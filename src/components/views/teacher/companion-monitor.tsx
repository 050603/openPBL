"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  FileSearch,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import {
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Pill,
  PrimaryButton,
  Textarea,
} from "@/components/ui";
import {
  deriveStageReadiness,
  evidenceLabel,
  isLearningEvidenceStructurallyComplete,
} from "@/lib/learning-evidence/readiness";
import {
  getStageMissionDefinition,
  resolveCourseLearningPreset,
} from "@/lib/learning-evidence/missions";
import { STAGE_READINESS_LABEL } from "@/lib/learning-evidence/types";
import type { Course, LearningEvidence } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { cn } from "@/lib/utils";
import { TeacherDirectiveForm } from "./teacher-directive-form";

const READINESS_TONE = {
  "not-started": "gray",
  working: "blue",
  "awaiting-calibration": "amber",
  "needs-revision": "red",
  ready: "green",
} as const;

function recentEvidenceForStudent(
  course: Course,
  studentId: string,
  stageKey: string,
): LearningEvidence[] {
  return (course.learningEvidence ?? [])
    .filter((item) =>
      item.studentId === studentId
      && item.stageKey === stageKey
      && item.countsTowardReadiness)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function recommendedTeacherAction(
  status: ReturnType<typeof deriveStageReadiness>["status"],
): string {
  if (status === "awaiting-calibration") return "核查学生证据，并确认范围或方案";
  if (status === "needs-revision") return "查看修订证据，决定是否补充反馈";
  if (status === "not-started") return "未开始";
  if (status === "working") return "围绕首个证据缺口提供最小支架";
  return "保持观察，让学生继续自主推进";
}

export function CompanionMonitor({
  course,
  stageKey,
  initialStudentId,
  className,
}: {
  course: Course;
  stageKey: string;
  initialStudentId?: string;
  className?: string;
}) {
  const session = useSession();
  const students = course.students;
  const [selectedStudentId, setSelectedStudentId] = useState(
    initialStudentId ?? students[0]?.id,
  );
  const [feedbackByEvidence, setFeedbackByEvidence] = useState<Record<string, string>>({});
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [selectedForDirective, setSelectedForDirective] = useState<string[]>([]);
  const [directiveOpen, setDirectiveOpen] = useState(false);
  const [directiveTargets, setDirectiveTargets] = useState<string[]>([]);
  const [directiveAllStudents, setDirectiveAllStudents] = useState(false);
  const selectedStudent =
    students.find((item) => item.id === selectedStudentId) ?? students[0];
  const preset = resolveCourseLearningPreset(course);

  const rows = useMemo(
    () => students.map((student) => {
      const readiness = deriveStageReadiness(course, student.id, stageKey);
      const evidence = recentEvidenceForStudent(course, student.id, stageKey);
      const signals = (course.learningSignals ?? []).filter((signal) =>
        signal.studentId === student.id
        && signal.stageKey === stageKey
        && signal.status === "open");
      return {
        student,
        readiness,
        evidence,
        signals,
        latest: evidence[0],
        pendingCount: evidence.filter((item) => item.status === "submitted").length,
      };
    }).sort((a, b) => {
      const priority = {
        "awaiting-calibration": 0,
        "needs-revision": 1,
        working: 2,
        "not-started": 3,
        ready: 4,
      };
      return priority[a.readiness.status] - priority[b.readiness.status];
    }),
    [course, stageKey, students],
  );

  const selectedRow = rows.find((row) => row.student.id === selectedStudent?.id);
  const selectedReadiness = selectedRow?.readiness;
  const selectedEvidence = selectedRow?.evidence ?? [];
  const selectedSignals = selectedRow?.signals ?? [];
  const mission = selectedReadiness
    ? getStageMissionDefinition(stageKey, preset, selectedReadiness.missingEvidenceKinds)
    : null;
  const selectedMessages = (course.companionThreads ?? [])
    .filter((thread) =>
      thread.stageKey === stageKey && thread.studentId === selectedStudent?.id)
    .flatMap((thread) => thread.messages)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const selectedTasks = (course.companionTasks ?? [])
    .filter((task) =>
      task.stageKey === stageKey && task.studentId === selectedStudent?.id)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const selectedAssessment = (course.aiAssessmentSuggestions ?? [])
    .filter((item) =>
      item.stageKey === stageKey && item.studentId === selectedStudent?.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

  const waitingCount = rows.filter(
    (row) => row.readiness.status === "awaiting-calibration",
  ).length;
  const revisionCount = rows.filter(
    (row) => row.readiness.status === "needs-revision",
  ).length;
  const commonGaps = useMemo(() => {
    const counts = new Map<string, string[]>();
    rows.forEach((row) => {
      row.readiness.missingEvidenceKinds.forEach((kind) => {
        counts.set(kind, [...(counts.get(kind) ?? []), row.student.id]);
      });
    });
    return Array.from(counts.entries())
      .filter(([, ids]) => ids.length >= Math.max(2, Math.ceil(students.length * 0.25)))
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3);
  }, [rows, students.length]);

  function review(
    evidence: LearningEvidence,
    status: "teacher-confirmed" | "needs-revision",
  ) {
    const feedback = feedbackByEvidence[evidence.id]?.trim();
    if (status === "needs-revision" && !feedback) {
      setReviewErrors((current) => ({
        ...current,
        [evidence.id]: "要求修订时，请明确指出证据缺口和下一步。",
      }));
      return;
    }
    setReviewErrors((current) => ({ ...current, [evidence.id]: "" }));
    session.reviewLearningEvidence(course.id, evidence.id, status, feedback);
  }

  function openDirective(targetIds: string[], allStudents = false) {
    setDirectiveTargets(targetIds);
    setDirectiveAllStudents(allStudents);
    setDirectiveOpen(true);
  }

  function toggleDirectiveStudent(studentId: string) {
    setSelectedForDirective((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId]);
  }

  function resolveSignals(signalIds: string[]) {
    if (signalIds.length) session.resolveInterventionSignals(course.id, signalIds);
  }

  return (
    <Card className={cn("mt-5", className)}>
      <header className="flex flex-col gap-3 border-b border-stone-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <ClipboardCheck className="text-[var(--pbl-teacher)]" size={20} />
            方案校准行动台
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone={waitingCount ? "amber" : "gray"}>待校准 {waitingCount}</Pill>
          <Pill tone={revisionCount ? "red" : "gray"}>需修订 {revisionCount}</Pill>
        </div>
      </header>

      <section className="mt-4 flex flex-col gap-3 rounded-[10px] border border-indigo-200 bg-indigo-50/65 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-indigo-700 text-white">
            <Bot size={17} />
          </span>
          <div>
            <h4 className="text-sm font-bold text-indigo-950">伴学 Agent 目标控制</h4>
            <p className="mt-1 text-xs leading-5 text-indigo-800/75">
              可从行动优先级列表多选学生，也可直接向全班下发持续目标。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            disabled={!selectedForDirective.length}
            onClick={() => openDirective(selectedForDirective)}
            size="sm"
            type="button"
            variant="outline"
          >
            <SlidersHorizontal size={14} />向已选 {selectedForDirective.length} 人下发
          </PrimaryButton>
          <PrimaryButton onClick={() => openDirective([], true)} size="sm" type="button">
            <Users size={14} />向全班下发
          </PrimaryButton>
        </div>
      </section>

      {commonGaps.length ? (
        <section className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[9px] border border-amber-200 bg-amber-50 px-4 py-3">
          <h4 className="flex items-center gap-2 text-sm font-bold text-amber-950">
            <Users size={16} />
            班级共同证据缺口
          </h4>
          <div className="flex flex-1 flex-wrap gap-x-5 gap-y-2">
            {commonGaps.map(([kind, ids]) => (
              <div className="text-sm" key={kind}>
                <strong className="text-stone-900">{evidenceLabel(kind as Parameters<typeof evidenceLabel>[0])}</strong>
                <span className="ml-2 text-xs text-stone-500">
                  {ids.length} 人
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="rounded-[10px] border border-stone-200 bg-stone-50/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-stone-800">按行动优先级排序</h4>
              <p className="mt-0.5 text-[11px] text-stone-500">勾选学生可批量控制伴学 Agent</p>
            </div>
            <button
              className="text-xs font-bold text-[var(--pbl-teacher)] hover:underline"
              onClick={() => setSelectedForDirective(
                selectedForDirective.length === rows.length ? [] : rows.map((row) => row.student.id),
              )}
              type="button"
            >
              {selectedForDirective.length === rows.length ? "取消全选" : "全选"}
            </button>
          </div>
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.student.id}>
                <article
                  className={cn(
                    "grid grid-cols-[30px_minmax(0,1fr)] rounded-[9px] border p-2.5 transition",
                    selectedStudent?.id === row.student.id
                      ? "border-[var(--pbl-teacher-border)] bg-white shadow-sm"
                      : "border-transparent hover:border-stone-200 hover:bg-white",
                  )}
                >
                  <button
                    aria-label={`${selectedForDirective.includes(row.student.id) ? "取消选择" : "选择"}${row.student.name}`}
                    aria-pressed={selectedForDirective.includes(row.student.id)}
                    className={cn(
                      "mt-1 grid h-5 w-5 place-items-center rounded border",
                      selectedForDirective.includes(row.student.id)
                        ? "border-indigo-700 bg-indigo-700 text-white"
                        : "border-stone-300 bg-white text-transparent",
                    )}
                    onClick={() => toggleDirectiveStudent(row.student.id)}
                    type="button"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    className="min-w-0 text-left"
                    onClick={() => setSelectedStudentId(row.student.id)}
                    type="button"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={row.student.name} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <strong className="truncate text-sm">{row.student.name}</strong>
                          <Pill size="sm" tone={READINESS_TONE[row.readiness.status]}>
                            {STAGE_READINESS_LABEL[row.readiness.status]}
                          </Pill>
                        </span>
                        <span className="mt-1 block truncate text-[11px] text-stone-500">
                          {row.latest ? row.latest.title : "尚未提交阶段证据"}
                        </span>
                      </span>
                      <ChevronRight size={15} className="text-stone-400" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      {row.pendingCount ? <span className="font-bold text-amber-800">{row.pendingCount} 项待核查</span> : null}
                      {row.signals.length ? <span className="inline-flex items-center gap-1 font-bold text-rose-700"><CircleAlert size={12} />{row.signals.length} 条学习信号</span> : null}
                      {!row.pendingCount && !row.signals.length ? <span className="text-emerald-700">暂无待处理项</span> : null}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-stone-500">
                      下一步：{recommendedTeacherAction(row.readiness.status)}
                    </p>
                  </button>
                </article>
              </li>
            ))}
          </ul>
        </aside>

        <section className="min-w-0 rounded-xl border border-stone-200 bg-white p-4 md:p-5">
          {selectedStudent && selectedReadiness && mission ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-4">
                <div className="flex items-center gap-3">
                  <Avatar name={selectedStudent.name} size={44} />
                  <div>
                    <h4 className="text-lg font-bold">{selectedStudent.name}</h4>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-stone-500">
                      {mission.currentAction.label} · {recommendedTeacherAction(selectedReadiness.status)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={READINESS_TONE[selectedReadiness.status]}>
                    {STAGE_READINESS_LABEL[selectedReadiness.status]}
                  </Pill>
                  <PrimaryButton
                    onClick={() => openDirective([selectedStudent.id])}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Bot size={14} />仅对此学生下发目标
                  </PrimaryButton>
                </div>
              </div>

              {selectedSignals.length ? (
                <section className="mt-4 rounded-[9px] border border-rose-200 bg-rose-50/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="flex items-center gap-2 text-sm font-bold text-rose-950">
                      <CircleAlert size={16} />学习信号 · {selectedSignals.length} 条待处理
                    </h5>
                    <button
                      className="text-xs font-bold text-rose-700 hover:underline"
                      onClick={() => resolveSignals(selectedSignals.map((signal) => signal.id))}
                      type="button"
                    >
                      全部标记为已处理
                    </button>
                  </div>
                  <ul className="mt-2 divide-y divide-rose-100">
                    {selectedSignals.map((signal) => (
                      <li className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center" key={signal.id}>
                        <div className="min-w-0 flex-1">
                          <strong className="text-xs text-rose-900">{signal.title}</strong>
                          <p className="mt-0.5 text-xs leading-5 text-rose-800/75">{signal.summary}</p>
                        </div>
                        <button
                          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[6px] border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:bg-rose-100"
                          onClick={() => resolveSignals([signal.id])}
                          type="button"
                        >
                          <Check size={13} />标记已处理
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <h5 className="flex items-center gap-2 text-sm font-bold">
                    <FileSearch size={16} />
                    最近学习证据
                  </h5>
                  <span className="text-xs text-stone-500">
                    {selectedEvidence.length} 项
                  </span>
                </div>
                {selectedEvidence.length ? (
                  <div className="mt-3 grid gap-3">
                    {selectedEvidence.slice(0, 8).map((evidence) => {
                      const structurallyComplete = isLearningEvidenceStructurallyComplete(
                        evidence,
                        course.artifactSnapshots ?? [],
                      );
                      const feedback = feedbackByEvidence[evidence.id] ?? evidence.teacherFeedback ?? "";
                      const linkedSnapshots = (course.artifactSnapshots ?? []).filter(
                        (snapshot) =>
                          evidence.artifactSnapshotIds.includes(snapshot.id),
                      );
                      return (
                        <article className="rounded-xl border border-stone-200 p-4" key={evidence.id}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <strong className="text-sm text-stone-900">{evidence.title}</strong>
                              <p className="mt-1 text-xs text-stone-500">
                                {evidenceLabel(evidence.kind)} · {
                                  evidence.status === "teacher-confirmed"
                                    ? "教师已确认"
                                    : evidence.status === "needs-revision"
                                      ? "需修订"
                                      : evidence.status === "submitted"
                                        ? "待校准"
                                        : "草稿"
                                }
                              </p>
                            </div>
                            <Pill tone={structurallyComplete ? "green" : "red"} size="sm">
                              {structurallyComplete ? "结构完整" : "证据不完整"}
                            </Pill>
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">
                            {evidence.summary || "尚无可读摘要"}
                          </p>
                          {linkedSnapshots.map((snapshot) => (
                            <div className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600" key={snapshot.id}>
                              <strong className="text-stone-800">
                                快照：{snapshot.title} · {snapshot.inspectionStatus}
                              </strong>
                              <p>
                                {snapshot.inspectableText
                                  || snapshot.studentExcerpt
                                  || snapshot.annotation
                                  || "可打开原文件查看"}
                              </p>
                              {snapshot.sourceUrl ? (
                                <a
                                  className="font-semibold text-[var(--pbl-teacher)] underline"
                                  href={snapshot.sourceUrl}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  打开原文件
                                </a>
                              ) : null}
                            </div>
                          ))}
                          {evidence.status !== "draft" ? (
                            <div className="mt-3 grid gap-2">
                              <Textarea
                                aria-label={`${evidence.title}教师反馈`}
                                onChange={(event) => {
                                  setFeedbackByEvidence((current) => ({
                                    ...current,
                                    [evidence.id]: event.target.value,
                                  }));
                                  setReviewErrors((current) => ({
                                    ...current,
                                    [evidence.id]: "",
                                  }));
                                }}
                                placeholder="填写反馈（要求修订时必填）"
                                rows={2}
                                value={feedback}
                              />
                              {reviewErrors[evidence.id] ? (
                                <p className="text-xs font-semibold text-rose-700" role="alert">
                                  {reviewErrors[evidence.id]}
                                </p>
                              ) : null}
                              <div className="flex flex-wrap justify-end gap-2">
                                <PrimaryButton
                                  onClick={() => review(evidence, "needs-revision")}
                                  size="sm"
                                  tone="orange"
                                  type="button"
                                  variant="outline"
                                >
                                  <AlertTriangle size={14} />要求修订
                                </PrimaryButton>
                                <PrimaryButton
                                  disabled={!structurallyComplete}
                                  onClick={() => review(evidence, "teacher-confirmed")}
                                  size="sm"
                                  tone="green"
                                  type="button"
                                >
                                  <CheckCircle2 size={14} />确认此证据
                                </PrimaryButton>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-3 text-xs text-stone-500">草稿尚未提交，教师暂不校准。</p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-dashed border-stone-200 py-8 text-center text-sm text-stone-500">
                    该学生尚未提交本阶段内容
                  </p>
                )}
              </section>

              <section className="mt-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                <h5 className="flex items-center gap-2 text-sm font-bold text-violet-950">
                  <Bot size={16} />
                  AI评价建议状态
                </h5>
                {selectedAssessment ? (
                  <div className="mt-2 text-sm leading-6 text-violet-900">
                    <p>
                      状态：{selectedAssessment.status} · 置信度：{selectedAssessment.confidence}
                    </p>
                    <p>
                      证据引用 {selectedAssessment.evidenceIds.length} 项；
                      证据缺口 {selectedAssessment.evidenceGaps.length
                        ? selectedAssessment.evidenceGaps.join("、")
                        : "无"}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-violet-900">
                    暂无 AI 评价建议
                  </p>
                )}
              </section>

              <details className="mt-5 rounded-xl border border-stone-200 bg-stone-50">
                <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-stone-800">
                  伴学任务与对话记录
                </summary>
                <div className="grid gap-4 border-t border-stone-200 bg-white p-4 lg:grid-cols-2">
                  <section>
                    <h6 className="text-xs font-bold uppercase tracking-wide text-stone-500">
                      伙伴任务 {selectedTasks.length} 项
                    </h6>
                    <ol className="mt-2 space-y-2">
                      {selectedTasks.slice(0, 10).map((task) => (
                        <li className="rounded-lg border border-stone-100 p-2 text-sm" key={task.id}>
                          <strong>{task.title}</strong>
                          <p className="mt-1 text-xs leading-5 text-stone-500">{task.request}</p>
                        </li>
                      ))}
                    </ol>
                  </section>
                  <section>
                    <h6 className="text-xs font-bold uppercase tracking-wide text-stone-500">
                      完整聊天 {selectedMessages.length} 条
                    </h6>
                    <ol className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                      {selectedMessages.map((message) => (
                        <li className="border-l-2 border-stone-200 pl-3" key={message.id}>
                          <span className="text-[11px] text-stone-400">
                            {message.authorName ?? message.companionId ?? message.role}
                          </span>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">
                            {message.content}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </section>
                </div>
              </details>

            </>
          ) : (
            <p className="py-12 text-center text-sm text-stone-500">暂无学生数据</p>
          )}
        </section>
      </div>

      <Dialog onOpenChange={setDirectiveOpen} open={directiveOpen}>
        <DialogContent className="max-h-[88vh] w-[min(720px,calc(100vw-24px))] max-w-none overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="text-indigo-700" size={19} />伴学 Agent 目标控制
            </DialogTitle>
            <DialogDescription>
              为选定学生或全班设置持续目标。目标会生效至系统检测完成或教师撤销。
            </DialogDescription>
          </DialogHeader>
          <TeacherDirectiveForm
            course={course}
            initialAllStudents={directiveAllStudents}
            initialStudentIds={directiveTargets}
            key={`${directiveAllStudents ? "all" : directiveTargets.join("-")}-${directiveOpen}`}
            onSubmitted={() => setDirectiveOpen(false)}
            stageKey={stageKey}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
