"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Brain, Pencil, RefreshCw, Save, Users } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import { useSession } from "@/lib/session/store";
import type { Course, GroupBoardMode } from "@/lib/session/types";

// tldraw ships a CSS file that must be imported once on the client.
// We import it inside the dynamically-loaded wrapper to avoid SSR issues.
const TldrawWrapper = dynamic(() => import("./tldraw-wrapper"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[480px] place-items-center rounded-[10px] border border-slate-200 bg-slate-50 text-sm text-slate-500">
      正在加载协作画板...
    </div>
  ),
});

type GroupBoardEditorProps = {
  course: Course;
  groupId: string;
  /** When true, render a read-only monitoring view (used by teachers). */
  readOnly?: boolean;
};

export function GroupBoardEditor({ course, groupId, readOnly = false }: GroupBoardEditorProps) {
  const session = useSession();
  const board = course.boards?.find((b) => b.groupId === groupId);
  const [mode, setMode] = useState<GroupBoardMode>(board?.mode ?? "mindmap");
  const [autosaveTick, setAutosaveTick] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>(board?.updatedAt);

  const handleModeChange = useCallback(
    (next: GroupBoardMode) => {
      setMode(next);
      // Persist mode change immediately so peers see the switch.
      session.upsertGroupBoard(course.id, {
        groupId,
        snapshot: board?.snapshot ?? null,
        mode: next,
      });
    },
    [board?.snapshot, course.id, groupId, session],
  );

  const handleSnapshot = useCallback(
    (snapshot: unknown) => {
      if (readOnly) return;
      const now = new Date().toISOString();
      session.upsertGroupBoard(course.id, { groupId, snapshot, mode, updatedAt: now });
      setLastSavedAt(now);
      setAutosaveTick((t) => t + 1);
    },
    [course.id, groupId, mode, readOnly, session],
  );

  const collaboratorCount = useMemo(() => {
    const group = course.groups?.find((g) => g.id === groupId);
    return group?.members.length ?? 0;
  }, [course.groups, groupId]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">
            {mode === "mindmap" ? "协作思维导图" : "协作白板"}
          </h2>
          <Pill tone="blue">
            <Users size={12} className="mr-1 inline" />
            {collaboratorCount} 人协作
          </Pill>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle mode={mode} onChange={handleModeChange} disabled={readOnly} />
          {!readOnly ? (
            <span className="text-xs text-slate-500" data-testid="board-autosave-status">
              <Save size={12} className="mr-1 inline" />
              {lastSavedAt ? `已自动保存 · ${new Date(lastSavedAt).toLocaleTimeString("zh-CN")}` : "自动保存已开启"}
              {autosaveTick > 0 ? ` · ${autosaveTick}` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <RefreshCw size={12} /> 教师只读视图
            </span>
          )}
        </div>
      </div>
      <div className="relative h-[560px] w-full">
        <TldrawWrapper
          key={`${course.id}:${groupId}`}
          groupId={groupId}
          initialSnapshot={board?.snapshot ?? null}
          mode={mode}
          readOnly={readOnly}
          onSnapshot={handleSnapshot}
          remoteSnapshot={board?.snapshot}
          remoteUpdatedAt={board?.updatedAt}
        />
      </div>
    </Card>
  );
}

function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: GroupBoardMode;
  onChange: (next: GroupBoardMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-[6px] border border-slate-200 bg-slate-50 p-1" role="tablist">
      <button
        className={`inline-flex h-8 items-center gap-1 rounded-[5px] px-3 text-sm font-semibold transition ${
          mode === "mindmap" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"
        }`}
        disabled={disabled}
        onClick={() => onChange("mindmap")}
        type="button"
        role="tab"
        aria-selected={mode === "mindmap"}
        data-testid="mode-mindmap"
      >
        <Brain size={14} /> 思维导图
      </button>
      <button
        className={`inline-flex h-8 items-center gap-1 rounded-[5px] px-3 text-sm font-semibold transition ${
          mode === "whiteboard" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"
        }`}
        disabled={disabled}
        onClick={() => onChange("whiteboard")}
        type="button"
        role="tab"
        aria-selected={mode === "whiteboard"}
        data-testid="mode-whiteboard"
      >
        <Pencil size={14} /> 白板
      </button>
    </div>
  );
}
