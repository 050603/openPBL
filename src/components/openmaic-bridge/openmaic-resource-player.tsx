"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Stage } from "@openmaic/components/stage";
import { ServerProvidersInit } from "@openmaic/components/server-providers-init";
import { MediaStageProvider } from "@openmaic/lib/contexts/media-stage-context";
import { migrateScene } from "@openmaic/lib/edit/slide-schema";
import { I18nProvider } from "@openmaic/lib/hooks/use-i18n";
import { ThemeProvider } from "@openmaic/lib/hooks/use-theme";
import { createLogger } from "@openmaic/lib/logger";
import { useStageStore } from "@openmaic/lib/store";
import { useSettingsStore } from "@openmaic/lib/store/settings";
import type { Scene, Stage as StageType } from "@openmaic/lib/types/stage";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui";

const log = createLogger("OpenMaicResourcePlayer");

type LoadState = "loading" | "ready" | "error";

interface ClassroomPayload {
  stage: StageType;
  scenes: Scene[];
}

export function OpenMaicResourcePlayer({
  classroomId,
  sceneId,
  className,
}: {
  classroomId: string;
  sceneId?: string;
  className?: string;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>();

  const loadResource = useCallback(async () => {
    setState("loading");
    setErrorMessage(undefined);

    try {
      const response = await fetch(
        `/api/openmaic/classroom?id=${encodeURIComponent(classroomId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "授课资源课堂不存在或已被移除"
            : `授课资源加载失败（HTTP ${response.status}）`,
        );
      }

      const payload = (await response.json()) as {
        success?: boolean;
        classroom?: ClassroomPayload;
      };
      if (!payload.success || !payload.classroom) {
        throw new Error("授课资源课堂返回内容为空");
      }

      const selectedScene = sceneId
        ? payload.classroom.scenes.find((scene) => scene.id === sceneId)
        : payload.classroom.scenes[0];
      if (!selectedScene) {
        throw new Error("所选授课资源场景不存在，请重新生成课程资源");
      }

      // Older split classrooms kept the original student stageId on teacher
      // scenes. Normalize it at read time so existing courses render too.
      const migratedScene = migrateScene({
        ...selectedScene,
        stageId: payload.classroom.stage.id,
      } as Scene);
      useStageStore.getState().setStage(payload.classroom.stage);
      useStageStore.setState({
        scenes: [migratedScene],
        currentSceneId: migratedScene.id,
        mode: "playback",
        outlines: [],
        generatingOutlines: [],
        generationComplete: true,
        generationStatus: "completed",
      });
      useSettingsStore.setState((settings) => ({
        ttsEnabled: true,
        ttsProviderId: settings.ttsProviderId || "browser-native-tts",
        ttsProvidersConfig: {
          ...settings.ttsProvidersConfig,
          "browser-native-tts": {
            ...settings.ttsProvidersConfig?.["browser-native-tts"],
            enabled: true,
          },
        },
      }));
      setState("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "授课资源加载失败";
      log.error("Failed to load projected teacher resource:", error);
      setErrorMessage(message);
      setState("error");
      toast.error("资源加载失败", { description: message });
    }
  }, [classroomId, sceneId]);

  useEffect(() => {
    // Loading the external classroom snapshot initializes both Zustand stores
    // and this component's visible loading state as one bridge operation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadResource();
    return () => {
      useStageStore.getState().clearStore();
    };
  }, [loadResource]);

  return (
    <ThemeProvider>
      <I18nProvider>
        <ServerProvidersInit />
        <MediaStageProvider value={classroomId}>
          <div
            className={cn(
              "relative flex min-h-0 flex-col overflow-hidden bg-background text-foreground",
              className,
            )}
          >
            {state === "loading" ? (
              <div className="flex flex-1 items-center justify-center bg-slate-50">
                <div className="text-center text-slate-500">
                  <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-blue-600" />
                  <p className="text-sm">正在加载授课资源...</p>
                </div>
              </div>
            ) : state === "error" ? (
              <div className="flex flex-1 items-center justify-center bg-rose-50/40 p-6">
                <div className="max-w-md text-center">
                  <AlertTriangle className="mx-auto mb-3 text-rose-600" size={28} />
                  <p className="text-sm leading-6 text-rose-700">{errorMessage}</p>
                  <button
                    className="mt-4 inline-flex h-9 items-center gap-2 rounded-[6px] bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
                    onClick={() => void loadResource()}
                    type="button"
                  >
                    <RefreshCw size={15} /> 重试
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
