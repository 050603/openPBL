"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Lightbulb,
  Loader2,
  MessageCircle,
  Users,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Avatar, AvatarStack } from "@/components/dashboard-shell";
import { Card, FileBadge, Pill, PrimaryButton, TextArea, toast } from "@/components/ui";
import type {
  Course,
  EvaluationDimension,
  ProjectGroup,
  RubricScore,
} from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { generateProcessEvaluation, type ProcessEvaluationResult } from "@/lib/teaching-ai/client-api";
import { computeFinalScore } from "@/lib/evaluation/scoring";
import { getTeacherEvaluationDimensions } from "@/lib/evaluation/responsibility";

type StatusTone = "slate" | "blue" | "green" | "orange";

export function ShowcaseTeacherView({
  course,
  onSelectGroup,
}: {
  course: Course;
  onSelectGroup?: (id: string) => void;
}) {
  const session = useSession();
  const groups = course.groups ?? [];
  const [activeId, setActiveId] = useState(
    course.presentingGroupId ?? groups[0]?.id ?? "",
  );
  const active = groups.find((g) => g.id === activeId) ?? groups[0];
  const dimensions = getTeacherEvaluationDimensions(
    course.content.evaluationPlan.dimensions,
  );
  const activeUploads = (course.uploads ?? []).filter(
    (item) => item.groupId === active?.id,
  );

  // ===== 取该组已评过的分数（用于编辑模式预填） =====
  const existingScore: RubricScore | undefined = (course.rubricScores ?? []).find(
    (s) => s.groupId === active?.id && s.stageKey === "showcase",
  );

  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [savingScore, setSavingScore] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [message, setMessage] = useState<
    { tone: "ok" | "err"; text: string } | null
  >(null);
  const [processEvaluation, setProcessEvaluation] = useState<ProcessEvaluationResult | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | undefined>();
  const [aiProcessScore, setAiProcessScore] = useState<number | null>(existingScore?.aiTotal ?? null);

  // Track which group's score we've loaded so we don't reset sliders
  // when dimensions array reference changes during re-renders.
  const lastLoadedGroupId = useRef<string | null>(null);
  const messageTimerRef = useRef<number | null>(null);

  // Only reset scores when the active group changes or on first load.
  // We intentionally do NOT depend on `dimensions` or `existingScore`
  // because those references change on every re-render, which would
  // reset slider values the teacher has already adjusted.
  /* eslint-disable react-hooks/set-state-in-effect -- Changing the presenting group loads its persisted scoring draft into the controlled form. */
  useEffect(() => {
    if (active?.id === lastLoadedGroupId.current) return;
    lastLoadedGroupId.current = active?.id ?? null;

    if (existingScore) {
      const persistedScores = existingScore.dimensionScores ?? {};
      setScores(
        dimensions.reduce<Record<string, number>>((result, dimension) => {
          result[dimension.id] = clampScore(persistedScores[dimension.id] ?? 0);
          return result;
        }, {}),
      );
      setComment(existingScore.comment ?? "");
    } else {
      // 没有已有评分：重置为 0
      const zeros: Record<string, number> = {};
      for (const d of dimensions) zeros[d.id] = 0;
      setScores(zeros);
      setComment("");
    }
    setMessage(null);
    setProcessEvaluation(null);
    setEvalError(undefined);
    setAiProcessScore(existingScore?.aiTotal ?? null);
    // Group changes are the only reset boundary; including derived rubric objects
    // would overwrite slider edits whenever the session store re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function flashMessage(text: string, tone: "ok" | "err") {
    setMessage({ tone, text });
    if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
    messageTimerRef.current = window.setTimeout(() => {
      messageTimerRef.current = null;
      setMessage(null);
    }, 3500);
  }

  useEffect(() => () => {
    if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
  }, []);

  // AI 仅评价过程与方案专业性，不读取教师现场评分，也不提供教师参考分。
  async function runLiveEval() {
    if (!active) return;
    setEvalLoading(true);
    setEvalError(undefined);
    try {
      const result = await generateProcessEvaluation({ course, groupId: active.id });
      const total = result.dimensions.length
        ? Math.round(result.dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / result.dimensions.length)
        : null;
      setProcessEvaluation(result);
      setAiProcessScore(total);
      const teacherTotal = weightedTotal(scores, dimensions);
      const finalTotal = computeFinalScore({
        aiScore: total,
        aiWeight,
        teacherScore: teacherTotal,
        teacherWeight,
      });
      session.upsertRubricScore({
        id: existingScore?.id,
        courseId: course.id,
        groupId: active.id,
        stageKey: "showcase",
        dimensionScores: scores,
        teacherTotal,
        aiTotal: total,
        finalTotal: finalTotal ?? undefined,
        scoringMode: "hybrid",
        comment: comment.trim(),
        total: finalTotal ?? teacherTotal,
        status: existingScore?.status ?? "draft",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI 过程评价失败";
      setEvalError(message);
      toast.error("AI 过程评价失败", { description: message });
    } finally {
      setEvalLoading(false);
    }
  }

  async function submitFeedback(kind: "question" | "comment") {
    if (!active) return;
    if (!comment.trim()) {
      flashMessage("请先填写点评内容", "err");
      return;
    }
    setSavingFeedback(true);
    try {
      session.addFeedback({
        courseId: course.id,
        targetType: "student",
        targetId: active.members[0]?.studentId ?? active.id,
        stageKey: "showcase",
        kind,
        content: comment.trim(),
      });
      flashMessage("已发送点评给学生", "ok");
    } catch (e) {
      flashMessage(`发送失败：${e instanceof Error ? e.message : "未知错误"}`, "err");
    } finally {
      setSavingFeedback(false);
    }
  }

  async function submitScore(status: "submitted" | "passed" | "revision" = "submitted") {
    if (!active) return;
    const normalizedScores = dimensions.reduce<Record<string, number>>((result, dimension) => {
      result[dimension.id] = clampScore(scores[dimension.id] ?? 0);
      return result;
    }, {});
    const total = weightedTotal(normalizedScores, dimensions);
    const finalTotal = computeFinalScore({ aiScore: aiProcessScore, aiWeight, teacherScore: total, teacherWeight });
    if (total === 0 && status === "submitted") {
      flashMessage("请先拖动滑块给维度打分", "err");
      return;
    }
    setSavingScore(true);
    try {
      const result = session.upsertRubricScore({
        id: existingScore?.id,
        courseId: course.id,
        groupId: active.id,
        stageKey: "showcase",
        dimensionScores: normalizedScores,
        teacherTotal: total,
        aiTotal: aiProcessScore,
        finalTotal: finalTotal ?? undefined,
        scoringMode: "hybrid",
        comment: comment.trim() || "展示结构清晰，后续可继续加强数据论证与落地说明。",
        total: finalTotal ?? total,
        status,
      });
      if (!result) {
        throw new Error("提交未生效：缺少 courseId");
      }
      flashMessage(
        status === "revision"
          ? `已记录「需修改」，当前总分 ${total}`
          : finalTotal === null ? `教师评分已提交，等待 AI 过程评价后合成` : `评分已提交，最终分 ${finalTotal}`,
        "ok",
      );
    } catch (e) {
      flashMessage(`提交失败：${e instanceof Error ? e.message : "未知错误"}`, "err");
    } finally {
      setSavingScore(false);
    }
  }

  function setPresenting(group: ProjectGroup) {
    setActiveId(group.id);
    session.setPresentingGroup(course.id, group.id);
    session.addActivity(course.id, "切换当前个人汇报", group.name, "教师");
  }

  const teacherScoreTotal = weightedTotal(scores, dimensions);
  const scoredFlows = course.content.evaluationPlan.flows ?? [];
  const aiWeight = scoredFlows.find((flow) => flow.sourceRole === "ai")?.weight ?? 40;
  const teacherWeight = scoredFlows.find((flow) => flow.sourceRole === "teacher")?.weight ?? 60;
  const finalScore = computeFinalScore({ aiScore: aiProcessScore, aiWeight, teacherScore: teacherScoreTotal || existingScore?.teacherTotal, teacherWeight });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="本场个人汇报数" value={`${groups.length}`} />
        <Metric
          label="当前汇报学生"
          value={groups.find((g) => g.id === course.presentingGroupId)?.name ?? "-"}
          tone="blue"
        />
        <Metric
          label="已评分"
          value={`${(course.rubricScores ?? []).filter((s) => s.stageKey === "showcase").length} / ${groups.length}`}
          tone="green"
        />
        <Metric label="上传材料" value={`${course.uploads?.length ?? 0}`} tone="orange" />
      </div>

      {message ? (
        <div
          className={`flex items-start gap-2 rounded-[8px] border px-4 py-3 text-sm font-semibold ${
            message.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-[var(--pbl-success)]"
              : "border-[var(--pbl-danger-border)] bg-[var(--pbl-danger-soft)] text-[var(--pbl-danger)]"
          }`}
        >
          {message.tone === "ok" ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Users className="text-blue-700" size={20} /> 学生项目列表
          </h2>
          <ul className="space-y-2">
            {groups.map((group) => {
              const isPresenting = course.presentingGroupId === group.id;
              const scored = Boolean(
                (course.rubricScores ?? []).some(
                  (score) => score.groupId === group.id && score.stageKey === "showcase",
                ),
              );
              return (
                <li
                  className={`cursor-pointer rounded-[6px] border px-3 py-2 transition ${
                    group.id === active?.id
                      ? "border-blue-400 bg-blue-50/60"
                      : "border-stone-200 bg-white hover:border-blue-300"
                  }`}
                  key={group.id}
                  onClick={() => setActiveId(group.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{group.name}</span>
                    {isPresenting ? (
                      <Pill tone="green">汇报中</Pill>
                    ) : scored ? (
                      <Pill tone="blue">已评</Pill>
                    ) : (
                      <Pill tone="orange">待评</Pill>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-stone-500">
                    {group.topic} · {group.members.length} 人
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    {group.members.slice(0, 4).map((m) => (
                      <Avatar key={m.studentId} name={m.name} size={24} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {active ? (
          <div className="space-y-5">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">
                    {active.name}
                    <span className="ml-2 text-base font-semibold text-stone-500">
                      {active.topic}
                    </span>
                  </h2>
                  <div className="mt-1 flex items-center gap-2 text-sm text-stone-500">
                    <AvatarStack names={active.members.map((m) => m.name)} /> 汇报人：
                    {active.members[0]?.name ?? "-"}
                  </div>
                  {existingScore ? (
                    <div className="mt-1 text-xs text-stone-500">
                      已评过：总分 {existingScore.total}（{existingScore.status === "passed" ? "通过" : existingScore.status === "revision" ? "需修改" : "已提交"}）
                    </div>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <PrimaryButton
                    className="h-9 px-3 text-sm"
                    onClick={() => onSelectGroup?.(active.id)}
                  >
                    <Eye size={15} /> 查看作品
                  </PrimaryButton>
                  <PrimaryButton
                    className="h-9 px-3 text-sm"
                    onClick={() => setPresenting(active)}
                    tone={course.presentingGroupId === active.id ? "green" : "blue"}
                  >
                    {course.presentingGroupId === active.id ? "正在汇报" : "设为当前汇报"}
                  </PrimaryButton>
                </div>
              </div>
            </Card>

            <div className="grid gap-5 xl:grid-cols-2">
              <Card>
                <h3 className="mb-3 flex items-center gap-2 font-bold">
                  <FileText className="text-blue-700" size={18} /> 方案材料
                </h3>
                {activeUploads.length ? (
                  <ul className="space-y-2">
                    {activeUploads.map((file) => (
                      <li
                        className="flex items-center gap-3 rounded-[6px] border border-stone-200 px-3 py-2"
                        key={file.id}
                      >
                        <FileBadge type={file.fileType} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{file.fileName}</div>
                          <div className="text-xs text-stone-500">
                            {file.title} · {file.size}
                          </div>
                        </div>
                        <a
                          className="grid h-8 w-8 place-items-center rounded-[6px] border border-blue-200 text-blue-700 hover:bg-blue-50"
                          href={file.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Eye size={15} />
                        </a>
                        <a
                          className="grid h-8 w-8 place-items-center rounded-[6px] border border-stone-200 text-stone-600 hover:bg-stone-50"
                          href={file.url}
                          download
                        >
                          <Download size={15} />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-[6px] border border-dashed border-stone-300 py-10 text-center text-sm text-stone-500">
                    暂未提交
                  </div>
                )}
              </Card>

              <Card className="xl:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 font-bold">
                    <Sparkles className="text-blue-600" size={18} /> AI 过程与专业评价
                  </h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${aiProcessScore !== null ? "bg-emerald-50 text-[var(--pbl-success)]" : "bg-stone-100 text-stone-600"}`}>
                    {aiProcessScore !== null ? `${aiProcessScore} 分 · 权重 ${aiWeight}%` : "待生成"}
                  </span>
                </div>
                <p className="mb-3 text-sm leading-6 text-stone-600">基于学习轨迹、伴学对话、作品迭代、AI 协作健康度和最终方案专业性独立评分；不会读取或建议教师现场评分。</p>
                <PrimaryButton
                  className="h-9 px-3 text-sm"
                  onClick={() => void runLiveEval()}
                  disabled={evalLoading || !active}
                  type="button"
                >
                  {evalLoading ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                  {evalLoading ? "正在生成..." : "生成 AI 过程评价"}
                </PrimaryButton>
                {evalError ? (
                  <div className="mt-3 rounded-[6px] border border-[var(--pbl-danger-border)] bg-[var(--pbl-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--pbl-danger)]">
                    {evalError}
                  </div>
                ) : null}
                {processEvaluation ? (
                  <div className="mt-3 rounded-[6px] border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs leading-5 text-blue-700">
                    {processEvaluation.summary}
                  </div>
                ) : null}
              </Card>
              <Card className="xl:col-span-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 font-bold">
                    <Sparkles className="text-emerald-600" size={18} /> 教师现场汇报评分
                  </h3>
                  <span className="text-xs font-bold text-[var(--pbl-success)]">独立权重 {teacherWeight}%</span>
                </div>
                <ul className="space-y-3">
                  {dimensions.map((d) => (
                    <DimensionRow
                      dimension={d}
                      key={d.id}
                      onChange={(v) =>
                        setScores((prev) => ({ ...prev, [d.id]: clampScore(v) }))
                      }
                      value={scores[d.id] ?? 0}
                    />
                  ))}
                </ul>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <ScoreChip label="教师评分" value={teacherScoreTotal} tone="emerald" />
                  <ScoreChip label="AI 过程评价" value={aiProcessScore ?? "待完成"} tone="blue" />
                  <ScoreChip label="当前最终分" value={finalScore ?? (aiProcessScore === null ? "待 AI 评价" : "待教师评分")} tone="amber" />
                </div>
                <div className="mt-2 rounded-[6px] border border-blue-100 bg-blue-50/40 p-2 text-xs leading-5 text-blue-700">
                  <span className="font-semibold">评分流程：</span>
                  AI 与教师分别负责不同板块并独立评分；两部分都完成后系统才按 {aiWeight}/{teacherWeight} 权重合成最终分。
                </div>
              </Card>
            </div>

            <Card>
              <h3 className="mb-3 flex items-center gap-2 font-bold">
                <MessageCircle className="text-blue-700" size={18} /> 提问 / 点评
              </h3>
              <TextArea
                className="h-24"
                onChange={(e) => setComment(e.target.value)}
                placeholder="对当前学生汇报的点评、问题或建议..."
                value={comment}
              />
              <div className="mt-3 flex justify-end gap-2">
                <PrimaryButton
                  className="h-9 px-3 text-sm"
                  disabled={savingFeedback}
                  onClick={() => void submitFeedback("question")}
                  variant="outline"
                >
                  {savingFeedback ? (
                    <Loader2 className="animate-spin" size={15} />
                  ) : (
                    <Lightbulb size={15} />
                  )}{" "}
                  提问给学生
                </PrimaryButton>
                <PrimaryButton
                  className="h-9 px-3 text-sm"
                  disabled={savingScore}
                  onClick={() => void submitScore("submitted")}
                >
                  {savingScore ? (
                    <Loader2 className="animate-spin" size={15} />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}{" "}
                  {existingScore ? "更新评分" : "提交评分"}
                </PrimaryButton>
                <PrimaryButton
                  className="h-9 px-3 text-sm"
                  disabled={savingScore}
                  onClick={() => void submitScore("revision")}
                  tone="orange"
                >
                  {savingScore ? (
                    <Loader2 className="animate-spin" size={15} />
                  ) : null}{" "}
                  要求修改
                </PrimaryButton>
              </div>
            </Card>
          </div>
        ) : (
          <div className="grid place-items-center rounded-[10px] border border-dashed border-stone-300 py-20 text-sm text-stone-500">
            暂无个人项目
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: StatusTone;
}) {
  return (
    <Card>
      <div className="text-sm text-stone-500">{label}</div>
      <div
        className={`mt-2 truncate text-2xl font-bold ${
          tone === "blue"
            ? "text-blue-700"
            : tone === "green"
              ? "text-[var(--pbl-success)]"
              : tone === "orange"
                ? "text-[var(--pbl-warning)]"
                : "text-stone-900"
        }`}
      >
        {value}
      </div>
    </Card>
  );
}

function ScoreChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "emerald" | "blue" | "amber";
}) {
  const className =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-[var(--pbl-success)]"
      : tone === "blue"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-[var(--pbl-warning-soft)] bg-[var(--pbl-warning-soft)] text-[var(--pbl-warning)]";
  return (
    <div className={`rounded-[6px] border p-3 ${className}`}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function DimensionRow({
  dimension,
  value,
  onChange,
}: {
  dimension: EvaluationDimension;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <li className="rounded-[8px] border border-stone-200 bg-white p-3">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-stone-800">
            {dimension.name}
            <span className="ml-2 text-xs text-stone-500">权重 {dimension.weight}%</span>
          </span>
          <span className="text-sm font-bold">{value}</span>
        </div>
        <div className="mt-1 text-xs text-stone-500">{dimension.description}</div>
        <input
          aria-label={`${dimension.name}分数`}
          className="mt-1 h-8 w-20 rounded-[4px] border border-stone-200 px-2 text-right text-sm font-semibold tabular-nums outline-none focus:border-blue-500"
          inputMode="numeric"
          max={100}
          min={0}
          onChange={(e) => onChange(clampScore(Number(e.target.value)))}
          type="number"
          value={value}
        />
        <input
          className="mt-1 w-full accent-blue-600"
          max={100}
          min={0}
          onChange={(e) => onChange(clampScore(Number(e.target.value)))}
          type="range"
          value={value}
        />
      </div>
    </li>
  );
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function weightedTotal(
  scores: Record<string, number>,
  dimensions: EvaluationDimension[],
): number {
  if (dimensions.length === 0) return 0;
  const totalDimensionWeight = dimensions.reduce(
    (sum, dimension) => sum + dimension.weight,
    0,
  );
  if (totalDimensionWeight <= 0) return 0;
  return Math.round(
    dimensions.reduce(
      (sum, d) => sum + ((scores[d.id] ?? 0) * d.weight) / totalDimensionWeight,
      0,
    ),
  );
}
