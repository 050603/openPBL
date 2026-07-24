"use client";

import { useState } from "react";
import {
  ArrowDown,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  GitBranch,
  Layers3,
  Loader2,
  PlaySquare,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  AdaptiveBranchOutline,
  AdaptiveLearningPlan,
  KnowledgePoint,
  OpenMaicSceneOutlineSnapshot,
} from "@/lib/session/types";
import { cn } from "@/lib/utils";

type AdaptiveMainScene = Pick<
  OpenMaicSceneOutlineSnapshot,
  "id" | "title" | "type" | "order" | "stageKey" | "audience" | "knowledgePointIds"
>;

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
      if (!response.ok || !payload.plan) {
        throw new Error(payload.error || "生成失败");
      }
      onChange(payload.plan);
      setMessage(payload.warning || "已生成前测与分支大纲，请确认后再进入课堂生成。");
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
    const invalidatesPreparedResource = [
      "title",
      "objective",
      "keyPoints",
      "sceneType",
      "targetDurationSec",
      "generationGuidance",
    ].some((key) => key in patch);
    patchPlan({
      branches: plan.branches.map((branch) =>
        branch.id === id
          ? {
              ...branch,
              ...patch,
              preparedResource: invalidatesPreparedResource
                ? undefined
                : branch.preparedResource,
              status: "draft",
            }
          : branch,
      ),
    });
  }

  const validMainSceneIds = new Set(mainScenes.filter(isStudentMainScene).map((scene) => scene.id));
  const unboundBranchCount = plan?.branches.filter(
    (branch) => !branch.trigger?.afterSceneId || !validMainSceneIds.has(branch.trigger.afterSceneId),
  ).length ?? 0;

  return (
    <section className="overflow-hidden rounded-[10px] border border-cyan-200 bg-[linear-gradient(145deg,#f8fdff_0%,#ffffff_46%,#f7fbf8_100%)] shadow-[0_10px_30px_rgba(8,145,178,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-cyan-100 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] bg-cyan-950 text-cyan-50 shadow-sm">
            <Route size={20} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-editorial text-lg font-semibold text-stone-950">自适应学习路径</h3>
              {plan?.status === "teacher-confirmed" && unboundBranchCount === 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  <CheckCircle2 size={12} /> 教师已确认
                </span>
              ) : unboundBranchCount > 0 ? (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                  {unboundBranchCount} 个触发点待绑定
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                  待确认
                </span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-stone-600">
              主课程页面确认后，再把前测、页间触发条件和两类补充资源绑定成一条完整课程路径。
            </p>
          </div>
        </div>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-cyan-950 px-3.5 text-xs font-bold text-white transition hover:bg-cyan-900 disabled:cursor-wait disabled:opacity-60"
          disabled={generating || knowledgePoints.length === 0}
          onClick={() => void generatePlan()}
          type="button"
        >
          {generating ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
          {plan ? "按当前主课重新建模" : "AI 生成分层方案"}
        </button>
      </div>

      {!plan ? (
        <div className="grid min-h-36 place-items-center px-6 py-8 text-center">
          <div>
            <BrainCircuit className="mx-auto text-cyan-700" size={26} />
            <p className="mt-3 text-sm font-semibold text-stone-800">
              基于已确认知识图谱生成 3–5 道轻量前测与锚点分支
            </p>
            <p className="mt-1 text-xs text-stone-500">
              生成后可逐项修改；确认后会在“生成课程内容”阶段同步生成可预览的分支课堂。
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5 p-5">
          <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
            <ProcessStep
              detail={`${mainScenes.filter(isStudentMainScene).length} 个已确认页面`}
              icon={<PlaySquare size={16} />}
              index="01"
              title="先生成主课程"
            />
            <ArrowDown className="mx-auto rotate-0 text-cyan-300 md:-rotate-90" size={18} />
            <ProcessStep
              detail={`${plan.pretest.questions.length} 题前测 · 三层学生`}
              icon={<ShieldCheck size={16} />}
              index="02"
              title="再配置分层依据"
            />
            <ArrowDown className="mx-auto rotate-0 text-cyan-300 md:-rotate-90" size={18} />
            <ProcessStep
              detail={`${plan.branches.length} 个页间候选资源`}
              icon={<GitBranch size={16} />}
              index="03"
              title="最后绑定触发点"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricField
              label="分支总时间预算"
              suffix="分钟"
              value={plan.timeBudgetMin}
              onChange={(value) => patchPlan({ timeBudgetMin: value })}
            />
            <MetricField
              label="基础生上限"
              suffix="分"
              value={plan.thresholds.foundationMax}
              onChange={(value) =>
                patchPlan({ thresholds: { ...plan.thresholds, foundationMax: value } })
              }
            />
            <MetricField
              label="优秀生起点"
              suffix="分"
              value={plan.thresholds.advancedMin}
              onChange={(value) =>
                patchPlan({ thresholds: { ...plan.thresholds, advancedMin: value } })
              }
            />
            <MetricField
              label="补基础小测线"
              suffix="分"
              value={plan.thresholds.branchQuizLow}
              onChange={(value) =>
                patchPlan({ thresholds: { ...plan.thresholds, branchQuizLow: value } })
              }
            />
            <MetricField
              label="拓展小测线"
              suffix="分"
              value={plan.thresholds.branchQuizHigh}
              onChange={(value) =>
                patchPlan({ thresholds: { ...plan.thresholds, branchQuizHigh: value } })
              }
            />
          </div>

          <div className="rounded-[9px] border border-cyan-200 bg-cyan-950 px-4 py-3 text-cyan-50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">触发判定规则</p>
                <p className="mt-1 text-xs leading-5 text-cyan-50/85">
                  学生到达指定页 → 读取前测层次与当前节点小测 → 校验剩余分支时间 → 插入补基础或拓展资源。
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                <span className="rounded-full bg-white/10 px-2 py-1">低于 {plan.thresholds.branchQuizLow} 分：补基础</span>
                <span className="rounded-full bg-white/10 px-2 py-1">达到 {plan.thresholds.branchQuizHigh} 分：拓展</span>
              </div>
            </div>
          </div>

          <div className="rounded-[9px] border border-stone-200 bg-white">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <BookOpenCheck className="text-cyan-800" size={17} />
                <div>
                  <h4 className="text-sm font-bold text-stone-900">课前轻量前测</h4>
                  <p className="text-[11px] text-stone-500">
                    {plan.pretest.questions.length} 题 · 预计 {plan.pretest.estimatedMinutes} 分钟
                  </p>
                </div>
              </div>
            </div>
            <div className="divide-y divide-stone-100">
              {plan.pretest.questions.map((question, index) => (
                <div className="grid gap-3 px-4 py-3 md:grid-cols-[34px_1fr_180px]" key={question.id}>
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-cyan-50 text-xs font-black text-cyan-900">
                    {index + 1}
                  </span>
                  <div>
                    <input
                      aria-label={`前测第 ${index + 1} 题`}
                      className="h-9 w-full rounded-[6px] border border-stone-200 px-3 text-sm font-semibold outline-none focus:border-cyan-600"
                      onChange={(event) =>
                        patchPlan({
                          pretest: {
                            ...plan.pretest,
                            questions: plan.pretest.questions.map((item) =>
                              item.id === question.id
                                ? { ...item, prompt: event.target.value }
                                : item,
                            ),
                          },
                        })
                      }
                      value={question.prompt}
                    />
                    <p className="mt-1.5 truncate text-[11px] text-stone-500">
                      锚定：
                      {question.knowledgePointIds
                        .map((id) => knowledgePoints.find((point) => point.id === id)?.name || id)
                        .join("、") || "未关联"}
                    </p>
                  </div>
                  <select
                    aria-label={`前测第 ${index + 1} 题正确答案`}
                    className="h-9 rounded-[6px] border border-stone-200 bg-white px-2 text-xs outline-none focus:border-cyan-600"
                    onChange={(event) =>
                      patchPlan({
                        pretest: {
                          ...plan.pretest,
                          questions: plan.pretest.questions.map((item) =>
                            item.id === question.id
                              ? { ...item, correctOptionIndex: Number(event.target.value) }
                              : item,
                          ),
                        },
                      })
                    }
                    value={question.correctOptionIndex}
                  >
                    {question.options.map((option, optionIndex) => (
                      <option key={`${question.id}-${optionIndex}`} value={optionIndex}>
                        正确：{option}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <CourseFlowModel
            branches={plan.branches}
            mainScenes={mainScenes}
            pretestTitle={plan.pretest.title}
          />

          <div>
            <div className="mb-2 flex items-end justify-between">
              <div>
                <h4 className="text-sm font-bold text-stone-900">主课锚点后的候选分支</h4>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  运行时只编排满足证据与时间预算的成品资源，不再现场生成课程。
                </p>
              </div>
              <span className="text-[11px] font-semibold text-stone-400">
                {plan.branches.length} 个候选
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {plan.branches.map((branch) => (
                <BranchCard
                  branch={branch}
                  key={branch.id}
                  knowledgePoints={knowledgePoints}
                  mainScenes={mainScenes}
                  thresholds={plan.thresholds}
                  onChange={(patch) => patchBranch(branch.id, patch)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700">
              <input
                checked={plan.enabled}
                className="h-4 w-4 accent-cyan-900"
                onChange={(event) => patchPlan({ enabled: event.target.checked })}
                type="checkbox"
              />
              新课程启用学生分层与离线资源池
            </label>
            <button
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-[7px] px-4 text-xs font-bold transition",
                plan.status === "teacher-confirmed"
                  ? "border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : "bg-emerald-700 text-white hover:bg-emerald-800",
              )}
              disabled={
                plan.status !== "teacher-confirmed"
                && plan.enabled
                && unboundBranchCount > 0
              }
              onClick={() =>
                patchPlan({
                  status:
                    plan.status === "teacher-confirmed" ? "draft" : "teacher-confirmed",
                  branches: plan.branches.map((branch) => ({
                    ...branch,
                    status:
                      plan.status === "teacher-confirmed" ? "draft" : "teacher-confirmed",
                  })),
                })
              }
              type="button"
              title={
                plan.enabled && unboundBranchCount > 0
                  ? "请先为所有分支绑定主课程页面"
                  : undefined
              }
            >
              <CheckCircle2 size={15} />
              {plan.status === "teacher-confirmed" ? "取消确认并继续修改" : "确认自适应路径"}
            </button>
          </div>
        </div>
      )}
      {message ? (
        <div className="border-t border-cyan-100 bg-cyan-50/70 px-5 py-2 text-xs text-cyan-900">
          {message}
        </div>
      ) : null}
    </section>
  );
}

function isStudentMainScene(scene: AdaptiveMainScene): boolean {
  return scene.stageKey === "ai-learning" || scene.audience === "student";
}

function ProcessStep({
  detail,
  icon,
  index,
  title,
}: {
  detail: string;
  icon: React.ReactNode;
  index: string;
  title: string;
}) {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-[9px] border border-cyan-100 bg-white px-3 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-cyan-50 text-cyan-900">{icon}</span>
      <span className="min-w-0">
        <small className="block text-[9px] font-black tracking-[0.14em] text-cyan-600">STEP {index}</small>
        <strong className="mt-0.5 block text-xs text-stone-900">{title}</strong>
        <span className="mt-0.5 block truncate text-[10px] text-stone-500">{detail}</span>
      </span>
    </div>
  );
}

function CourseFlowModel({
  branches,
  mainScenes,
  onPreviewBranch,
  pretestTitle,
}: {
  branches: AdaptiveBranchOutline[];
  mainScenes: AdaptiveMainScene[];
  onPreviewBranch?: (branch: AdaptiveBranchOutline) => void;
  pretestTitle: string;
}) {
  const scenes = mainScenes.filter(isStudentMainScene).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const anchored = new Set<string>();

  return (
    <section className="overflow-hidden rounded-[10px] border border-stone-200 bg-[#f7f8f6]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-white px-4 py-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold text-stone-900">
            <Layers3 className="text-cyan-800" size={17} /> 整节课程完整走向
          </h4>
          <p className="mt-0.5 text-[11px] text-stone-500">实线为所有学生的主课程；虚线资源仅在页间条件满足时插入。</p>
        </div>
        <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-bold text-stone-600">
          前测 + {scenes.length} 个主页面 + {branches.length} 个候选分支
        </span>
      </div>
      <div className="px-4 py-4">
        <div className="mx-auto max-w-4xl">
          <FlowNode
            eyebrow="开课前 · 全体学生"
            index="P"
            title={pretestTitle}
            tone="pretest"
          />
          {scenes.length ? scenes.map((scene, index) => {
            const inserted = branches.filter((branch) => branch.trigger?.afterSceneId === scene.id);
            inserted.forEach((branch) => anchored.add(branch.id));
            const nextScene = scenes[index + 1];
            return (
              <div key={scene.id}>
                <div className="mx-auto h-5 w-px bg-stone-300" />
                <FlowNode
                  eyebrow={`主课程 ${index + 1}/${scenes.length} · ${scene.type === "quiz" ? "节点小测" : scene.type === "interactive" ? "互动" : "PPT"}`}
                  index={String(index + 1).padStart(2, "0")}
                  title={scene.title}
                  tone="main"
                />
                {inserted.length ? (
                  <div className="relative my-2 rounded-[9px] border border-dashed border-cyan-300 bg-white/80 p-3">
                    <div className="absolute left-1/2 top-0 h-full border-l border-dashed border-cyan-300" />
                    <p className="relative mx-auto mb-2 w-fit rounded-full bg-cyan-950 px-3 py-1 text-[9px] font-black text-white">
                      到达本页后判定 · 满足条件才插入 · 完成后回到「{nextScene?.title ?? "主课结束"}」
                    </p>
                    <div className="relative grid gap-2 sm:grid-cols-2">
                      {inserted.map((branch) => (
                        <BranchFlowNode
                          branch={branch}
                          key={branch.id}
                          onPreview={onPreviewBranch}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          }) : (
            <div className="mt-4 rounded-[8px] border border-dashed border-amber-300 bg-amber-50 px-4 py-6 text-center text-xs text-amber-900">
              请先生成并确认主课程页面，再生成自适应路径；否则分支无法绑定到具体页间位置。
            </div>
          )}
          {branches.some((branch) => !anchored.has(branch.id)) ? (
            <div className="mt-4 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              尚有 {branches.filter((branch) => !anchored.has(branch.id)).length} 个分支未绑定主课程页面，请在下方资源卡中设置触发点。
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function AdaptiveCourseFlowPreview({
  mainScenes,
  onPreviewBranch,
  plan,
}: {
  mainScenes: AdaptiveMainScene[];
  onPreviewBranch?: (branch: AdaptiveBranchOutline) => void;
  plan: AdaptiveLearningPlan;
}) {
  return (
    <CourseFlowModel
      branches={plan.branches}
      mainScenes={mainScenes}
      onPreviewBranch={onPreviewBranch}
      pretestTitle={plan.pretest.title}
    />
  );
}

function FlowNode({
  eyebrow,
  index,
  title,
  tone,
}: {
  eyebrow: string;
  index: string;
  title: string;
  tone: "pretest" | "main";
}) {
  return (
    <div className={cn(
      "relative grid min-h-16 grid-cols-[42px_1fr] items-center gap-3 rounded-[9px] border px-3 py-2.5 shadow-sm",
      tone === "pretest" ? "border-cyan-200 bg-cyan-50" : "border-stone-200 bg-white",
    )}>
      <span className={cn(
        "grid h-9 w-9 place-items-center rounded-[8px] text-xs font-black",
        tone === "pretest" ? "bg-cyan-950 text-white" : "bg-stone-900 text-white",
      )}>{index}</span>
      <span>
        <small className="block text-[9px] font-black uppercase tracking-[0.12em] text-stone-400">{eyebrow}</small>
        <strong className="mt-0.5 block text-xs text-stone-900">{title}</strong>
      </span>
    </div>
  );
}

function BranchFlowNode({
  branch,
  onPreview,
}: {
  branch: AdaptiveBranchOutline;
  onPreview?: (branch: AdaptiveBranchOutline) => void;
}) {
  const foundation = branch.kind === "foundation";
  const rule = branch.trigger?.evidenceRule;
  return (
    <div className={cn(
      "rounded-[8px] border px-3 py-2.5",
      foundation ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50",
    )}>
      <div className="flex items-center justify-between gap-2">
        <strong className={foundation ? "text-amber-950" : "text-sky-950"}>{foundation ? "补基础" : "拓展知识"}</strong>
        <span className="text-[9px] font-bold text-stone-500">{Math.round(branch.targetDurationSec / 60)} 分钟</span>
      </div>
      <p className="mt-1 truncate text-[10px] font-semibold text-stone-700">{branch.title}</p>
      <p className="mt-1 text-[9px] text-stone-500">
        {rule === "tier"
          ? "达到指定层次"
          : rule === "tier-and-high-score"
            ? `优秀生且小测 ≥ ${branch.trigger?.scoreThreshold ?? 90}`
            : `基础生或小测 < ${branch.trigger?.scoreThreshold ?? 70}`}
        {" · "}剩余 ≥ {Math.round((branch.trigger?.minimumRemainingSec ?? 90) / 60)} 分钟
      </p>
      {branch.preparedResource?.status === "ready" && branch.preparedResource.classroomId ? (
        <button
          className={cn(
            "mt-2 inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-[10px] font-bold text-white",
            foundation ? "bg-amber-800 hover:bg-amber-900" : "bg-sky-800 hover:bg-sky-900",
          )}
          onClick={() => onPreview?.(branch)}
          type="button"
        >
          <PlaySquare size={11} /> 打开成品课堂
        </button>
      ) : (
        <p className="mt-2 text-[9px] font-semibold text-stone-400">
          {branch.preparedResource?.status === "failed"
            ? "成品生成失败，发布前必须重新生成"
            : "尚未生成成品课堂"}
        </p>
      )}
    </div>
  );
}

function MetricField({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rounded-[8px] border border-stone-200 bg-white px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
        <Clock3 size={12} /> {label}
      </span>
      <span className="mt-1 flex items-baseline gap-1">
        <input
          className="w-16 bg-transparent text-xl font-black text-stone-900 outline-none"
          min={0}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          type="number"
          value={value}
        />
        <span className="text-xs text-stone-400">{suffix}</span>
      </span>
    </label>
  );
}

function BranchCard({
  branch,
  knowledgePoints,
  mainScenes,
  thresholds,
  onChange,
}: {
  branch: AdaptiveBranchOutline;
  knowledgePoints: KnowledgePoint[];
  mainScenes: AdaptiveMainScene[];
  thresholds: AdaptiveLearningPlan["thresholds"];
  onChange: (patch: Partial<AdaptiveBranchOutline>) => void;
}) {
  const foundation = branch.kind === "foundation";
  const scenes = mainScenes.filter(isStudentMainScene).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const trigger = branch.trigger ?? {
    evidenceRule: foundation ? "tier-or-low-score" as const : "tier-and-high-score" as const,
    scoreThreshold: foundation ? thresholds.branchQuizLow : thresholds.branchQuizHigh,
    minimumRemainingSec: branch.targetDurationSec,
  };
  const patchTrigger = (patch: Partial<NonNullable<AdaptiveBranchOutline["trigger"]>>) =>
    onChange({ trigger: { ...trigger, ...patch } });
  return (
    <article
      className={cn(
        "rounded-[9px] border bg-white p-4",
        foundation ? "border-amber-200" : "border-sky-200",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-black tracking-wide",
            foundation ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-900",
          )}
        >
          {foundation ? "补基础" : "拓展"}
        </span>
        <span className="text-[11px] font-semibold text-stone-400">
          {branch.preparedResource?.status === "ready"
            ? `成品已生成 · ${branch.preparedResource.scenesCount ?? 1} 页`
            : branch.preparedResource?.status === "failed"
              ? "上次生成失败"
              : "将在课堂资源生成阶段预先制作"}
          {" · "}{Math.round(branch.targetDurationSec / 60)} 分钟 · {branch.sceneType === "interactive" ? "互动" : "1–2 页 PPT"}
        </span>
      </div>
      <input
        aria-label={`${foundation ? "补基础" : "拓展"}分支标题`}
        className="mt-3 h-9 w-full border-b border-stone-200 bg-transparent text-sm font-bold text-stone-900 outline-none focus:border-cyan-700"
        onChange={(event) => onChange({ title: event.target.value })}
        value={branch.title}
      />
      <textarea
        aria-label={`${branch.title}目标`}
        className="mt-2 min-h-16 w-full resize-y rounded-[6px] border border-stone-200 p-2 text-xs leading-5 text-stone-600 outline-none focus:border-cyan-700"
        onChange={(event) => onChange({ objective: event.target.value })}
        value={branch.objective}
      />
      <label className="mt-3 block rounded-[8px] border border-cyan-100 bg-cyan-50/55 p-3">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-900">
          教师生成指导
        </span>
        <span className="mt-0.5 block text-[10px] leading-4 text-cyan-800/75">
          可指定案例、难度、讲解顺序、互动方式，以及不希望 AI 引入的内容。
        </span>
        <textarea
          aria-label={`${branch.title}教师生成指导`}
          className="mt-2 min-h-20 w-full resize-y rounded-[6px] border border-cyan-200 bg-white p-2 text-xs leading-5 text-stone-700 outline-none focus:border-cyan-700"
          onChange={(event) => onChange({ generationGuidance: event.target.value })}
          placeholder={foundation
            ? "例如：使用生活化例子，先解释前序概念，再安排一道低门槛练习。"
            : "例如：使用新的项目情境，要求比较方案边界并说明判断依据。"}
          value={branch.generationGuidance ?? ""}
        />
      </label>
      <div className="mt-3 rounded-[8px] border border-stone-200 bg-stone-50 p-3">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-stone-500">页间触发点</p>
        <label className="mt-2 block text-[10px] font-semibold text-stone-600">
          学生完成哪一页后判定
          <select
            className="mt-1 h-9 w-full rounded-[6px] border border-stone-300 bg-white px-2 text-xs font-semibold text-stone-800 outline-none focus:border-cyan-700"
            onChange={(event) => {
              const index = scenes.findIndex((scene) => scene.id === event.target.value);
              patchTrigger({
                afterSceneId: event.target.value || undefined,
                beforeSceneId: index >= 0 ? scenes[index + 1]?.id : undefined,
              });
            }}
            value={trigger.afterSceneId ?? ""}
          >
            <option value="">尚未绑定页面</option>
            {scenes.map((scene, index) => (
              <option key={scene.id} value={scene.id}>
                第 {index + 1} 页后 · {scene.title}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_90px_100px]">
          <label className="text-[10px] font-semibold text-stone-600">
            学情条件
            <select
              className="mt-1 h-9 w-full rounded-[6px] border border-stone-300 bg-white px-2 text-xs outline-none"
              onChange={(event) => patchTrigger({
                evidenceRule: event.target.value as NonNullable<AdaptiveBranchOutline["trigger"]>["evidenceRule"],
              })}
              value={trigger.evidenceRule}
            >
              <option value="tier">仅按学生层次</option>
              <option value="tier-or-low-score">基础层或小测低分</option>
              <option value="tier-and-high-score">优秀层且小测高分</option>
            </select>
          </label>
          <label className="text-[10px] font-semibold text-stone-600">
            小测阈值
            <input
              className="mt-1 h-9 w-full rounded-[6px] border border-stone-300 bg-white px-2 text-xs outline-none"
              max={100}
              min={0}
              onChange={(event) => patchTrigger({ scoreThreshold: Number(event.target.value) || 0 })}
              type="number"
              value={trigger.scoreThreshold ?? (foundation ? thresholds.branchQuizLow : thresholds.branchQuizHigh)}
            />
          </label>
          <label className="text-[10px] font-semibold text-stone-600">
            最少剩余
            <span className="mt-1 flex h-9 items-center rounded-[6px] border border-stone-300 bg-white px-2">
              <input
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                min={2}
                onChange={(event) => patchTrigger({ minimumRemainingSec: (Number(event.target.value) || 2) * 60 })}
                type="number"
                value={Math.round(trigger.minimumRemainingSec / 60)}
              />
              <small className="text-stone-400">分</small>
            </span>
          </label>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-stone-500">
          插入位置：{trigger.afterSceneId ? `“${scenes.find((scene) => scene.id === trigger.afterSceneId)?.title ?? "指定页"}”之后` : "未设置"}
          {" → "}
          {trigger.beforeSceneId ? `“${scenes.find((scene) => scene.id === trigger.beforeSceneId)?.title ?? "下一页"}”之前` : "主课结束前"}
        </p>
      </div>
      <div className="mt-3">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-stone-500">成品资源内容标签</p>
        <ul className="mt-1.5 space-y-1">
          {branch.keyPoints.map((point, index) => (
            <li className="flex gap-2 text-[10px] leading-4 text-stone-600" key={`${branch.id}-point-${index}`}>
              <span className={foundation ? "text-amber-600" : "text-sky-600"}>0{index + 1}</span>{point}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-semibold text-cyan-800">
          {foundation ? "基础巩固" : "迁移拓展"}
        </span>
        {branch.targetTiers.map((tier) => (
          <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-semibold text-stone-600" key={`${branch.id}-${tier}`}>
            {tier === "foundation" ? "基础生" : tier === "advanced" ? "优秀生" : "平均生"}
          </span>
        ))}
        <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-semibold text-stone-600">
          {branch.sceneType === "interactive" ? "互动资源" : "PPT + TTS"}
        </span>
        <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-semibold text-stone-600">
          {Math.round(branch.targetDurationSec / 60)} 分钟
        </span>
        {branch.anchorKnowledgePointIds.map((id) => (
          <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-semibold text-stone-600" key={id}>
            {knowledgePoints.find((point) => point.id === id)?.name || id}
          </span>
        ))}
      </div>
    </article>
  );
}
