"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { StageWorkspaceMode } from "@/lib/session/types";

export type StudentWorkspaceMode = StageWorkspaceMode;

const DEFAULT_WORKSPACE_MODE: StudentWorkspaceMode = "companions";
const WORKSPACE_MODE_EVENT = "openpbl:workspace-mode-change";

export function workspaceModeStorageKey(courseId: string, studentId?: string, stageKey?: string): string {
  return `openpbl:student-workspace:${courseId}:${studentId || "anonymous"}:${stageKey || "course"}`;
}

export function useStudentWorkspaceMode(
  courseId: string,
  studentId?: string,
  stageKey?: string,
  defaultMode: StudentWorkspaceMode = DEFAULT_WORKSPACE_MODE,
) {
  const storageKey = workspaceModeStorageKey(courseId, studentId, stageKey);
  const subscribe = useCallback((onStoreChange: () => void) => {
    const onWorkspaceModeChange = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail === storageKey) onStoreChange();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === window.sessionStorage && event.key === storageKey) onStoreChange();
    };
    window.addEventListener(WORKSPACE_MODE_EVENT, onWorkspaceModeChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(WORKSPACE_MODE_EVENT, onWorkspaceModeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [storageKey]);
  const getSnapshot = useCallback((): StudentWorkspaceMode => {
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      return stored === "task" || stored === "companions" ? stored : defaultMode;
    } catch {
      return defaultMode;
    }
  }, [defaultMode, storageKey]);
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => defaultMode);

  const setMode = useCallback((nextMode: StudentWorkspaceMode) => {
    try {
      window.sessionStorage.setItem(storageKey, nextMode);
      window.dispatchEvent(new CustomEvent(WORKSPACE_MODE_EVENT, { detail: storageKey }));
    } catch {
      // Embedded browsers that deny storage keep the safe immersive default.
    }
  }, [storageKey]);

  return [mode, setMode] as const;
}
