'use client';

/**
 * StudentStageHost — 学生端 OpenMAIC Stage 宿主组件
 *
 * 职责：
 * 1. 从 /api/openmaic/classroom?id= 加载课堂（stage + scenes）
 * 2. 从 /api/openmaic/progress?courseId= 恢复学生学习进度（currentSceneIndex / completedScenes）
 * 3. 通过 useStageStore.getState().setStage + setState 把数据喂给 OpenMAIC Stage
 * 4. 包裹 ThemeProvider + I18nProvider + MediaStageProvider，使 Stage 的下游组件可用
 * 5. 订阅 useStageStore 的 currentSceneId 变化，将进度上报到 /api/openmaic/progress
 * 6. 提供 loading / error / retry UI，以及返回课程入口
 *
 * 不修改 OpenMAIC 任何核心算法逻辑，仅作为适配层挂载 Stage。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Stage } from '@openmaic/components/stage';
import { ThemeProvider } from '@openmaic/lib/hooks/use-theme';
import { I18nProvider } from '@openmaic/lib/hooks/use-i18n';
import { MediaStageProvider } from '@openmaic/lib/contexts/media-stage-context';
import { ServerProvidersInit } from '@openmaic/components/server-providers-init';
import { useStageStore } from '@openmaic/lib/store';
import { useSettingsStore } from '@openmaic/lib/store/settings';
import { migrateScene } from '@openmaic/lib/edit/slide-schema';
import { createLogger } from '@openmaic/lib/logger';
import type { Scene, Stage as StageType } from '@openmaic/lib/types/stage';
import { createLearningEvent, postLearningEvents } from '@/lib/learning-analytics/telemetry';
import type {
  KnowledgeGraph,
  KnowledgePoint,
  LearningEvent,
  LearningEventType,
} from '@/lib/session/types';
import { TeachingKnowledgeGraphProvider } from '@/components/openmaic-bridge/knowledge-graph-context';
import { cn } from '@/lib/utils';
import { isStudentAiLearningScene } from '@openmaic/lib/pbl/scene-routing';
import { estimateSpeechDurationSec } from '@openmaic/lib/audio/tts-timing';
import type { PlaybackSyncState } from '@openmaic/components/stage-experience';
import { isScenePlaybackExhausted } from '@openmaic/lib/playback/scene-completion';
import { readSubmittedState } from '@openmaic/lib/quiz/persistence';
import {
  AI_PROGRESS_COMPLETION_MODEL_VERSION,
  isReliableAiProgress,
} from '@openmaic/lib/progress/completion-model';

const log = createLogger('StudentStageHost');

interface ClassroomPayload {
  stage: StageType;
  scenes: Scene[];
}

const preparedClassroomCache = new Map<string, Promise<ClassroomPayload>>();

export function prefetchAdaptiveClassroom(
  preparedClassroomId: string,
): Promise<ClassroomPayload> {
  const cached = preparedClassroomCache.get(preparedClassroomId);
  if (cached) return cached;
  const request = fetch(
    `/api/openmaic/classroom?id=${encodeURIComponent(preparedClassroomId)}`,
    { cache: 'no-store' },
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Prepared classroom failed to load (${response.status})`);
      }
      const payload = (await response.json()) as {
        success: boolean;
        classroom?: ClassroomPayload;
      };
      if (!payload.success || !payload.classroom?.scenes.length) {
        throw new Error('Prepared classroom is empty');
      }
      return payload.classroom;
    })
    .catch((error) => {
      preparedClassroomCache.delete(preparedClassroomId);
      throw error;
    });
  preparedClassroomCache.set(preparedClassroomId, request);
  return request;
}

interface ProgressEntry {
  currentSceneIndex: number;
  totalScenes: number;
  completedScenes: string[];
  masteryLevel: string;
  quizScore?: number;
  lastActiveAt?: string;
  completionModelVersion?: number;
}

interface ProgressResponse {
  data?: {
    progress?: Record<string, ProgressEntry>;
  };
}

interface StudentStageHostProps {
  classroomId: string;
  courseId?: string;
  studentId?: string;
  studentName?: string;
  backHref: string;
  variant?: 'fullscreen' | 'embedded';
  mode?: StudentStageHostMode;
  className?: string;
  onSceneComplete?: (detail: {
    scene: Scene;
    quizScore?: number;
    completedSceneCount: number;
    totalSceneCount: number;
  }) => void;
  /** Plays an independently generated branch or micro lesson without course progress writes. */
  standalone?: boolean;
  /** Prepared adaptive classrooms to splice into the already-mounted player. */
  adaptiveInsertions?: AdaptiveSceneInsertion[];
  /** Prepared classroom ids to warm while the student completes the pretest/main lesson. */
  prefetchClassroomIds?: string[];
  knowledgeGraph?: KnowledgeGraph;
  knowledgePoints?: KnowledgePoint[];
  /** Optional controlled state for the page thumbnail rail. Teacher preview
   * uses this to open the rail without changing the student's saved setting. */
  sidebarCollapsed?: boolean;
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
}

export type AdaptiveSceneInsertion = {
  id: string;
  classroomId: string;
  placement: 'before-current' | 'after-current';
  /** Runtime id of the assessment that caused this insertion. */
  anchorSceneId?: string;
};

type AdaptiveScene = Scene & {
  openpblAdaptiveInsertionId?: string;
  openpblAdaptiveLastScene?: boolean;
  openpblAdaptiveClassroomId?: string;
  openpblAdaptiveReturnSceneId?: string;
};

type LoadState = 'loading' | 'ready' | 'error';
export type StudentStageHostMode = 'student' | 'teacher-preview';

export function shouldTrackStudentLearning(mode: StudentStageHostMode): boolean {
  return mode === 'student';
}

export function quizScoreForScene(scene: Scene): number | undefined {
  const submitted = readSubmittedState(scene.id);
  if (submitted?.kind !== 'reviewing' || submitted.results.length === 0) return undefined;
  const correct = submitted.results.filter((result) => result.status === 'correct').length;
  return Math.round((correct / submitted.results.length) * 100);
}

/**
 * The student player is a hard audience boundary. A split classroom normally
 * already contains only student scenes, but filtering here protects the
 * playback UI when a classroom is opened before the split finishes or when a
 * malformed scene is returned by storage.
 */
export function selectStudentLearningScenes(scenes: Scene[]): Scene[] {
  const hasPblRoutingMetadata = scenes.some(
    (scene) =>
      Boolean(scene.stageKey) ||
      Boolean(scene.audience) ||
      Boolean(scene.generationPurpose),
  );
  if (!hasPblRoutingMetadata) return scenes;

  return scenes.filter(isStudentAiLearningScene);
}

export function prepareAdaptiveInsertionScenes(
  insertionId: string,
  classroomId: string,
  scenes: Scene[],
): Scene[] {
  return scenes.map((scene, index) => ({
    ...migrateScene(scene),
    id: `adaptive:${insertionId}:${scene.id}`,
    openpblAdaptiveInsertionId: insertionId,
    openpblAdaptiveLastScene: index === scenes.length - 1,
    openpblAdaptiveClassroomId: classroomId,
  })) as AdaptiveScene[];
}

export function resolveAdaptiveInsertionIndex(
  scenes: Scene[],
  currentSceneId: string | null,
  insertion: AdaptiveSceneInsertion,
): number {
  const currentIndex = Math.max(
    0,
    scenes.findIndex((scene) => scene.id === currentSceneId),
  );
  if (insertion.placement === 'before-current') return currentIndex;
  const anchorIndex = insertion.anchorSceneId
    ? scenes.findIndex((scene) => scene.id === insertion.anchorSceneId)
    : -1;
  return (anchorIndex >= 0 ? anchorIndex : currentIndex) + 1;
}

type PreparedAdaptiveInsertion = {
  insertion: AdaptiveSceneInsertion;
  scenes: Scene[];
};

/**
 * Compose a batch before publishing it to the player store. In particular,
 * prerequisite segments must already be at the head of the queue when Stage
 * mounts; inserting them afterwards makes the main lesson audibly start and
 * then jump backwards once for every resource that finishes loading.
 */
export function composeAdaptiveSceneQueue(
  scenes: Scene[],
  currentSceneId: string | null,
  prepared: PreparedAdaptiveInsertion[],
): { scenes: Scene[]; activatedSceneId?: string } {
  const nextScenes = [...scenes];
  const activatedSceneId = prepared[0]?.scenes[0]?.id;
  const insertionGroups = new Map<number, PreparedAdaptiveInsertion[]>();
  for (const item of prepared) {
    const insertionIndex = resolveAdaptiveInsertionIndex(
      scenes,
      currentSceneId,
      item.insertion,
    );
    insertionGroups.set(insertionIndex, [
      ...(insertionGroups.get(insertionIndex) ?? []),
      item,
    ]);
  }
  // Work backwards through the untouched base indexes. Items sharing an
  // anchor are spliced as one declared-order segment and their tails form a
  // deterministic A -> B -> main-course return chain.
  for (const [insertionIndex, group] of [...insertionGroups.entries()].sort(
    ([left], [right]) => right - left,
  )) {
    const returnSceneId = nextScenes[insertionIndex]?.id;
    let downstreamSceneId = returnSceneId;
    for (const item of [...group].reverse()) {
      const lastInsertedScene = item.scenes.at(-1) as AdaptiveScene | undefined;
      if (lastInsertedScene && downstreamSceneId) {
        lastInsertedScene.openpblAdaptiveReturnSceneId = downstreamSceneId;
      }
      downstreamSceneId = item.scenes[0]?.id ?? downstreamSceneId;
    }
    nextScenes.splice(insertionIndex, 0, ...group.flatMap((item) => item.scenes));
  }
  return { scenes: nextScenes, activatedSceneId };
}

function expectedDurationSec(scene?: Scene): number | undefined {
  if (!scene) return undefined;
  if (scene.timingPlan) {
    const target = scene.timingPlan.activityTargetDurationSec ?? scene.timingPlan.targetDurationSec;
    if (target > 0) return target;
  }
  const value = (scene as Scene & { estimatedDuration?: number }).estimatedDuration;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value <= 60 ? value * 60 : value;
  }
  const speechText = (scene.actions ?? [])
    .filter((action) => action.type === 'speech' && 'text' in action && typeof action.text === 'string')
    .map((action) => 'text' in action && typeof action.text === 'string' ? action.text : '')
    .join('\n');
  return speechText ? Math.max(30, estimateSpeechDurationSec(speechText)) : undefined;
}

function sceneAudioUrls(scene?: Scene): string[] {
  if (!scene) return [];
  return [...new Set((scene.actions ?? []).flatMap((action) =>
    action.type === 'speech' && action.audioUrl ? [action.audioUrl] : [],
  ))];
}

function audioDurationSec(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;
    let timer = 0;
    const finish = (duration: number | undefined) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      resolve(duration);
    };
    timer = window.setTimeout(() => finish(undefined), 8_000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : undefined);
    audio.onerror = () => finish(undefined);
    audio.src = url;
  });
}

async function measuredSceneTtsDurationSec(scene: Scene): Promise<number | undefined> {
  const durations = await Promise.all(sceneAudioUrls(scene).map(audioDurationSec));
  const measured = durations.reduce<number>((sum, duration) => sum + (duration ?? 0), 0);
  return measured > 0 ? measured : undefined;
}

export function StudentStageHost({
  classroomId,
  courseId,
  studentId,
  studentName,
  backHref,
  variant = 'fullscreen',
  mode = 'student',
  className,
  onSceneComplete,
  standalone = false,
  adaptiveInsertions = [],
  prefetchClassroomIds = [],
  knowledgeGraph,
  knowledgePoints = [],
  sidebarCollapsed,
  onSidebarCollapsedChange,
}: StudentStageHostProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState<string | undefined>();
  const [activeMediaClassroomId, setActiveMediaClassroomId] = useState(classroomId);
  const [autoplaySceneId, setAutoplaySceneId] = useState<string>();

  // 已完成的场景 ID 集合（在内存中维护，避免重复上报）
  const completedRef = useRef<Set<string>>(new Set());
  // 上一次上报的 sceneId，避免相同 scene 重复 POST
  const lastReportedSceneRef = useRef<string | null>(null);
  // 已上报"全部完成"标记
  const completionReportedRef = useRef<boolean>(false);
  const classroomLoadControllerRef = useRef<AbortController | null>(null);
  // store 订阅卸载函数
  const unsubscribeRef = useRef<(() => void) | null>(null);
  // 是否已成功 hydrate store（用于阻止 hydrate 前的 subscribe 触发误报）
  const hydratedRef = useRef<boolean>(false);
  const telemetryQueueRef = useRef<LearningEvent[]>([]);
  const telemetryFlushingRef = useRef(false);
  const sceneEnteredAtRef = useRef<number | null>(null);
  const lastHeartbeatAtRef = useRef<number | null>(null);
  const seenSceneIdsRef = useRef<Set<string>>(new Set());
  const ttsDurationBySceneRef = useRef<Map<string, number>>(new Map());
  const mainSceneIdsRef = useRef<Set<string>>(new Set());
  const insertedAdaptiveIdsRef = useRef<Set<string>>(new Set());
  // A prerequisite queue is immutable for this player mount. Capture it so
  // later branch-run persistence cannot reload the main classroom underneath
  // an actively playing student.
  const initialPrerequisiteInsertionsRef = useRef(
    adaptiveInsertions.filter((insertion) => insertion.placement === 'before-current'),
  );
  const trackingEnabled = !standalone && shouldTrackStudentLearning(mode) && Boolean(courseId && studentId);
  const prefetchClassroomKey = prefetchClassroomIds.join('|');

  useEffect(() => {
    if (variant !== 'embedded') return;
    // The fullscreen control already prioritizes the scene canvas. Apply the
    // same default to the in-course player instead of restoring a previously
    // expanded sidebar/chat layout that can squeeze interactive scenes into a
    // narrow viewport. Students can still reopen either panel from the canvas.
    useSettingsStore.setState({
      sidebarCollapsed: true,
      chatAreaCollapsed: true,
    });
  }, [variant]);

  const flushTelemetry = useCallback(async () => {
    if (!trackingEnabled || !courseId || !studentId || telemetryFlushingRef.current) return;
    const events = telemetryQueueRef.current.splice(0);
    if (!events.length) return;
    telemetryFlushingRef.current = true;
    try {
      await postLearningEvents({ courseId, studentId, events });
    } catch {
      telemetryQueueRef.current.unshift(...events);
    } finally {
      telemetryFlushingRef.current = false;
    }
  }, [courseId, studentId, trackingEnabled]);

  const queueTelemetry = useCallback((
    type: LearningEventType,
    sceneId?: string | null,
    patch: Partial<Pick<LearningEvent, 'durationMs' | 'visible' | 'progressMarker' | 'metadata'>> = {},
  ) => {
    if (!trackingEnabled || !courseId || !studentId) return;
    const scenes = useStageStore.getState().scenes;
    const sceneIndex = scenes.findIndex((item) => item.id === sceneId);
    const scene = sceneIndex >= 0 ? scenes[sceneIndex] : undefined;
    const measuredTtsDurationSec = sceneId ? ttsDurationBySceneRef.current.get(sceneId) : undefined;
    telemetryQueueRef.current.push(createLearningEvent(type, {
      courseId,
      studentId,
      stageKey: 'ai-learning',
      ...patch,
      ...(sceneId ? { sceneId } : {}),
      ...(expectedDurationSec(scene) ? { expectedDurationSec: expectedDurationSec(scene) } : {}),
      ...(measuredTtsDurationSec ? { ttsDurationSec: measuredTtsDurationSec } : {}),
      ...(scene?.timingPlan?.studentActivitySec
        ? { plannedStudentActivitySec: scene.timingPlan.studentActivitySec }
        : {}),
      ...(scene ? {
        content: {
          stageLabel: scene.stageLabel ?? 'AI 授知',
          sceneTitle: scene.title,
          sceneIndex: sceneIndex + 1,
          sceneType: scene.type,
          activityId: scene.parentActivityId ?? scene.activityId,
          knowledgePointIds: scene.knowledgePointIds ?? [],
        },
        metadata: {
          sceneTitle: scene.title,
          sceneIndex: sceneIndex + 1,
          ...(patch.metadata ?? {}),
        },
      } : {}),
    }));
  }, [courseId, studentId, trackingEnabled]);

  const loadClassroom = useCallback(async () => {
    classroomLoadControllerRef.current?.abort();
    const loadController = new AbortController();
    classroomLoadControllerRef.current = loadController;
    setState('loading');
    setErrorMsg(undefined);
    try {
      // 1. 拉取课堂
      const res = await fetch(
        `/api/openmaic/classroom?id=${encodeURIComponent(classroomId)}`,
        { cache: 'no-store', signal: loadController.signal },
      );
      if (!res.ok) {
        setErrorMsg(
          res.status === 404
            ? 'AI 课堂不存在或已被移除'
            : `加载失败（HTTP ${res.status}）`,
        );
        setState('error');
        return;
      }
      const json = (await res.json()) as { success: boolean; classroom?: ClassroomPayload };
      if (!json.success || !json.classroom) {
        setErrorMsg('AI 课堂内容为空');
        setState('error');
        return;
      }
      const { stage, scenes } = json.classroom;
      if (!Array.isArray(scenes) || scenes.length === 0) {
        setErrorMsg('AI 课堂未包含任何场景');
        setState('error');
        return;
      }

      const studentScenes = standalone ? scenes : selectStudentLearningScenes(scenes);
      if (studentScenes.length === 0) {
        setErrorMsg('AI 课堂中没有可供学生学习的场景');
        setState('error');
        return;
      }

      // 2. 拉取已有进度（用于恢复 currentSceneIndex）
      let restoredIndex = 0;
      let restoredCompleted: string[] = [];
      if (!standalone && mode === 'student' && courseId && studentId) {
        try {
          const progRes = await fetch(
            `/api/openmaic/progress?courseId=${encodeURIComponent(courseId)}&studentId=${encodeURIComponent(studentId)}`,
            { cache: 'no-store', signal: loadController.signal },
          );
          if (progRes.ok) {
            const progJson = (await progRes.json()) as ProgressResponse;
            const entry = progJson.data?.progress?.[studentId];
            if (entry && isReliableAiProgress(entry)) {
              restoredIndex = Math.min(
                entry.currentSceneIndex ?? 0,
                Math.max(0, studentScenes.length - 1),
              );
              restoredCompleted = entry.completedScenes ?? [];
            }
          }
        } catch {
          // 进度恢复失败不阻断学习
        }
      }
      completedRef.current = new Set(restoredCompleted);
      if (loadController.signal.aborted) return;
      lastReportedSceneRef.current = studentScenes[restoredIndex]?.id ?? null;
      // 已上报过完成：恢复进度中已完成场景数 >= 总场景数
      completionReportedRef.current = restoredCompleted.length >= studentScenes.length;

      // 3. hydrate useStageStore（与 OpenMAIC classroom page 一致）
      const migrated = studentScenes.map(migrateScene);
      mainSceneIdsRef.current = new Set(migrated.map((scene) => scene.id));
      insertedAdaptiveIdsRef.current.clear();
      const restoredMainSceneId = migrated[restoredIndex]?.id ?? migrated[0]?.id ?? null;
      const preparedPrerequisites = await Promise.all(
        initialPrerequisiteInsertionsRef.current.map(async (insertion) => {
          const classroom = await prefetchAdaptiveClassroom(insertion.classroomId);
          const preparedStudentScenes = selectStudentLearningScenes(classroom.scenes);
          return {
            insertion,
            scenes: prepareAdaptiveInsertionScenes(
              insertion.id,
              insertion.classroomId,
              preparedStudentScenes.length ? preparedStudentScenes : classroom.scenes,
            ),
          };
        }),
      );
      if (loadController.signal.aborted) return;
      const initialQueue = composeAdaptiveSceneQueue(
        migrated,
        restoredMainSceneId,
        preparedPrerequisites,
      );
      preparedPrerequisites.forEach(({ insertion }) =>
        insertedAdaptiveIdsRef.current.add(insertion.id),
      );
      const initialSceneId = initialQueue.activatedSceneId ?? restoredMainSceneId ?? undefined;
      useStageStore.getState().setStage(stage);
      useStageStore.setState({
        scenes: initialQueue.scenes,
        currentSceneId: initialSceneId ?? null,
        // playback 模式：学生端只读，不允许进入 Pro 编辑模式
        mode: 'playback',
        // 清空生成相关 transient 状态，避免 IndexedDB 残留触发自动生成
        outlines: [],
        generatingOutlines: [],
        generationComplete: true,
        generationStatus: 'completed',
      });
      const initialAdaptiveScene = initialQueue.scenes.find(
        (scene) => scene.id === initialSceneId,
      ) as AdaptiveScene | undefined;
      setActiveMediaClassroomId(
        initialAdaptiveScene?.openpblAdaptiveClassroomId ?? classroomId,
      );
      if (initialQueue.activatedSceneId) setAutoplaySceneId(initialQueue.activatedSceneId);
      // Preserve the configured provider and voice. Generated classrooms carry
      // server-side audio URLs; forcing browser-native here silently replaced
      // the teacher/system voice choice whenever a segment lacked an asset.
      useSettingsStore.setState((s) => ({
        ttsEnabled: true,
        ttsMuted: false,
        ttsVolume: s.ttsVolume > 0 ? s.ttsVolume : 1,
      }));
      hydratedRef.current = true;
      ttsDurationBySceneRef.current.clear();
      for (const scene of initialQueue.scenes) {
        if (!sceneAudioUrls(scene).length) continue;
        void measuredSceneTtsDurationSec(scene).then((duration) => {
          if (!duration || !hydratedRef.current) return;
          ttsDurationBySceneRef.current.set(scene.id, duration);
          if (useStageStore.getState().currentSceneId === scene.id) {
            queueTelemetry('heartbeat', scene.id, { durationMs: 0, visible: true });
            void flushTelemetry();
          }
        });
      }
      if (trackingEnabled && initialSceneId) {
        seenSceneIdsRef.current.add(initialSceneId);
        sceneEnteredAtRef.current = Date.now();
        lastHeartbeatAtRef.current = Date.now();
        queueTelemetry('stage-enter', initialSceneId);
        queueTelemetry('scene-enter', initialSceneId);
        void flushTelemetry();
      }
      log.info('Stage store hydrated for classroom:', classroomId);

      setState('ready');
    } catch (err) {
      if (
        loadController.signal.aborted ||
        (err instanceof DOMException && err.name === 'AbortError')
      ) {
        return;
      }
      log.error('Failed to load classroom:', err);
      setErrorMsg(err instanceof Error ? err.message : '网络异常，请稍后重试');
      setState('error');
    } finally {
      if (classroomLoadControllerRef.current === loadController) {
        classroomLoadControllerRef.current = null;
      }
    }
  }, [classroomId, courseId, flushTelemetry, mode, queueTelemetry, standalone, studentId, trackingEnabled]);

  const loadPreparedClassroom = useCallback(
    (preparedClassroomId: string) =>
      prefetchAdaptiveClassroom(preparedClassroomId),
    [],
  );

  useEffect(() => {
    if (!prefetchClassroomKey) return;
    for (const preparedClassroomId of prefetchClassroomIds) {
      void loadPreparedClassroom(preparedClassroomId).catch(() => undefined);
    }
  }, [loadPreparedClassroom, prefetchClassroomIds, prefetchClassroomKey]);

  useEffect(() => {
    if (state !== 'ready') return;
    const pending = adaptiveInsertions.filter(
      (insertion) => !insertedAdaptiveIdsRef.current.has(insertion.id),
    );
    if (!pending.length) return;
    let cancelled = false;
    void (async () => {
      const prepared = await Promise.all(
        pending.map(async (insertion) => {
          const classroom = await loadPreparedClassroom(insertion.classroomId);
          const studentScenes = selectStudentLearningScenes(classroom.scenes);
          return {
            insertion,
            scenes: prepareAdaptiveInsertionScenes(
              insertion.id,
              insertion.classroomId,
              studentScenes.length ? studentScenes : classroom.scenes,
            ),
          };
        }),
      );
      if (cancelled) return;
      const storeState = useStageStore.getState();
      const nextQueue = composeAdaptiveSceneQueue(
        storeState.scenes,
        storeState.currentSceneId,
        prepared,
      );
      prepared.forEach(({ insertion }) =>
        insertedAdaptiveIdsRef.current.add(insertion.id),
      );
      if (nextQueue.activatedSceneId) setAutoplaySceneId(nextQueue.activatedSceneId);
      useStageStore.setState({
        scenes: nextQueue.scenes,
        currentSceneId: nextQueue.activatedSceneId ?? storeState.currentSceneId,
      });
    })().catch((error) => {
      log.error('Failed to insert prepared adaptive classroom:', error);
    });
    return () => {
      cancelled = true;
    };
  }, [adaptiveInsertions, loadPreparedClassroom, state]);

  // 上报进度到 /api/openmaic/progress
  const reportProgress = useCallback(
    async (nextSceneId: string | null, quizScore?: number) => {
      if (standalone || mode !== 'student' || !courseId || !studentId || !classroomId) return;
      // 取当前 store 的 scenes 列表
      const storeState = useStageStore.getState();
      const scenes = storeState.scenes.filter((scene) =>
        mainSceneIdsRef.current.has(scene.id),
      );
      if (scenes.length === 0) return;

      const directIndex = nextSceneId
        ? scenes.findIndex((scene) => scene.id === nextSceneId)
        : -1;
      const currentIdx = directIndex >= 0
        ? directIndex
        : Math.min(
            scenes.length - 1,
            Array.from(completedRef.current).filter((id) =>
              mainSceneIdsRef.current.has(id),
            ).length,
          );
      const completedScenes = Array.from(completedRef.current).filter((id) =>
        mainSceneIdsRef.current.has(id),
      );
      const isAllComplete = completedScenes.length >= scenes.length;

      // 已上报过完成且状态未变化则跳过
      if (isAllComplete && completionReportedRef.current) return;

      try {
        await fetch('/api/openmaic/progress', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-OpenPBL-Role': 'student',
          },
          body: JSON.stringify({
            courseId,
            studentId,
            studentName,
            classroomId,
            currentSceneIndex: currentIdx,
            totalScenes: scenes.length,
            completedScenes,
            completionModelVersion: AI_PROGRESS_COMPLETION_MODEL_VERSION,
            ...(quizScore !== undefined ? { quizScore } : {}),
          }),
        });
        if (isAllComplete) completionReportedRef.current = true;
      } catch {
        // 上报失败静默处理
      }
    },
    [courseId, studentId, studentName, classroomId, mode, standalone],
  );

  const settleScene = useCallback(
    (
      scene: Scene,
      storeScenes: Scene[],
      options: { requireSubmittedAssessment?: boolean } = {},
    ): boolean => {
      if (completedRef.current.has(scene.id)) return false;
      const quizScore = quizScoreForScene(scene);
      if (options.requireSubmittedAssessment && quizScore === undefined) return false;

      completedRef.current.add(scene.id);
      queueTelemetry('scene-complete', scene.id, { progressMarker: 'completed' });
      const completedMainSceneCount = Array.from(completedRef.current).filter((id) =>
        mainSceneIdsRef.current.has(id),
      ).length;
      if (completedMainSceneCount >= mainSceneIdsRef.current.size) {
        queueTelemetry('stage-goal-complete', null, { progressMarker: 'completed' });
      }
      void flushTelemetry();
      onSceneComplete?.({
        scene,
        quizScore,
        completedSceneCount: completedRef.current.size,
        totalSceneCount: storeScenes.length,
      });
      void reportProgress(scene.id, quizScore);
      return true;
    },
    [flushTelemetry, onSceneComplete, queueTelemetry, reportProgress],
  );

  const handlePlaybackStateChange = useCallback(
    (playbackState: Omit<PlaybackSyncState, 'version'>) => {
      if (mode !== 'student') return;
      const storeState = useStageStore.getState();
      const scene = storeState.scenes.find((item) => item.id === storeState.currentSceneId);
      if (!scene || !isScenePlaybackExhausted(scene, playbackState)) return;
      if (!settleScene(scene, storeState.scenes)) return;
      const adaptiveScene = scene as AdaptiveScene;
      if (adaptiveScene.openpblAdaptiveLastScene) {
        const sceneIndex = storeState.scenes.findIndex((item) => item.id === scene.id);
        const nextScene = adaptiveScene.openpblAdaptiveReturnSceneId
          ? storeState.scenes.find((item) => item.id === adaptiveScene.openpblAdaptiveReturnSceneId)
          : storeState.scenes[sceneIndex + 1];
        if (nextScene) {
          setAutoplaySceneId(nextScene.id);
          queueMicrotask(() => useStageStore.getState().setCurrentSceneId(nextScene.id));
        }
      }
    },
    [mode, settleScene],
  );

  // 订阅 useStageStore 的 currentSceneId 变化
  useEffect(() => {
    if (state !== 'ready') return;
    if (unsubscribeRef.current) return; // 避免重复订阅

    let prevSceneId = useStageStore.getState().currentSceneId;
    unsubscribeRef.current = useStageStore.subscribe((current, previous) => {
      if (!hydratedRef.current) return;
      if (current.currentSceneId === prevSceneId) return;
      prevSceneId = current.currentSceneId;
      if (
        previous.currentSceneId &&
        previous.currentSceneId !== current.currentSceneId
      ) {
        const previousScene = previous.scenes.find(
          (scene) => scene.id === previous.currentSceneId,
        );
        if (previousScene) {
          settleScene(previousScene, previous.scenes, {
            requireSubmittedAssessment: true,
          });
        }
        queueTelemetry('scene-leave', previous.currentSceneId, {
          durationMs: Math.max(0, Date.now() - (sceneEnteredAtRef.current ?? Date.now())),
          visible: typeof document === 'undefined' ? true : document.visibilityState === 'visible',
        });
      }
      if (current.currentSceneId) {
        const currentScene = current.scenes.find(
          (scene) => scene.id === current.currentSceneId,
        ) as AdaptiveScene | undefined;
        setActiveMediaClassroomId(
          currentScene?.openpblAdaptiveClassroomId ?? classroomId,
        );
        if (seenSceneIdsRef.current.has(current.currentSceneId)) {
          queueTelemetry('scene-replay', current.currentSceneId);
        }
        seenSceneIdsRef.current.add(current.currentSceneId);
        sceneEnteredAtRef.current = Date.now();
        lastHeartbeatAtRef.current = Date.now();
        queueTelemetry('scene-enter', current.currentSceneId);
        void flushTelemetry();
      }
      lastReportedSceneRef.current = current.currentSceneId;
      void reportProgress(current.currentSceneId);
    });
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [classroomId, flushTelemetry, queueTelemetry, reportProgress, settleScene, state]);

  useEffect(() => {
    if (state !== 'ready' || !trackingEnabled) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      const currentSceneId = useStageStore.getState().currentSceneId;
      queueTelemetry('heartbeat', currentSceneId, {
        durationMs: Math.max(0, now - (lastHeartbeatAtRef.current ?? now)),
        visible: true,
      });
      lastHeartbeatAtRef.current = now;
      void flushTelemetry();
    }, 10_000);
    const handleVisibility = () => {
      lastHeartbeatAtRef.current = Date.now();
      if (document.visibilityState === 'hidden') void flushTelemetry();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flushTelemetry, queueTelemetry, state, trackingEnabled]);

  // 初次加载
  useEffect(() => {
    queueMicrotask(() => {
      void loadClassroom();
    });
    // 组件卸载时清空 store，避免跨课堂污染
    return () => {
      classroomLoadControllerRef.current?.abort();
      const currentSceneId = useStageStore.getState().currentSceneId;
      queueTelemetry('scene-leave', currentSceneId, {
        durationMs: Math.max(0, Date.now() - (sceneEnteredAtRef.current ?? Date.now())),
        visible: typeof document === 'undefined' ? true : document.visibilityState === 'visible',
      });
      void flushTelemetry();
      hydratedRef.current = false;
      useStageStore.getState().clearStore();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId, flushTelemetry, queueTelemetry]);

  return (
    <ThemeProvider>
      <I18nProvider>
        <ServerProvidersInit />
        <MediaStageProvider value={activeMediaClassroomId}>
          <div
            data-openpbl-embed
            data-stage-host-mode={mode}
            data-back-href={backHref}
            className={cn(
              'relative flex flex-col overflow-hidden bg-background text-foreground',
              variant === 'embedded'
                ? 'h-[calc(100dvh-135px)] min-h-[720px] max-h-[1080px] rounded-[8px] border border-stone-200'
                : 'h-screen',
              className,
            )}
          >

            {state === 'loading' ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-primary" />
                  <p className="text-sm">正在加载 AI 课堂...</p>
                </div>
              </div>
            ) : state === 'error' ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="max-w-md text-center">
                  <p className="mb-4 text-sm text-destructive">{errorMsg}</p>
                  <button
                    onClick={() => void loadClassroom()}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <RefreshCw size={16} /> 重试
                  </button>
                </div>
              </div>
            ) : (
              <TeachingKnowledgeGraphProvider graph={knowledgeGraph} points={knowledgePoints}>
                <Stage
                  autoplaySceneId={autoplaySceneId}
                  experience="student-course"
                  onPlaybackStateChange={handlePlaybackStateChange}
                  sidebarCollapsed={sidebarCollapsed}
                  onSidebarCollapsedChange={onSidebarCollapsedChange}
                />
              </TeachingKnowledgeGraphProvider>
            )}
          </div>
        </MediaStageProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
