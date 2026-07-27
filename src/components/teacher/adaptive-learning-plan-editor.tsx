"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleGauge,
  FileQuestion,
  Layers3,
  Loader2,
  PlaySquare,
  Route,
  Sparkles,
} from "lucide-react";
import type {
  AdaptiveBranchOutline,
  AdaptiveLearningPlan,
  KnowledgePoint,
  OpenMaicSceneOutlineSnapshot,
} from "@/lib/session/types";
import {
  adaptiveResourceAddsNovelContent,
  deriveAdaptiveCheckpointSceneIds,
} from "@/lib/adaptive-learning";
import { cn } from "@/lib/utils";

type AdaptiveMainScene = Pick<
  OpenMaicSceneOutlineSnapshot,
  "id" | "title" | "type" | "order" | "stageKey" | "audience" | "knowledgePointIds"
>;

const RESOURCE_LABEL: Record<AdaptiveBranchOutline["kind"], string> = {
  prerequisite: "先决知识回顾",
  "worked-example": "新例题",
  application: "应用举例",
  extension: "拓展与思考",
};

function resourceKind(branch: AdaptiveBranchOutline): AdaptiveBranchOutline["kind"] {
  return (branch.kind as string) === "foundation" ? "prerequisite" : branch.kind;
}

function resourceLabel(branch: AdaptiveBranchOutline): string {
  return RESOURCE_LABEL[resourceKind(branch)] ?? "额外学习资源";
}

export function AdaptiveLearningPlanEditor({
  courseId,
  knowledgePoints,
  mainScenes = [],
  plan,
  onChange,
}: {
  courseId: string;
  knowledgePoints: KnowledgePoint[];
  mainScenes?: AdaptiveMainScene[];
  plan?: AdaptiveLearningPlan;
  onChange: (plan: AdaptiveLearningPlan) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string>();

  async function generatePlan() {
    setGenerating(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/adaptive-learning/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenPBL-Role": "teacher" },
        body: JSON.stringify({ courseId, knowledgePoints, mainScenes }),
      });
      const payload = await response.json() as {
        plan?: AdaptiveLearningPlan;
        warning?: string;
        error?: string;
      };
      if (!response.ok || !payload.plan) throw new Error(payload.error || "生成失败");
      onChange(payload.plan);
      setMessage(payload.warning || "已结合主课逐页建模，请审核先决知识、插入位置与新增价值。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败，请稍后重试。");
    } finally {
      setGenerating(false);
    }
  }

  function patchPlan(patch: Partial<AdaptiveLearningPlan>) {
    if (!plan) return;
    onChange({
      ...plan,
      ...patch,
      status: patch.status ?? "draft",
      updatedAt: new Date().toISOString(),
    });
  }

  function patchBranch(id: string, patch: Partial<AdaptiveBranchOutline>) {
    if (!plan) return;
    const invalidatesResource = [
      "kind", "title", "objective", "keyPoints", "sceneType", "targetDurationSec",
      "generationGuidance", "noveltyStatement", "prerequisiteKnowledgePointIds",
    ].some((key) => key in patch);
    patchPlan({
      branches: plan.branches.map((branch) => branch.id === id ? {
        ...branch,
        ...patch,
        preparedResource: invalidatesResource ? undefined : branch.preparedResource,
        status: "draft",
      } : branch),
    });
  }

  const studentScenes = mainScenes.filter(isStudentMainScene).sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0),
  );
  const quizIds = new Set(deriveAdaptiveCheckpointSceneIds(studentScenes));
  const pretestKnowledgePointIds = new Set(
    plan?.pretest.questions.flatMap((question) => question.knowledgePointIds) ?? [],
  );
  const coveredPrerequisiteIds = new Set(
    plan?.branches.flatMap((branch) =>
      (branch.trigger?.placement ?? (resourceKind(branch) === "prerequisite" ? "before-main-course" : "after-module")) === "before-main-course"
        ? branch.prerequisiteKnowledgePointIds ?? []
        : [],
    ) ?? [],
  );
  const coveredModuleQuizIds = new Set(
    plan?.branches.flatMap((branch) =>
      (branch.trigger?.placement ?? (resourceKind(branch) === "prerequisite" ? "before-main-course" : "after-module")) === "after-module"
        ? branch.trigger?.assessmentSceneIds ?? []
        : [],
    ) ?? [],
  );
  const missingPrerequisiteCoverage = [...pretestKnowledgePointIds].filter(
    (id) => !coveredPrerequisiteIds.has(id),
  );
  const missingModuleCoverage = [...quizIds].filter(
    (id) => !coveredModuleQuizIds.has(id),
  );
  const coverageComplete =
    missingPrerequisiteCoverage.length === 0
    && missingModuleCoverage.length === 0;
  const invalidResources = plan?.branches.filter((branch) =>
    !adaptiveResourceAddsNovelContent(branch)
    || ((branch.trigger?.placement ?? (resourceKind(branch) === "prerequisite" ? "before-main-course" : "after-module")) === "after-module"
      && !(branch.trigger?.assessmentSceneIds ?? []).some((id) => quizIds.has(id))),
  ) ?? [];
  const prerequisites = plan?.branches.filter((branch) =>
    (branch.trigger?.placement ?? (resourceKind(branch) === "prerequisite" ? "before-main-course" : "after-module"))
      === "before-main-course",
  ) ?? [];
  const moduleResources = plan?.branches.filter((branch) =>
    (branch.trigger?.placement ?? (resourceKind(branch) === "prerequisite" ? "before-main-course" : "after-module"))
      === "after-module",
  ) ?? [];
  const issueCount =
    invalidResources.length
    + missingPrerequisiteCoverage.length
    + missingModuleCoverage.length;
  const totalResourceMinutes = Math.ceil(
    (plan?.branches.reduce((total, branch) => total + branch.targetDurationSec, 0) ?? 0) / 60,
  );

  return (
    <section className="overflow-hidden rounded-[14px] border border-stone-200 bg-[#f5f6f3] shadow-[0_18px_45px_rgba(28,38,36,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-[linear-gradient(120deg,#082f35_0%,#124b50_58%,#1b6865_100%)] px-6 py-5 text-white">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white/12 text-cyan-50 ring-1 ring-white/20">
            <Route size={20} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-editorial text-xl font-semibold">自适应课程审核台</h3>
              {plan?.status === "teacher-confirmed" && !invalidResources.length && coverageComplete ? (
                <Status tone="ready">已随课程确认</Status>
              ) : !coverageComplete ? (
                <Status tone="warning">
                  缺 {missingPrerequisiteCoverage.length} 个先决知识资源 / {missingModuleCoverage.length} 个模块资源
                </Status>
              ) : invalidResources.length ? (
                <Status tone="warning">{invalidResources.length} 份资源待完善</Status>
              ) : (
                <span className="rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-bold text-cyan-50 ring-1 ring-white/15">
                  可进入生成
                </span>
              )}
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-cyan-50/75">
              先看完整学习路径与覆盖风险；需要修改时，再展开具体题目或资源。
            </p>
          </div>
        </div>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-white px-3.5 text-xs font-bold text-cyan-950 shadow-sm hover:bg-cyan-50 disabled:opacity-50"
          disabled={generating || knowledgePoints.length === 0}
          onClick={() => void generatePlan()}
          type="button"
        >
          {generating ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
          {plan ? "按当前主课重新建模" : "生成自适应资源方案"}
        </button>
      </div>

      {!plan ? (
        <div className="grid min-h-44 place-items-center px-6 py-8 text-center">
          <div>
            <Layers3 className="mx-auto text-cyan-800" size={28} />
            <p className="mt-3 text-sm font-bold text-stone-800">先完成课程基本信息、知识图谱与主课大纲</p>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              系统随后根据完整主课生成最多 5 道先决知识前测，以及可预生成、可审核的额外资源。
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OverviewMetric label="主课结构" value={`${studentScenes.length} 页`} detail={`${quizIds.size} 个模块测验`} />
            <OverviewMetric label="课前诊断" value={`${plan.pretest.questions.length} 题`} detail={`覆盖 ${pretestKnowledgePointIds.size} 个先决知识`} />
            <OverviewMetric label="资源池" value={`${plan.branches.length} 份`} detail={`合计约 ${totalResourceMinutes} 分钟`} />
            <OverviewMetric
              label="审核结果"
              value={issueCount ? `${issueCount} 项待处理` : "可以生成"}
              detail={issueCount ? "展开黄色标记项目进行修改" : "进入课程生成时自动确认"}
              tone={issueCount ? "warning" : "ready"}
            />
          </div>

          <section className="overflow-hidden rounded-[12px] border border-stone-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-bold text-stone-900">
                  <CircleGauge size={16} className="text-cyan-800" /> 运行规则
                </h4>
                <p className="mt-0.5 text-[10px] text-stone-500">只需把握总预算与模块拓展门槛。</p>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                <input
                  checked={plan.enabled}
                  onChange={(event) => patchPlan({ enabled: event.target.checked })}
                  type="checkbox"
                />
                启用自适应编排
              </label>
            </div>
            <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
              <CompactNumberField
                label="额外资源总预算"
                suffix="分钟"
                max={20}
                min={3}
                onChange={(value) => patchPlan({ timeBudgetMin: value })}
                value={plan.timeBudgetMin}
              />
              <CompactNumberField
                label="模块拓展掌握门槛"
                suffix="分及以上"
                max={100}
                min={60}
                onChange={(value) => patchPlan({ thresholds: { enrichmentMasteryMin: value } })}
                value={plan.thresholds.enrichmentMasteryMin ?? 80}
              />
            </div>
          </section>

          <section className="rounded-[12px] border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-cyan-700">Course map</p>
                <h4 className="mt-1 text-base font-bold text-stone-950">学生可能经历的完整学习路径</h4>
                <p className="mt-1 text-[11px] text-stone-500">上方是固定主线，下方彩色区域是满足证据与时间条件后无感插入的资源。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Status tone={missingPrerequisiteCoverage.length ? "warning" : "ready"}>
                  先决覆盖 {pretestKnowledgePointIds.size - missingPrerequisiteCoverage.length}/{pretestKnowledgePointIds.size}
                </Status>
                <Status tone={missingModuleCoverage.length ? "warning" : "ready"}>
                  模块覆盖 {quizIds.size - missingModuleCoverage.length}/{quizIds.size}
                </Status>
              </div>
            </div>
            <div className="mt-4">
              <CourseFlowModel branches={plan.branches} mainScenes={studentScenes} pretestTitle={plan.pretest.title} />
            </div>
          </section>

          <details className="group overflow-hidden rounded-[12px] border border-stone-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-cyan-50 text-cyan-800"><FileQuestion size={17} /></span>
                <span>
                  <strong className="block text-sm text-stone-900">课前测题目</strong>
                  <span className="mt-0.5 block text-[11px] text-stone-500">{plan.pretest.questions.length} 题 · 点击展开逐题审核</span>
                </span>
              </span>
              <ChevronDown className="shrink-0 text-stone-400 transition group-open:rotate-180" size={18} />
            </summary>
            <div className="space-y-3 border-t border-stone-100 bg-stone-50/60 p-4">
              {plan.pretest.questions.slice(0, 5).map((question, index) => (
                <div className="rounded-[9px] border border-stone-200 bg-white p-3" key={question.id}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.12em] text-stone-400">题目 {index + 1}</span>
                    <span className="text-[10px] text-stone-500">关联：{knowledgeNames(question.knowledgePointIds, knowledgePoints)}</span>
                  </div>
                  <textarea
                    className="min-h-16 w-full resize-y rounded-[7px] border border-stone-200 bg-white px-3 py-2 text-xs leading-5"
                    onChange={(event) => patchPlan({
                      pretest: {
                        ...plan.pretest,
                        questions: plan.pretest.questions.map((item) =>
                          item.id === question.id ? { ...item, prompt: event.target.value } : item,
                        ).slice(0, 5),
                      },
                    })}
                    value={question.prompt}
                  />
                </div>
              ))}
            </div>
          </details>

          <ResourceReviewGroup
            branches={prerequisites}
            description="前测暴露对应知识缺口时，在正式主课开始前插入。"
            knowledgePoints={knowledgePoints}
            mainScenes={studentScenes}
            onChange={patchBranch}
            threshold={plan.thresholds.enrichmentMasteryMin ?? 80}
            title="课前先决知识资源"
          />
          <ResourceReviewGroup
            branches={moduleResources}
            description="模块测验掌握良好且时间充足时，在解析后插入。"
            knowledgePoints={knowledgePoints}
            mainScenes={studentScenes}
            onChange={patchBranch}
            threshold={plan.thresholds.enrichmentMasteryMin ?? 80}
            title="模块后拓展资源"
          />

          <div className="flex items-start gap-3 rounded-[10px] border border-cyan-200 bg-cyan-50 px-4 py-3 text-cyan-950">
            <Route className="mt-0.5 shrink-0" size={16} />
            <div>
              <p className="text-xs font-bold">无需在这里单独确认</p>
              <p className="mt-0.5 text-[10px] leading-4 text-cyan-800">点击页面底部“进入课程生成”时，系统会校验并自动确认当前方案，然后生成主课和全部额外资源。</p>
            </div>
          </div>
          {message ? <p className="text-right text-xs text-cyan-900">{message}</p> : null}
        </div>
      )}
    </section>
  );
}

function OverviewMetric({
  detail,
  label,
  tone = "neutral",
  value,
}: {
  detail: string;
  label: string;
  tone?: "neutral" | "ready" | "warning";
  value: string;
}) {
  return (
    <div className={cn(
      "rounded-[11px] border bg-white px-4 py-3",
      tone === "ready"
        ? "border-emerald-200"
        : tone === "warning"
          ? "border-amber-300 bg-amber-50"
          : "border-stone-200",
    )}>
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-stone-400">{label}</p>
      <strong className={cn(
        "mt-1 block text-lg",
        tone === "ready" ? "text-emerald-800" : tone === "warning" ? "text-amber-900" : "text-stone-950",
      )}>{value}</strong>
      <p className="mt-0.5 text-[10px] leading-4 text-stone-500">{detail}</p>
    </div>
  );
}

function ResourceReviewGroup({
  branches,
  description,
  knowledgePoints,
  mainScenes,
  onChange,
  threshold,
  title,
}: {
  branches: AdaptiveBranchOutline[];
  description: string;
  knowledgePoints: KnowledgePoint[];
  mainScenes: AdaptiveMainScene[];
  onChange: (id: string, patch: Partial<AdaptiveBranchOutline>) => void;
  threshold: number;
  title: string;
}) {
  const invalidCount = branches.filter((branch) => !adaptiveResourceAddsNovelContent(branch)).length;
  return (
    <section className="overflow-hidden rounded-[12px] border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-stone-900">{title}</h4>
            <Status tone={invalidCount ? "warning" : "ready"}>
              {invalidCount ? `${invalidCount} 份待完善` : `${branches.length} 份已覆盖`}
            </Status>
          </div>
          <p className="mt-1 text-[11px] text-stone-500">{description}</p>
        </div>
        <span className="text-[10px] font-bold text-stone-400">点击单项展开编辑</span>
      </div>
      <div className="divide-y divide-stone-100">
        {branches.length ? branches.map((branch) => (
          <ResourceEditor
            branch={branch}
            key={branch.id}
            knowledgePoints={knowledgePoints}
            mainScenes={mainScenes}
            onChange={(patch) => onChange(branch.id, patch)}
            threshold={threshold}
          />
        )) : (
          <div className="flex items-center gap-2 px-4 py-4 text-xs text-amber-800">
            <AlertTriangle size={15} /> 尚无资源，请按当前主课重新建模。
          </div>
        )}
      </div>
    </section>
  );
}

function ResourceEditor({
  branch,
  knowledgePoints,
  mainScenes,
  onChange,
  threshold,
}: {
  branch: AdaptiveBranchOutline;
  knowledgePoints: KnowledgePoint[];
  mainScenes: AdaptiveMainScene[];
  onChange: (patch: Partial<AdaptiveBranchOutline>) => void;
  threshold: number;
}) {
  const effectiveKind = resourceKind(branch);
  const prerequisite = effectiveKind === "prerequisite";
  const trigger = branch.trigger ?? {
    placement: prerequisite ? "before-main-course" as const : "after-module" as const,
    evidenceRule: prerequisite ? "pretest-gap" as const : "module-mastery" as const,
    minimumRemainingSec: branch.targetDurationSec,
  };
  const quizzes = mainScenes.filter((scene) => scene.type === "quiz");
  const noveltyValid = adaptiveResourceAddsNovelContent(branch);
  const linkedQuizTitle = quizzes.find((scene) =>
    (trigger.assessmentSceneIds ?? []).includes(scene.id),
  )?.title;
  const evidenceSummary = prerequisite
    ? `前测缺口 · ${knowledgeNames(branch.prerequisiteKnowledgePointIds, knowledgePoints)}`
    : `${linkedQuizTitle ?? "未关联模块测验"} · ≥ ${trigger.scoreThreshold ?? threshold} 分`;
  return (
    <details className="group bg-white">
      <summary className="grid cursor-pointer list-none gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)_auto] md:items-center">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-800">{resourceLabel(branch)}</span>
            <strong className="truncate text-sm text-stone-900">{branch.title}</strong>
          </span>
          <span className="mt-1 block truncate text-[10px] text-stone-500">{branch.noveltyStatement || "尚未说明相对主课的新增价值"}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-semibold text-stone-700">{evidenceSummary}</span>
          <span className="mt-1 block text-[10px] text-stone-400">约 {Math.ceil(branch.targetDurationSec / 60)} 分钟 · 同播放器无感插入</span>
        </span>
        <span className="flex items-center justify-end gap-2">
          <Status tone={branch.preparedResource?.status === "ready" ? "ready" : "draft"}>
            {branch.preparedResource?.status === "ready" ? `${branch.preparedResource.scenesCount ?? 1} 页成品` : "待生成"}
          </Status>
          {!noveltyValid ? <Status tone="warning">需处理</Status> : null}
          <ChevronDown className="text-stone-400 transition group-open:rotate-180" size={17} />
        </span>
      </summary>
      <div className="grid gap-4 border-t border-stone-100 bg-stone-50/70 p-4 lg:grid-cols-2">
        <div className="space-y-3">
          <TextField label="资源标题" onChange={(value) => onChange({ title: value })} value={branch.title} />
          <TextArea label="教学目标" onChange={(value) => onChange({ objective: value })} value={branch.objective} />
          <label className="block text-[11px] font-bold text-stone-700">
            资源类型
            <select
              className="mt-1 h-9 w-full rounded-[7px] border border-stone-200 bg-white px-2 text-xs"
              onChange={(event) => {
                const kind = event.target.value as AdaptiveBranchOutline["kind"];
                const isPrerequisite = kind === "prerequisite";
                onChange({
                  kind,
                  trigger: {
                    ...trigger,
                    placement: isPrerequisite ? "before-main-course" : "after-module",
                    evidenceRule: isPrerequisite ? "pretest-gap" : "module-mastery",
                  },
                });
              }}
              value={branch.kind}
            >
              {Object.entries(RESOURCE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <TextArea
            label="相对主课新增价值（必填）"
            onChange={(value) => onChange({ noveltyStatement: value })}
            value={branch.noveltyStatement ?? ""}
          />
          <TextArea
            label="成品生成指导"
            onChange={(value) => onChange({ generationGuidance: value })}
            value={branch.generationGuidance ?? ""}
          />
        </div>
        <div className="space-y-3">
          <div className="rounded-[8px] border border-cyan-100 bg-cyan-50/50 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-700">插入规则</p>
            <p className="mt-1 text-xs font-bold text-cyan-950">
              {prerequisite
                ? "前测发现关联先决知识缺口 → 正式主课开始前连续插入"
                : `模块测验达到 ${trigger.scoreThreshold ?? threshold} 分且时间充足 → 测验解析后连续插入`}
            </p>
            {!prerequisite ? (
              <label className="mt-3 block text-[11px] font-bold text-stone-700">
                关联模块测验
                <select
                  className="mt-1 h-9 w-full rounded-[7px] border border-stone-200 bg-white px-2 text-xs"
                  onChange={(event) => onChange({
                    trigger: { ...trigger, assessmentSceneIds: event.target.value ? [event.target.value] : [] },
                  })}
                  value={trigger.assessmentSceneIds?.[0] ?? ""}
                >
                  <option value="">请选择模块测验</option>
                  {quizzes.map((scene) => <option key={scene.id} value={scene.id}>{scene.title}</option>)}
                </select>
              </label>
            ) : (
              <p className="mt-2 text-[11px] text-stone-600">
                关联先决知识：{knowledgeNames(branch.prerequisiteKnowledgePointIds, knowledgePoints)}
              </p>
            )}
          </div>
          <NumberField
            label="资源时长（秒）"
            max={360}
            min={90}
            onChange={(value) => onChange({
              targetDurationSec: value,
              trigger: { ...trigger, minimumRemainingSec: Math.max(value, trigger.minimumRemainingSec) },
            })}
            value={branch.targetDurationSec}
          />
          {!prerequisite ? (
            <NumberField
              label="该资源掌握阈值（分）"
              max={100}
              min={60}
              onChange={(value) => onChange({
                trigger: { ...trigger, scoreThreshold: value },
              })}
              value={trigger.scoreThreshold ?? threshold}
            />
          ) : null}
          <div className="rounded-[8px] border border-stone-200 bg-stone-50 p-3 text-[11px] leading-5 text-stone-600">
            <strong className="text-stone-900">主课重叠审查：</strong>
            {(branch.mainCourseOverlapSceneIds?.length ?? 0) > 0
              ? branch.mainCourseOverlapSceneIds.map((id) => mainScenes.find((scene) => scene.id === id)?.title ?? id).join("、")
              : "未标记潜在重叠页；生成时仍会使用完整主课大纲进行去重。"}
          </div>
          {branch.preparedResource?.status === "ready" && branch.preparedResource.classroomId ? (
            <a
              className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-stone-900 px-3 text-xs font-bold text-white"
              href={`/teacher/openmaic/classroom/${branch.preparedResource.classroomId}`}
              target="_blank"
            >
              <PlaySquare size={14} /> 预览已生成资源
            </a>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function CourseFlowModel({
  branches,
  mainScenes,
  pretestTitle,
}: {
  branches: AdaptiveBranchOutline[];
  mainScenes: AdaptiveMainScene[];
  pretestTitle: string;
}) {
  const prerequisites = branches.filter((branch) =>
    (branch.trigger?.placement ?? (resourceKind(branch) === "prerequisite" ? "before-main-course" : "after-module"))
      === "before-main-course",
  );
  const modules: Array<{
    checkpoint?: AdaptiveMainScene;
    resources: AdaptiveBranchOutline[];
    scenes: AdaptiveMainScene[];
  }> = [];
  let currentScenes: AdaptiveMainScene[] = [];
  mainScenes.forEach((scene) => {
    currentScenes.push(scene);
    if (scene.type !== "quiz") return;
    modules.push({
      checkpoint: scene,
      resources: branches.filter((branch) =>
        (branch.trigger?.placement ?? (resourceKind(branch) === "prerequisite" ? "before-main-course" : "after-module")) === "after-module"
        && (branch.trigger?.assessmentSceneIds ?? []).includes(scene.id),
      ),
      scenes: currentScenes,
    });
    currentScenes = [];
  });
  if (currentScenes.length) {
    modules.push({ scenes: currentScenes, resources: [] });
  }
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-stretch gap-0">
        <div className="flex w-56 flex-col overflow-hidden rounded-[11px] border border-cyan-200 bg-white shadow-sm">
          <div className="border-b border-cyan-100 bg-cyan-50 px-3 py-3">
            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-cyan-700">开课前 · 必经</span>
            <strong className="mt-1 block text-xs text-stone-950">{pretestTitle}</strong>
            <span className="mt-1 block text-[10px] text-stone-500">最多 5 题，诊断先决知识</span>
          </div>
          <div className={cn(
            "flex flex-1 flex-col justify-between px-3 py-3",
            prerequisites.length ? "bg-amber-50" : "bg-stone-50",
          )}>
            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-800">条件资源轨道</span>
            <div className="mt-2 space-y-1.5">
              {prerequisites.length ? prerequisites.slice(0, 3).map((branch) => (
                <ResourceChip branch={branch} key={branch.id} />
              )) : <span className="text-[10px] text-stone-400">无课前补充资源</span>}
              {prerequisites.length > 3 ? (
                <span className="block text-[10px] font-bold text-amber-800">另有 {prerequisites.length - 3} 份资源</span>
              ) : null}
            </div>
            <span className="mt-2 text-[9px] leading-4 text-amber-800">仅答错关联先决知识时插入</span>
          </div>
        </div>
        {modules.map((module, index) => {
          const title = module.checkpoint?.title
            ?? module.scenes[0]?.title
            ?? `模块 ${index + 1}`;
          return (
            <div className="flex items-stretch" key={module.checkpoint?.id ?? module.scenes.map((scene) => scene.id).join("-")}>
              <div className="flex w-12 shrink-0 items-center px-2">
                <span className="h-px flex-1 bg-stone-300" />
                <span className="-ml-px h-2 w-2 rotate-45 border-r border-t border-stone-400" />
              </div>
              <div className="flex w-60 flex-col overflow-hidden rounded-[11px] border border-stone-200 bg-white shadow-sm">
                <div className="border-b border-stone-100 px-3 py-3">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-stone-400">
                    主课模块 {String(index + 1).padStart(2, "0")} · {module.scenes.length} 页
                  </span>
                  <strong className="mt-1 block truncate text-xs text-stone-950">{title}</strong>
                  <span className="mt-1 block truncate text-[10px] text-stone-500">
                    {module.scenes.slice(0, 3).map((scene) => scene.title).join(" → ")}
                  </span>
                </div>
                <div className={cn(
                  "flex flex-1 flex-col justify-between px-3 py-3",
                  module.resources.length ? "bg-sky-50" : "bg-stone-50",
                )}>
                  <span className="text-[9px] font-black uppercase tracking-[0.12em] text-sky-800">
                    {module.checkpoint ? "测验后条件资源" : "继续主课"}
                  </span>
                  <div className="mt-2 space-y-1.5">
                    {module.resources.length ? module.resources.slice(0, 2).map((branch) => (
                      <ResourceChip branch={branch} key={branch.id} />
                    )) : (
                      <span className="text-[10px] text-stone-400">
                        {module.checkpoint ? "尚未配置模块拓展" : "本段无模块测验"}
                      </span>
                    )}
                    {module.resources.length > 2 ? (
                      <span className="block text-[10px] font-bold text-sky-800">另有 {module.resources.length - 2} 份资源</span>
                    ) : null}
                  </div>
                  <span className="mt-2 text-[9px] leading-4 text-sky-800">
                    {module.checkpoint ? "掌握达标且时间充足时插入" : "按主课程连续播放"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div className="flex w-20 shrink-0 items-center pl-3">
          <span className="h-px w-5 bg-emerald-400" />
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-800">完成</span>
        </div>
      </div>
    </div>
  );
}

export function AdaptiveCourseFlowPreview({
  mainScenes,
  plan,
}: {
  mainScenes: AdaptiveMainScene[];
  onPreviewBranch?: (branch: AdaptiveBranchOutline) => void;
  plan: AdaptiveLearningPlan;
}) {
  return <CourseFlowModel branches={plan.branches} mainScenes={mainScenes.filter(isStudentMainScene)} pretestTitle={plan.pretest.title} />;
}

function ResourceChip({ branch }: { branch: AdaptiveBranchOutline }) {
  return (
    <span className="block truncate rounded-[6px] border border-white/80 bg-white px-2 py-1.5 text-[9px] font-bold text-stone-700 shadow-sm">
      {resourceLabel(branch)} · {branch.title} · {Math.ceil(branch.targetDurationSec / 60)} 分钟
    </span>
  );
}

function CompactNumberField({
  label,
  max,
  min,
  onChange,
  suffix,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-[8px] border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] font-bold text-stone-700">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          className="h-8 w-16 rounded-[6px] border border-stone-200 bg-white px-2 text-right text-xs font-bold text-stone-900"
          max={max}
          min={min}
          onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))}
          type="number"
          value={value}
        />
        <span className="text-[10px] font-medium text-stone-500">{suffix}</span>
      </span>
    </label>
  );
}

function TextField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block text-[11px] font-bold text-stone-700">
      {label}
      <input className="mt-1 h-9 w-full rounded-[7px] border border-stone-200 px-3 text-xs" onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}

function TextArea({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block text-[11px] font-bold text-stone-700">
      {label}
      <textarea className="mt-1 min-h-20 w-full resize-y rounded-[7px] border border-stone-200 px-3 py-2 text-xs leading-5" onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}

function NumberField({ label, max, min, onChange, value }: { label: string; max: number; min: number; onChange: (value: number) => void; value: number }) {
  return (
    <label className="block text-[11px] font-bold text-stone-700">
      {label}
      <input
        className="mt-1 h-9 w-full rounded-[7px] border border-stone-200 px-3 text-xs"
        max={max}
        min={min}
        onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))}
        type="number"
        value={value}
      />
    </label>
  );
}

function Status({ children, tone }: { children: React.ReactNode; tone: "ready" | "warning" | "draft" }) {
  return (
    <span className={cn(
      "rounded-full px-2 py-0.5 text-[10px] font-bold",
      tone === "ready" ? "bg-emerald-100 text-emerald-800" : tone === "warning" ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-600",
    )}>{children}</span>
  );
}

function isStudentMainScene(scene: AdaptiveMainScene): boolean {
  return scene.stageKey === "ai-learning" || scene.audience === "student";
}

function knowledgeNames(ids: string[] | undefined, points: KnowledgePoint[]): string {
  if (!ids?.length) return "未关联";
  return ids.map((id) => points.find((point) => point.id === id)?.name ?? id).join("、");
}
