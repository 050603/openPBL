"use client";

import { Bot, ListTodo, RefreshCw, UsersRound } from "lucide-react";
import type { Stage, StageWorkspacePolicy } from "@/lib/session/types";
import {
  getStageWorkspacePolicy,
  stageSupportsCompanionWorkspace,
  updateStageWorkspacePolicy,
} from "@/lib/classroom/stage-workspace-policy";
import { cn } from "@/lib/utils";

const ACCESS_OPTIONS: Array<{
  value: StageWorkspacePolicy["access"];
  label: string;
}> = [
  { value: "companions-only", label: "仅 AI 伴学场景" },
  { value: "task-only", label: "仅传统学习页面" },
  { value: "student-choice", label: "允许学生切换" },
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
    <section
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--pbl-teacher-border)] bg-white p-3.5",
        className,
      )}
    >
      <header className="mb-3 flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-xs)] bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]">
          <RefreshCw size={16} />
        </span>
        <div>
          <h2 className="text-sm font-bold text-stone-900">学生课堂界面</h2>
          <p className="mt-0.5 text-xs leading-5 text-stone-500">
            {compact
              ? "调整后会实时同步到学生端。"
              : "第 1、2 阶段固定为传统学习页面；第 3–6 阶段由教师决定是否启用 AI 伴学场景。"}
          </p>
        </div>
      </header>

      <div className={cn("grid gap-2.5", !compact && "lg:grid-cols-2")}>
        {visibleStages.map((stage, index) => {
          const policy = getStageWorkspacePolicy(policies, stage.key);
          const companionSupported = stageSupportsCompanionWorkspace(stage.key);
          return (
            <fieldset
              className="rounded-[var(--radius-xs)] border border-stone-200 bg-stone-50/70 p-3"
              key={stage.key}
            >
              <legend className="px-1 text-xs font-bold text-stone-700">
                {compact ? stage.label : `${index + 1}. ${stage.label}`}
              </legend>
              <label
                className="mt-1 block text-[11px] font-semibold text-stone-500"
                htmlFor={`workspace-access-${stage.key}`}
              >
                学生端显示
              </label>
              {companionSupported ? (
                <select
                  aria-label={`${stage.label}学生端显示`}
                  className="mt-1 h-9 w-full rounded-[var(--radius-xs)] border border-stone-200 bg-white px-2.5 text-xs font-semibold text-stone-700 outline-none focus:border-[var(--pbl-teacher)]"
                  id={`workspace-access-${stage.key}`}
                  onChange={(event) =>
                    onChange(
                      updateStageWorkspacePolicy(policies, stage.key, {
                        access: event.target
                          .value as StageWorkspacePolicy["access"],
                      }),
                    )
                  }
                  value={policy.access}
                >
                  {ACCESS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div
                  aria-label={`${stage.label}学生端显示`}
                  className="mt-1 flex h-9 items-center rounded-[var(--radius-xs)] border border-stone-200 bg-stone-100 px-2.5 text-xs font-semibold text-stone-600"
                >
                  仅传统学习页面（本阶段固定）
                </div>
              )}

              {companionSupported && policy.access === "student-choice" ? (
                <div className="mt-2">
                  <div className="mb-1 text-[11px] font-semibold text-stone-500">
                    学生首次进入默认显示
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <ModeButton
                      active={policy.defaultMode === "companions"}
                      icon={<UsersRound size={13} />}
                      label="AI 伴学"
                      onClick={() =>
                        onChange(
                          updateStageWorkspacePolicy(policies, stage.key, {
                            defaultMode: "companions",
                          }),
                        )
                      }
                      stageLabel={stage.label}
                    />
                    <ModeButton
                      active={policy.defaultMode === "task"}
                      icon={<ListTodo size={13} />}
                      label="传统页面"
                      onClick={() =>
                        onChange(
                          updateStageWorkspacePolicy(policies, stage.key, {
                            defaultMode: "task",
                          }),
                        )
                      }
                      stageLabel={stage.label}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--pbl-teacher)]">
                  <Bot size={12} />
                  学生将直接进入
                  {policy.access === "task-only"
                    ? "传统学习页面"
                    : "AI 伴学场景"}
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}

function ModeButton({
  active,
  icon,
  label,
  stageLabel,
  onClick,
}: {
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
      {icon}
      {label}
    </button>
  );
}
