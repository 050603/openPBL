"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Brain, Pencil, RefreshCw, Users } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import { useSession } from "@/lib/session/store";
import type { Course, GroupBoardMode } from "@/lib/session/types";

const TldrawWrapper = dynamic(() => import("./tldraw-wrapper"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[480px] place-items-center rounded-[10px] border border-stone-200 bg-stone-50 text-sm text-stone-500">
      正在加载协作画板…
    </div>
  ),
});

type GroupBoardEditorProps = {
  course: Course;
  groupId: string;
  readOnly?: boolean;
};

export function GroupBoardEditor({
  course,
  groupId,
  readOnly = false,
}: GroupBoardEditorProps) {
  const session = useSession();
  const board = course.boards?.find((item) => item.groupId === groupId);
  const [mode, setMode] = useState<GroupBoardMode>(board?.mode ?? "mindmap");

  const handleModeChange = useCallback(
    (next: GroupBoardMode) => {
      setMode(next);
      // Drawing records are persisted by tldraw sync. This low-frequency
      // action retains only the course UI mode for peers and teacher views.
      session.upsertGroupBoard(course.id, {
        groupId,
        snapshot: null,
        mode: next,
      });
    },
    [course.id, groupId, session],
  );

  const collaboratorCount = useMemo(() => {
    const group = course.groups?.find((item) => item.id === groupId);
    return group?.members.length ?? 0;
  }, [course.groups, groupId]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
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
          <ModeToggle
            mode={mode}
            onChange={handleModeChange}
            disabled={readOnly}
          />
          <span
            className="inline-flex items-center gap-1 text-xs text-stone-500"
            data-testid="board-autosave-status"
          >
            <RefreshCw size={12} />
            {readOnly ? "教师只读视图" : "实时同步与自动持久化"}
          </span>
        </div>
      </div>
      <div className="relative h-[560px] w-full">
        <TldrawWrapper
          key={`${course.id}:${groupId}`}
          courseId={course.id}
          groupId={groupId}
          mode={mode}
          readOnly={readOnly}
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
    <div
      className="inline-flex rounded-[6px] border border-stone-200 bg-stone-50 p-1"
      role="tablist"
    >
      <button
        className={`inline-flex h-8 items-center gap-1 rounded-[5px] px-3 text-sm font-semibold transition ${
          mode === "mindmap"
            ? "bg-[var(--pbl-student)] text-white shadow-sm"
            : "text-stone-600 hover:bg-white"
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
          mode === "whiteboard"
            ? "bg-[var(--pbl-student)] text-white shadow-sm"
            : "text-stone-600 hover:bg-white"
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
