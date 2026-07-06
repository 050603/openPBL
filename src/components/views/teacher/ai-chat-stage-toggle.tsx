"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { useSession } from "@/lib/session/store";
import type { Course } from "@/lib/session/types";

const STAGES: Array<{ key: string; label: string }> = [
  { key: "group", label: "小组构思" },
  { key: "workspace", label: "项目制作" },
  { key: "showcase", label: "成果汇报" },
  { key: "reflection", label: "评价反思" },
];

/**
 * 教师控制开关：控制学生在各阶段（group / workspace / showcase / reflection）
 * 能否看到 AI 聊天面板。对应 CourseUiState.aiChatStagesEnabled: string[]。
 * 默认关闭，教师显式开启。
 */
export function AiChatStageToggle({ course }: { course: Course }) {
  const { setUiState } = useSession();
  const [open, setOpen] = useState(false);
  const enabled = course.uiState?.aiChatStagesEnabled ?? [];

  function toggle(stageKey: string) {
    const next = enabled.includes(stageKey)
      ? enabled.filter((k) => k !== stageKey)
      : [...enabled, stageKey];
    setUiState(course.id, { aiChatStagesEnabled: next });
  }

  return (
    <div className="rounded-[8px] border border-slate-200 bg-white px-3 py-2">
      <button
        className="flex w-full items-center justify-between text-sm font-semibold text-slate-700"
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <MessageSquare size={15} className="text-blue-700" />
          AI 对话面板开关
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {enabled.length} / {STAGES.length} 已开启
          </span>
        </span>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {open ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {STAGES.map((s) => {
            const checked = enabled.includes(s.key);
            return (
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-[6px] border px-3 py-2 text-sm transition ${
                  checked
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
                key={s.key}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s.key)}
                  className="accent-blue-600"
                />
                <span className="font-semibold">{s.label}</span>
              </label>
            );
          })}
        </div>
      ) : null}
      <div className="mt-2 text-xs leading-5 text-slate-500">
        勾选后，学生在对应阶段会看到右下角浮动 AI 学习助手按钮；未勾选则隐藏。
      </div>
    </div>
  );
}
