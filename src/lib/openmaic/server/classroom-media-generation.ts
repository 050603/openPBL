/**
 * Server-side media and TTS generation for classrooms.
 *
 * Generates image/video files and TTS audio for a classroom,
 * writes them to disk, and returns serving URL mappings.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '@openmaic/lib/logger';
import { CLASSROOMS_DIR } from '@openmaic/lib/server/classroom-storage';
import { generateImage } from '@openmaic/lib/media/image-providers';
import { generateVideo, normalizeVideoOptions } from '@openmaic/lib/media/video-providers';
import { generateTTS } from '@openmaic/lib/audio/tts-providers';
import { DEFAULT_TTS_VOICES, DEFAULT_TTS_MODELS, TTS_PROVIDERS } from '@openmaic/lib/audio/constants';
import { IMAGE_PROVIDERS } from '@openmaic/lib/media/image-providers';
import { VIDEO_PROVIDERS } from '@openmaic/lib/media/video-providers';
import { isMediaPlaceholder } from '@openmaic/lib/store/media-generation';
import {
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
  resolveImageApiKey,
  resolveImageBaseUrl,
  resolveVideoApiKey,
  resolveVideoBaseUrl,
  resolveTTSApiKey,
  resolveTTSBaseUrl,
  resolveTTSModel,
} from '@openmaic/lib/server/provider-config';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import type { Scene } from '@openmaic/lib/types/stage';
import type { SpeechAction } from '@openmaic/lib/types/action';
import type { ImageProviderId } from '@openmaic/lib/media/types';
import type { VideoProviderId } from '@openmaic/lib/media/types';
import type { TTSProviderId } from '@openmaic/lib/audio/types';
import { splitLongSpeechActions } from '@openmaic/lib/audio/tts-utils';
import { VOXCPM_AUTO_VOICE_ID, VOXCPM_TTS_PROVIDER_ID } from '@openmaic/lib/audio/voxcpm';

const log = createLogger('ClassroomMedia');

type ServerTTSRuntime = {
  providerId: TTSProviderId;
  apiKey: string;
  baseUrl?: string;
  modelId: string;
  voice: string;
  format: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

const DOWNLOAD_TIMEOUT_MS = 120_000; // 2 minutes
const DOWNLOAD_MAX_SIZE = 100 * 1024 * 1024; // 100 MB

async function downloadToBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  const contentLength = Number(resp.headers.get('content-length') || 0);
  if (contentLength > DOWNLOAD_MAX_SIZE) {
    throw new Error(`File too large: ${contentLength} bytes (max ${DOWNLOAD_MAX_SIZE})`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

function mediaServingUrl(baseUrl: string, classroomId: string, subPath: string): string {
  return `${baseUrl}/api/classroom-media/${classroomId}/${subPath}`;
}

// ---------------------------------------------------------------------------
// Image / Video generation
// ---------------------------------------------------------------------------

export async function generateMediaForClassroom(
  outlines: SceneOutline[],
  classroomId: string,
  baseUrl: string,
): Promise<Record<string, string>> {
  const mediaDir = path.join(CLASSROOMS_DIR, classroomId, 'media');
  await ensureDir(mediaDir);

  // Collect all media generation requests from outlines
  const requests = outlines.flatMap((o) => o.mediaGenerations ?? []);
  if (requests.length === 0) return {};

  // Resolve providers
  const imageProviders = getServerImageProviders();
  const videoProviders = getServerVideoProviders();
  const imageProviderIds = Object.keys(imageProviders);
  const videoProviderIds = Object.keys(videoProviders);

  const mediaMap: Record<string, string> = {};

  // Separate image and video requests, generate each type sequentially
  // but run the two types in parallel (providers often have limited concurrency).
  const imageRequests = requests.filter((r) => r.type === 'image' && imageProviderIds.length > 0);
  const videoRequests = requests.filter((r) => r.type === 'video' && videoProviderIds.length > 0);

  const generateImages = async () => {
    for (const req of imageRequests) {
      try {
        const providerId = imageProviderIds[0] as ImageProviderId;
        const apiKey = resolveImageApiKey(providerId);
        const providerConfig = IMAGE_PROVIDERS[providerId];
        if (providerConfig?.requiresApiKey && !apiKey) {
          log.warn(`No API key for image provider "${providerId}", skipping ${req.elementId}`);
          continue;
        }
        const model = imageProviders[providerId]?.defaultModel || providerConfig?.models?.[0]?.id;

        const result = await generateImage(
          { providerId, apiKey, baseUrl: resolveImageBaseUrl(providerId), model },
          { prompt: req.prompt, aspectRatio: req.aspectRatio || '16:9' },
        );

        let buf: Buffer;
        let ext: string;
        if (result.base64) {
          buf = Buffer.from(result.base64, 'base64');
          ext = 'png';
        } else if (result.url) {
          buf = await downloadToBuffer(result.url);
          const urlExt = path.extname(new URL(result.url).pathname).replace('.', '');
          ext = ['png', 'jpg', 'jpeg', 'webp'].includes(urlExt) ? urlExt : 'png';
        } else {
          log.warn(`Image generation returned no data for ${req.elementId}`);
          continue;
        }

        const filename = `${req.elementId}.${ext}`;
        await fs.writeFile(path.join(mediaDir, filename), buf);
        mediaMap[req.elementId] = mediaServingUrl(baseUrl, classroomId, `media/${filename}`);
        log.info(`Generated image: ${filename}`);
      } catch (err) {
        log.warn(`Image generation failed for ${req.elementId}:`, err);
      }
    }
  };

  const generateVideos = async () => {
    for (const req of videoRequests) {
      try {
        const providerId = videoProviderIds[0] as VideoProviderId;
        const apiKey = resolveVideoApiKey(providerId);
        if (!apiKey) {
          log.warn(`No API key for video provider "${providerId}", skipping ${req.elementId}`);
          continue;
        }
        const providerConfig = VIDEO_PROVIDERS[providerId];
        const model = videoProviders[providerId]?.defaultModel || providerConfig?.models?.[0]?.id;

        const normalized = normalizeVideoOptions(providerId, {
          prompt: req.prompt,
          aspectRatio: (req.aspectRatio as '16:9' | '4:3' | '1:1' | '9:16') || '16:9',
        });

        const result = await generateVideo(
          { providerId, apiKey, baseUrl: resolveVideoBaseUrl(providerId), model },
          normalized,
        );

        const buf = await downloadToBuffer(result.url);
        const filename = `${req.elementId}.mp4`;
        await fs.writeFile(path.join(mediaDir, filename), buf);
        mediaMap[req.elementId] = mediaServingUrl(baseUrl, classroomId, `media/${filename}`);
        log.info(`Generated video: ${filename}`);
      } catch (err) {
        log.warn(`Video generation failed for ${req.elementId}:`, err);
      }
    }
  };

  await Promise.all([generateImages(), generateVideos()]);

  return mediaMap;
}

// ---------------------------------------------------------------------------
// Placeholder replacement in scene content
// ---------------------------------------------------------------------------

export function replaceMediaPlaceholders(scenes: Scene[], mediaMap: Record<string, string>): void {
  if (Object.keys(mediaMap).length === 0) return;

  for (const scene of scenes) {
    if (scene.type !== 'slide') continue;
    const canvas = (
      scene.content as {
        canvas?: {
          elements?: Array<{ id: string; src?: string; mediaRef?: string; type?: string }>;
        };
      }
    )?.canvas;
    if (!canvas?.elements) continue;

    for (const el of canvas.elements) {
      if (
        el.type === 'video' &&
        typeof el.mediaRef === 'string' &&
        mediaMap[el.mediaRef] &&
        (!el.src || isMediaPlaceholder(el.src))
      ) {
        el.src = mediaMap[el.mediaRef];
        continue;
      }
      if (
        (el.type === 'image' || el.type === 'video') &&
        typeof el.src === 'string' &&
        isMediaPlaceholder(el.src) &&
        mediaMap[el.src]
      ) {
        el.src = mediaMap[el.src];
      }
    }
  }
}

// ---------------------------------------------------------------------------
// TTS generation
// ---------------------------------------------------------------------------

function resolveServerTTSRuntimes(providerIds: string[]): ServerTTSRuntime[] {
  return providerIds.flatMap((id) => {
    const providerId = id as TTSProviderId;
    const apiKey = resolveTTSApiKey(providerId);
    const ttsProvider = TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS];
    if (ttsProvider?.requiresApiKey && !apiKey) {
      log.warn(`No API key for TTS provider "${providerId}", skipping provider`);
      return [];
    }

    const voice = DEFAULT_TTS_VOICES[providerId as keyof typeof DEFAULT_TTS_VOICES] || 'default';
    if (providerId === VOXCPM_TTS_PROVIDER_ID && voice === VOXCPM_AUTO_VOICE_ID) {
      log.warn('VoxCPM Auto Voice requires agent context; skipping server-side provider');
      return [];
    }

    const defaultModel = DEFAULT_TTS_MODELS[providerId as keyof typeof DEFAULT_TTS_MODELS] || '';
    return [
      {
        providerId,
        apiKey,
        baseUrl: resolveTTSBaseUrl(providerId) || ttsProvider?.defaultBaseUrl,
        modelId: resolveTTSModel(providerId, defaultModel) || defaultModel,
        voice,
        format: ttsProvider?.supportedFormats?.[0] || 'mp3',
      },
    ];
  });
}

export async function generateTTSForClassroom(
  scenes: Scene[],
  classroomId: string,
  baseUrl: string,
): Promise<void> {
  const audioDir = path.join(CLASSROOMS_DIR, classroomId, 'audio');
  await ensureDir(audioDir);

  // Resolve TTS provider (exclude browser-native-tts and operator force-disabled
  // providers — server precedence, #665).
  const ttsProviderIds = Object.entries(getServerTTSProviders())
    .filter(([id, info]) => id !== 'browser-native-tts' && !info.disabled)
    .map(([id]) => id);
  if (ttsProviderIds.length === 0) {
    log.warn('No server TTS provider configured, skipping TTS generation');
    return;
  }

  const runtimes = resolveServerTTSRuntimes(ttsProviderIds);
  if (runtimes.length === 0) {
    log.warn('No usable server TTS provider configured, skipping TTS generation');
    return;
  }
  const splitProviderId = runtimes[0].providerId;

  for (const scene of scenes) {
    if (!scene.actions) continue;

    // Split long speech actions into multiple shorter ones before TTS generation,
    // mirroring the client-side approach. Each sub-action gets its own audio file.
    scene.actions = splitLongSpeechActions(scene.actions, splitProviderId);

    // Use scene order to make audio IDs unique across scenes
    const sceneOrder = scene.order;

    for (const action of scene.actions) {
      if (action.type !== 'speech' || !(action as SpeechAction).text) continue;
      const speechAction = action as SpeechAction;
      // Include scene order in audioId to prevent collision across scenes
      const audioId = `tts_s${sceneOrder}_${action.id}`;

      let generated = false;
      for (const runtime of runtimes) {
        try {
          const result = await generateTTS(
            {
              providerId: runtime.providerId,
              modelId: runtime.modelId,
              apiKey: runtime.apiKey,
              baseUrl: runtime.baseUrl,
              voice: runtime.voice,
              speed: speechAction.speed,
            },
            speechAction.text,
          );

          const filename = `${audioId}.${result.format || runtime.format}`;
          await fs.writeFile(path.join(audioDir, filename), result.audio);

          speechAction.audioId = audioId;
          speechAction.audioUrl = mediaServingUrl(baseUrl, classroomId, `audio/${filename}`);
          log.info(
            `Generated TTS via ${runtime.providerId}: ${filename} (${result.audio.length} bytes)`,
          );
          generated = true;
          break;
        } catch (err) {
          log.warn(`TTS provider "${runtime.providerId}" failed for action ${action.id}:`, err);
        }
      }
      if (!generated) {
        log.warn(`TTS generation failed for action ${action.id}: all configured providers failed`);
      }
    }
  }
}
