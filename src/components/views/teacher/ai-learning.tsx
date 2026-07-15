"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CircleAlert,
  CircleCheck,
  Clock3,
  Eye,
  Repeat2,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import { Card, Pill, ProgressBar } from "@/components/ui";
import type { Course, LearningEvent, Student, StudentAiProgress } from "@/lib/session/types";
import { AiLearningTeacherPreview } from "./ai-learning-preview";
import { StudentLearningDetail } from "./student-learning-detail";
import { isReliableAiProgress } from "@openmaic/lib/progress/completion-model";
import { aggregateCommonIssues, calculateToleratedDurationSec, isLearningSignalRelevant } from "@/lib/learning-analytics/analyzer";
import { formatLearningContentReference } from "@/lib/learning-analytics/content-reference";

function computeProgress(entry?: StudentAiProgress): number {
  if (!entry || !isReliableAiProgress(entry)) return 0;
  if (entry.masteryLevel === "completed" || entry.masteryLevel === "mastered") return 100;
  return Math.min(99, Math.round((entry.currentSceneIndex / Math.max(1, entry.totalScenes)) * 100));
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
    progress: computeProgress(course.aiLearningProgress?.[student.id]),
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

export function AiLearningTeacherView({
  course,
  onSelectStudent,
}: {
  course: Course;
  onSelectStudent?: (id: string) => void;
}) {
  const [selectedStudentId, setSelectedStudentId] = useState<string>();
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
        <div className="mb-4 flex items-center justify-between"><div><h3 className="text-lg font-black">学生学习状态</h3><p className="mt-1 text-sm text-stone-500">红色叹号表示存在未解决干预信号；点击学生查看证据与处理记录。</p></div><span className="text-sm text-stone-500">{course.students.length} 人</span></div>
        {summaries.length ? (
          <ul className="divide-y divide-stone-100 border-y border-stone-100">
            {[...summaries].sort((a, b) => b.signals.length - a.signals.length || a.progress - b.progress).map((summary) => (
              <li key={summary.student.id}>
                <button className="grid w-full gap-3 py-3 text-left transition hover:bg-stone-50 md:grid-cols-[220px_minmax(150px,1fr)_140px_120px_160px] md:items-center md:px-2" onClick={() => openStudent(summary.student.id)} type="button">
                  <span className="flex items-center gap-3"><span className="relative"><Avatar name={summary.student.name} size={36} />{summary.signals.length ? <CircleAlert aria-label="有干预信号" className="absolute -right-2 -top-2 fill-white text-[var(--pbl-danger)]" size={19} /> : null}</span><span><span className="block font-bold text-stone-900">{summary.student.name}</span><span className="text-xs text-stone-500">{summary.signals.length ? `${summary.signals.length} 条待处理` : "暂无风险"}</span></span></span>
                  <span><span className="mb-1 flex justify-between text-xs text-stone-500"><span>进度</span><strong>{summary.progress}%</strong></span><ProgressBar className="h-2" tone={summary.signals.length ? "red" : summary.progress >= 90 ? "green" : "slate"} value={summary.progress} /></span>
                  <span className="text-sm"><span className="block text-xs text-stone-400">当前内容</span><span className="line-clamp-1 font-semibold text-stone-700">{currentScene(summary.events)}</span></span>
                  <span className="text-sm"><span className="block text-xs text-stone-400">有效学习</span><span className="font-semibold text-stone-700">{summary.hasEvidence ? minutes(summary.effectiveDurationMs) : "暂无证据"}</span></span>
                  <span className="text-sm"><span className="block text-xs text-stone-400">最近活动</span><span className="font-semibold text-stone-700">{summary.lastEvent ? new Date(summary.lastEvent.occurredAt).toLocaleString("zh-CN") : "尚未开始"}</span></span>
                </button>
              </li>
            ))}
          </ul>
        ) : <div className="py-12 text-center text-sm text-stone-500"><Eye className="mx-auto mb-2 text-stone-300" size={24} />暂无学生加入课堂</div>}
      </Card>

      <StudentLearningDetail course={course} onOpenChange={(open) => { if (!open) setSelectedStudentId(undefined); }} open={Boolean(selectedStudentId)} studentId={selectedStudentId} />
    </div>
  );
}

function MetricCard({ icon, label, value, helper, tone = "default" }: { icon: React.ReactNode; label: string; value: string; helper: string; tone?: "default" | "danger" }) {
  return <Card className={tone === "danger" ? "border-[var(--pbl-danger-border)] bg-[var(--pbl-danger-soft)]/40" : undefined}><div className="flex items-center justify-between text-sm text-stone-500"><span>{label}</span><span className={tone === "danger" ? "text-[var(--pbl-danger)]" : "text-[var(--pbl-teacher)]"}>{icon}</span></div><div className={`mt-2 text-2xl font-black ${tone === "danger" ? "text-[var(--pbl-danger)]" : "text-stone-950"}`}>{value}</div><p className="mt-1 text-xs text-stone-400">{helper}</p></Card>;
}
