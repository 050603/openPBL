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
  // 教师端用 indigo，学生端用 teal
  const accentBg = isTeacher ? "bg-indigo-600" : "bg-teal-600";
  const accentSoft = isTeacher ? "bg-indigo-400" : "bg-teal-400";
  const activeBorder = isTeacher ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-teal-300 bg-teal-50 text-teal-800";
  const doneBorder = isTeacher ? "border-emerald-200 bg-white/82 text-slate-800 hover:border-emerald-300" : "border-emerald-200 bg-white/82 text-slate-800 hover:border-emerald-300";
  const advanceBtn = isTeacher ? "bg-indigo-700 hover:bg-indigo-800" : "bg-teal-600 hover:bg-teal-700";

  return (
    <section className="pbl-glass rounded-[var(--radius-md)] p-2.5">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <div className="flex shrink-0 items-center justify-between gap-2 xl:w-auto">
          <div className="px-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">stage</div>
            <div className="mt-0.5 text-[13px] font-bold text-slate-800">{currentIndex + 1} / {stages.length}</div>
          </div>
          {isTeacher && onAdvance ? (
            <div className="flex items-center gap-1.5">
              <button
                className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] border border-slate-200 bg-white/82 text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canPrev}
                onClick={() => onAdvance(-1)}
                type="button"
                aria-label="回到上一阶段"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className={cn("grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-white shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0", advanceBtn)}
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
                    state === "locked" && "border-slate-200 bg-white/52 text-slate-400",
                    isTeacher && state !== "locked" && "hover:bg-white",
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
                      state === "done" && "bg-emerald-600 text-white",
                      state === "locked" && "bg-slate-100 text-slate-400",
                    )}
                  >
                    {state === "done" ? <Check size={13} /> : state === "locked" ? <LockKeyhole size={11} /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold">{stage.label}</span>
                    <span className="block truncate text-[10px] text-current opacity-65">{stage.description}</span>
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
