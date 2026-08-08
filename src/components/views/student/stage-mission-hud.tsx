"use client";

import {
  CheckCircle2,
  Clock3,
  Compass,
  HandHelping,
  ShieldCheck,
} from "lucide-react";
import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import {
  getStageMissionDefinition,
  LEARNING_PRESETS,
  resolveCourseLearningPreset,
} from "@/lib/learning-evidence/missions";
import {
  deriveStageReadiness,
  evidenceLabel,
} from "@/lib/learning-evidence/readiness";
import { STAGE_READINESS_LABEL } from "@/lib/learning-evidence/types";
import { cn } from "@/lib/utils";

const STATUS_STYLE = {
  "not-started": "bg-stone-100 text-stone-700 ring-stone-200",
  working: "bg-blue-50 text-blue-700 ring-blue-200",
  "awaiting-calibration": "bg-amber-50 text-amber-800 ring-amber-200",
  "needs-revision": "bg-rose-50 text-rose-700 ring-rose-200",
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
} as const;

const TEACHER_REQUIREMENT = {
  none: "本阶段无需教师前置确认",
  "scope-confirmation": "教师需确认项目范围",
  "plan-approval": "教师需批准方案",
  "live-evaluation": "教师需完成现场评价",
} as const;

const CALIBRATION_LABEL = {
  "not-required": "无需校准",
  pending: "等待教师",
  confirmed: "教师已确认",
  "needs-revision": "教师要求修订",
} as const;

export function StageMissionHud({
  course,
  stageKey,
  studentId,
  compact = false,
}: {
  course: Course;
  stageKey: string;
  studentId: string;
  compact?: boolean;
}) {
  const session = useSession();
  if (!studentId) return null;
  const readiness = deriveStageReadiness(course, studentId, stageKey);
  const preset = resolveCourseLearningPreset(course);
  const mission = getStageMissionDefinition(
    stageKey,
    preset,
    readiness.missingEvidenceKinds,
  );
  const completedChecks = readiness.checks.filter((item) => item.satisfied).length;
  const helpRequested = (course.learningSignals ?? []).some((item) =>
    item.studentId === studentId
    && item.stageKey === stageKey
    && item.kind === "student-help-request"
    && item.status === "open");
  const currentAction = mission.currentAction;

  return (
    <aside
      aria-label="当前阶段任务条"
      className={cn(
        "relative z-20 overflow-hidden border border-teal-200 bg-white/95 shadow-sm backdrop-blur",
        compact ? "rounded-xl p-3" : "sticky top-2 rounded-2xl p-4 md:p-5",
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]">
            <Compass size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[.15em] text-[var(--pbl-student)]">
                当前任务
              </p>
              <span
                className={cn(
                  "inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ring-1",
                  STATUS_STYLE[readiness.status],
                )}
              >
                {STAGE_READINESS_LABEL[readiness.status]}
              </span>
              <span className="text-xs font-medium text-stone-500">
                {LEARNING_PRESETS[preset].label}
              </span>
            </div>
            <h2 className="mt-1 text-base font-bold text-stone-950 md:text-lg">
              {currentAction.label}
            </h2>
            {!compact ? (
              <p className="mt-1 text-sm leading-6 text-stone-600">
                {currentAction.description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid shrink-0 gap-2 text-xs text-stone-600 sm:grid-cols-3 lg:w-[34rem]">
          <MissionFact
            icon={<CheckCircle2 size={15} />}
            label="完成标准"
            value={currentAction.doneWhen}
          />
          <MissionFact
            icon={<Clock3 size={15} />}
            label="时间建议"
            value={`${mission.suggestedMinutes} 分钟，可按教师节奏调整`}
          />
          <MissionFact
            icon={<ShieldCheck size={15} />}
            label="教师要求"
            value={`${TEACHER_REQUIREMENT[mission.teacherRequirement]} · ${CALIBRATION_LABEL[readiness.teacherCalibration]}`}
          />
        </div>
      </div>

      {!compact ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-stone-100 pt-3 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-stone-700">
            已完成 {completedChecks}/{readiness.checks.length}
          </span>
          {readiness.completedIterations || readiness.requiredIterations ? (
            <span className="font-semibold text-stone-700">
              完整迭代 {readiness.completedIterations}/{readiness.requiredIterations}
            </span>
          ) : null}
          <span className="text-stone-500">{readiness.reason}</span>
          {readiness.missingEvidenceKinds.length ? (
            <span className="text-stone-500">
              待形成：
              {readiness.missingEvidenceKinds.map(evidenceLabel).join("、")}
            </span>
          ) : null}
          <button
            className={cn(
              "ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 font-bold transition",
              helpRequested
                ? "cursor-default border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
            )}
            disabled={helpRequested}
            onClick={() => session.requestTeacherHelp(course.id, stageKey)}
            type="button"
          >
            <HandHelping size={14} />
            {helpRequested ? "已请求教师帮助" : "请求教师帮助"}
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function MissionFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2.5">
      <span className="flex items-center gap-1.5 font-bold text-stone-800">
        {icon}
        {label}
      </span>
      <span className="mt-1 block line-clamp-2 leading-5">{value}</span>
    </div>
  );
}
