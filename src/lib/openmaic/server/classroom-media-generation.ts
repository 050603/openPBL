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
  resolveTTSVoice,
  resolveTTSTimingCalibration,
  getTtsConcurrencyLimit,
} from '@openmaic/lib/server/provider-config';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import type { Scene } from '@openmaic/lib/types/stage';
import type { SpeechAction } from '@openmaic/lib/types/action';
import type { ImageProviderId } from '@openmaic/lib/media/types';
import type { MediaGenerationRequest } from '@openmaic/lib/media/types';
import type { VideoProviderId } from '@openmaic/lib/media/types';
import type { TTSProviderId } from '@openmaic/lib/audio/types';
import { splitLongSpeechActions } from '@openmaic/lib/audio/tts-utils';
import { VOXCPM_AUTO_VOICE_ID, VOXCPM_TTS_PROVIDER_ID } from '@openmaic/lib/audio/voxcpm';
import {
  getTtsTimingProfile,
} from '@openmaic/lib/audio/tts-timing';
import { throwIfAborted, withGenerationRetry } from '@openmaic/lib/generation/generation-retry';
import { mapWithConcurrency } from '@openmaic/lib/utils/concurrency';
import {
  hasPblRoutingMetadata,
  isStudentAiLearningScene,
} from '@openmaic/lib/pbl/scene-routing';

const log = createLogger('ClassroomMedia');

const imageProviderQueue = new Map<ImageProviderId, Promise<void>>();
const imageProviderLastStartedAt = new Map<ImageProviderId, number>();

export function isStudentNarratedScene(scene: Scene): boolean {
  if (scene.ttsPolicy === 'none') return false;
  if (isStudentAiLearningScene(scene)) return true;
  return (
    scene.audience === 'student'
    && scene.generationPurpose === 'knowledge-teaching'
    && (scene.stageKey === 'proposal' || scene.stageKey === 'make')
  );
}

function imageRequestSpacingMs(providerId: ImageProviderId): number {
  if (providerId !== 'qwen-image') return 0;
  const configured = Number(process.env.OPENMAIC_QWEN_IMAGE_MIN_INTERVAL_MS ?? 5_000);
  return Number.isFinite(configured) && configured >= 0 ? configured : 5_000;
}

async function waitForProviderSlot(
  providerId: ImageProviderId,
  signal: AbortSignal | undefined,
  operation: () => Promise<Awaited<ReturnType<typeof generateImage>>>,
) {
  const prior = imageProviderQueue.get(providerId) ?? Promise.resolve();
  const run = prior.catch(() => undefined).then(async () => {
    throwIfAborted(signal);
    const spacingMs = imageRequestSpacingMs(providerId);
    const remainingMs = spacingMs - (Date.now() - (imageProviderLastStartedAt.get(providerId) ?? 0));
    if (remainingMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const finish = () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        };
        const timer = setTimeout(finish, remainingMs);
        const onAbort = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
    throwIfAborted(signal);
    imageProviderLastStartedAt.set(providerId, Date.now());
    return operation();
  });
  imageProviderQueue.set(providerId, run.then(() => undefined, () => undefined));
  return run;
}

type ServerTTSRuntime = {
  providerId: TTSProviderId;
  apiKey: string;
  baseUrl?: string;
  modelId: string;
  voice: string;
  format: string;
};

export type ServerTtsTimingSelection = {
  providerId: string;
  modelId: string;
  voiceId: string;
  speed: number;
  language: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

const DOWNLOAD_TIMEOUT_MS = 120_000; // 2 minutes
const DOWNLOAD_MAX_SIZE = 100 * 1024 * 1024; // 100 MB

async function downloadToBuffer(url: string, signal?: AbortSignal): Promise<Buffer> {
  const timeoutSignal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  const downloadSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;
  const resp = await fetch(url, { signal: downloadSignal });
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  const contentLength = Number(resp.headers.get('content-length') || 0);
  if (contentLength > DOWNLOAD_MAX_SIZE) {
    throw new Error(`File too large: ${contentLength} bytes (max ${DOWNLOAD_MAX_SIZE})`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

function mediaServingUrl(baseUrl: string, classroomId: string, subPath: string): string {
  return `${baseUrl}/api/openmaic/classroom-media/${classroomId}/${subPath}`;
}

// ---------------------------------------------------------------------------
// Image / Video generation
// ---------------------------------------------------------------------------

export async function generateMediaForClassroom(
  outlines: SceneOutline[],
  classroomId: string,
  baseUrl: string,
  capabilities: { image: boolean; video: boolean },
  signal?: AbortSignal,
): Promise<{
  mediaMap: Record<string, string>;
  failures: Array<{ elementId: string; type: 'image' | 'video'; error: string }>;
}> {
  throwIfAborted(signal);
  const mediaDir = path.join(CLASSROOMS_DIR, classroomId, 'media');
  await ensureDir(mediaDir);

  // Collect all media generation requests from outlines
  const requests = Array.from(
    new Map(
      outlines
        .flatMap((o) => o.mediaGenerations ?? [])
        .map((request) => [`${request.type}:${request.elementId}`, request] as const),
    ).values(),
  ) as MediaGenerationRequest[];
  if (requests.length === 0) return { mediaMap: {}, failures: [] };

  // Resolve providers
  const imageProviders = getServerImageProviders();
  const videoProviders = getServerVideoProviders();
  const imageProviderIds = Object.keys(imageProviders);
  const videoProviderIds = Object.keys(videoProviders);

  const mediaMap: Record<string, string> = {};
  const failures: Array<{ elementId: string; type: 'image' | 'video'; error: string }> = [];

  if (capabilities.image && imageProviderIds.length === 0) {
    for (const request of requests.filter((item) => item.type === 'image')) {
      failures.push({ elementId: request.elementId, type: 'image', error: '未配置可用的图像生成服务' });
    }
  }
  if (capabilities.video && videoProviderIds.length === 0) {
    for (const request of requests.filter((item) => item.type === 'video')) {
      failures.push({ elementId: request.elementId, type: 'video', error: '未配置可用的视频生成服务' });
    }
  }

  // Separate image and video requests, generate each type sequentially
  // but run the two types in parallel (providers often have limited concurrency).
  const imageRequests = requests.filter((r) => capabilities.image && r.type === 'image' && imageProviderIds.length > 0);
  const videoRequests = requests.filter((r) => capabilities.video && r.type === 'video' && videoProviderIds.length > 0);

  const generateImages = async () => {
    for (const req of imageRequests) {
      try {
        throwIfAborted(signal);
        const providerId = imageProviderIds[0] as ImageProviderId;
        const apiKey = resolveImageApiKey(providerId);
        const providerConfig = IMAGE_PROVIDERS[providerId];
        if (providerConfig?.requiresApiKey && !apiKey) {
          log.warn(`No API key for image provider "${providerId}", skipping ${req.elementId}`);
          failures.push({ elementId: req.elementId, type: 'image', error: '图像生成服务缺少 API 密钥' });
          continue;
        }
        const model = imageProviders[providerId]?.defaultModel || providerConfig?.models?.[0]?.id;

        await withGenerationRetry(async () => {
          const result = await waitForProviderSlot(providerId, signal, () => generateImage(
            { providerId, apiKey, baseUrl: resolveImageBaseUrl(providerId), model },
            { prompt: req.prompt, aspectRatio: req.aspectRatio || '16:9' },
          ));
          throwIfAborted(signal);
          let buf: Buffer;
          let ext: string;
          if (result.base64) {
            buf = Buffer.from(result.base64, 'base64');
            ext = 'png';
          } else if (result.url) {
            buf = await downloadToBuffer(result.url, signal);
            const urlExt = path.extname(new URL(result.url).pathname).replace('.', '');
            ext = ['png', 'jpg', 'jpeg', 'webp'].includes(urlExt) ? urlExt : 'png';
          } else {
            throw new Error('Image provider returned neither base64 data nor a URL');
          }
          const filename = `${req.elementId}.${ext}`;
          await fs.writeFile(path.join(mediaDir, filename), buf);
          mediaMap[req.elementId] = mediaServingUrl(baseUrl, classroomId, `media/${filename}`);
          log.info(`Generated image: ${filename}`);
        }, {
          label: `image ${req.elementId}`,
          signal,
          maxRetries: providerId === 'qwen-image' ? 3 : 2,
          baseDelayMs: providerId === 'qwen-image' ? 10_000 : 1_000,
          maxDelayMs: providerId === 'qwen-image' ? 60_000 : 16_000,
          onRetry: ({ attempt, maxAttempts, nextDelayMs, reason }) => {
            log.warn(
              `Retrying image ${req.elementId} [provider=${providerId}, attempt=${attempt + 1}/${maxAttempts}, waitMs=${nextDelayMs}, reason=${reason}]`,
            );
          },
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        log.warn(`Image generation failed for ${req.elementId}:`, err);
        failures.push({ elementId: req.elementId, type: 'image', error: err instanceof Error ? err.message : String(err) });
      }
    }
  };

  const generateVideos = async () => {
    for (const req of videoRequests) {
      try {
        throwIfAborted(signal);
        const providerId = videoProviderIds[0] as VideoProviderId;
        const apiKey = resolveVideoApiKey(providerId);
        if (!apiKey) {
          log.warn(`No API key for video provider "${providerId}", skipping ${req.elementId}`);
          failures.push({ elementId: req.elementId, type: 'video', error: '视频生成服务缺少 API 密钥' });
          continue;
        }
        const providerConfig = VIDEO_PROVIDERS[providerId];
        const model = videoProviders[providerId]?.defaultModel || providerConfig?.models?.[0]?.id;

        const normalized = normalizeVideoOptions(providerId, {
          prompt: req.prompt,
          aspectRatio: (req.aspectRatio as '16:9' | '4:3' | '1:1' | '9:16') || '16:9',
        });

        await withGenerationRetry(async () => {
          const result = await generateVideo(
            { providerId, apiKey, baseUrl: resolveVideoBaseUrl(providerId), model },
            normalized,
          );
          throwIfAborted(signal);
          const buf = await downloadToBuffer(result.url, signal);
          throwIfAborted(signal);
          const filename = `${req.elementId}.mp4`;
          await fs.writeFile(path.join(mediaDir, filename), buf);
          mediaMap[req.elementId] = mediaServingUrl(baseUrl, classroomId, `media/${filename}`);
          log.info(`Generated video: ${filename}`);
        }, { label: `video ${req.elementId}`, signal, maxRetries: 1 });
      } catch (err) {
        if (signal?.aborted) throw err;
        log.warn(`Video generation failed for ${req.elementId}:`, err);
        failures.push({ elementId: req.elementId, type: 'video', error: err instanceof Error ? err.message : String(err) });
      }
    }
  };

  await Promise.all([generateImages(), generateVideos()]);
  throwIfAborted(signal);

  return { mediaMap, failures };
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

    const voice = resolveTTSVoice(
      providerId,
      DEFAULT_TTS_VOICES[providerId as keyof typeof DEFAULT_TTS_VOICES] || 'default',
    ) || 'default';
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

function getConfiguredTtsProviderIds(): string[] {
  return Object.entries(getServerTTSProviders())
    .filter(([id, info]) => id !== 'browser-native-tts' && !info.disabled)
    .map(([id]) => id);
}

/** Resolve the same provider/model that server-side audio generation will use. */
export function resolveServerTtsTimingSelection(options: {
  providerId?: string;
  modelId?: string;
  voiceId?: string;
  speed?: number;
  language?: string;
} = {}): ServerTtsTimingSelection {
  const configuredIds = getConfiguredTtsProviderIds();
  const runtimes = resolveServerTTSRuntimes(
    options.providerId && configuredIds.includes(options.providerId)
      ? [options.providerId, ...configuredIds.filter((id) => id !== options.providerId)]
      : configuredIds,
  );
  const runtime = runtimes[0];
  const providerId = runtime?.providerId ?? options.providerId ?? 'default';
  const requestedModelIsForSelectedProvider = Boolean(
    options.modelId && (!options.providerId || options.providerId === providerId),
  );
  const requestedVoiceIsForSelectedProvider = Boolean(
    options.voiceId && (!options.providerId || options.providerId === providerId),
  );
  const modelId = runtime?.modelId ?? options.modelId ?? '';
  const voiceId = requestedVoiceIsForSelectedProvider
    ? options.voiceId!
    : runtime?.voice ?? options.voiceId ?? 'default';
  resolveTTSTimingCalibration(providerId, modelId, voiceId);
  const profile = getTtsTimingProfile(
    providerId,
    requestedModelIsForSelectedProvider ? options.modelId : modelId,
    voiceId,
  );
  return {
    providerId: profile.providerId,
    modelId: profile.modelId,
    voiceId,
    speed: 1,
    language: options.language || 'zh-CN',
  };
}

export async function generateTTSForClassroom(
  scenes: Scene[],
  classroomId: string,
  baseUrl: string,
  signal?: AbortSignal,
  timingOptions: Partial<ServerTtsTimingSelection> = {},
): Promise<void> {
  throwIfAborted(signal);
  // Defensive second gate: if the caller passes a routed PBL scene set, only
  // the explicit student AI-learning route may receive audio. This keeps
  // future callers from accidentally reintroducing TTS on teacher resources.
  const hasRoutedScenes = scenes.some(hasPblRoutingMetadata);
  const eligibleScenes = hasRoutedScenes
    ? scenes.filter(isStudentNarratedScene)
    : scenes;

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
  const preferredRuntimeIndex = timingOptions.providerId
    ? runtimes.findIndex((runtime) => runtime.providerId === timingOptions.providerId)
    : 0;
  if (preferredRuntimeIndex > 0) {
    const [preferred] = runtimes.splice(preferredRuntimeIndex, 1);
    if (preferred) runtimes.unshift(preferred);
  }
  const selectedRuntime = runtimes[0];
  const splitProviderId = selectedRuntime.providerId;
  const speechTasks: Array<{
    speechAction: SpeechAction;
    actionId: string;
    audioId: string;
  }> = [];

  // Prepare all scene actions before starting requests. This keeps action
  // splitting and duration allocation deterministic, while the actual TTS
  // calls below can run concurrently without mutating the same action twice.
  for (const scene of eligibleScenes) {
    throwIfAborted(signal);
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
      speechTasks.push({ speechAction, actionId: action.id, audioId });
    }
  }

  if (speechTasks.length === 0) return;

  // A fallback provider may have a lower quota than the preferred provider.
  // Use the strictest configured limit so a provider switch never creates a
  // burst larger than one of the possible runtimes can handle.
  const concurrency = Math.min(
    speechTasks.length,
    ...runtimes.map((runtime) => getTtsConcurrencyLimit(runtime.providerId)),
  );
  log.info(
    `Generating TTS with bounded concurrency [classroomId=${classroomId}, segments=${speechTasks.length}, concurrency=${concurrency}]`,
  );

  await mapWithConcurrency(speechTasks, concurrency, async (task) => {
    throwIfAborted(signal);
    let generated = false;
    for (const runtime of runtimes) {
      try {
        throwIfAborted(signal);
        const result = await generateTTS(
          {
            providerId: runtime.providerId,
            modelId:
              runtime.providerId === selectedRuntime.providerId && timingOptions.modelId
                ? timingOptions.modelId
                : runtime.modelId,
            apiKey: runtime.apiKey,
            baseUrl: runtime.baseUrl,
            voice:
              runtime.providerId === selectedRuntime.providerId
                ? timingOptions.voiceId || runtime.voice
                : runtime.voice,
            speed: 1,
          },
          task.speechAction.text,
        );
        throwIfAborted(signal);

        const filename = `${task.audioId}.${result.format || runtime.format}`;
        await fs.writeFile(path.join(audioDir, filename), result.audio);

        task.speechAction.audioId = task.audioId;
        task.speechAction.audioUrl = mediaServingUrl(baseUrl, classroomId, `audio/${filename}`);
        log.info(
          `Generated TTS via ${runtime.providerId}: ${filename} (${result.audio.length} bytes)`,
        );
        generated = true;
        break;
      } catch (err) {
        if (signal?.aborted) throw err;
        log.warn(`TTS provider "${runtime.providerId}" failed for action ${task.actionId}:`, err);
      }
    }
    if (!generated) {
      log.warn(`TTS generation failed for action ${task.actionId}: all configured providers failed`);
    }
  });
}
