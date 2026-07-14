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
import type { SceneOutline } from '@openmaic/lib/types/generation';
import type { Scene } from '@openmaic/lib/types/stage';
import { throwIfAborted } from '@openmaic/lib/generation/generation-retry';

const log = createLogger('ClassroomAssets');

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
}

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
  for (const group of groups) {
    await updatePersistedClassroomScenes(group.classroomId, group.scenes);
  }
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
  const requestedMedia = input.outlines.flatMap((outline) => outline.mediaGenerations ?? []).filter(
    (item) => item.type === 'image' ? input.enableImageGeneration : input.enableVideoGeneration,
  );

  const updateAssetStatus = async (
    status: 'running' | 'completed' | 'partial-failure',
    completed: number,
    failures: Array<{ elementId: string; type: 'image' | 'video'; error: string }>,
  ) => {
    await Promise.all(groups.map((group) => updatePersistedClassroomAssetStatus(group.classroomId, {
      status,
      requested: requestedMedia.length,
      completed,
      failures,
      updatedAt: new Date().toISOString(),
    })));
  };

  if (hasMediaGeneration) {
    try {
      throwIfAborted(input.signal);
      await updateAssetStatus('running', 0, []);
      const { mediaMap, failures } = await generateMediaForClassroom(
        input.outlines,
        input.studentClassroomId,
        input.baseUrl,
        { image: input.enableImageGeneration, video: input.enableVideoGeneration },
        input.signal,
      );
      replaceMediaPlaceholders(allScenes, mediaMap);
      await persistSceneGroups(groups);
      await updateAssetStatus(failures.length > 0 ? 'partial-failure' : 'completed', Object.keys(mediaMap).length, failures);
      log.info(
        `Classroom media backfilled [studentClassroomId=${input.studentClassroomId}, files=${Object.keys(mediaMap).length}]`,
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
  }

  if (!input.enableTTS) return;

  // PBL teacher resources are intentionally excluded from server-side TTS.
  // Non-PBL classrooms retain the previous behavior and receive audio for
  // both split resource sets.
  const ttsGroups = input.isPblCourse
    ? groups.filter((group) => group.role === 'student')
    : groups;

  // Process split classrooms one at a time so the provider concurrency limit
  // remains global even when a non-PBL classroom has both student and teacher
  // resources. Speech segments inside each call are finite-concurrent.
  for (const group of ttsGroups) {
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
    } catch (error) {
      if (input.signal?.aborted) throw error;
      log.warn(
        `Classroom TTS backfill failed [classroomId=${group.classroomId}]; content remains available:`,
        error,
      );
    }
  }
}
