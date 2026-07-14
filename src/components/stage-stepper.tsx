"use client";

import { Check, ChevronLeft, ChevronRight, LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stage } from "@/lib/session/types";

export function StageStepper({
  stages,
  currentIndex,
  onSelect,
  onAdvance,
  canPrev = true,
  canNext = true,
  variant = "teacher",
}: {
  stages: Stage[];
  currentIndex: number;
  onSelect?: (index: number) => void;
  onAdvance?: (direction: 1 | -1) => void;
  canPrev?: boolean;
  canNext?: boolean;
  variant?: "teacher" | "student";
}) {
  const isTeacher = variant === "teacher";
  const accentBg = isTeacher ? "bg-[var(--pbl-teacher)]" : "bg-[var(--pbl-student)]";
  const accentSoft = isTeacher ? "bg-[var(--pbl-teacher-border)]" : "bg-[var(--pbl-student-border)]";
  const activeBorder = isTeacher ? "border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]" : "border-[var(--pbl-student-border)] bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]";
  const doneBorder = "border-[var(--pbl-student-border)] bg-[var(--pbl-surface)]/82 text-[var(--pbl-text)] hover:border-[var(--pbl-student)]";
  const advanceBtn = isTeacher ? "bg-[var(--pbl-teacher)] hover:bg-[var(--pbl-teacher-hover)] text-white" : "bg-[var(--pbl-student)] hover:bg-[var(--pbl-student-hover)] text-white";

  return (
    <section className="pbl-glass rounded-[var(--radius-md)] p-2.5">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <div className="flex shrink-0 items-center justify-between gap-2 xl:w-auto">
          <div className="px-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pbl-text-subtle)]">stage</div>
            <div className="mt-0.5 text-[13px] font-bold text-[var(--pbl-text)]">{currentIndex + 1} / {stages.length}</div>
          </div>
          {isTeacher && onAdvance ? (
            <div className="flex items-center gap-1.5">
              <button
                className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)]/82 text-[var(--pbl-text-muted)] transition hover:bg-[var(--pbl-surface)] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canPrev}
                onClick={() => onAdvance(-1)}
                type="button"
                aria-label="回到上一阶段"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className={cn("grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40", advanceBtn)}
                disabled={!canNext}
                onClick={() => onAdvance(1)}
                type="button"
                aria-label="推进到下一阶段"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max gap-1.5 xl:min-w-0">
            {stages.map((stage, index) => {
              const state =
                index < currentIndex
                  ? "done"
                  : index === currentIndex
                    ? "current"
                    : "locked";
              return (
                <button
                  key={stage.key}
                  className={cn(
                    "flex h-11 min-w-[120px] flex-1 items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 text-left transition",
                    state === "current" && activeBorder,
                    state === "done" && doneBorder,
                    state === "locked" && "border-[var(--pbl-border)] bg-[var(--pbl-surface)]/52 text-[var(--pbl-text-subtle)]",
                    isTeacher && state !== "locked" && "hover:bg-[var(--pbl-surface)]",
                    !isTeacher && "cursor-default",
                  )}
                  disabled={!isTeacher || state === "locked"}
                  onClick={() => {
                    if (!isTeacher || state === "locked") return;
                    onSelect?.(index);
                  }}
                  type="button"
                >
                  <span
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-xs)] text-[11px] font-bold",
                      state === "current" && accentBg + " text-white",
                      state === "done" && "bg-[var(--pbl-success)] text-white",
                      state === "locked" && "bg-[var(--pbl-surface-soft)] text-[var(--pbl-text-subtle)]",
                    )}
                  >
                    {state === "done" ? <Check size={13} /> : state === "locked" ? <LockKeyhole size={11} /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold">{stage.label}</span>
                    <span className="block truncate text-[11px] text-current opacity-65">{stage.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
