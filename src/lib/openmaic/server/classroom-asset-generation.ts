/**
 * Post-response classroom asset generation.
 *
 * The classroom body is useful before any external media provider responds.
 * This module fills in image/video placeholders and TTS URLs after the body
 * has been persisted, updating each split classroom snapshot atomically.
 */

import { createLogger } from '@openmaic/lib/logger';
import {
  updatePersistedClassroomScenes,
  updatePersistedClassroomAssetStatus,
} from '@openmaic/lib/server/classroom-storage';
import {
  generateMediaForClassroom,
  generateTTSForClassroom,
  replaceMediaPlaceholders,
  type ServerTtsTimingSelection,
} from '@openmaic/lib/server/classroom-media-generation';
import { runIndependentClassroomAssetTasks } from '@openmaic/lib/server/classroom-asset-tasks';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import type { Scene } from '@openmaic/lib/types/stage';
import type { MediaGenerationRequest } from '@openmaic/lib/media/types';
import { throwIfAborted } from '@openmaic/lib/generation/generation-retry';

const log = createLogger('ClassroomAssets');

type MediaFailure = {
  elementId: string;
  type: 'image' | 'video';
  error: string;
};

const MAX_MEDIA_REPAIR_PASSES = 1;

function mediaRequestKey(request: Pick<MediaGenerationRequest, 'elementId' | 'type'>): string {
  return `${request.type}:${request.elementId}`;
}

export function collectRequestedClassroomMedia(
  outlines: SceneOutline[],
  capabilities: { image: boolean; video: boolean },
): MediaGenerationRequest[] {
  const unique = new Map<string, MediaGenerationRequest>();
  for (const request of outlines.flatMap((outline) => outline.mediaGenerations ?? [])) {
    if (request.type === 'image' ? !capabilities.image : !capabilities.video) continue;
    unique.set(mediaRequestKey(request), request);
  }
  return Array.from(unique.values());
}

function needsSafeEducationalFallback(error: string): boolean {
  return /DataInspectionFailed|inappropriate content|content safety|sensitive/i.test(error);
}

function safeEducationalImagePrompt(outline: SceneOutline): string {
  const topic = outline.title?.trim() || '人工智能基础知识';
  return `面向学校课堂的安全、中性教育课件插图，主题为“${topic}”。使用蓝绿色扁平化信息图风格，以抽象数据节点、连接线和简洁几何图形表达概念；无人物肖像、无文字、无品牌、无暴力或敏感内容，画面清晰，16:9。`;
}

export function buildMediaRepairOutlines(
  outlines: SceneOutline[],
  failures: MediaFailure[],
): SceneOutline[] {
  const failureByKey = new Map(failures.map((failure) => [mediaRequestKey(failure), failure]));
  return outlines.flatMap((outline) => {
    const mediaGenerations = (outline.mediaGenerations ?? []).flatMap((request) => {
      const failure = failureByKey.get(mediaRequestKey(request));
      if (!failure) return [];
      return [{
        ...request,
        prompt: request.type === 'image' && needsSafeEducationalFallback(failure.error)
          ? safeEducationalImagePrompt(outline)
          : request.prompt,
      }];
    });
    return mediaGenerations.length > 0 ? [{ ...outline, mediaGenerations }] : [];
  });
}

export function reconcileMediaFailures(
  requestedMedia: MediaGenerationRequest[],
  mediaMap: Record<string, string>,
  latestFailures: MediaFailure[],
): MediaFailure[] {
  const failureByKey = new Map(latestFailures.map((failure) => [mediaRequestKey(failure), failure]));
  return requestedMedia.flatMap((request) => {
    if (mediaMap[request.elementId]) return [];
    return [failureByKey.get(mediaRequestKey(request)) ?? {
      elementId: request.elementId,
      type: request.type,
      error: '素材生成未返回可用文件',
    }];
  });
}

export interface ClassroomAssetGenerationInput {
  outlines: SceneOutline[];
  baseUrl: string;
  studentClassroomId: string;
  studentScenes: Scene[];
  teacherClassroomId?: string;
  teacherScenes?: Scene[];
  enableImageGeneration: boolean;
  enableVideoGeneration: boolean;
  enableTTS: boolean;
  isPblCourse: boolean;
  ttsTimingSelection: ServerTtsTimingSelection;
  signal?: AbortSignal;
  onProgress?: (progress: ClassroomAssetGenerationProgress) => Promise<void> | void;
}

export type ClassroomAssetGenerationProgress = {
  phase: 'media' | 'tts' | 'persisting';
  status: 'running' | 'completed' | 'partial-failure';
  completed: number;
  total: number;
  message: string;
};

function classroomGroups(input: ClassroomAssetGenerationInput): Array<{
  classroomId: string;
  scenes: Scene[];
  role: 'student' | 'teacher';
}> {
  const groups: Array<{
    classroomId: string;
    scenes: Scene[];
    role: 'student' | 'teacher';
  }> = [
    {
      classroomId: input.studentClassroomId,
      scenes: input.studentScenes,
      role: 'student',
    },
  ];

  if (input.teacherClassroomId && input.teacherScenes?.length) {
    groups.push({
      classroomId: input.teacherClassroomId,
      scenes: input.teacherScenes,
      role: 'teacher',
    });
  }

  return groups;
}

async function persistSceneGroups(
  groups: ReturnType<typeof classroomGroups>,
): Promise<void> {
  await Promise.all(
    groups.map((group) =>
      updatePersistedClassroomScenes(group.classroomId, group.scenes),
    ),
  );
}

/**
 * Generate and backfill all optional media for a split classroom.
 *
 * Images and videos are generated once against the student classroom media
 * directory, matching the original classroom URL contract. The resulting map
 * is applied to both student and teacher scene snapshots, avoiding duplicate
 * image/video API calls for the same course content.
 */
export async function generateClassroomAssets(
  input: ClassroomAssetGenerationInput,
): Promise<void> {
  const groups = classroomGroups(input);
  const allScenes = groups.flatMap((group) => group.scenes);
  const hasMediaGeneration = input.enableImageGeneration || input.enableVideoGeneration;
  const capabilities = { image: input.enableImageGeneration, video: input.enableVideoGeneration };
  const requestedMedia = collectRequestedClassroomMedia(input.outlines, capabilities);

  const updateAssetStatus = async (
    status: 'running' | 'completed' | 'partial-failure',
    completed: number,
    failures: MediaFailure[],
  ) => {
    await Promise.all(groups.map((group) => updatePersistedClassroomAssetStatus(group.classroomId, {
      status,
      requested: requestedMedia.length,
      completed,
      failures,
      updatedAt: new Date().toISOString(),
    })));
  };

  const generateMediaAssets = async () => {
    if (!hasMediaGeneration) return;
    try {
      throwIfAborted(input.signal);
      await input.onProgress?.({
        phase: 'media',
        status: 'running',
        completed: 0,
        total: requestedMedia.length,
        message: `正在生成并插入 ${requestedMedia.length} 项图片与视频资源`,
      });
      await updateAssetStatus('running', 0, []);
      const mediaMap: Record<string, string> = {};
      let failures: MediaFailure[] = [];
      let repairOutlines = input.outlines;

      for (let pass = 0; pass <= MAX_MEDIA_REPAIR_PASSES; pass += 1) {
        const result = await generateMediaForClassroom(
          repairOutlines,
          input.studentClassroomId,
          input.baseUrl,
          capabilities,
          input.signal,
        );
        Object.assign(mediaMap, result.mediaMap);
        replaceMediaPlaceholders(allScenes, result.mediaMap);
        await persistSceneGroups(groups);

        failures = reconcileMediaFailures(requestedMedia, mediaMap, result.failures);
        if (failures.length === 0 || pass >= MAX_MEDIA_REPAIR_PASSES) break;

        repairOutlines = buildMediaRepairOutlines(input.outlines, failures);
        await updateAssetStatus('running', Object.keys(mediaMap).length, failures);
        log.warn(
          `Retrying missing classroom media [studentClassroomId=${input.studentClassroomId}, pass=${pass + 2}, missing=${failures.length}]`,
        );
      }

      const completed = requestedMedia.length - failures.length;
      await updateAssetStatus(failures.length > 0 ? 'partial-failure' : 'completed', completed, failures);
      await input.onProgress?.({
        phase: 'media',
        status: failures.length > 0 ? 'partial-failure' : 'completed',
        completed,
        total: requestedMedia.length,
        message: failures.length > 0
          ? `已插入 ${completed} / ${requestedMedia.length} 项媒体资源`
          : `已完成 ${completed} 项图片与视频资源`,
      });
      log.info(
        `Classroom media backfilled [studentClassroomId=${input.studentClassroomId}, files=${completed}, missing=${failures.length}]`,
      );
    } catch (error) {
      if (input.signal?.aborted) throw error;
      log.warn('Classroom media backfill failed; content remains available:', error);
      await updateAssetStatus('partial-failure', 0, [{
        elementId: 'media-batch',
        type: input.enableImageGeneration ? 'image' : 'video',
        error: error instanceof Error ? error.message : String(error),
      }]).catch((statusError) => log.warn('Failed to persist asset failure status:', statusError));
    }
  };

  const generateSpeechAssets = async () => {
    if (!input.enableTTS) return;

    // PBL teacher resources are intentionally excluded from server-side TTS.
    // Non-PBL classrooms retain the previous behavior and receive audio for
    // both split resource sets.
    const ttsGroups = input.isPblCourse
      ? groups.filter((group) => group.role === 'student')
      : groups;

    await input.onProgress?.({
      phase: 'tts',
      status: 'running',
      completed: 0,
      total: ttsGroups.length,
      message: '正在生成课堂讲授语音',
    });

    // Process split classrooms one at a time so the provider concurrency limit
    // remains global even when a non-PBL classroom has both student and teacher
    // resources. Speech segments inside each call are finite-concurrent.
    for (let index = 0; index < ttsGroups.length; index += 1) {
      const group = ttsGroups[index];
      throwIfAborted(input.signal);
      try {
        await generateTTSForClassroom(
          group.scenes,
          group.classroomId,
          input.baseUrl,
          input.signal,
          input.ttsTimingSelection,
        );
        await updatePersistedClassroomScenes(group.classroomId, group.scenes);
        log.info(
          `Classroom TTS backfilled [classroomId=${group.classroomId}, role=${group.role}]`,
        );
        await input.onProgress?.({
          phase: 'tts',
          status: index === ttsGroups.length - 1 ? 'completed' : 'running',
          completed: index + 1,
          total: ttsGroups.length,
          message: index === ttsGroups.length - 1 ? '课堂讲授语音已经生成并写入页面' : '正在继续生成课堂讲授语音',
        });
      } catch (error) {
        if (input.signal?.aborted) throw error;
        // Keep successful segments durable, but surface the remaining missing
        // audio to the caller so generation cannot be marked fully ready.
        await updatePersistedClassroomScenes(group.classroomId, group.scenes);
        log.warn(
          `Classroom TTS backfill failed [classroomId=${group.classroomId}]; content remains available:`,
          error,
        );
        throw error;
      }
    }
  };

  // Media/video providers and speech providers are independent. Their existing
  // bounded pipelines can overlap without changing prompts, retry policies,
  // provider concurrency, or quality checks. Persist once more after both have
  // finished so the shared scene snapshots contain the merged asset updates.
  await runIndependentClassroomAssetTasks({
    media: generateMediaAssets,
    tts: generateSpeechAssets,
    persistMergedState: async () => {
      await input.onProgress?.({
        phase: 'persisting',
        status: 'running',
        completed: 0,
        total: groups.length,
        message: '正在合并并保存课堂资源',
      });
      await persistSceneGroups(groups);
      await input.onProgress?.({
        phase: 'persisting',
        status: 'completed',
        completed: groups.length,
        total: groups.length,
        message: '课堂页面与配套资源已经保存',
      });
    },
  });
}
