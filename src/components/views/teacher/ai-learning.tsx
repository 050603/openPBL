"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CircleAlert,
  CircleCheck,
  Clock3,
  Eye,
  PauseCircle,
  Route,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import { Card, Pill, ProgressBar } from "@/components/ui";
import type { AdaptiveBranchOutline, AdaptiveTriggerEvaluation, Course, LearningEvent, Student, StudentAiProgress } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import {
  calculateAdaptiveRemainingBudgetSec,
  eligibleAdaptiveBranches,
  evaluateAdaptiveBranchDecision,
} from "@/lib/adaptive-learning";
import { AiLearningTeacherPreview } from "./ai-learning-preview";
import { StudentLearningDetail } from "./student-learning-detail";
import { isReliableAiProgress } from "@openmaic/lib/progress/completion-model";
import { aggregateCommonIssues, calculateToleratedDurationSec, isLearningSignalRelevant } from "@/lib/learning-analytics/analyzer";
import { formatLearningContentReference } from "@/lib/learning-analytics/content-reference";
import { cn } from "@/lib/utils";
import { deriveClassroomTimingSnapshot } from "@/lib/classroom/timing";
import { isOpaqueInternalId, userFacingName } from "@/lib/user-facing-labels";

export function computeAiLearningProgress(entry?: StudentAiProgress): number {
  if (!entry || !isReliableAiProgress(entry)) return 0;
  if (entry.masteryLevel === "completed" || entry.masteryLevel === "mastered") return 100;
  const completedCount = new Set(entry.completedScenes ?? []).size;
  const reachedCount = Math.max(completedCount, entry.currentSceneIndex);
  return Math.min(99, Math.round((reachedCount / Math.max(1, entry.totalScenes)) * 100));
}

function summarizeStudent(course: Course, student: Student) {
  const events = (course.learningEvents ?? [])
    .filter((event) => event.studentId === student.id && event.stageKey === "ai-learning")
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const effectiveDurationMs = events.reduce(
    (sum, event) => event.type === "heartbeat" && event.visible !== false
      ? sum + Math.max(0, event.durationMs ?? 0)
      : sum,
    0,
  );
  const expectedByScene = new Map<string, number>();
  for (const event of events) {
    if (event.sceneId && typeof event.expectedDurationSec === "number") {
      expectedByScene.set(event.sceneId, calculateToleratedDurationSec({
        expectedDurationSec: event.expectedDurationSec,
        ttsDurationSec: event.ttsDurationSec,
        plannedStudentActivitySec: event.plannedStudentActivitySec,
      }) * 1_000);
    }
  }
  const expectedDurationMs = [...expectedByScene.values()].reduce((sum, value) => sum + value, 0);
  const lastEvent = events.at(-1);
  const signals = (course.learningSignals ?? []).filter(
    (signal) => signal.studentId === student.id
      && signal.stageKey === "ai-learning"
      && signal.status === "open"
      && isLearningSignalRelevant(
        signal,
        course.learningEvents ?? [],
        ["completed", "mastered"].includes(course.aiLearningProgress?.[student.id]?.masteryLevel ?? ""),
      ),
  );
  return {
    student,
    events,
    progress: computeAiLearningProgress(course.aiLearningProgress?.[student.id]),
    effectiveDurationMs,
    expectedDurationMs,
    lastEvent,
    signals,
    hasEvidence: events.length > 0,
  };
}

function minutes(ms: number): string {
  return ms < 60_000 ? "<1 分钟" : `${Math.round(ms / 60_000)} 分钟`;
}

function currentScene(events: LearningEvent[]): string {
  const latest = [...events].reverse().find((event) => event.sceneId);
  return latest ? formatLearningContentReference(latest.content, latest.metadata?.sceneTitle?.toString() || "当前学习内容") : "尚未开始";
}

type AdaptiveStatusTone = "muted" | "active" | "ready" | "danger";
const CLASSROOM_TRIGGER_CONDITION_KEYS = new Set(["anchor", "evidence", "score", "time"]);

function adaptiveToneClass(tone: AdaptiveStatusTone): string {
  if (tone === "danger") return "bg-rose-100 text-rose-800";
  if (tone === "active") return "bg-violet-100 text-violet-800";
  if (tone === "ready") return "bg-emerald-100 text-emerald-800";
  return "bg-stone-100 text-stone-600";
}

export function adaptiveResponseStatus(
  progress: StudentAiProgress | undefined,
  planEnabled: boolean,
  pretestRequired = true,
): { label: string; tone: "muted" | "active" | "ready" | "danger" } {
  const state = progress?.adaptiveLearning;
  if (!planEnabled) return { label: "课程未启用", tone: "muted" };
  if (state?.enabled === false) return { label: "个体已关闭", tone: "danger" };
  if (pretestRequired && !state?.pretestCompletedAt) return { label: "等待前测", tone: "muted" };
  const currentRun = [...(state?.branchRuns ?? [])].reverse().find((run) =>
    ["generating", "ready"].includes(run.status),
  );
  if (currentRun?.status === "generating") return { label: "资源准备中", tone: "active" };
  if (currentRun?.status === "ready") return { label: "额外资源学习中", tone: "active" };
  if (state?.branchRuns.some((run) => run.status === "completed")) {
    return { label: "已学习额外资源", tone: "ready" };
  }
  return { label: "监测触发点", tone: "ready" };
}

export function AiLearningTeacherView({
  course,
  onSelectStudent,
}: {
  course: Course;
  onSelectStudent?: (id: string) => void;
}) {
  const session = useSession();
  const [selectedStudentId, setSelectedStudentId] = useState<string>();
  const [triggerAuditStudentId, setTriggerAuditStudentId] = useState<string>();
  const hasClassroom = Boolean(course.aiLearningClassroomId);
  const summaries = useMemo(
    () => course.students.map((student) => summarizeStudent(course, student)),
    [course],
  );
  const evidenceStudents = summaries.filter((summary) => summary.hasEvidence);
  const avgProgress = summaries.length
    ? Math.round(summaries.reduce((sum, item) => sum + item.progress, 0) / summaries.length)
    : 0;
  const avgVariance = evidenceStudents.length
    ? Math.round(
        evidenceStudents.reduce((sum, item) => {
          if (!item.expectedDurationMs) return sum;
          return sum + ((item.effectiveDurationMs - item.expectedDurationMs) / item.expectedDurationMs) * 100;
        }, 0) / evidenceStudents.length,
      )
    : undefined;
  const unresolvedSignals = summaries.flatMap((summary) => summary.signals);
  const commonIssues = aggregateCommonIssues(unresolvedSignals, course.students.length);

  function openStudent(studentId: string) {
    setSelectedStudentId(studentId);
    onSelectStudent?.(studentId);
  }

  function patchStudentAdaptive(
    studentId: string,
    patch: {
      enabled?: boolean;
    },
  ) {
    const existingProgress = course.aiLearningProgress?.[studentId] ?? {
      classroomId: course.aiLearningClassroomId ?? "",
      studentId,
      currentSceneIndex: 0,
      totalScenes: 0,
      completedScenes: [],
      lastActiveAt: new Date().toISOString(),
      masteryLevel: "not-started" as const,
    };
    const adaptive = existingProgress.adaptiveLearning ?? {
      evidence: [],
      branchRuns: [],
      microLessons: [],
    };
    session.updateCourse(course.id, {
      aiLearningProgress: {
        ...(course.aiLearningProgress ?? {}),
        [studentId]: {
          ...existingProgress,
          adaptiveLearning: { ...adaptive, ...patch },
        },
      },
    });
  }

  return (
    <div className="space-y-5">
      {!hasClassroom ? (
        <Card className="border-[var(--pbl-warning-soft)] bg-[var(--pbl-warning-soft)]/70">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 text-[var(--pbl-warning)]" size={21} /><div><h3 className="font-black text-[var(--pbl-warning)]">AI 课堂尚未生成</h3><p className="mt-1 text-sm text-[var(--pbl-warning)]">完成备课生成后，教师可以预览课程并查看真实学习数据。</p></div></div>
        </Card>
      ) : null}

      <section aria-label="AI 授知班级指标" className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={<Bot size={19} />} label="班级平均进度" value={summaries.length ? `${avgProgress}%` : "—"} helper={summaries.length ? "基于学生实际场景进度" : "暂无学生"} />
        <MetricCard icon={<Clock3 size={19} />} label="容忍时长偏差" value={avgVariance === undefined ? "—" : `${avgVariance >= 0 ? "+" : ""}${avgVariance}%`} helper={avgVariance === undefined ? "暂无足够证据" : "相对设计、实际语音与思考操作余量"} />
        <MetricCard icon={<CircleAlert size={19} />} label="未解决风险" value={evidenceStudents.length ? `${unresolvedSignals.length} 条` : "—"} helper={evidenceStudents.length ? "需要教师观察或介入" : "暂无足够证据"} tone={unresolvedSignals.length ? "danger" : "default"} />
      </section>

      {hasClassroom ? <AiLearningTeacherPreview course={course} /> : null}

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="flex items-center gap-2 text-lg font-black"><Users className="text-[var(--pbl-teacher)]" size={20} /> 班级共性问题</h3><p className="mt-1 text-sm text-stone-500">同一具体内容影响至少 30% 且不少于 2 人时显示，适合转为全班补充教学。</p></div>
          <Pill tone={commonIssues.length ? "red" : "green"}>{commonIssues.length ? `${commonIssues.length} 项` : "暂无"}</Pill>
        </div>
        {commonIssues.length ? (
          <ul className="mt-4 divide-y divide-[var(--pbl-danger-border)] border-y border-[var(--pbl-danger-border)]">
            {commonIssues.map((issue) => <li className="grid gap-2 py-3 md:grid-cols-[1fr_auto] md:items-center" key={issue.id}><div><p className="font-bold text-[var(--pbl-danger)]">{issue.title}</p><p className="mt-1 text-xs font-semibold text-stone-500">{formatLearningContentReference(issue.content)}</p><p className="mt-1 text-sm text-stone-600">{issue.summary}</p><p className="mt-1 text-xs text-stone-500">涉及学生：{issue.studentIds.map((id) => course.students.find((student) => student.id === id)?.name ?? "未识别学生").join("、")}</p></div><span className="text-sm font-bold text-[var(--pbl-danger)]">影响 {issue.studentIds.length} 人</span></li>)}
          </ul>
        ) : <div className="mt-4 flex items-center gap-2 border-y border-stone-100 py-5 text-sm text-stone-500"><CircleCheck className="text-[var(--pbl-success)]" size={18} /> 尚未发现达到班级阈值的共性问题。</div>}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <div>
            <h3 className="text-base font-black">学生学习情况</h3>
            <p className="mt-0.5 text-xs text-stone-500">按风险优先排列，点击状态查看额外资源触发详情</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">存在先决缺口 {summaries.filter((summary) => (course.aiLearningProgress?.[summary.student.id]?.adaptiveLearning?.pretestWeakKnowledgePointIds?.length ?? 0) > 0).length}</span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-900">已学额外资源 {summaries.filter((summary) => course.aiLearningProgress?.[summary.student.id]?.adaptiveLearning?.branchRuns.some((run) => run.status === "completed")).length}</span>
          </div>
        </div>
        {summaries.length ? (
          <ul aria-label="学生状态总览" className="grid grid-cols-[repeat(auto-fill,minmax(172px,1fr))] gap-2.5 bg-stone-50/60 p-3">
            {[...summaries].sort((a, b) => b.signals.length - a.signals.length || a.progress - b.progress).map((summary) => {
              const progress = course.aiLearningProgress?.[summary.student.id];
              const adaptive = progress?.adaptiveLearning;
              const weakCount = adaptive?.pretestWeakKnowledgePointIds?.length ?? 0;
              const learnedCount = adaptive?.branchRuns.filter((run) => run.status === "completed").length ?? 0;
              const pretestRequired = Boolean(course.content.adaptiveLearningPlan?.pretest.questions.length);
              const awaitingPretest = pretestRequired && !adaptive?.pretestCompletedAt;
              const response = adaptiveResponseStatus(
                progress,
                Boolean(
                  course.content.adaptiveLearningPlan?.enabled
                  && course.content.adaptiveLearningPlan.status === "teacher-confirmed",
                ),
                pretestRequired,
              );
              const prerequisiteLabel = !pretestRequired
                ? "无需前测"
                : awaitingPretest
                  ? "待前测"
                  : weakCount
                    ? `先决缺口 ${weakCount}`
                    : "先决已具备";
              return (
                <li className={cn(
                  "min-w-0 rounded-[10px] border bg-white p-2.5 shadow-sm transition hover:-translate-y-px hover:shadow-md",
                  summary.signals.length ? "border-rose-200" : "border-stone-200",
                )} key={summary.student.id}>
                  <div className="flex items-center justify-between gap-2">
                    <button className="flex min-w-0 items-center gap-2 rounded-[7px] text-left focus:outline-none focus:ring-2 focus:ring-cyan-500" onClick={() => openStudent(summary.student.id)} type="button">
                      <span className="relative shrink-0"><Avatar name={summary.student.name} size={30} />{summary.signals.length ? <CircleAlert aria-label="有干预信号" className="absolute -right-1.5 -top-1.5 fill-white text-[var(--pbl-danger)]" size={15} /> : null}</span>
                      <span className="min-w-0"><span className="block truncate text-sm font-bold text-stone-900">{summary.student.name}</span><span className={cn("block truncate text-[10px]", summary.signals.length ? "font-bold text-rose-700" : "text-stone-400")}>{summary.signals.length ? `${summary.signals.length} 条待处理` : summary.hasEvidence ? `学习 ${minutes(summary.effectiveDurationMs)}` : "尚未开始"}</span></span>
                    </button>
                    <strong className="shrink-0 text-sm tabular-nums text-stone-700">{summary.progress}%</strong>
                  </div>

                  <div className="mt-2">
                    <ProgressBar className="h-1.5" tone={summary.signals.length ? "red" : summary.progress >= 90 ? "green" : "teal"} value={summary.progress} />
                    <p className="mt-1 truncate text-[10px] text-stone-400">{currentScene(summary.events)}</p>
                  </div>

                  <button
                    className="mt-2 flex w-full items-center justify-between gap-2 rounded-[7px] bg-stone-50 px-2 py-1.5 text-left transition hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    onClick={() => setTriggerAuditStudentId(summary.student.id)}
                    title="查看额外资源学习详情"
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold", adaptiveToneClass(response.tone))}><Route size={10} />{response.label}</span>
                      <span className="mt-1 block truncate text-[10px] text-stone-500">
                        {prerequisiteLabel}{typeof adaptive?.pretestScore === "number" ? ` ${adaptive.pretestScore}分` : ""} · 已学 {learnedCount}份
                      </span>
                    </span>
                    <Eye className="shrink-0 text-stone-400" size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <div className="py-12 text-center text-sm text-stone-500"><Eye className="mx-auto mb-2 text-stone-300" size={24} />暂无学生加入课堂</div>}
      </Card>

      <AdaptiveTriggerAuditDialog
        course={course}
        onClose={() => setTriggerAuditStudentId(undefined)}
        onToggleAdaptive={patchStudentAdaptive}
        studentId={triggerAuditStudentId}
      />
      <StudentLearningDetail course={course} onOpenChange={(open) => { if (!open) setSelectedStudentId(undefined); }} open={Boolean(selectedStudentId)} studentId={selectedStudentId} />
    </div>
  );
}

function AdaptiveTriggerAuditDialog({
  course,
  studentId,
  onClose,
  onToggleAdaptive,
}: {
  course: Course;
  studentId?: string;
  onClose: () => void;
  onToggleAdaptive: (studentId: string, patch: { enabled?: boolean }) => void;
}) {
  if (!studentId) return null;
  const student = course.students.find((item) => item.id === studentId);
  const progress = course.aiLearningProgress?.[studentId];
  const adaptive = progress?.adaptiveLearning;
  const plan = course.content.adaptiveLearningPlan;
  const pretestRequired = Boolean(plan?.pretest.questions.length);
  if (!student) return null;

  const evaluations = adaptive?.triggerEvaluations ?? [];
  const eligibleBranches =
    plan ? eligibleAdaptiveBranches(plan, adaptive) : [];
  const classroomTiming = course.uiState?.classroomTiming;
  const runtimeStageRemainingSec =
    classroomTiming?.activeStageKey === "ai-learning"
      ? deriveClassroomTimingSnapshot(
          classroomTiming,
          new Date().toISOString(),
        ).activeStage?.remainingSec
      : undefined;
  const remainingBudgetSec =
    plan
      ? calculateAdaptiveRemainingBudgetSec(
          plan,
          adaptive ?? { branchRuns: [] },
          runtimeStageRemainingSec,
        )
      : 0;
  const auditState =
    adaptive && plan
      ? {
          ...adaptive,
          evidence: [
            ...adaptive.evidence,
            ...evaluations.flatMap((evaluation) => {
              if (
                typeof evaluation.score !== "number"
                || evaluation.scoreSource === "pretest"
                || adaptive.evidence.some((item) =>
                  item.source === "node-quiz"
                  && item.sceneId === evaluation.completedSceneId
                )
              ) {
                return [];
              }
              const branch = plan.branches.find(
                (item) => item.id === evaluation.branchOutlineId,
              );
              return [{
                id: `audit-evidence-${evaluation.id}`,
                source: "node-quiz" as const,
                score: evaluation.score,
                occurredAt: evaluation.evaluatedAt,
                sceneId: evaluation.completedSceneId,
                knowledgePointIds: branch?.anchorKnowledgePointIds ?? [],
              }];
            }),
          ],
        }
      : adaptive;
  const liveEvaluations =
    plan && auditState && (!pretestRequired || auditState.pretestCompletedAt)
      ? eligibleBranches.flatMap((branch) => evaluateAdaptiveBranchDecision({
          plan,
          state: auditState,
          anchorKnowledgePointIds: branch.anchorKnowledgePointIds,
          completedSceneId:
            progress?.completedOutlineIds?.at(-1)
            ?? progress?.completedScenes.at(-1),
          runtimeSceneId: progress?.completedScenes.at(-1),
          remainingBudgetSec,
          candidateBranchIds: [branch.id],
          reachedSceneIds:
            progress?.completedOutlineIds?.length
              ? progress.completedOutlineIds
              : progress?.completedScenes ?? [],
          phase: branch.trigger?.placement === "before-main-course" ? "pre-course" : "after-module",
        }).evaluations)
      : [];
  const response = adaptiveResponseStatus(
    progress,
    Boolean(plan?.enabled && plan.status === "teacher-confirmed"),
    pretestRequired,
  );
  const learnedCount = adaptive?.branchRuns.filter((run) => run.status === "completed").length ?? 0;
  const enabled = adaptive?.enabled !== false;
  const knowledgePointNames = new Map([
    ...course.content.knowledgePoints,
    ...(plan?.prerequisiteKnowledgePoints ?? []),
  ].map((point) => [point.id, point.name]));
  const sceneNames = new Map([
    ...(course.content._openmaicSceneOutlines ?? []),
    ...course.content.lessonOutline,
  ].map((scene) => [scene.id, scene.title]));
  const namesForKnowledgePoints = (ids: string[], fallback: string) => {
    const names = ids.flatMap((id) => {
      const name = knowledgePointNames.get(id)?.trim();
      return name && name !== id && !isOpaqueInternalId(name) ? [name] : [];
    });
    return names.length ? names.join("、") : fallback;
  };
  const sceneTitle = (branch: AdaptiveBranchOutline) => {
    const sceneIds = branch.trigger?.assessmentSceneIds?.length
      ? branch.trigger.assessmentSceneIds
      : branch.trigger?.afterSceneId
        ? [branch.trigger.afterSceneId]
        : [];
    const titles = sceneIds.flatMap((sceneId) => {
      const title = sceneNames.get(sceneId)?.trim();
      return title && title !== sceneId && !isOpaqueInternalId(title) ? [title] : [];
    });
    return titles.length
      ? titles.join(" / ")
      : `${namesForKnowledgePoints(branch.anchorKnowledgePointIds, "对应主课")}达标测`;
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-stone-950/55 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${student.name}额外资源学习详情`}>
      <div className="flex max-h-[90vh] w-[min(880px,96vw)] flex-col overflow-hidden rounded-[14px] border border-white/20 bg-stone-50 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-stone-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-black text-stone-950">{student.name} · 额外资源学习详情</h3>
              <span className={cn(
                "rounded-full px-2.5 py-1 text-xs font-bold",
                adaptiveToneClass(response.tone),
              )}>{response.label}</span>
            </div>
            <p className="mt-1 text-sm text-stone-500">查看该生是否触发额外资源，以及触发或未触发的直接原因。</p>
          </div>
          <button aria-label="关闭额外资源学习详情" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100" onClick={onClose} type="button"><X size={18} /></button>
        </header>

        <div className="overflow-y-auto p-5">
          <section aria-label="学生额外资源学习概况" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[10px] border border-stone-200 bg-white px-4 py-3 text-xs text-stone-600">
            <LearningSummary label="主课" value={`${computeAiLearningProgress(progress)}%`} />
            <LearningSummary label="先决证据" value={!pretestRequired ? "无需前测" : typeof adaptive?.pretestScore === "number" ? `${adaptive.pretestScore} 分` : "待前测"} />
            <LearningSummary label="已学资源" value={`${learnedCount} 份`} />
            <LearningSummary label="可用时间" value={`${Math.floor(remainingBudgetSec / 60)}分 ${remainingBudgetSec % 60}秒`} />
            <button
              className={cn(
                "ml-auto inline-flex h-8 items-center gap-1.5 rounded-[7px] border px-2.5 text-xs font-bold transition",
                enabled ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 bg-emerald-50 text-emerald-700",
              )}
              onClick={() => onToggleAdaptive(student.id, { enabled: !enabled })}
              type="button"
            >
              {enabled ? <PauseCircle size={14} /> : <Settings2 size={14} />}
              {enabled ? "暂停个性化" : "开启个性化"}
            </button>
          </section>

          {!plan?.enabled || plan.status !== "teacher-confirmed" ? (
            <div className="mt-4 rounded-[9px] border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">个性化资源编排未启用或尚未由教师确认，额外资源不会插入。</div>
          ) : adaptive?.enabled === false ? (
            <div className="mt-4 rounded-[9px] border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">该学生的个体自适应路径已关闭。</div>
          ) : evaluations.length === 0 && (progress?.completedScenes.length ?? 0) > 0 ? (
            <div className="mt-4 rounded-[9px] border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              已有主课学习进度，但暂未产生额外资源触发记录。
            </div>
          ) : null}

          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="font-black text-stone-900">额外资源</h4>
              <span className="text-xs text-stone-500">共 {eligibleBranches.length} 项可匹配资源</span>
            </div>
            <div className="space-y-3">
            {eligibleBranches.map((branch) => {
              const latestRecorded = [...evaluations]
                .filter((evaluation) => evaluation.branchOutlineId === branch.id)
                .sort((a, b) => Date.parse(b.evaluatedAt) - Date.parse(a.evaluatedAt))[0];
              const live = liveEvaluations.find(
                (evaluation) => evaluation.branchOutlineId === branch.id,
              );
              const run = [...(adaptive?.branchRuns ?? [])].reverse().find((item) => item.branchOutlineId === branch.id);
              const prerequisiteNames = namesForKnowledgePoints(
                branch.prerequisiteKnowledgePointIds,
                "关联先决知识",
              );
              const weakPrerequisiteNames = namesForKnowledgePoints(
                branch.prerequisiteKnowledgePointIds.filter((id) =>
                  adaptive?.pretestWeakKnowledgePointIds?.includes(id),
                ),
                prerequisiteNames,
              );
              return (
                <TriggerAuditCard
                  branch={branch}
                  evaluation={live ?? latestRecorded}
                  key={branch.id}
                  pretestRequired={pretestRequired}
                  prerequisiteNames={prerequisiteNames}
                  runStatus={run?.status}
                  sceneTitle={sceneTitle(branch)}
                  weakPrerequisiteNames={weakPrerequisiteNames}
                />
              );
            })}
            {plan?.branches.length && (!pretestRequired || adaptive?.pretestCompletedAt) && !eligibleBranches.length ? (
              <div className="rounded-[9px] border border-dashed border-stone-300 py-12 text-center text-sm text-stone-500">
                当前学习证据没有匹配的额外资源。
              </div>
            ) : null}
            {!plan?.branches.length ? <div className="rounded-[9px] border border-dashed border-stone-300 py-12 text-center text-sm text-stone-500">课程尚未配置额外学习资源。</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LearningSummary({ label, value }: { label: string; value: string }) {
  return <span><span className="text-stone-400">{label}</span><strong className="ml-1.5 text-stone-900">{value}</strong></span>;
}

function TriggerAuditCard({
  branch,
  evaluation,
  pretestRequired,
  prerequisiteNames,
  runStatus,
  sceneTitle,
  weakPrerequisiteNames,
}: {
  branch: AdaptiveBranchOutline;
  evaluation?: AdaptiveTriggerEvaluation;
  pretestRequired: boolean;
  prerequisiteNames: string;
  runStatus?: string;
  sceneTitle: string;
  weakPrerequisiteNames: string;
}) {
  const triggered = evaluation?.result === "triggered";
  const classroomConditions = evaluation?.conditions.filter((condition) => CLASSROOM_TRIGGER_CONDITION_KEYS.has(condition.key)) ?? [];
  const passedConditions = classroomConditions.filter((condition) => condition.passed);
  const pendingConditions = classroomConditions.filter((condition) => !condition.passed);
  const hasHiddenBlocker = Boolean(evaluation?.conditions.some((condition) =>
    !CLASSROOM_TRIGGER_CONDITION_KEYS.has(condition.key) && !condition.passed,
  ));
  const runLabel: Record<string, string> = {
    generating: "资源准备中",
    ready: "资源学习中",
    completed: "已完成学习",
    skipped: "已跳过",
    failed: "资源加载失败",
  };
  const kindLabel: Record<AdaptiveBranchOutline["kind"], string> = {
    prerequisite: "先决知识回顾",
    "worked-example": "新例题",
    application: "应用举例",
    extension: "拓展与思考",
  };
  const prerequisite = branch.trigger?.placement === "before-main-course";
  const threshold = branch.trigger?.scoreThreshold;
  const timeRequiredSec = Math.max(branch.targetDurationSec, branch.trigger?.minimumRemainingSec ?? 90);
  const triggerRule = prerequisite
    ? `检测到“${prerequisiteNames}”存在缺口`
    : `达标测${typeof threshold === "number" ? ` ≥ ${threshold} 分` : "达到课程阈值"}，且剩余至少 ${Math.ceil(timeRequiredSec / 60)} 分钟`;
  function readableCondition(condition: AdaptiveTriggerEvaluation["conditions"][number]): { actual: string; expected: string } {
    if (condition.key === "anchor" && !prerequisite) {
      const completedTitle = evaluation?.completedSceneTitle?.trim();
      return {
        actual: condition.passed
          ? completedTitle && completedTitle !== evaluation?.completedSceneId && !isOpaqueInternalId(completedTitle)
            ? `已完成“${completedTitle}”`
            : "已完成对应主课达标测"
          : "尚未到达对应主课达标测",
        expected: `完成“${sceneTitle}”`,
      };
    }
    if (condition.key === "evidence" && prerequisite) {
      return {
        actual: condition.passed
          ? `检测到缺口：“${weakPrerequisiteNames}”`
          : `未检测到“${prerequisiteNames}”缺口`,
        expected: `至少一项先决知识存在缺口：“${prerequisiteNames}”`,
      };
    }
    return { actual: condition.actual, expected: condition.expected };
  }
  function describeExpectedTiming(): string {
    if (runStatus === "completed") return "已完成学习，无需再次触发";
    if (runStatus === "ready") return "已触发，学生正在学习";
    if (runStatus === "generating") return "已触发，资源准备完成后开始";
    if (runStatus) return "已有触发记录，请关注当前资源状态";
    if (triggered) return "条件已满足，可立即触发";
    if (evaluation && pendingConditions.some((condition) => condition.key === "anchor")) {
      return `到达「${sceneTitle}」后自动复核`;
    }
    if (evaluation && pendingConditions.length) {
      return `已到达触发点；${pendingConditions.map((condition) => condition.label).join("、")}满足后自动触发`;
    }
    if (evaluation && hasHiddenBlocker) return "课堂条件已满足，资源可用后自动触发";
    if (prerequisite) return pretestRequired ? "课前测提交后、主课开始前" : "主课开始前";
    return `完成「${sceneTitle}」后，条件满足时`;
  }
  const expectedTiming = describeExpectedTiming();
  const displayStatus = runStatus
    ? runLabel[runStatus] ?? runStatus
    : triggered
      ? "可立即激活"
      : evaluation && hasHiddenBlocker && !pendingConditions.length
        ? "资源暂不可用"
        : evaluation
          ? "条件未满足"
          : "尚未到达";
  return (
    <article className={cn("rounded-[10px] border bg-white px-4 py-3", triggered ? "border-emerald-200" : evaluation ? "border-amber-200" : "border-stone-200")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={branch.kind === "prerequisite" ? "orange" : "blue"}>{kindLabel[branch.kind]}</Pill>
            <span className="text-xs font-semibold text-stone-400">插入位置：{branch.trigger?.placement === "before-main-course" ? "正式主课开始前" : sceneTitle}</span>
          </div>
          <h4 className="mt-1.5 font-black text-stone-900">{userFacingName(branch.title, "未命名额外资源")}</h4>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-black", triggered ? "bg-emerald-100 text-emerald-800" : evaluation ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-600")}>
          {displayStatus}
        </span>
      </div>

      {evaluation ? (
        <div className="mt-3 grid gap-2 border-t border-stone-100 pt-3 text-xs sm:grid-cols-[110px_1fr]">
          <span className="font-bold text-stone-400">触发条件</span>
          <span className="font-semibold text-stone-700">{triggerRule}</span>
          <span className="font-bold text-stone-400">当前满足</span>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {passedConditions.length ? passedConditions.map((condition) => (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-800" key={condition.key}><CircleCheck size={12} />{condition.label} · {readableCondition(condition).actual}</span>
            )) : <span className="text-stone-500">暂未满足课堂触发条件</span>}
          </div>
          <span className="font-bold text-stone-400">仍需满足</span>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {pendingConditions.length ? pendingConditions.map((condition) => (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-900" key={condition.key}><CircleAlert size={12} />{condition.label} · 当前 {readableCondition(condition).actual} / 需 {readableCondition(condition).expected}</span>
            )) : <span className="font-semibold text-emerald-700">课堂触发条件均已满足</span>}
          </div>
          <span className="font-bold text-stone-400">预计触发</span>
          <span className="text-stone-700">{expectedTiming}</span>
        </div>
      ) : (
        <div className="mt-3 grid gap-2 border-t border-stone-100 pt-3 text-xs sm:grid-cols-[110px_1fr]">
          <span className="font-bold text-stone-400">触发条件</span><span className="font-semibold text-stone-700">{triggerRule}</span>
          <span className="font-bold text-stone-400">当前状态</span><span className="text-stone-500">{pretestRequired ? "等待学生完成前测或到达对应主课节点" : "等待学生到达对应主课节点"}</span>
          <span className="font-bold text-stone-400">预计触发</span><span className="text-stone-700">{expectedTiming}</span>
        </div>
      )}
    </article>
  );
}

function MetricCard({ icon, label, value, helper, tone = "default" }: { icon: React.ReactNode; label: string; value: string; helper: string; tone?: "default" | "danger" }) {
  return <Card className={tone === "danger" ? "border-[var(--pbl-danger-border)] bg-[var(--pbl-danger-soft)]/40" : undefined}><div className="flex items-center justify-between text-sm text-stone-500"><span>{label}</span><span className={tone === "danger" ? "text-[var(--pbl-danger)]" : "text-[var(--pbl-teacher)]"}>{icon}</span></div><div className={`mt-2 text-2xl font-black ${tone === "danger" ? "text-[var(--pbl-danger)]" : "text-stone-950"}`}>{value}</div><p className="mt-1 text-xs text-stone-400">{helper}</p></Card>;
}
