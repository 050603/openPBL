"use client";

import { Bot, ListTodo, RefreshCw, UsersRound } from "lucide-react";
import type { Stage, StageWorkspacePolicy } from "@/lib/session/types";
import {
  getStageWorkspacePolicy,
  stageSupportsCompanionWorkspace,
  updateStageWorkspacePolicy,
} from "@/lib/classroom/stage-workspace-policy";
import { cn } from "@/lib/utils";

const ACCESS_OPTIONS: Array<{ value: StageWorkspacePolicy["access"]; label: string }> = [
  { value: "companions-only", label: "仅伴学模式" },
  { value: "task-only", label: "仅普通模式" },
  { value: "student-choice", label: "学生自主切换" },
];

export function StageWorkspacePolicyPanel({
  stages,
  policies,
  onChange,
  currentStageKey,
  compact = false,
  className,
}: {
  stages: Stage[];
  policies?: Record<string, StageWorkspacePolicy>;
  onChange: (policies: Record<string, StageWorkspacePolicy>) => void;
  currentStageKey?: string;
  compact?: boolean;
  className?: string;
}) {
  const visibleStages = compact
    ? stages.filter((stage) => stage.key === currentStageKey).slice(0, 1)
    : stages;

  return (
    <section className={cn("rounded-[var(--radius-md)] border border-[var(--pbl-teacher-border)] bg-white p-3.5", className)}>
      <header className="mb-3 flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-xs)] bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]">
          <RefreshCw size={16} />
        </span>
        <div>
          <h2 className="text-sm font-bold text-stone-900">学生课堂模式</h2>
          <p className="mt-0.5 text-xs leading-5 text-stone-500">
            {compact ? "修改后将通过课堂同步实时作用于学生。" : "分别设置六个阶段开放的界面；两种界面共享项目数据和智能体上下文。"}
          </p>
        </div>
      </header>

      <div className={cn("grid gap-2.5", !compact && "lg:grid-cols-2")}>
        {visibleStages.map((stage, index) => {
          const policy = getStageWorkspacePolicy(policies, stage.key);
          const companionSupported = stageSupportsCompanionWorkspace(stage.key);
          return (
            <fieldset className="rounded-[var(--radius-xs)] border border-stone-200 bg-stone-50/70 p-3" key={stage.key}>
              <legend className="px-1 text-xs font-bold text-stone-700">
                {compact ? stage.label : `${index + 1}. ${stage.label}`}
              </legend>
              <label className="mt-1 block text-[11px] font-semibold text-stone-500" htmlFor={`workspace-access-${stage.key}`}>
                可用模式
              </label>
              {companionSupported ? (
                <select
                  aria-label={`${stage.label}可用模式`}
                  className="mt-1 h-9 w-full rounded-[var(--radius-xs)] border border-stone-200 bg-white px-2.5 text-xs font-semibold text-stone-700 outline-none focus:border-[var(--pbl-teacher)]"
                  id={`workspace-access-${stage.key}`}
                  onChange={(event) => onChange(updateStageWorkspacePolicy(policies, stage.key, {
                    access: event.target.value as StageWorkspacePolicy["access"],
                  }))}
                  value={policy.access}
                >
                  {ACCESS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <div aria-label={`${stage.label}可用模式`} className="mt-1 flex h-9 items-center rounded-[var(--radius-xs)] border border-stone-200 bg-stone-100 px-2.5 text-xs font-semibold text-stone-600">
                  仅普通模式（本阶段固定）
                </div>
              )}

              {companionSupported && policy.access === "student-choice" ? (
                <div className="mt-2">
                  <div className="mb-1 text-[11px] font-semibold text-stone-500">首次进入默认显示</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <ModeButton
                      active={policy.defaultMode === "companions"}
                      icon={<UsersRound size={13} />}
                      label="伴学模式"
                      onClick={() => onChange(updateStageWorkspacePolicy(policies, stage.key, { defaultMode: "companions" }))}
                      stageLabel={stage.label}
                    />
                    <ModeButton
                      active={policy.defaultMode === "task"}
                      icon={<ListTodo size={13} />}
                      label="普通模式"
                      onClick={() => onChange(updateStageWorkspacePolicy(policies, stage.key, { defaultMode: "task" }))}
                      stageLabel={stage.label}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--pbl-teacher)]">
                  <Bot size={12} /> 学生将直接进入{policy.access === "task-only" ? "普通模式" : "伴学模式"}
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}

function ModeButton({ active, icon, label, stageLabel, onClick }: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  stageLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`${stageLabel}默认${label}`}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-8 items-center justify-center gap-1 rounded-[var(--radius-xs)] border px-2 text-[11px] font-bold transition",
        active
          ? "border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]"
          : "border-stone-200 bg-white text-stone-500 hover:border-stone-300",
      )}
      onClick={onClick}
      type="button"
    >
      {icon}{label}
    </button>
  );
}
