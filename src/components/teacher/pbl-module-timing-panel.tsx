"use client";

import { useMemo } from "react";
import { CheckCircle2, Clock3, Gauge, LockKeyhole, WandSparkles } from "lucide-react";
import {
  buildPblModuleTimingPlan,
  classifyPblActivityKind,
  isPblModuleTimingPlanConfirmed,
  PBL_MODULE_DEFINITIONS,
  type PblModuleTimingPlan,
  type PblTimeActivity,
  type PblTimeActivityKind,
  type PblTimeModelContext,
} from "@/lib/pbl-time-model";
import { cn } from "@/lib/utils";

function moduleLabel(kind: PblTimeActivityKind, fallback?: string): string {
  return PBL_MODULE_DEFINITIONS.find((definition) => definition.kind === kind)?.label
    ?? fallback
    ?? "其他课程模块";
}

export function PblModuleTimingPanel({
  moduleActivities,
  totalMinutes,
  timeContext,
  timingPlan,
  readOnly = false,
  onChangeModuleDuration,
  onApplyRecommendation,
  onConfirm,
}: {
  moduleActivities: ReadonlyArray<PblTimeActivity>;
  totalMinutes: number;
  timeContext?: PblTimeModelContext;
  timingPlan?: PblModuleTimingPlan;
  readOnly?: boolean;
  onChangeModuleDuration?: (
    kind: Exclude<PblTimeActivityKind, "other">,
    targetMinutes: number,
  ) => void;
  onApplyRecommendation?: (allocations: Readonly<Record<string, number>>) => void;
  onConfirm?: () => void;
}) {
  const safeTotalMinutes = Math.max(0, Math.round(totalMinutes));
  const hasModules = moduleActivities.length > 0;
  const displayPlan = useMemo(
    () => timingPlan ?? buildPblModuleTimingPlan(safeTotalMinutes, moduleActivities, timeContext),
    [moduleActivities, safeTotalMinutes, timeContext, timingPlan],
  );
  const recommendations = useMemo(
    () => new Map(displayPlan.allocations.map((activity) => [activity.id, activity.recommendedDurationMin])),
    [displayPlan.allocations],
  );
  const currentTotalMinutes = moduleActivities.reduce(
    (sum, activity) => sum + Math.max(0, Math.round(Number(activity.durationMin) || 0)),
    0,
  );
  const allocationDelta = currentTotalMinutes - safeTotalMinutes;
  const planConfirmed = displayPlan.status === "confirmed"
    && isPblModuleTimingPlanConfirmed(displayPlan);
  const hasAllCanonicalModules = PBL_MODULE_DEFINITIONS.every((definition) =>
    moduleActivities.some((activity) => classifyPblActivityKind(activity) === definition.kind),
  );
  const canConfirm = !readOnly
    && hasAllCanonicalModules
    && allocationDelta === 0
    && Boolean(onConfirm);

  if (!hasModules) {
    return (
      <section className="rounded-[var(--radius-sm)] border border-dashed border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)]/40 p-5">
        <div className="flex items-center gap-2 text-[var(--pbl-teacher)]">
          <Gauge size={17} />
          <p className="text-xs font-bold uppercase tracking-[0.12em]">课程模块时间安排</p>
        </div>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          课程模块尚未生成。生成模块后，系统会根据课程难度、知识点复杂度、年级和总课时给出六个模块的时间建议。
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--pbl-teacher-border)] bg-white shadow-[0_8px_24px_rgba(71,58,42,0.06)]">
      <div className="border-b border-[var(--pbl-teacher-border)] bg-[linear-gradient(110deg,var(--pbl-teacher-soft),#fff_68%)] px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[var(--pbl-teacher)]">
              <Gauge size={17} />
              <p className="text-xs font-bold uppercase tracking-[0.12em]">课程模块时间安排</p>
            </div>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              AI 根据课程信息给出模块时间建议，教师调整并确认后，系统才会生成 PBL 项目主线和后续课程大纲。
            </p>
          </div>
          <div className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
            planConfirmed
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700",
          )}>
            {planConfirmed ? <LockKeyhole size={13} /> : <WandSparkles size={13} />}
            {planConfirmed ? "教师已确认" : "AI 建议待确认"}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-[6px] bg-white/80 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-stone-500"><Clock3 size={13} /> 课程总时长</div>
            <p className="mt-1 text-lg font-bold tabular-nums text-stone-800">{safeTotalMinutes} 分钟</p>
          </div>
          <div className="rounded-[6px] bg-white/80 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-stone-500"><Gauge size={13} /> 当前模块合计</div>
            <p className="mt-1 text-lg font-bold tabular-nums text-stone-800">{currentTotalMinutes} 分钟</p>
          </div>
          <div className={cn(
            "rounded-[6px] px-3 py-2",
            allocationDelta === 0 ? "bg-emerald-50" : "bg-amber-50",
          )}>
            <div className="text-xs text-stone-500">分配状态</div>
            <p className={cn(
              "mt-1 text-sm font-bold",
              allocationDelta === 0 ? "text-emerald-700" : "text-amber-700",
            )}>
              {allocationDelta === 0 ? "已与课程总时长对齐" : `相差 ${Math.abs(allocationDelta)} 分钟`}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--pbl-teacher)]">六模块分配</p>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              建议会随课程难度、年级和知识点结构变化；确认后以教师当前填写的分钟数为唯一准则。
            </p>
          </div>
          {!readOnly && onApplyRecommendation ? (
            <button
              type="button"
              onClick={() => onApplyRecommendation(
                Object.fromEntries(moduleActivities.map((activity) => [
                  activity.id,
                  recommendations.get(activity.id) ?? activity.durationMin,
                ])),
              )}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--pbl-teacher-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--pbl-teacher)] hover:bg-[var(--pbl-teacher-soft)]"
            >
              <WandSparkles size={13} /> 应用 AI 建议
            </button>
          ) : null}
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {moduleActivities.map((activity) => {
            const kind = classifyPblActivityKind(activity);
            const recommended = recommendations.get(activity.id) ?? activity.durationMin;
            const definition = PBL_MODULE_DEFINITIONS.find((item) => item.kind === kind);
            return (
              <div className="rounded-[6px] border border-stone-100 bg-stone-50/70 px-3 py-2.5" key={activity.id}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-stone-700">
                      {moduleLabel(kind, activity.title ?? definition?.label)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-400">AI 建议 {recommended} 分钟</p>
                  </div>
                  {readOnly ? (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--pbl-teacher)]">
                      {activity.durationMin} 分钟
                    </span>
                  ) : (
                    <label className="flex shrink-0 items-center gap-1 text-xs text-stone-500">
                      <input
                        aria-label={`${activity.title ?? definition?.label ?? activity.id}目标时长`}
                        className="h-8 w-16 rounded-[4px] border border-stone-200 px-1.5 text-right text-sm font-semibold tabular-nums text-stone-700 outline-none focus:border-[var(--pbl-teacher)]"
                        defaultValue={activity.durationMin}
                        key={`${activity.id}-${activity.durationMin}`}
                        min={1}
                        onBlur={(event) => {
                          const nextValue = Number(event.currentTarget.value);
                          if (
                            Number.isFinite(nextValue)
                            && kind !== "other"
                            && onChangeModuleDuration
                          ) {
                            onChangeModuleDuration(kind, Math.max(1, Math.round(nextValue)));
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                        type="number"
                      />
                      <span>分钟</span>
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!hasAllCanonicalModules ? (
          <p className="mt-3 text-xs font-semibold text-amber-800">
            六个标准模块尚未完整生成，暂不能确认时间。
          </p>
        ) : allocationDelta !== 0 ? (
          <p className="mt-3 text-xs font-semibold text-amber-800">
            当前模块合计必须等于课程总时长，调整后才能确认并生成项目主线。
          </p>
        ) : null}

        {!readOnly && onConfirm ? (
          <div className="mt-4 flex justify-end border-t border-stone-100 pt-4">
            <button
              type="button"
              disabled={!canConfirm}
              onClick={onConfirm}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[6px] px-4 py-2 text-sm font-semibold transition",
                canConfirm
                  ? "bg-[var(--pbl-teacher)] text-white hover:opacity-90"
                  : "cursor-not-allowed bg-stone-100 text-stone-400",
              )}
            >
              <CheckCircle2 size={15} /> 确认时间并生成项目主线
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
