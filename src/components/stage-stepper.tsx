"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
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
  return (
    <div className="rounded-[8px] border border-slate-200/80 bg-white px-5 py-4 shadow-[0_12px_34px_rgba(15,23,42,0.055)]">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
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
                    "group relative flex min-w-0 flex-col items-center gap-2 px-2 pb-1 text-center transition",
                    !isTeacher && "cursor-default",
                  )}
                  disabled={!isTeacher || state === "locked"}
                  onClick={() => {
                    if (!isTeacher) return;
                    if (state === "locked") return;
                    onSelect?.(index);
                  }}
                  type="button"
                >
                  {index > 0 ? (
                    <span
                      className={cn(
                        "absolute right-1/2 top-[17px] h-1 w-full -translate-x-[18px] rounded-full",
                        state === "done" || state === "current" ? "bg-blue-600" : "bg-slate-200",
                      )}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative z-10 grid h-9 w-9 place-items-center rounded-full text-sm font-black",
                      state === "current" && "bg-blue-600 text-white ring-4 ring-blue-100",
                      state === "done" && "bg-blue-600 text-white",
                      state === "locked" && "bg-slate-300 text-white",
                    )}
                  >
                    {state === "done" ? <Check size={18} /> : index + 1}
                  </span>
                  <span className="relative z-10 max-w-full truncate text-sm font-black text-slate-900">
                    {stage.label}
                  </span>
                  <span className="relative z-10 line-clamp-1 text-xs text-slate-500">
                    {stage.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {isTeacher && onAdvance ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="grid h-9 w-9 place-items-center rounded-[6px] border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canPrev}
              onClick={() => onAdvance(-1)}
              type="button"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold text-slate-500">
              {currentIndex + 1} / {stages.length}
            </span>
            <button
              className="grid h-9 w-9 place-items-center rounded-[6px] bg-blue-600 text-white shadow-[0_8px_18px_rgba(37,99,235,0.22)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canNext}
              onClick={() => onAdvance(1)}
              type="button"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        ) : (
          <span className="shrink-0 text-sm font-semibold text-slate-500">
            {currentIndex + 1} / {stages.length}
          </span>
        )}
      </div>
    </div>
  );
}
