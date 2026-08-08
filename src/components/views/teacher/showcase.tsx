"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FileText,
  Lightbulb,
  Loader2,
  MessageCircle,
  Search,
  Users,
  Sparkles,
  RefreshCw,
  Wand2,
  X,
} from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import { Card, FileBadge, PrimaryButton, TextArea, toast } from "@/components/ui";
import type {
  AiAssessmentSuggestion,
  Course,
  EvaluationDimension,
  ProjectGroup,
  RubricScore,
} from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { generateProcessEvaluation, type ProcessEvaluationResult } from "@/lib/teaching-ai/client-api";
import { computeFinalScore } from "@/lib/evaluation/scoring";
import {
  aiAssessmentConfidenceLabel,
  aiAssessmentStatusLabel,
  calculateProcessSuggestionTotal,
  confirmedProcessScore,
  localizeEvaluationText,
  uniqueEvidenceGaps,
} from "@/lib/evaluation/process-assessment";
import { getTeacherEvaluationDimensions } from "@/lib/evaluation/responsibility";
import {
  isLearningEvidenceStructurallyComplete,
} from "@/lib/learning-evidence/readiness";

export type ShowcaseMaterial = {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  url?: string;
  inspectionStatus: "inspectable" | "student-annotated" | "metadata-only" | "unsupported";
  note?: string;
  createdAt: string;
};

export function collectShowcaseMaterials(course: Course, group: ProjectGroup | undefined): ShowcaseMaterial[] {
  if (!group) return [];
  const studentIds = new Set(group.members.map((member) => member.studentId));
  const byFile = new Map<string, ShowcaseMaterial>();
  (course.uploads ?? [])
    .filter((upload) => upload.stageKey === "showcase" && (upload.groupId === group.id || Boolean(upload.studentId && studentIds.has(upload.studentId))))
    .forEach((upload) => {
      byFile.set(upload.url || `${upload.fileName}:${upload.createdAt}`, {
        id: upload.id,
        title: upload.title,
        fileName: upload.fileName,
        fileType: upload.fileType,
        url: upload.url,
        inspectionStatus: "metadata-only",
        createdAt: upload.createdAt,
      });
    });
  (course.artifactSnapshots ?? [])
    .filter((snapshot) => snapshot.stageKey === "showcase" && studentIds.has(snapshot.studentId))
    .forEach((snapshot) => {
      const fileName = snapshot.fileName ?? snapshot.title;
      byFile.set(snapshot.sourceUrl || `${fileName}:${snapshot.createdAt}`, {
        id: snapshot.id,
        title: snapshot.title,
        fileName,
        fileType: snapshot.fileType,
        url: snapshot.sourceUrl,
        inspectionStatus: snapshot.inspectionStatus,
        note: snapshot.studentExcerpt ?? snapshot.annotation,
        createdAt: snapshot.createdAt,
      });
    });
  return [...byFile.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

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
  const activeStudentIds = new Set(
    active?.members.map((member) => member.studentId) ?? [],
  );
  const activeStudentId = active?.members[0]?.studentId;
  const activeShowcaseEvidence = (course.learningEvidence ?? []).filter(
    (item) =>
      activeStudentIds.has(item.studentId)
      && item.stageKey === "showcase"
      && item.countsTowardReadiness
      && ["submitted", "teacher-confirmed"].includes(item.status)
      && isLearningEvidenceStructurallyComplete(
        item,
        course.artifactSnapshots ?? [],
      ),
  );
  const requiredShowcaseKinds = [
    "final-artifact",
    "presentation-claim",
    "defense-response",
  ] as const;
  const hasCompleteShowcaseEvidence = requiredShowcaseKinds.every((kind) =>
    activeShowcaseEvidence.some((item) => item.kind === kind));
  const activeMaterials = collectShowcaseMaterials(course, active);
  const activeFinalArtifact = activeShowcaseEvidence.find((item) =>
    item.kind === "final-artifact");
  const activeIntent = (course.learningEvidence ?? []).find((item) =>
    item.studentId === activeStudentId && item.kind === "project-intent");
  const activeProjectTitle =
    (activeFinalArtifact?.payload as { title?: string } | undefined)?.title
    ?? (activeIntent?.payload as { personalQuestion?: string } | undefined)?.personalQuestion
    ?? "尚未形成新流程项目证据";
  const activeProcessEvidence = (course.learningEvidence ?? []).filter(
    (item) =>
      activeStudentIds.has(item.studentId)
      && item.countsTowardReadiness
      && ["submitted", "teacher-confirmed"].includes(item.status)
      && isLearningEvidenceStructurallyComplete(
        item,
        course.artifactSnapshots ?? [],
      ),
  );
  const hasActiveProcessEvidence = activeProcessEvidence.length > 0;
  const persistedSuggestion = (course.aiAssessmentSuggestions ?? [])
    .filter((item) =>
      item.studentId === activeStudentId && item.stageKey === "showcase")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

  // ===== 取该组已评过的分数（用于编辑模式预填） =====
  const existingScore: RubricScore | undefined = hasCompleteShowcaseEvidence
    ? (course.rubricScores ?? []).find(
        (s) => s.groupId === active?.id && s.stageKey === "showcase",
      )
    : undefined;

  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [savingScore, setSavingScore] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [materialDrawerOpen, setMaterialDrawerOpen] = useState(false);
  const [message, setMessage] = useState<
    { tone: "ok" | "err"; text: string } | null
  >(null);
  const [processEvaluation, setProcessEvaluation] = useState<ProcessEvaluationResult | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | undefined>();
  const [teacherGuidance, setTeacherGuidance] = useState("");
  const [assessmentSuggestion, setAssessmentSuggestion] =
    useState<AiAssessmentSuggestion | null>(persistedSuggestion ?? null);
  const [assessmentScoreDraft, setAssessmentScoreDraft] = useState<number | "">(
    persistedSuggestion?.teacherScore ?? persistedSuggestion?.suggestedTotal ?? "",
  );
  const [aiProcessScore, setAiProcessScore] = useState<number | null>(
    confirmedProcessScore(persistedSuggestion),
  );

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
    setTeacherGuidance("");
    setMaterialDrawerOpen(false);
    setAssessmentSuggestion(persistedSuggestion ?? null);
    setAssessmentScoreDraft(
      persistedSuggestion?.teacherScore ?? persistedSuggestion?.suggestedTotal ?? "",
    );
    setAiProcessScore(confirmedProcessScore(persistedSuggestion));
    // Group changes are the only reset boundary; including derived rubric objects
    // would overwrite slider edits whenever the session store re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!materialDrawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMaterialDrawerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [materialDrawerOpen]);

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
  async function runLiveEval(guidance?: string) {
    if (!active || !hasActiveProcessEvidence) return;
    setEvalLoading(true);
    setEvalError(undefined);
    try {
      const result = await generateProcessEvaluation({
        course,
        groupId: active.id,
        teacherGuidance: guidance?.trim() || undefined,
      });
      const total = calculateProcessSuggestionTotal(result.dimensions);
      const suggestion: AiAssessmentSuggestion = {
        id: `ai-assessment-${course.id}-${activeStudentId ?? active.id}-showcase`,
        courseId: course.id,
        studentId: activeStudentId ?? "",
        stageKey: "showcase",
        dimensions: result.dimensions.map((dimension) => ({
          dimensionId: dimension.dimensionId,
          dimensionLabel: dimension.name,
          suggestedScore: dimension.score,
          rationale: dimension.rationale,
          evidenceIds: dimension.evidenceIds,
          evidenceGaps: dimension.evidenceGaps,
        })),
        evidenceIds: result.evidenceIds,
        evidenceGaps: result.evidenceGaps,
        confidence: result.confidence,
        suggestedTotal: total,
        status: "pending-teacher-confirmation",
        createdAt: new Date().toISOString(),
      };
      setProcessEvaluation(result);
      setAssessmentSuggestion(suggestion);
      setAssessmentScoreDraft(total);
      setAiProcessScore(null);
      session.upsertAiAssessmentSuggestion(suggestion);
      if (guidance?.trim()) {
        flashMessage("AI 已按教师指导重新评分，请检查后确认", "ok");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI 过程评价失败";
      setEvalError(message);
      toast.error("AI 过程评价失败", { description: message });
    } finally {
      setEvalLoading(false);
    }
  }

  function reviewAiSuggestion(status: "confirmed" | "adjusted" | "rejected") {
    if (!assessmentSuggestion) return;
    const teacherScore = status === "confirmed"
      ? assessmentSuggestion.suggestedTotal
      : status === "adjusted" && assessmentScoreDraft !== ""
        ? clampScore(assessmentScoreDraft)
        : undefined;
    if (status !== "rejected" && typeof teacherScore !== "number") {
      flashMessage("证据不足，暂无法确认分数；可拒绝建议并补充证据", "err");
      return;
    }
    const reviewed: AiAssessmentSuggestion = {
      ...assessmentSuggestion,
      status,
      teacherScore,
      teacherName: session.user.name,
      teacherComment: comment.trim() || undefined,
      reviewedAt: new Date().toISOString(),
    };
    session.upsertAiAssessmentSuggestion(reviewed);
    setAssessmentSuggestion(reviewed);
    setAiProcessScore(status === "rejected" ? null : teacherScore ?? null);

    if (status !== "rejected" && typeof teacherScore === "number" && existingScore) {
      const synchronizedFinalScore = computeFinalScore({
        aiScore: teacherScore,
        aiWeight,
        teacherScore: existingScore.teacherTotal,
        teacherWeight,
      });
      session.upsertRubricScore({
        ...existingScore,
        aiDimensionScores: Object.fromEntries(
          assessmentSuggestion.dimensions.map((dimension) => [
            dimension.dimensionId,
            dimension.suggestedScore ?? 0,
          ]),
        ),
        aiTotal: teacherScore,
        aiProcessSummary: processEvaluation?.summary ?? existingScore.aiProcessSummary,
        aiProcessEvidence: assessmentSuggestion.evidenceIds,
        finalTotal: synchronizedFinalScore ?? undefined,
        total: synchronizedFinalScore ?? existingScore.teacherTotal ?? existingScore.total,
      });
    }
    flashMessage(
      status === "rejected"
        ? "已拒绝AI评价建议，不会进入成绩"
        : existingScore
          ? "AI过程分已确认，并同步更新最终分"
          : "AI过程分已确认；完成教师现场评分后将自动合成最终分",
      "ok",
    );
  }

  async function submitFeedback() {
    if (!active || !activeStudentId) return;
    if (!comment.trim()) {
      flashMessage("请先填写现场追问", "err");
      return;
    }
    setSavingFeedback(true);
    try {
      session.upsertTeacherAgentDirective({
        courseId: course.id,
        stageKey: "showcase",
        targetStudentIds: [activeStudentId],
        targetScope: "student",
        goal: "完成教师现场追问",
        instruction: comment.trim(),
        successCriteria: ["使用至少一条项目证据作答", "说明回答的边界或局限"],
        status: "active",
      });
      flashMessage("现场追问已下发，等待学生形成答辩证据", "ok");
    } catch (e) {
      flashMessage(`发送失败：${e instanceof Error ? e.message : "未知错误"}`, "err");
    } finally {
      setSavingFeedback(false);
    }
  }

  function requestRevision() {
    if (!comment.trim()) {
      flashMessage("请先写明需要修订的内容", "err");
      return;
    }
    const targetEvidence = [...activeShowcaseEvidence]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
    if (!targetEvidence) {
      flashMessage("尚无可退回的展示学习证据，请先让学生提交任务舱证据", "err");
      return;
    }
    session.upsertLearningEvidence({
      ...targetEvidence,
      status: "needs-revision",
      teacherFeedback: comment.trim(),
      updatedAt: new Date().toISOString(),
    });
    flashMessage("已将展示证据退回修订，并记录教师反馈", "ok");
  }

  async function submitScore(status: "submitted" | "passed" | "revision" = "submitted") {
    if (!active) return;
    if (!hasCompleteShowcaseEvidence) {
      flashMessage("最终作品、主张—证据—局限图和答辩证据完整后才能进行现场评分", "err");
      return;
    }
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
        aiDimensionScores:
          assessmentSuggestion
          && ["confirmed", "adjusted"].includes(assessmentSuggestion.status)
            ? Object.fromEntries(
                assessmentSuggestion.dimensions.flatMap((dimension) =>
                  typeof dimension.suggestedScore === "number"
                    ? [[dimension.dimensionId, dimension.suggestedScore]]
                    : []),
              )
            : undefined,
        aiTotal: aiProcessScore,
        aiProcessSummary:
          processEvaluation?.summary ?? existingScore?.aiProcessSummary,
        aiProcessEvidence:
          assessmentSuggestion
          && ["confirmed", "adjusted"].includes(assessmentSuggestion.status)
            ? assessmentSuggestion.evidenceIds
            : undefined,
        finalTotal: finalTotal ?? undefined,
        scoringMode: "hybrid",
        comment: comment.trim(),
        total: finalTotal ?? total,
        status,
      });
      if (!result) {
        throw new Error("提交未生效：缺少 courseId");
      }
      flashMessage(
        status === "revision"
          ? `已记录「需修改」，当前总分 ${total}`
          : finalTotal === null
            ? `教师评分已提交，等待教师确认AI过程建议后合成`
            : `评分已提交，最终分 ${finalTotal}`,
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
  }

  const teacherScoreTotal = weightedTotal(scores, dimensions);
  const scoredFlows = course.content.evaluationPlan.flows ?? [];
  const aiWeight = scoredFlows.find((flow) => flow.sourceRole === "ai")?.weight ?? 40;
  const teacherWeight = scoredFlows.find((flow) => flow.sourceRole === "teacher")?.weight ?? 60;
  const finalScore = computeFinalScore({ aiScore: aiProcessScore, aiWeight, teacherScore: teacherScoreTotal || existingScore?.teacherTotal, teacherWeight });
  const processSummary = processEvaluation?.summary ?? existingScore?.aiProcessSummary;
  const localizedProcessSummary = processSummary
    ? localizeEvaluationText(processSummary)
    : undefined;
  const processEvidenceById = new Map(
    activeProcessEvidence.map((evidence) => [evidence.id, evidence]),
  );
  const normalizedStudentQuery = studentQuery.trim().toLocaleLowerCase("zh-CN");
  const filteredGroups = normalizedStudentQuery
    ? groups.filter((group) => [
        group.name,
        group.topic,
        ...group.members.map((member) => member.name),
      ].some((value) => value?.toLocaleLowerCase("zh-CN").includes(normalizedStudentQuery)))
    : groups;

  return (
    <div className="space-y-3">
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

      <div className="grid gap-3 xl:h-[calc(100dvh-9rem)] xl:min-h-[680px] xl:max-h-[920px] xl:grid-cols-[230px_minmax(0,1fr)] xl:overflow-hidden">
        <Card className="flex min-h-0 flex-col p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Users className="text-blue-700" size={16} /> 学生列表
            </h2>
            <span className="text-xs font-semibold text-stone-400">{filteredGroups.length}/{groups.length}</span>
          </div>
          <label className="relative mb-2 block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
            <input
              aria-label="搜索学生"
              className="h-8 w-full rounded-lg border border-stone-200 bg-stone-50 pl-8 pr-2 text-xs outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              onChange={(event) => setStudentQuery(event.target.value)}
              placeholder="搜索姓名或项目"
              value={studentQuery}
            />
          </label>
          <ul className="min-h-0 flex-1 space-y-1.5 xl:overflow-y-auto xl:pr-1">
            {filteredGroups.map((group) => {
              const isPresenting = course.presentingGroupId === group.id;
              const groupScore = (course.rubricScores ?? []).find(
                  (score) => score.groupId === group.id && score.stageKey === "showcase",
              );
              const studentName = group.members[0]?.name ?? group.name;
              return (
                <li key={group.id}>
                  <button
                  aria-pressed={group.id === active?.id}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 ${
                    group.id === active?.id
                      ? "border-blue-400 bg-blue-50 shadow-sm"
                      : "border-stone-200 bg-white hover:border-blue-300"
                  }`}
                  onClick={() => setActiveId(group.id)}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={studentName} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-sm font-semibold">{studentName}</span>
                    {isPresenting ? (
                          <span className="shrink-0 text-[10px] font-bold text-emerald-700">汇报中</span>
                        ) : groupScore ? (
                          <span className="shrink-0 text-[10px] font-bold text-blue-700">{Math.round(groupScore.total)}分</span>
                    ) : (
                          <span className="shrink-0 text-[10px] font-bold text-amber-700">待评</span>
                    )}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-stone-500">{group.topic || "待确认项目主题"}</div>
                    </div>
                  </div>
                  </button>
                </li>
              );
            })}
            {!filteredGroups.length ? (
              <li className="rounded-lg border border-dashed border-stone-200 px-2 py-8 text-center text-xs text-stone-400">没有匹配的学生</li>
            ) : null}
          </ul>
        </Card>

        {active ? (
          <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(480px,1.15fr)_minmax(420px,0.85fr)] xl:grid-rows-[auto_minmax(0,1fr)_auto] xl:overflow-hidden">
            <Card className="p-3 xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h2 className="text-base font-bold">{active.members[0]?.name ?? active.name}</h2>
                    <span className="max-w-2xl truncate text-sm font-semibold text-stone-500">{activeProjectTitle}</span>
                  </div>
                  {existingScore ? (
                    <div className="mt-1 text-[11px] text-stone-500">
                      已提交评分：{existingScore.total} 分 · {existingScore.status === "passed" ? "通过" : existingScore.status === "revision" ? "需修改" : "已提交"}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <PrimaryButton
                    className="h-8 px-2.5 text-xs"
                    onClick={() => setMaterialDrawerOpen(true)}
                    type="button"
                    variant="outline"
                  >
                    <FileText size={14} /> 查看材料（{activeMaterials.length}）
                  </PrimaryButton>
                  <PrimaryButton
                    className="h-8 px-2.5 text-xs"
                    onClick={() => setPresenting(active)}
                    tone={course.presentingGroupId === active.id ? "green" : "blue"}
                  >
                    {course.presentingGroupId === active.id ? "正在汇报" : "设为当前汇报"}
                  </PrimaryButton>
                </div>
              </div>
            </Card>

            <div className="contents">
              <Card className="min-h-0 overflow-y-auto p-4 xl:col-start-1 xl:row-start-2">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-stone-200 pb-2">
                  <div>
                    <h3 className="flex items-center gap-2 font-bold text-stone-950">
                      <span className="grid size-7 place-items-center rounded-lg bg-blue-50 text-blue-700">
                        <Sparkles size={15} />
                      </span>
                      AI 过程评价
                    </h3>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-stone-500">
                      基于学习证据给出建议，缺证据维度记 0 分；教师确认后才计入最终分。
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    aiProcessScore !== null
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : assessmentSuggestion?.status === "pending-teacher-confirmation"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-stone-200 bg-stone-50 text-stone-600"
                  }`}>
                    {assessmentSuggestion
                      ? aiAssessmentStatusLabel(assessmentSuggestion.status)
                      : "尚未生成"}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <PrimaryButton
                    className="h-8 px-2.5 text-xs"
                    onClick={() => void runLiveEval()}
                    disabled={evalLoading || !active || !hasActiveProcessEvidence}
                    type="button"
                  >
                    {evalLoading ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                    {evalLoading ? "正在评分..." : assessmentSuggestion ? "重新生成评价" : "生成 AI 过程评价"}
                  </PrimaryButton>
                </div>
                {!hasActiveProcessEvidence ? (
                  <p className="mt-3 rounded-[6px] border border-dashed border-stone-300 px-3 py-4 text-sm text-stone-500">
                    尚无可评价的学习证据。学生提交结构完整的过程或成果证据后即可生成。
                  </p>
                ) : null}
                {evalError ? (
                  <div className="mt-3 rounded-[6px] border border-[var(--pbl-danger-border)] bg-[var(--pbl-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--pbl-danger)]">
                    {evalError}
                  </div>
                ) : null}
                {assessmentSuggestion ? (
                  <div className="mt-3 space-y-2.5">
                    <div className="grid gap-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3 sm:grid-cols-[92px_1fr]">
                      <div className="flex items-center gap-3 sm:block">
                        <div className="text-3xl font-black tabular-nums text-blue-800">
                          {assessmentSuggestion.suggestedTotal ?? 0}
                          <span className="ml-1 text-sm font-bold text-blue-600">分</span>
                        </div>
                        <div className="mt-1 text-xs font-semibold text-blue-700">AI 建议过程分</div>
                      </div>
                      <div className="border-blue-100 sm:border-l sm:pl-4">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-stone-600">
                          <span>置信度：{aiAssessmentConfidenceLabel(assessmentSuggestion.confidence)}</span>
                          <span>引用学习证据：{assessmentSuggestion.evidenceIds.length} 项</span>
                          <span>计分权重：{aiWeight}%</span>
                        </div>
                        {localizedProcessSummary ? (
                          <p className="mt-1 line-clamp-3 text-xs leading-5 text-stone-700">{localizedProcessSummary}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {assessmentSuggestion.dimensions.map((dimension) => {
                        const score = dimension.suggestedScore ?? 0;
                        const gaps = uniqueEvidenceGaps(dimension.evidenceGaps).map(localizeEvaluationText);
                        return (
                          <article
                            className={`rounded-lg border px-3 py-2 ${
                              score === 0
                                ? "border-amber-200 bg-amber-50/35"
                                : "border-stone-200 bg-white"
                            }`}
                            key={dimension.dimensionId}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <strong className="text-xs text-stone-900">{dimension.dimensionLabel}</strong>
                                <p className="mt-1 text-xs leading-5 text-stone-600">{localizeEvaluationText(dimension.rationale)}</p>
                              </div>
                              <div className={`shrink-0 text-right ${score === 0 ? "text-amber-800" : "text-blue-800"}`}>
                                <div className="text-xl font-black tabular-nums">{score}</div>
                                <div className="text-[9px] font-bold">建议分</div>
                              </div>
                            </div>
                            <details className="group mt-1.5 border-t border-current/10 pt-1.5 text-[10px]">
                              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-stone-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                                <span>评分依据 · {dimension.evidenceIds.length} 项证据 · {gaps.length} 项缺口</span>
                                <ChevronDown className="transition-transform group-open:rotate-180" size={14} />
                              </summary>
                              <div className="mt-2 space-y-2 leading-5 text-stone-600">
                                {dimension.evidenceIds.length ? (
                                  <ul className="space-y-1">
                                    {dimension.evidenceIds.map((evidenceId) => {
                                      const evidence = processEvidenceById.get(evidenceId);
                                      return (
                                        <li key={evidenceId}>• {evidence?.title ?? "已提交学习证据"}{evidence?.summary ? `：${localizeEvaluationText(evidence.summary)}` : ""}</li>
                                      );
                                    })}
                                  </ul>
                                ) : <p>本维度没有可引用证据，因此记 0 分。</p>}
                                {gaps.length ? (
                                  <div className="rounded-lg bg-amber-100/60 px-3 py-2 text-amber-900">
                                    <strong>还缺：</strong>{gaps.join("；")}
                                  </div>
                                ) : null}
                              </div>
                            </details>
                          </article>
                        );
                      })}
                    </div>

                    {uniqueEvidenceGaps(assessmentSuggestion.evidenceGaps).length ? (
                      <details className="group rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-xs text-amber-900">
                        <summary className="flex cursor-pointer list-none items-center justify-between font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
                          <span>整体证据缺口（{uniqueEvidenceGaps(assessmentSuggestion.evidenceGaps).length} 项）</span>
                          <ChevronDown className="transition-transform group-open:rotate-180" size={14} />
                        </summary>
                        <ul className="mt-2 space-y-1 leading-5">
                          {uniqueEvidenceGaps(assessmentSuggestion.evidenceGaps).map((gap) => <li key={gap}>• {localizeEvaluationText(gap)}</li>)}
                        </ul>
                      </details>
                    ) : null}

                    <details className="group rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-stone-800">
                        给 AI 指导并重新评分
                        <ChevronDown className="transition-transform group-open:rotate-180" size={13} />
                      </summary>
                      <p className="mt-1 text-[10px] leading-4 text-stone-500">说明本轮需要关注的标准；AI 仍只能引用现有学习证据。</p>
                      <TextArea className="mt-2 min-h-16 bg-white text-xs" id="process-evaluation-guidance" onChange={(event) => setTeacherGuidance(event.target.value)} placeholder="例如：重点检查测试方法是否可靠" value={teacherGuidance} />
                      <PrimaryButton className="mt-2 h-8 px-2.5 text-xs" disabled={evalLoading || !teacherGuidance.trim()} onClick={() => void runLiveEval(teacherGuidance)} type="button" variant="outline">
                        {evalLoading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} 按指导重新评分
                      </PrimaryButton>
                    </details>

                    {assessmentSuggestion.status === "pending-teacher-confirmation" ? (
                      <div className="sticky bottom-0 z-10 grid grid-cols-[82px_minmax(0,1fr)] items-end gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50/95 p-2 shadow-[0_-8px_20px_rgba(255,255,255,0.9)] backdrop-blur">
                        <label className="grid gap-1 text-xs font-bold text-emerald-950">
                          确认分
                          <input
                            aria-label="教师确认过程分"
                            className="h-8 w-full rounded-lg border border-emerald-300 bg-white px-2 text-sm font-black tabular-nums outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200"
                            max={100}
                            min={0}
                            onChange={(event) =>
                              setAssessmentScoreDraft(
                                event.target.value === ""
                                  ? ""
                                  : clampScore(Number(event.target.value)),
                              )}
                            type="number"
                            value={assessmentScoreDraft}
                          />
                        </label>
                        <div className="flex min-w-0 gap-1.5">
                          <PrimaryButton className="h-8 shrink-0 px-2 text-xs" onClick={() => reviewAiSuggestion("rejected")} tone="red" type="button" variant="outline">
                            不采用
                          </PrimaryButton>
                          <PrimaryButton
                            className="h-8 min-w-0 flex-1 px-2 text-xs"
                            onClick={() => reviewAiSuggestion(
                              assessmentScoreDraft === assessmentSuggestion.suggestedTotal
                                ? "confirmed"
                                : "adjusted",
                            )}
                            tone="green"
                            type="button"
                          >
                            <CheckCircle2 size={14} /> 确认计分
                          </PrimaryButton>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs font-semibold text-stone-700">
                        状态：{aiAssessmentStatusLabel(assessmentSuggestion.status)}
                        {typeof assessmentSuggestion.teacherScore === "number"
                          ? ` · 最终采用 ${assessmentSuggestion.teacherScore} 分`
                          : ""}
                      </p>
                    )}
                  </div>
                ) : null}
              </Card>
              <Card className="min-h-0 overflow-y-auto p-4 xl:col-start-2 xl:row-start-2">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold">
                    <Sparkles className="text-emerald-600" size={16} /> 教师现场评分
                  </h3>
                  <span className="text-xs font-bold text-[var(--pbl-success)]">独立权重 {teacherWeight}%</span>
                </div>
                <ul className="space-y-2">
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
                  <ScoreChip
                    label="AI 过程分"
                    value={aiProcessScore ?? (assessmentSuggestion ? "待确认" : "未生成")}
                    tone="blue"
                  />
                  <ScoreChip
                    label="当前最终分"
                    value={finalScore ?? (aiProcessScore === null ? "待确认 AI 过程分" : "待教师评分")}
                    tone="amber"
                  />
                </div>
                <div className="mt-2 rounded-[6px] border border-blue-100 bg-blue-50/40 p-2 text-[10px] leading-4 text-blue-700">
                  AI 过程分确认后，与教师现场分按 {aiWeight}/{teacherWeight} 合成。
                </div>
              </Card>
            </div>

            <Card className="p-3 xl:col-span-2 xl:row-start-3">
              <div className="grid items-end gap-3 xl:grid-cols-[minmax(260px,1fr)_auto]">
                <label className="grid gap-1 text-xs font-bold text-stone-700">
                  <span className="flex items-center gap-1.5"><MessageCircle className="text-blue-700" size={14} /> 提问与点评</span>
                  <TextArea
                className="h-16 min-h-16 text-xs"
                onChange={(e) => setComment(e.target.value)}
                placeholder="对当前学生汇报的点评、问题或建议..."
                value={comment}
              />
                </label>
              <div className="flex flex-wrap justify-end gap-2">
                <PrimaryButton
                  className="h-8 px-2.5 text-xs"
                  disabled={savingFeedback}
                  onClick={() => void submitFeedback()}
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
                  className="h-8 px-2.5 text-xs"
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
                  className="h-8 px-2.5 text-xs"
                  disabled={savingFeedback}
                  onClick={requestRevision}
                  tone="orange"
                >
                  {savingFeedback ? (
                    <Loader2 className="animate-spin" size={15} />
                  ) : null}{" "}
                  要求修改
                </PrimaryButton>
              </div>
              </div>
            </Card>
          </div>
        ) : (
          <div className="grid place-items-center rounded-[10px] border border-dashed border-stone-300 py-20 text-sm text-stone-500">
            暂无个人项目
          </div>
        )}
      </div>

      {active && materialDrawerOpen ? (
        <div className="fixed inset-0 z-[80]" role="presentation">
          <button
            aria-label="关闭展示材料"
            className="absolute inset-0 bg-stone-950/25 backdrop-blur-[1px]"
            onClick={() => setMaterialDrawerOpen(false)}
            type="button"
          />
          <aside
            aria-labelledby="showcase-material-title"
            aria-modal="true"
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-2xl"
            role="dialog"
          >
            <header className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold" id="showcase-material-title">
                  <FileText className="text-blue-700" size={18} /> 展示材料
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  {active.members[0]?.name ?? active.name} · {activeMaterials.length} 项材料
                </p>
              </div>
              <button
                aria-label="关闭"
                className="grid size-9 place-items-center rounded-lg border border-stone-200 text-stone-500 transition hover:bg-stone-50 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                onClick={() => setMaterialDrawerOpen(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {activeMaterials.length ? (
                <ul className="space-y-2">
                  {activeMaterials.map((material) => (
                    <li className="rounded-xl border border-stone-200 p-3" key={material.id}>
                      <div className="flex items-center gap-3">
                        <FileBadge type={material.fileType} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">
                            {material.fileName}
                          </div>
                        </div>
                        {material.url ? (
                          <div className="flex gap-1.5">
                            <a
                              aria-label={`查看${material.fileName}`}
                              className="grid size-8 place-items-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
                              href={material.url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <Eye size={15} />
                            </a>
                            <a
                              aria-label={`下载${material.fileName}`}
                              className="grid size-8 place-items-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                              download
                              href={material.url}
                            >
                              <Download size={15} />
                            </a>
                          </div>
                        ) : null}
                      </div>
                      {material.note ? (
                        <details className="group mt-2 border-t border-stone-100 pt-2 text-xs text-stone-600">
                          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                            查看学生标注
                            <ChevronDown className="transition-transform group-open:rotate-180" size={14} />
                          </summary>
                          <p className="mt-2 leading-5">{material.note}</p>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-dashed border-stone-300 py-12 text-center text-sm text-stone-500">
                  暂无最终作品快照
                </div>
              )}
            </div>
            {onSelectGroup ? (
              <footer className="border-t border-stone-200 p-4">
                <PrimaryButton className="w-full" onClick={() => onSelectGroup(active.id)} type="button" variant="outline">
                  <Eye size={15} /> 打开完整过程与作品
                </PrimaryButton>
              </footer>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
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
    <div className={`min-w-0 rounded-[6px] border p-2 ${className}`}>
      <div className="truncate text-[10px] font-semibold">{label}</div>
      <div className="mt-0.5 truncate text-lg font-black tabular-nums">{value}</div>
    </div>
  );
}

export function DimensionRow({
  dimension,
  value,
  onChange,
}: {
  dimension: EvaluationDimension;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <li className="rounded-xl border border-stone-200 bg-white p-3 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm text-stone-900">{dimension.name}</strong>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-500">
              权重 {dimension.weight}%
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-stone-600">
            {dimension.description || "请根据学生本次汇报与作品表现进行综合判断。"}
          </p>
        </div>
        <input
          aria-label={`${dimension.name}分数`}
          className="h-9 w-16 shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-center text-sm font-black tabular-nums text-emerald-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          inputMode="numeric"
          max={100}
          min={0}
          onChange={(e) => onChange(clampScore(Number(e.target.value)))}
          type="number"
          value={value}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-[10px] font-semibold text-stone-400">0</span>
        <input
          aria-label={`${dimension.name}评分滑块`}
          className="h-2 w-full cursor-pointer accent-emerald-600"
          max={100}
          min={0}
          onChange={(e) => onChange(clampScore(Number(e.target.value)))}
          type="range"
          value={value}
        />
        <span className="text-[10px] font-semibold text-stone-400">100</span>
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
