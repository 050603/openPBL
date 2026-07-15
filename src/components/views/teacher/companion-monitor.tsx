"use client";

import { useMemo, useState } from "react";
import { CircleAlert, ClipboardCheck, MessageSquareText, Target, Users, XCircle } from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import { Card, Pill, PrimaryButton, ProgressBar } from "@/components/ui";
import { useSession } from "@/lib/session/store";
import { detectInterventionSignals, type InterventionSignal } from "@/lib/classroom/stage-gates";
import type { Course, LearningSignal } from "@/lib/session/types";
import { cn } from "@/lib/utils";
import { TeacherDirectiveForm } from "./teacher-directive-form";
import { formatLearningContentReference } from "@/lib/learning-analytics/content-reference";
import { aggregateCommonIssues, isLearningSignalRelevant } from "@/lib/learning-analytics/analyzer";

type StudentSignal = LearningSignal | InterventionSignal;

function signalTargetsStudent(course: Course, signal: InterventionSignal, studentId: string): boolean {
  if (signal.targetType === "student") return signal.targetIds.includes(studentId);
  if (signal.targetType === "course") return true;
  const group = course.groups?.find((item) => signal.targetIds.includes(item.id));
  return Boolean(group?.members.some((member) => member.studentId === studentId));
}

function getStudentSignals(course: Course, stageKey: string, studentId: string): StudentSignal[] {
  const learningSignals = (course.learningSignals ?? []).filter(
    (signal) => signal.stageKey === stageKey
      && signal.studentId === studentId
      && signal.status === "open"
      && isLearningSignalRelevant(
        signal,
        course.learningEvents ?? [],
        stageKey === "ai-learning" && ["completed", "mastered"].includes(course.aiLearningProgress?.[studentId]?.masteryLevel ?? ""),
      ),
  );
  const derivedSignals = detectInterventionSignals(course).filter(
    (signal) => (!signal.stageKey || signal.stageKey === stageKey) && signalTargetsStudent(course, signal, studentId),
  );
  const seen = new Set<string>();
  return [...learningSignals, ...derivedSignals].filter((signal) => {
    if (seen.has(signal.id)) return false;
    seen.add(signal.id);
    return true;
  });
}

function getStudentProgress(course: Course, stageKey: string, studentId: string): number {
  const direct = course.students.find((student) => student.id === studentId)?.stageProgress?.[stageKey];
  if (typeof direct === "number") return direct;
  const group = course.groups?.find((item) => item.members.some((member) => member.studentId === studentId));
  const members = group?.members ?? [];
  if (!members.length) return 0;
  return Math.round(members.reduce((sum, member) => sum + (course.students.find((student) => student.id === member.studentId)?.stageProgress?.[stageKey] ?? 0), 0) / members.length);
}

export function CompanionMonitor({ course, stageKey }: { course: Course; stageKey: string }) {
  const session = useSession();
  const students = course.students;
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id);
  const [handling, setHandling] = useState(false);
  const [handlingNote, setHandlingNote] = useState("");

  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? students[0];
  const commonIssues = aggregateCommonIssues(
    students.flatMap((student) => getStudentSignals(course, stageKey, student.id)).filter((signal): signal is LearningSignal => "normalizedIssueKey" in signal),
    students.length,
  );
  const selectedSignals = selectedStudent ? getStudentSignals(course, stageKey, selectedStudent.id) : [];
  const selectedMessages = (course.companionThreads ?? [])
    .filter((thread) => thread.stageKey === stageKey && thread.studentId === selectedStudent?.id)
    .flatMap((thread) => thread.messages)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const selectedDirectives = (course.teacherAgentDirectives ?? []).filter((directive) => directive.stageKey === stageKey && (directive.targetScope === "course" || directive.targetStudentIds.includes(selectedStudent?.id ?? "")));

  const studentRows = useMemo(() => students.map((student) => ({
    student,
    progress: getStudentProgress(course, stageKey, student.id),
    signals: getStudentSignals(course, stageKey, student.id),
    messages: (course.companionThreads ?? []).filter((thread) => thread.stageKey === stageKey && thread.studentId === student.id).reduce((count, thread) => count + thread.messages.length, 0),
  })), [course, stageKey, students]);

  function handleSelectedStudent() {
    if (!selectedStudent || !selectedSignals.length || handling) return;
    setHandling(true);
    const signalIds = selectedSignals.map((signal) => signal.id);
    session.addOfflineIntervention?.({
      courseId: course.id,
      stageKey,
      kind: "individual-guidance",
      targetStudentIds: [selectedStudent.id],
      signalIds,
      note: handlingNote.trim() || "教师已查看风险证据并完成现场介入。",
    });
    session.resolveInterventionSignals?.(course.id, signalIds);
    session.addActivity(course.id, "处理学生伴学风险", `${selectedStudent.name}：${handlingNote.trim() || "已完成现场介入"}`, session.user.name);
    setHandlingNote("");
    setHandling(false);
  }

  return (
    <Card className="mt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-black"><MessageSquareText className="text-indigo-700" size={20} />学生—AI 伴学观察</h3>
          <p className="mt-1 text-sm text-stone-500">左侧按学生聚合进度与风险，右侧查看完整对话、证据并完成教师处理。</p>
        </div>
        <Pill tone={commonIssues.length ? "red" : "green"}>{commonIssues.length ? `${commonIssues.length} 个共性问题` : "暂无共性问题"}</Pill>
      </div>

      {commonIssues.length ? (
        <section className="mt-4 rounded-lg border border-[var(--pbl-danger-border)] bg-[var(--pbl-danger-soft)]/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-black text-[var(--pbl-danger)]"><Users size={16} />班级共性问题</div>
          <ul className="space-y-2">{commonIssues.map((issue) => <li className="flex items-start justify-between gap-3 text-sm" key={issue.id}><span><strong>{issue.title}</strong><span className="mt-0.5 block text-xs font-semibold text-stone-500">{formatLearningContentReference(issue.content)}</span><span className="mt-0.5 block text-stone-600">{issue.summary}</span><span className="mt-0.5 block text-xs text-stone-500">{issue.studentIds.map((id) => course.students.find((student) => student.id === id)?.name ?? id).join("、")}</span></span><span className="shrink-0 font-bold text-[var(--pbl-danger)]">{issue.studentIds.length} 人</span></li>)}</ul>
        </section>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-stone-200 bg-stone-50/70 p-3">
          <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-black text-stone-800">学生列表</h4><span className="text-xs text-stone-400">{students.length} 人</span></div>
          <ul className="space-y-2">
            {studentRows.map(({ student, progress, signals, messages }) => (
              <li key={student.id}>
                <button aria-label={`${student.name}${signals.length ? " 有干预信号" : ""}`} className={cn("w-full rounded-lg border p-2.5 text-left transition", selectedStudent?.id === student.id ? "border-[var(--pbl-teacher-border)] bg-white shadow-sm" : "border-transparent hover:border-stone-200 hover:bg-white")} onClick={() => setSelectedStudentId(student.id)} type="button">
                  <div className="flex items-center gap-2.5"><span className="relative"><Avatar name={student.name} size={32} />{signals.length ? <CircleAlert aria-label="有干预信号" className="absolute -right-2 -top-2 fill-white text-[var(--pbl-danger)]" size={17} /> : null}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{student.name}</strong><span className={cn("text-[11px]", signals.length ? "font-bold text-[var(--pbl-danger)]" : "text-stone-500")}>{signals.length ? `${signals.length} 条待处理` : "暂无待处理风险"}</span></span></div>
                  <div className="mt-2"><div className="mb-1 flex justify-between text-[11px] text-stone-500"><span>阶段进度</span><strong>{progress}%</strong></div><ProgressBar className="h-1.5" tone={signals.length ? "red" : progress >= 80 ? "green" : "slate"} value={progress} /></div>
                  <div className="mt-1 text-[11px] text-stone-400">{messages} 条伴学消息</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="min-w-0 rounded-lg border border-stone-200 bg-white p-4">
          {selectedStudent ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-3"><div className="flex items-center gap-3"><Avatar name={selectedStudent.name} size={42} /><div><h4 className="text-lg font-black">{selectedStudent.name}</h4><p className="text-xs text-stone-500">阶段进度 {getStudentProgress(course, stageKey, selectedStudent.id)}% · {selectedSignals.length ? `${selectedSignals.length} 条待处理信号` : "当前无待处理信号"}</p></div></div>{selectedSignals.length ? <Pill tone="red"><CircleAlert size={13} />需要教师处理</Pill> : <Pill tone="green">已处理</Pill>}</div>
              <section className="mt-4"><h5 className="flex items-center gap-2 text-sm font-black"><CircleAlert size={15} />介入详情</h5>{selectedSignals.length ? <ul className="mt-2 space-y-2">{selectedSignals.map((signal) => <li className="rounded-lg border border-[var(--pbl-danger-border)] bg-[var(--pbl-danger-soft)]/60 p-3" key={signal.id}><div className="flex items-center justify-between gap-2"><strong className="text-sm text-[var(--pbl-danger)]">{signal.title}</strong><span className="text-[11px] font-bold text-[var(--pbl-danger)]">{"severity" in signal ? signal.severity : signal.confidence === "high" ? "高置信" : "需核查"}</span></div>{"content" in signal ? <p className="mt-1 text-xs font-semibold text-stone-500">{formatLearningContentReference(signal.content, signal.sceneId)}</p> : "contentLocation" in signal && signal.contentLocation ? <p className="mt-1 text-xs font-semibold text-stone-500">{signal.contentLocation}</p> : null}<p className="mt-1 text-sm leading-6 text-stone-600">{"summary" in signal ? signal.summary : signal.whatHappened}</p><p className="mt-1 text-xs text-stone-400">依据：{"evidenceEventIds" in signal ? `${signal.evidenceEventIds.length} 条学习事件` : signal.evidence.join("；")}</p></li>)}</ul> : <p className="mt-2 rounded-lg border border-dashed border-stone-200 py-6 text-center text-sm text-stone-500">暂无未处理风险。教师处理完成后，学生卡片上的叹号会消失。</p>}</section>

              <section className="mt-5"><h5 className="flex items-center gap-2 text-sm font-black"><MessageSquareText size={15} />AI 对话过程</h5>{selectedMessages.length ? <ol className="mt-2 max-h-64 space-y-2 overflow-y-auto">{selectedMessages.map((message) => <li className="border-l-2 border-stone-200 pl-3" key={message.id}><div className="flex justify-between gap-3 text-[11px] text-stone-400"><span>{message.authorName ?? message.companionId ?? message.role}{message.visibility === "teacher-only" ? " · 仅教师" : ""}</span><time>{new Date(message.createdAt).toLocaleString("zh-CN")}</time></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-700">{message.content}</p></li>)}</ol> : <p className="mt-2 text-sm text-stone-500">暂无 AI 对话记录</p>}</section>

              {selectedSignals.length ? <section className="mt-5 rounded-lg border border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)]/50 p-3"><div className="flex items-center gap-2 text-sm font-black text-indigo-900"><ClipboardCheck size={15} />教师处理</div><textarea aria-label="教师处理备注" className="mt-2 min-h-20 w-full rounded-md border border-[var(--pbl-teacher-border)] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500" onChange={(event) => setHandlingNote(event.target.value)} placeholder="记录现场介入的关键动作或给学生的下一步要求（可选）" value={handlingNote} /><PrimaryButton className="mt-2" disabled={handling} onClick={handleSelectedStudent} type="button"><ClipboardCheck size={15} />{handling ? "保存中..." : "教师已处理，消除叹号"}</PrimaryButton></section> : null}

              <section className="mt-5"><h5 className="flex items-center gap-2 text-sm font-black"><Target size={15} />教师持续目标</h5>{selectedDirectives.length ? <ul className="mt-2 space-y-2">{selectedDirectives.map((directive) => <li className="rounded-lg border border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)] p-3" key={directive.id}><div className="flex justify-between gap-3"><strong className="text-sm">{directive.goal}</strong><span className="text-xs font-bold text-indigo-700">{directive.status}</span></div><p className="mt-1 text-xs leading-5 text-stone-600">{directive.instruction}</p>{directive.status === "active" ? <PrimaryButton className="mt-2" onClick={() => session.upsertTeacherAgentDirective({ ...directive, status: "revoked", revokedAt: new Date().toISOString() })} type="button" variant="outline"><XCircle size={14} />撤销</PrimaryButton> : null}</li>)}</ul> : null}<TeacherDirectiveForm course={course} initialStudentId={selectedStudent.id} stageKey={stageKey} /></section>
            </>
          ) : <p className="py-12 text-center text-sm text-stone-500">暂无学生数据</p>}
        </section>
      </div>
    </Card>
  );
}
