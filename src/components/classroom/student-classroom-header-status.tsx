"use client";

import { StudentLeaveButton } from "@/components/student-leave-button";

export function StudentClassroomHeaderStatus({
  currentIndex,
  total,
  stageLabel,
  readinessLabel,
  onlineCount,
}: {
  currentIndex: number;
  total: number;
  stageLabel: string;
  readinessLabel: string;
  onlineCount: number;
}) {
  return (
    <div className="hidden items-center gap-2 md:flex">
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--pbl-student-soft)] px-2.5 text-[12px] font-bold text-[var(--pbl-student)] ring-1 ring-[var(--pbl-student-border)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--pbl-student)]" />
        阶段 {currentIndex + 1}/{total} · {stageLabel}
      </span>
      <span className="inline-flex h-7 items-center rounded-full bg-white px-2.5 text-[12px] font-bold text-stone-700 ring-1 ring-stone-200">
        {readinessLabel}
      </span>
      <span className="text-[12px] font-semibold text-stone-400">在线 {onlineCount}</span>
      <StudentLeaveButton className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-xs)] border border-orange-200 bg-white/80 px-2.5 text-[12px] font-semibold text-[var(--pbl-danger)] transition hover:bg-[var(--pbl-danger-soft)]" />
    </div>
  );
}
