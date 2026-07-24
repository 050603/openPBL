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
  Repeat2,
  Route,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import { Card, Pill, ProgressBar } from "@/components/ui";
import type { AdaptiveBranchOutline, AdaptiveTriggerEvaluation, Course, LearningEvent, Student, StudentAiProgress, StudentLearningTier } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import {
  calculateAdaptiveRemainingBudgetSec,
  classifyStudentTier,
  eligibleAdaptiveBranches,
  evaluateAdaptiveBranchDecision,
} from "@/lib/adaptive-learning";
import { AiLearningTeacherPreview } from "./ai-learning-preview";
import { StudentLearningDetail } from "./student-learning-detail";
import { isReliableAiProgress } from "@openmaic/lib/progress/completion-model";
import { aggregateCommonIssues, calculateToleratedDurationSec, isLearningSignalRelevant } from "@/lib/learning-analytics/analyzer";
import { formatLearningContentReference } from "@/lib/learning-analytics/content-reference";
import { cn } from "@/lib/utils";

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
  const replayCount = events.filter((event) => event.type === "scene-replay").length;
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
    replayCount,
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
  return latest ? formatLearningContentReference(latest.content, latest.metadata?.sceneTitle?.toString() || latest.sceneId) : "尚未开始";
}

const TIER_LABEL: Record<StudentLearningTier, string> = {
  foundation: "基础生",
  standard: "平均生",
  advanced: "优秀生",
};

export function adaptiveResponseStatus(
  progress: StudentAiProgress | undefined,
  planEnabled: boolean,
): { label: string; tone: "muted" | "active" | "ready" | "danger" } {
  const state = progress?.adaptiveLearning;
  if (!planEnabled) return { label: "课程未启用", tone: "muted" };
  if (state?.enabled === false) return { label: "个体已关闭", tone: "danger" };
  if (!state?.pretestCompletedAt && !state?.tier) return { label: "等待前测", tone: "muted" };
  const currentRun = [...(state?.branchRuns ?? [])].reverse().find((run) =>
    ["generating", "ready"].includes(run.status),
  );
  if (currentRun?.status === "generating") return { label: "分支生成中", tone: "active" };
  if (currentRun?.status === "ready") return { label: "分支学习中", tone: "active" };
  if (state?.branchRuns.some((run) => run.status === "completed")) {
    return { label: "已响应分支", tone: "ready" };
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
  const repeatLearners = summaries.filter((summary) => summary.replayCount >= 3).length;
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
      tier?: StudentLearningTier;
      tierSource?: "pretest" | "teacher";
      tierUpdatedAt?: string;
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

  function setStudentTier(studentId: string, value: string) {
    const adaptive = course.aiLearningProgress?.[studentId]?.adaptiveLearning;
    if (value === "auto") {
      const score = adaptive?.pretestScore;
      const plan = course.content.adaptiveLearningPlan;
      patchStudentAdaptive(studentId, {
        tier:
          typeof score === "number" && plan
            ? classifyStudentTier(score, plan.thresholds)
            : undefined,
        tierSource: typeof score === "number" ? "pretest" : undefined,
        tierUpdatedAt: new Date().toISOString(),
      });
      return;
    }
    patchStudentAdaptive(studentId, {
      tier: value as StudentLearningTier,
      tierSource: "teacher",
      tierUpdatedAt: new Date().toISOString(),
    });
  }

  const tierCounts = summaries.reduce<Record<StudentLearningTier, number>>(
    (counts, summary) => {
      const tier = course.aiLearningProgress?.[summary.student.id]?.adaptiveLearning?.tier;
      if (tier) counts[tier] += 1;
      return counts;
    },
    { foundation: 0, standard: 0, advanced: 0 },
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-[var(--pbl-border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--pbl-teacher)]">AI 授知 · 教师观察台</p>
          <h2 className="mt-1 text-2xl font-black text-stone-950">用学习证据决定何时现场介入</h2>
          <p className="mt-1 text-sm text-stone-500">本阶段不控制伴学 Agent；风险用于教师巡视、个别辅导和全班补充教学。</p>
        </div>
        {hasClassroom ? <AiLearningTeacherPreview course={course} /> : null}
      </header>

      {!hasClassroom ? (
        <Card className="border-[var(--pbl-warning-soft)] bg-[var(--pbl-warning-soft)]/70">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 text-[var(--pbl-warning)]" size={21} /><div><h3 className="font-black text-[var(--pbl-warning)]">AI 课堂尚未生成</h3><p className="mt-1 text-sm text-[var(--pbl-warning)]">完成备课生成后，教师可以预览课程并查看真实学习数据。</p></div></div>
        </Card>
      ) : null}

      <section aria-label="AI 授知班级指标" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Bot size={19} />} label="班级平均进度" value={summaries.length ? `${avgProgress}%` : "—"} helper={summaries.length ? "基于学生实际场景进度" : "暂无学生"} />
        <MetricCard icon={<Clock3 size={19} />} label="容忍时长偏差" value={avgVariance === undefined ? "—" : `${avgVariance >= 0 ? "+" : ""}${avgVariance}%`} helper={avgVariance === undefined ? "暂无足够证据" : "相对设计、实际语音与思考操作余量"} />
        <MetricCard icon={<Repeat2 size={19} />} label="重复学习学生" value={evidenceStudents.length ? `${repeatLearners} 人` : "—"} helper={evidenceStudents.length ? "同一内容重复至少 3 次且未形成进展" : "暂无足够证据"} />
        <MetricCard icon={<CircleAlert size={19} />} label="未解决风险" value={evidenceStudents.length ? `${unresolvedSignals.length} 条` : "—"} helper={evidenceStudents.length ? "需要教师观察或介入" : "暂无足够证据"} tone={unresolvedSignals.length ? "danger" : "default"} />
      </section>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="flex items-center gap-2 text-lg font-black"><Users className="text-[var(--pbl-teacher)]" size={20} /> 班级共性问题</h3><p className="mt-1 text-sm text-stone-500">同一具体内容影响至少 30% 且不少于 2 人时显示，适合转为全班补充教学。</p></div>
          <Pill tone={commonIssues.length ? "red" : "green"}>{commonIssues.length ? `${commonIssues.length} 项` : "暂无"}</Pill>
        </div>
        {commonIssues.length ? (
          <ul className="mt-4 divide-y divide-[var(--pbl-danger-border)] border-y border-[var(--pbl-danger-border)]">
            {commonIssues.map((issue) => <li className="grid gap-2 py-3 md:grid-cols-[1fr_auto] md:items-center" key={issue.id}><div><p className="font-bold text-[var(--pbl-danger)]">{issue.title}</p><p className="mt-1 text-xs font-semibold text-stone-500">{formatLearningContentReference(issue.content)}</p><p className="mt-1 text-sm text-stone-600">{issue.summary}</p><p className="mt-1 text-xs text-stone-500">涉及学生：{issue.studentIds.map((id) => course.students.find((student) => student.id === id)?.name ?? id).join("、")}</p></div><span className="text-sm font-bold text-[var(--pbl-danger)]">影响 {issue.studentIds.length} 人</span></li>)}
          </ul>
        ) : <div className="mt-4 flex items-center gap-2 border-y border-stone-100 py-5 text-sm text-stone-500"><CircleCheck className="text-[var(--pbl-success)]" size={18} /> 尚未发现达到班级阈值的共性问题。</div>}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="text-lg font-black">学生分层与自适应响应</h3><p className="mt-1 text-sm text-stone-500">查看前测分层、当前响应状态；教师可关闭个体路径或覆盖系统分层。</p></div>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">基础生 {tierCounts.foundation}</span>
            <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-cyan-900">平均生 {tierCounts.standard}</span>
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-900">优秀生 {tierCounts.advanced}</span>
          </div>
        </div>
        {summaries.length ? (
          <ul className="divide-y divide-stone-100 border-y border-stone-100">
            {[...summaries].sort((a, b) => b.signals.length - a.signals.length || a.progress - b.progress).map((summary) => {
              const progress = course.aiLearningProgress?.[summary.student.id];
              const adaptive = progress?.adaptiveLearning;
              const tier = adaptive?.tier;
              const enabled = adaptive?.enabled !== false;
              const response = adaptiveResponseStatus(
                progress,
                Boolean(course.content.adaptiveLearningPlan?.enabled),
              );
              return (
                <li className="grid gap-3 py-3 md:px-2 xl:grid-cols-[190px_minmax(135px,1fr)_130px_125px_230px] xl:items-center" key={summary.student.id}>
                  <button className="flex items-center gap-3 rounded-[7px] text-left transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-cyan-500" onClick={() => openStudent(summary.student.id)} type="button">
                    <span className="relative"><Avatar name={summary.student.name} size={36} />{summary.signals.length ? <CircleAlert aria-label="有干预信号" className="absolute -right-2 -top-2 fill-white text-[var(--pbl-danger)]" size={19} /> : null}</span>
                    <span><span className="block font-bold text-stone-900">{summary.student.name}</span><span className="text-xs text-stone-500">{summary.signals.length ? `${summary.signals.length} 条待处理` : summary.hasEvidence ? `有效学习 ${minutes(summary.effectiveDurationMs)}` : "尚未开始"}</span></span>
                  </button>
                  <span><span className="mb-1 flex justify-between text-xs text-stone-500"><span>主课进度</span><strong>{summary.progress}%</strong></span><ProgressBar className="h-2" tone={summary.signals.length ? "red" : summary.progress >= 90 ? "green" : "teal"} value={summary.progress} /><span className="mt-1 block truncate text-[10px] text-stone-400">{currentScene(summary.events)}</span></span>
                  <span>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-stone-400">学习类别</span>
                    <span className={cn(
                      "mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-black",
                      tier === "foundation" ? "bg-amber-100 text-amber-900" : tier === "advanced" ? "bg-sky-100 text-sky-900" : tier === "standard" ? "bg-cyan-100 text-cyan-900" : "bg-stone-100 text-stone-500",
                    )}>
                      {tier ? TIER_LABEL[tier] : "尚未分类"}
                    </span>
                    {adaptive?.tierSource ? <small className="ml-1 text-[9px] text-stone-400">{adaptive.tierSource === "teacher" ? "教师调整" : "前测判定"}</small> : null}
                  </span>
                  <span>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-stone-400">响应状态</span>
                    <button className={cn(
                      "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold transition hover:ring-2 hover:ring-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500",
                      response.tone === "danger" ? "bg-rose-100 text-rose-800" : response.tone === "active" ? "bg-violet-100 text-violet-800" : response.tone === "ready" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600",
                    )}
                    onClick={() => setTriggerAuditStudentId(summary.student.id)}
                    title="查看每个触发点的条件判定"
                    type="button"
                    ><Route size={11} />{response.label}</button>
                  </span>
                  <span className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-[8px] border border-stone-200 bg-stone-50 p-2">
                    <label className="text-[10px] font-bold text-stone-500">
                      人工调整层次
                      <select
                        aria-label={`${summary.student.name}学习层次`}
                        className="mt-1 h-8 w-full rounded-[6px] border border-stone-300 bg-white px-2 text-xs font-semibold outline-none focus:border-cyan-700"
                        disabled={!enabled}
                        onChange={(event) => setStudentTier(summary.student.id, event.target.value)}
                        value={adaptive?.tierSource === "teacher" ? tier : "auto"}
                      >
                        <option value="auto">自动（前测）</option>
                        <option value="foundation">基础生</option>
                        <option value="standard">平均生</option>
                        <option value="advanced">优秀生</option>
                      </select>
                    </label>
                    <button
                      aria-label={`${enabled ? "关闭" : "开启"}${summary.student.name}的自适应路径`}
                      className={cn(
                        "grid h-8 w-8 place-items-center rounded-[6px] border",
                        enabled ? "border-rose-200 bg-white text-rose-700 hover:bg-rose-50" : "border-emerald-200 bg-emerald-50 text-emerald-700",
                      )}
                      onClick={() => patchStudentAdaptive(summary.student.id, { enabled: !enabled })}
                      title={enabled ? "关闭该学生的个性化路径" : "重新开启个性化路径"}
                      type="button"
                    >
                      {enabled ? <PauseCircle size={15} /> : <Settings2 size={15} />}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : <div className="py-12 text-center text-sm text-stone-500"><Eye className="mx-auto mb-2 text-stone-300" size={24} />暂无学生加入课堂</div>}
      </Card>

      <AdaptiveTriggerAuditDialog
        course={course}
        onClose={() => setTriggerAuditStudentId(undefined)}
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
}: {
  course: Course;
  studentId?: string;
  onClose: () => void;
}) {
  if (!studentId) return null;
  const student = course.students.find((item) => item.id === studentId);
  const progress = course.aiLearningProgress?.[studentId];
  const adaptive = progress?.adaptiveLearning;
  const plan = course.content.adaptiveLearningPlan;
  if (!student) return null;

  const evaluations = adaptive?.triggerEvaluations ?? [];
  const eligibleBranches =
    plan ? eligibleAdaptiveBranches(plan, adaptive?.tier) : [];
  const remainingBudgetSec =
    plan && adaptive
      ? calculateAdaptiveRemainingBudgetSec(plan, adaptive)
      : (plan?.timeBudgetMin ?? 0) * 60;
  const auditState =
    adaptive && plan
      ? {
          ...adaptive,
          evidence: [
            ...adaptive.evidence,
            ...evaluations.flatMap((evaluation) => {
              if (
                typeof evaluation.score !== "number"
                || evaluation.scoreSource === "pretest-fallback"
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
    plan && auditState?.tier && auditState.pretestCompletedAt
      ? evaluateAdaptiveBranchDecision({
          plan,
          state: auditState,
          anchorKnowledgePointIds: [],
          completedSceneId:
            progress?.completedOutlineIds?.at(-1)
            ?? progress?.completedScenes.at(-1),
          runtimeSceneId: progress?.completedScenes.at(-1),
          remainingBudgetSec,
          candidateBranchIds: eligibleBranches.map((branch) => branch.id),
          reachedSceneIds:
            progress?.completedOutlineIds?.length
              ? progress.completedOutlineIds
              : progress?.completedScenes ?? [],
        }).evaluations
      : [];
  const triggeredCount = new Set(
    (adaptive?.branchRuns ?? [])
      .filter((run) => eligibleBranches.some((branch) => branch.id === run.branchOutlineId))
      .map((run) => run.branchOutlineId),
  ).size;
  const sceneTitle = (branch: AdaptiveBranchOutline) => {
    const sceneId = branch.trigger?.afterSceneId;
    return course.content._openmaicSceneOutlines?.find((scene) => scene.id === sceneId)?.title
      ?? course.content.lessonOutline.find((scene) => scene.id === sceneId)?.title
      ?? sceneId
      ?? branch.anchorKnowledgePointIds.join("、")
      ?? "未设置";
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-stone-950/55 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${student.name}触发点审计`}>
      <div className="flex max-h-[92vh] w-[min(1040px,96vw)] flex-col overflow-hidden rounded-[14px] border border-white/20 bg-stone-50 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-stone-200 bg-white px-5 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-800">Adaptive trigger audit</p>
            <h3 className="mt-1 text-xl font-black text-stone-950">{student.name} · 自适应触发审计</h3>
            <p className="mt-1 text-sm text-stone-500">逐个检查触发位置、学生层次、测评证据与剩余时间，解释为什么触发或没有触发。</p>
          </div>
          <button aria-label="关闭触发审计" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100" onClick={onClose} type="button"><X size={18} /></button>
        </header>

        <div className="overflow-y-auto p-5">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <AuditMetric label="当前层次" value={adaptive?.tier ? TIER_LABEL[adaptive.tier] : "尚未分类"} helper={adaptive?.tierSource === "teacher" ? "教师人工调整" : adaptive?.tierSource === "pretest" ? "课前测判定" : "等待证据"} />
            <AuditMetric label="课前测" value={typeof adaptive?.pretestScore === "number" ? `${adaptive.pretestScore} 分` : "未完成"} helper={adaptive?.pretestCompletedAt ? new Date(adaptive.pretestCompletedAt).toLocaleString("zh-CN") : "暂无完成时间"} />
            <AuditMetric label="已评估触发点" value={`${evaluations.length} 次`} helper={evaluations.length ? "包含未满足条件的记录" : "尚无运行时判定记录"} />
            <AuditMetric label="已进入分支" value={`${triggeredCount} 个`} helper={(adaptive?.branchRuns ?? []).some((run) => run.status === "failed") ? "包含生成失败记录" : "补基础与拓展合计"} />
            <AuditMetric
              label="自适应预算剩余"
              value={`${Math.floor(remainingBudgetSec / 60)}分 ${remainingBudgetSec % 60}秒`}
              helper={`课程为个性化分支预留 ${plan?.timeBudgetMin ?? 0} 分钟`}
            />
          </section>

          {!plan?.enabled || plan.status !== "teacher-confirmed" ? (
            <div className="mt-4 rounded-[9px] border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">课程自适应路径未启用或尚未由教师确认，所有分支均不会触发。</div>
          ) : adaptive?.enabled === false ? (
            <div className="mt-4 rounded-[9px] border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">该学生的个体自适应路径已关闭。</div>
          ) : evaluations.length === 0 && (progress?.completedScenes.length ?? 0) > 0 ? (
            <div className="mt-4 rounded-[9px] border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              已有主课程播放进度，但没有触发判定记录。这通常表示页面在旧版运行时中完成，或备课大纲 ID 与实际播放场景 ID 不一致而被跳过；修复后的运行时会使用知识点映射并保存每次判定。
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {eligibleBranches.map((branch) => {
              const latestRecorded = [...evaluations]
                .filter((evaluation) => evaluation.branchOutlineId === branch.id)
                .sort((a, b) => Date.parse(b.evaluatedAt) - Date.parse(a.evaluatedAt))[0];
              const live = liveEvaluations.find(
                (evaluation) => evaluation.branchOutlineId === branch.id,
              );
              const run = [...(adaptive?.branchRuns ?? [])].reverse().find((item) => item.branchOutlineId === branch.id);
              return (
                <TriggerAuditCard
                  branch={branch}
                  evaluation={live ?? latestRecorded}
                  key={branch.id}
                  runStatus={run?.status}
                  sceneTitle={sceneTitle(branch)}
                />
              );
            })}
            {plan?.branches.length && adaptive?.tier && !eligibleBranches.length ? (
              <div className="rounded-[9px] border border-dashed border-stone-300 py-12 text-center text-sm text-stone-500">
                当前层次没有可激活的自适应分支。
              </div>
            ) : null}
            {!plan?.branches.length ? <div className="rounded-[9px] border border-dashed border-stone-300 py-12 text-center text-sm text-stone-500">课程尚未配置自适应分支。</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div className="rounded-[9px] border border-stone-200 bg-white p-3"><p className="text-[10px] font-black uppercase tracking-wide text-stone-400">{label}</p><p className="mt-1 text-lg font-black text-stone-900">{value}</p><p className="mt-1 text-[11px] text-stone-500">{helper}</p></div>;
}

function TriggerAuditCard({
  branch,
  evaluation,
  runStatus,
  sceneTitle,
}: {
  branch: AdaptiveBranchOutline;
  evaluation?: AdaptiveTriggerEvaluation;
  runStatus?: string;
  sceneTitle: string;
}) {
  const triggered = evaluation?.result === "triggered";
  const passedCount = evaluation?.conditions.filter((condition) => condition.passed).length ?? 0;
  const totalCount = evaluation?.conditions.length ?? 0;
  const progress = totalCount ? Math.round((passedCount / totalCount) * 100) : 0;
  const runLabel: Record<string, string> = {
    generating: "分支生成中",
    ready: "分支学习中",
    completed: "已完成学习",
    skipped: "已跳过",
    failed: "分支生成失败",
  };
  return (
    <article className={cn("rounded-[10px] border bg-white p-4", triggered ? "border-emerald-200" : evaluation ? "border-amber-200" : "border-stone-200")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={branch.kind === "extension" ? "blue" : "orange"}>{branch.kind === "extension" ? "拓展分支" : "补基础分支"}</Pill>
            <span className="text-xs font-semibold text-stone-400">触发位置：{sceneTitle}</span>
          </div>
          <h4 className="mt-2 font-black text-stone-900">{branch.title}</h4>
          <p className="mt-1 text-xs text-stone-500">{branch.objective}</p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-black", triggered ? "bg-emerald-100 text-emerald-800" : evaluation ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-600")}>
          {runStatus ? runLabel[runStatus] ?? runStatus : triggered ? "可立即激活" : evaluation ? "条件未满足" : "尚未到达"}
        </span>
      </div>

      {evaluation ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
              <div
                className={cn("h-full rounded-full transition-[width]", triggered ? "bg-emerald-500" : "bg-amber-500")}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[11px] font-black tabular-nums text-stone-600">
              触发进度 {passedCount}/{totalCount}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {evaluation.conditions.map((condition) => (
              <div className={cn("rounded-[7px] border p-2.5", condition.passed ? "border-emerald-100 bg-emerald-50/60" : "border-rose-100 bg-rose-50/70")} key={condition.key}>
                <p className={cn("flex items-center gap-1.5 text-xs font-black", condition.passed ? "text-emerald-800" : "text-rose-800")}>
                  {condition.passed ? <CircleCheck size={14} /> : <CircleAlert size={14} />}
                  {condition.label}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-stone-600">要求：{condition.expected}</p>
                <p className="text-[11px] leading-5 text-stone-600">实际：{condition.actual}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
            <p>实时快照 · {evaluation.reason}</p>
            <p>
              分支成品：
              {branch.preparedResource?.status === "ready"
                ? `已准备（${branch.preparedResource.scenesCount ?? 1} 页）`
                : branch.preparedResource?.status === "failed"
                  ? "预生成失败，将运行时兜底"
                  : "尚未生成"}
            </p>
          </div>
        </>
      ) : (
        <div className="mt-3 rounded-[7px] border border-stone-200 bg-stone-50 p-3 text-xs text-stone-500">
          学生完成前测后，系统将在这里显示层次、分数、到达页面和自适应预算的实时实际值。
        </div>
      )}
    </article>
  );
}

function MetricCard({ icon, label, value, helper, tone = "default" }: { icon: React.ReactNode; label: string; value: string; helper: string; tone?: "default" | "danger" }) {
  return <Card className={tone === "danger" ? "border-[var(--pbl-danger-border)] bg-[var(--pbl-danger-soft)]/40" : undefined}><div className="flex items-center justify-between text-sm text-stone-500"><span>{label}</span><span className={tone === "danger" ? "text-[var(--pbl-danger)]" : "text-[var(--pbl-teacher)]"}>{icon}</span></div><div className={`mt-2 text-2xl font-black ${tone === "danger" ? "text-[var(--pbl-danger)]" : "text-stone-950"}`}>{value}</div><p className="mt-1 text-xs text-stone-400">{helper}</p></Card>;
}
