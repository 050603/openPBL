"use client";

import { useState } from "react";
import { ChevronDown, Eye, Network, PanelLeft, ShieldCheck } from "lucide-react";
import { StudentStageHost } from "@/components/openmaic-bridge/student-stage-host";
import type { Course } from "@/lib/session/types";
import { cn } from "@/lib/utils";

export function AiLearningTeacherPreview({ course }: { course: Course }) {
  const [expanded, setExpanded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (!course.aiLearningClassroomId) return null;

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)]">
      <button
        aria-controls={`ai-learning-teacher-preview-${course.id}`}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center justify-between gap-4 bg-stone-50/80 px-4 py-3 text-left transition hover:bg-stone-100/80",
          expanded && "border-b border-stone-200",
        )}
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]">
            <Eye size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-bold text-stone-900">学生 AI 课程预览</span>
            <span className="mt-0.5 block text-xs text-stone-500">
              {expanded ? "正在预览 · 收起后自动停止播放" : "默认收起 · 点击展开课程"}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-stone-500">
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <PanelLeft size={14} /> 页面导航
            <span className="text-stone-300">·</span>
            <Network size={14} /> 知识图谱
          </span>
          <ChevronDown
            className={cn("transition-transform", expanded && "rotate-180")}
            size={18}
          />
        </span>
      </button>

      {expanded ? (
        <div className="p-3" id={`ai-learning-teacher-preview-${course.id}`}>
          <div className="mb-3 flex items-center gap-2 rounded-[6px] bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">
            <ShieldCheck size={15} />
            预览操作不会写入学生进度；可通过左侧缩略页快速切换课程内容。
          </div>
          <StudentStageHost
            backHref="#"
            className="h-[min(780px,calc(100dvh-170px))] min-h-[640px] max-h-[860px]"
            classroomId={course.aiLearningClassroomId}
            courseId={course.id}
            knowledgeGraph={course.content.knowledgeGraph}
            knowledgePoints={course.content.knowledgePoints}
            mode="teacher-preview"
            onSidebarCollapsedChange={setSidebarCollapsed}
            sidebarCollapsed={sidebarCollapsed}
            variant="embedded"
          />
        </div>
      ) : null}
    </section>
  );
}
