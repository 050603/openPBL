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
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { Avatar, AvatarStack } from "@/components/dashboard-shell";
import { Card, FileBadge, Pill, PrimaryButton, TextArea } from "@/components/ui";
import type {
  Course,
  EvaluationDimension,
  ProjectGroup,
  RubricScore,
} from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { generateLiveEvaluation, type LiveEvaluationResult } from "@/lib/teaching-ai/client-api";

type LiveEvaluation = LiveEvaluationResult;

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
  const dimensions = course.content.evaluationPlan.dimensions;
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

  // Track which group's score we've loaded so we don't reset sliders
  // when dimensions array reference changes during re-renders.
  const lastLoadedGroupId = useRef<string | null>(null);

  // Only reset scores when the active group changes or on first load.
  // We intentionally do NOT depend on `dimensions` or `existingScore`
  // because those references change on every re-render, which would
  // reset slider values the teacher has already adjusted.
  useEffect(() => {
    if (active?.id === lastLoadedGroupId.current) return;
    lastLoadedGroupId.current = active?.id ?? null;

    if (existingScore) {
      setScores(existingScore.dimensionScores ?? {});
      setComment(existingScore.comment ?? "");
    } else {
      // 没有已有评分：重置为 0
      const zeros: Record<string, number> = {};
      for (const d of dimensions) zeros[d.id] = 0;
      setScores(zeros);
      setComment("");
    }
    setMessage(null);
  }, [active?.id]);

  function flashMessage(text: string, tone: "ok" | "err") {
    setMessage({ tone, text });
    window.setTimeout(() => setMessage(null), 3500);
  }

  // ===== 阶段六：AI 实时汇报评价 =====
  const [liveEvaluation, setLiveEvaluation] = useState<LiveEvaluation | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | undefined>();
  const [teacherNotes, setTeacherNotes] = useState("");

  async function runLiveEval() {
    if (!active) return;
    setEvalLoading(true);
    setEvalError(undefined);
    try {
      const result = await generateLiveEvaluation({
        course,
        group: active,
        teacherNotes: teacherNotes.trim(),
      });
      setLiveEvaluation(result);
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : "AI 实时评价失败");
    } finally {
      setEvalLoading(false);
    }
  }

  function applyScore(dimensionName: string, suggestedScore: number) {
    const dim = dimensions.find((d) => d.name === dimensionName);
    if (!dim) {
      flashMessage(`未找到维度：${dimensionName}`, "err");
      return;
    }
    setScores((prev) => ({ ...prev, [dim.id]: suggestedScore }));
    flashMessage(`已将「${dim.name}」滑块设为 ${suggestedScore} 分`, "ok");
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
        targetType: "group",
        targetId: active.id,
        stageKey: "showcase",
        kind,
        content: comment.trim(),
      });
      flashMessage("已发送点评给小组", "ok");
    } catch (e) {
      flashMessage(`发送失败：${e instanceof Error ? e.message : "未知错误"}`, "err");
    } finally {
      setSavingFeedback(false);
    }
  }

  async function submitScore(status: "submitted" | "passed" | "revision" = "submitted") {
    if (!active) return;
    const total = weightedTotal(scores, dimensions);
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
        dimensionScores: scores,
        comment: comment.trim() || "展示结构清晰，后续可继续加强数据论证与落地说明。",
        total,
        status,
      });
      if (!result) {
        throw new Error("提交未生效：缺少 courseId");
      }
      flashMessage(
        status === "revision"
          ? `已记录「需修改」，当前总分 ${total}`
          : `评分已提交，当前总分 ${total}`,
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
    session.addActivity(course.id, "切换当前汇报组", group.name, "教师");
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="本场汇报组数" value={`${groups.length}`} />
        <Metric
          label="当前汇报组"
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
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
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
          <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
            <Users className="text-blue-700" size={20} /> 小组列表
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
                      : "border-slate-200 bg-white hover:border-blue-300"
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
                  <div className="mt-1 text-xs text-slate-500">
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
                  <h2 className="text-lg font-black">
                    {active.name}
                    <span className="ml-2 text-base font-semibold text-slate-500">
                      {active.topic}
                    </span>
                  </h2>
                  <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                    <AvatarStack names={active.members.map((m) => m.name)} /> 汇报人：
                    {active.members[0]?.name ?? "-"}
                  </div>
                  {existingScore ? (
                    <div className="mt-1 text-xs text-slate-500">
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
                    {course.presentingGroupId === active.id ? "正在汇报" : "设为汇报组"}
                  </PrimaryButton>
                </div>
              </div>
            </Card>

            <div className="grid gap-5 xl:grid-cols-2">
              <Card>
                <h3 className="mb-3 flex items-center gap-2 font-black">
                  <FileText className="text-blue-700" size={18} /> 方案材料
                </h3>
                {activeUploads.length ? (
                  <ul className="space-y-2">
                    {activeUploads.map((file) => (
                      <li
                        className="flex items-center gap-3 rounded-[6px] border border-slate-200 px-3 py-2"
                        key={file.id}
                      >
                        <FileBadge type={file.fileType} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{file.fileName}</div>
                          <div className="text-xs text-slate-500">
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
                          className="grid h-8 w-8 place-items-center rounded-[6px] border border-slate-200 text-slate-600 hover:bg-slate-50"
                          href={file.url}
                          download
                        >
                          <Download size={15} />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-[6px] border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
                    暂未提交
                  </div>
                )}
              </Card>

              <Card className="xl:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 font-black">
                    <Sparkles className="text-amber-600" size={18} /> AI 实时评价建议
                  </h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${liveEvaluation?.source === "llm" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {liveEvaluation ? (liveEvaluation.source === "llm" ? "LLM 生成" : "本地兜底") : "未生成"}
                  </span>
                </div>
                <div className="mb-3">
                  <div className="mb-1 text-xs font-semibold text-slate-700">现场速记（可选，提供给 AI 作为参考）：</div>
                  <TextArea
                    className="h-16"
                    onChange={(e) => setTeacherNotes(e.target.value)}
                    placeholder="如：表达清晰，但数据来源未说明..."
                    value={teacherNotes}
                  />
                </div>
                <PrimaryButton
                  className="h-9 px-3 text-sm"
                  onClick={() => void runLiveEval()}
                  disabled={evalLoading || !active}
                  type="button"
                >
                  {evalLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {evalLoading ? "评价中..." : "生成评价建议"}
                </PrimaryButton>
                {evalError ? (
                  <div className="mt-3 rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    {evalError}
                  </div>
                ) : null}
                {liveEvaluation ? (
                  <div className="mt-4 space-y-3">
                    <ul className="space-y-2">
                      {liveEvaluation.dimensions.map((d) => (
                        <li key={d.name} className="rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-slate-800">{d.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-blue-700">{d.suggestedScore} 分</span>
                              <button
                                className="inline-flex h-7 items-center gap-1 rounded-[5px] border border-blue-300 px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                onClick={() => applyScore(d.name, d.suggestedScore)}
                                type="button"
                              >
                                应用到滑块
                              </button>
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{d.rationale}</div>
                        </li>
                      ))}
                    </ul>
                    {liveEvaluation.overallComment ? (
                      <div className="rounded-[6px] border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm leading-6 text-slate-700">
                        <span className="font-semibold text-amber-700">总体评价：</span>
                        {liveEvaluation.overallComment}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Card>

              <Card>
                <h3 className="mb-3 flex items-center gap-2 font-black">
                  <Star className="text-amber-600" size={18} /> 实时评分
                </h3>
                <ul className="space-y-3">
                  {dimensions.map((d) => (
                    <DimensionRow
                      dimension={d}
                      key={d.id}
                      onChange={(v) =>
                        setScores((prev) => ({ ...prev, [d.id]: v }))
                      }
                      value={scores[d.id] ?? 0}
                    />
                  ))}
                </ul>
                <div className="mt-3 rounded-[6px] border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-emerald-700">
                      加权总分
                    </span>
                    <span className="text-2xl font-black text-emerald-700">
                      {weightedTotal(scores, dimensions)}
                    </span>
                  </div>
                </div>
                <div className="mt-2 rounded-[6px] border border-blue-100 bg-blue-50/40 p-2 text-xs text-blue-700">
                  <span className="font-semibold">评分影响：</span>
                  提交后，该分数将同步至「评价反思」页的班级均分统计，并自动推送给该组学生（约 1.5 秒内），学生在「个人评价与反思」页可实时查看雷达图与综合得分。
                </div>
              </Card>
            </div>

            <Card>
              <h3 className="mb-3 flex items-center gap-2 font-black">
                <MessageCircle className="text-blue-700" size={18} /> 提问 / 点评
              </h3>
              <TextArea
                className="h-24"
                onChange={(e) => setComment(e.target.value)}
                placeholder="对当前汇报小组的点评、问题或建议..."
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
                  提问给小组
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
          <div className="grid place-items-center rounded-[10px] border border-dashed border-slate-300 py-20 text-sm text-slate-500">
            暂无小组
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
      <div className="text-sm text-slate-500">{label}</div>
      <div
        className={`mt-2 truncate text-2xl font-black ${
          tone === "blue"
            ? "text-blue-700"
            : tone === "green"
              ? "text-emerald-700"
              : tone === "orange"
                ? "text-amber-700"
                : "text-slate-950"
        }`}
      >
        {value}
      </div>
    </Card>
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
    <li>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">
          {dimension.name}
          <span className="ml-2 text-xs text-slate-500">权重 {dimension.weight}%</span>
        </span>
        <span className="text-sm font-bold">{value}</span>
      </div>
      <div className="mt-1 text-xs text-slate-500">{dimension.description}</div>
      <input
        className="mt-1 w-full accent-blue-600"
        max={100}
        min={0}
        onChange={(e) => onChange(Number(e.target.value))}
        type="range"
        value={value}
      />
    </li>
  );
}

function weightedTotal(
  scores: Record<string, number>,
  dimensions: EvaluationDimension[],
): number {
  if (dimensions.length === 0) return 0;
  return Math.round(
    dimensions.reduce(
      (sum, d) => sum + ((scores[d.id] ?? 0) * d.weight) / 100,
      0,
    ),
  );
}
