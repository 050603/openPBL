"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function WizardStepper({
  steps,
  current,
}: {
  steps: { key: string; label: string }[];
  current: number;
}) {
  return (
    <ol className="flex items-center gap-3 overflow-x-auto py-1">
      {steps.map((step, index) => {
        const state =
          index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li className="flex shrink-0 items-center gap-3" key={step.key}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full text-sm font-bold",
                  state === "done" && "bg-emerald-500 text-white",
                  state === "current" && "bg-[var(--pbl-teacher)] text-white",
                  state === "todo" && "bg-slate-200 text-slate-500",
                )}
              >
                {state === "done" ? <Check size={14} /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-sm font-semibold",
                  state === "current" && "text-blue-700",
                  state === "done" && "text-emerald-700",
                  state === "todo" && "text-slate-500",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <span
                className={cn(
                  "h-px w-10 shrink-0",
                  state === "done" ? "bg-emerald-300" : "bg-slate-200",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
