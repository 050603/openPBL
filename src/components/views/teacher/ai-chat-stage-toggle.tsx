"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { useSession } from "@/lib/session/store";
import type { Course } from "@/lib/session/types";

const STAGES: Array<{ key: string; label: string }> = [
  { key: "proposal", label: "方案构思与校准" },
  { key: "make", label: "项目实践" },
  { key: "showcase", label: "成果汇报与评价" },
  { key: "reflection", label: "学习反思" },
];

/**
 * 教师控制开关：控制学生在各个人项目阶段能否使用 AI 伴学小组。
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
    <div className="rounded-[8px] border border-stone-200 bg-white px-3 py-2" title="勾选后，学生会在对应阶段看到角色化 AI 伴学小组；未做设置时项目阶段默认开启。">
      <button
        className="flex w-full items-center justify-between text-sm font-semibold text-stone-700"
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <MessageSquare size={15} className="text-blue-700" />
          AI 伴学小组开关
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
            {enabled.length} / {STAGES.length} 已开启
          </span>
        </span>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {open ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {STAGES.map((s) => {
              const checked = enabled.includes(s.key);
              return (
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-[6px] border px-3 py-2 text-sm transition ${
                    checked
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
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
          <div className="mt-2 text-xs leading-5 text-stone-500">
            勾选后，学生在对应阶段可以与角色化 AI 伴学伙伴对话；未做设置时四个项目阶段默认开启。
          </div>
        </>
      ) : null}
    </div>
  );
}
