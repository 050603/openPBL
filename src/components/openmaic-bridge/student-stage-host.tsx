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
import { cn } from '@/lib/utils';

const log = createLogger('StudentStageHost');

interface ClassroomPayload {
  stage: StageType;
  scenes: Scene[];
}

interface ProgressEntry {
  currentSceneIndex: number;
  totalScenes: number;
  completedScenes: string[];
  masteryLevel: string;
  quizScore?: number;
  lastActiveAt?: string;
}

interface ProgressResponse {
  data?: {
    progress?: Record<string, ProgressEntry>;
  };
}

interface StudentStageHostProps {
  classroomId: string;
  courseId?: string;
  studentId: string;
  studentName?: string;
  backHref: string;
  variant?: 'fullscreen' | 'embedded';
  className?: string;
}

type LoadState = 'loading' | 'ready' | 'error';

export function StudentStageHost({
  classroomId,
  courseId,
  studentId,
  studentName,
  backHref,
  variant = 'fullscreen',
  className,
}: StudentStageHostProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  // 已完成的场景 ID 集合（在内存中维护，避免重复上报）
  const completedRef = useRef<Set<string>>(new Set());
  // 上一次上报的 sceneId，避免相同 scene 重复 POST
  const lastReportedSceneRef = useRef<string | null>(null);
  // 已上报"全部完成"标记
  const completionReportedRef = useRef<boolean>(false);
  // store 订阅卸载函数
  const unsubscribeRef = useRef<(() => void) | null>(null);
  // 是否已成功 hydrate store（用于阻止 hydrate 前的 subscribe 触发误报）
  const hydratedRef = useRef<boolean>(false);

  const loadClassroom = useCallback(async () => {
    setState('loading');
    setErrorMsg(undefined);
    try {
      // 1. 拉取课堂
      const res = await fetch(
        `/api/openmaic/classroom?id=${encodeURIComponent(classroomId)}`,
        { cache: 'no-store' },
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

      // 2. 拉取已有进度（用于恢复 currentSceneIndex）
      let restoredIndex = 0;
      let restoredCompleted: string[] = [];
      if (courseId && studentId) {
        try {
          const progRes = await fetch(
            `/api/openmaic/progress?courseId=${encodeURIComponent(courseId)}`,
            { cache: 'no-store' },
          );
          if (progRes.ok) {
            const progJson = (await progRes.json()) as ProgressResponse;
            const entry = progJson.data?.progress?.[studentId];
            if (entry) {
              restoredIndex = Math.min(
                entry.currentSceneIndex ?? 0,
                Math.max(0, scenes.length - 1),
              );
              restoredCompleted = entry.completedScenes ?? [];
            }
          }
        } catch {
          // 进度恢复失败不阻断学习
        }
      }
      completedRef.current = new Set(restoredCompleted);
      lastReportedSceneRef.current = scenes[restoredIndex]?.id ?? null;
      // 已上报过完成：恢复进度中已完成场景数 >= 总场景数
      completionReportedRef.current = restoredCompleted.length >= scenes.length;

      // 3. hydrate useStageStore（与 OpenMAIC classroom page 一致）
      const migrated = scenes.map(migrateScene);
      useStageStore.getState().setStage(stage);
      useStageStore.setState({
        scenes: migrated,
        currentSceneId: migrated[restoredIndex]?.id ?? migrated[0]?.id ?? null,
        // playback 模式：学生端只读，不允许进入 Pro 编辑模式
        mode: 'playback',
        // 清空生成相关 transient 状态，避免 IndexedDB 残留触发自动生成
        outlines: [],
        generatingOutlines: [],
        generationComplete: true,
        generationStatus: 'completed',
      });
      // 学生端强制启用 TTS：默认使用 browser-native-tts（无需 API key），
      // 让 PlaybackEngine 在处理 speech action 时能调用浏览器原生语音合成。
      useSettingsStore.setState((s) => ({
        ttsEnabled: true,
        ttsProviderId: s.ttsProviderId || 'browser-native-tts',
        ttsProvidersConfig: {
          ...s.ttsProvidersConfig,
          'browser-native-tts': {
            ...s.ttsProvidersConfig?.['browser-native-tts'],
            enabled: true,
          },
        },
      }));
      hydratedRef.current = true;
      log.info('Stage store hydrated for classroom:', classroomId);

      setState('ready');
    } catch (err) {
      log.error('Failed to load classroom:', err);
      setErrorMsg(err instanceof Error ? err.message : '网络异常，请稍后重试');
      setState('error');
    }
  }, [classroomId, courseId, studentId]);

  // 上报进度到 /api/openmaic/progress
  const reportProgress = useCallback(
    async (nextSceneId: string | null, isComplete: boolean) => {
      if (!courseId || !studentId || !classroomId) return;
      // 取当前 store 的 scenes 列表
      const storeState = useStageStore.getState();
      const scenes = storeState.scenes;
      if (scenes.length === 0) return;

      const currentIdx = nextSceneId
        ? Math.max(0, scenes.findIndex((s) => s.id === nextSceneId))
        : scenes.length - 1;
      const completedSet = completedRef.current;
      // 把当前场景加入完成集合（学生看到即视为完成）
      if (nextSceneId) completedSet.add(nextSceneId);
      const completedScenes = Array.from(completedSet);
      const isAllComplete = isComplete || completedScenes.length >= scenes.length;

      // 已上报过完成且状态未变化则跳过
      if (isAllComplete && completionReportedRef.current) return;

      try {
        await fetch('/api/openmaic/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId,
            studentId,
            studentName,
            classroomId,
            currentSceneIndex: currentIdx,
            totalScenes: scenes.length,
            completedScenes,
          }),
        });
        if (isAllComplete) completionReportedRef.current = true;
      } catch {
        // 上报失败静默处理
      }
    },
    [courseId, studentId, studentName, classroomId],
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
      // 把上一个 scene 加入完成集合（如果是首次切换）
      if (
        previous.currentSceneId &&
        previous.currentSceneId !== current.currentSceneId
      ) {
        completedRef.current.add(previous.currentSceneId);
      }
      lastReportedSceneRef.current = current.currentSceneId;
      void reportProgress(current.currentSceneId, false);
    });
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [state, reportProgress]);

  // 初次加载
  useEffect(() => {
    queueMicrotask(() => {
      void loadClassroom();
    });
    // 组件卸载时清空 store，避免跨课堂污染
    return () => {
      hydratedRef.current = false;
      useStageStore.getState().clearStore();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId]);

  return (
    <ThemeProvider>
      <I18nProvider>
        <ServerProvidersInit />
        <MediaStageProvider value={classroomId}>
          <div
            data-back-href={backHref}
            className={cn(
              'relative flex flex-col overflow-hidden bg-background text-foreground',
              variant === 'embedded'
                ? 'h-full min-h-[640px] rounded-[8px] border border-slate-200'
                : 'h-screen',
              className,
            )}
          >
            {/* 返回入口由 Header 内置的 ArrowLeft 提供，避免 z-index 重叠 */}

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
              <Stage />
            )}
          </div>
        </MediaStageProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
