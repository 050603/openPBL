"use client";

import { useMemo, useState } from "react";
import { CircleAlert, ClipboardCheck, MessageSquareText, Route, ScrollText, Users } from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import { DialogDescription, DialogTitle, Drawer, DrawerContent, PrimaryButton } from "@/components/ui";
import { useSession } from "@/lib/session/store";
import type { Course, OfflineInterventionKind } from "@/lib/session/types";
import { cn } from "@/lib/utils";

type DetailTab = "signals" | "conversation" | "trajectory" | "artifacts" | "guidance";

const TABS: Array<{ id: DetailTab; label: string; icon: React.ReactNode }> = [
  { id: "signals", label: "风险信号", icon: <CircleAlert size={14} /> },
  { id: "conversation", label: "AI 对话", icon: <MessageSquareText size={14} /> },
  { id: "trajectory", label: "学习轨迹", icon: <Route size={14} /> },
  { id: "artifacts", label: "阶段产物", icon: <ScrollText size={14} /> },
  { id: "guidance", label: "教师指导", icon: <ClipboardCheck size={14} /> },
];

export function StudentLearningDetail({ course, studentId, open, onOpenChange }: { course: Course; studentId?: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const session = useSession();
  const [tab, setTab] = useState<DetailTab>("signals");
  const student = course.students.find((item) => item.id === studentId);
  const project = course.groups?.find((group) => group.members.some((member) => member.studentId === studentId));
  const signals = (course.learningSignals ?? []).filter((signal) => signal.studentId === studentId && signal.stageKey === "ai-learning");
  const events = (course.learningEvents ?? []).filter((event) => event.studentId === studentId && event.stageKey === "ai-learning").sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const messages = (course.companionThreads ?? []).filter((thread) => thread.studentId === studentId).flatMap((thread) => thread.messages).filter((message) => message.visibility === "student-and-teacher" || message.visibility === "teacher-only").sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const submissions = (course.submissions ?? []).filter((submission) => submission.studentId === studentId || (project && submission.groupId === project.id));
  const interventions = (course.offlineInterventions ?? []).filter((record) => record.targetStudentIds.includes(studentId ?? ""));
  const stageKey = course.stages[course.currentStageIndex]?.key ?? "ai-learning";

  const activeContent = useMemo(() => {
    if (tab === "signals") return signals.length ? <ul className="space-y-3">{signals.map((signal) => <li className="rounded-lg border border-rose-200 bg-rose-50/60 p-3" key={signal.id}><div className="flex items-center justify-between gap-2"><strong className="text-rose-800">{signal.title}</strong><span className="text-xs font-bold text-rose-700">{signal.status === "open" ? "待处理" : signal.status}</span></div><p className="mt-2 text-sm leading-6 text-stone-600">{signal.summary}</p><p className="mt-2 text-xs text-stone-400">证据 {signal.evidenceEventIds.length} 条 · 最近 {new Date(signal.lastDetectedAt).toLocaleString("zh-CN")}</p></li>)}</ul> : <Empty text="暂无风险信号" />;
    if (tab === "conversation") return messages.length ? <ol className="space-y-3">{messages.map((message) => <li className="border-l-2 border-stone-200 pl-3" key={message.id}><div className="flex justify-between gap-3 text-xs text-stone-400"><span>{message.authorName ?? message.companionId ?? message.role}</span><time>{new Date(message.createdAt).toLocaleString("zh-CN")}</time></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-700">{message.content}</p></li>)}</ol> : <Empty text="AI 授知阶段未配置伴学圆桌，暂无对话记录" />;
    if (tab === "trajectory") return events.length ? <ol className="space-y-2">{events.map((event) => <li className="flex gap-3 border-b border-stone-100 py-2 text-sm" key={event.id}><time className="w-36 shrink-0 text-xs text-stone-400">{new Date(event.occurredAt).toLocaleString("zh-CN")}</time><span className="font-semibold text-stone-700">{event.type}</span><span className="text-stone-500">{event.metadata?.sceneTitle?.toString() ?? event.sceneId ?? "阶段事件"}</span></li>)}</ol> : <Empty text="暂无学习轨迹" />;
    if (tab === "artifacts") return submissions.length ? <ul className="space-y-3">{submissions.map((submission) => <li className="rounded-lg border border-stone-200 p-3" key={submission.id}><strong>{submission.title}</strong><p className="mt-2 line-clamp-4 text-sm leading-6 text-stone-600">{submission.content}</p></li>)}</ul> : <Empty text="暂无阶段产物" />;
    return <div className="space-y-4"><div className="grid gap-2 sm:grid-cols-3"><InterventionButton kind="patrol" label="标记已巡视" /><InterventionButton kind="individual-guidance" label="已个别辅导" /><InterventionButton kind="whole-class-teaching" label="已进行全班讲解" /></div>{interventions.length ? <ul className="divide-y divide-stone-100 border-y border-stone-100">{interventions.map((record) => <li className="py-3 text-sm" key={record.id}><div className="flex justify-between"><strong>{record.kind === "patrol" ? "课堂巡视" : record.kind === "individual-guidance" ? "个别辅导" : "全班讲解"}</strong><time className="text-xs text-stone-400">{new Date(record.createdAt).toLocaleString("zh-CN")}</time></div><p className="mt-1 text-stone-500">记录人：{record.teacherName}</p></li>)}</ul> : <Empty text="暂无教师现场介入记录" />}</div>;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, interventions, messages, signals, submissions, tab]);

  function InterventionButton({ kind, label }: { kind: OfflineInterventionKind; label: string }) {
    return <PrimaryButton onClick={() => studentId && session.addOfflineIntervention({ courseId: course.id, stageKey, kind, targetStudentIds: kind === "whole-class-teaching" ? course.students.map((item) => item.id) : [studentId], signalIds: kind === "whole-class-teaching" ? (course.classCommonIssues ?? []).flatMap((issue) => issue.signalIds) : signals.map((signal) => signal.id) })} type="button" variant="outline">{kind === "whole-class-teaching" ? <Users size={15} /> : <ClipboardCheck size={15} />}{label}</PrimaryButton>;
  }

  return <Drawer onOpenChange={onOpenChange} open={open}><DrawerContent className="w-[min(760px,100vw)]"><DialogTitle className="flex items-center gap-3">{student ? <Avatar name={student.name} size={38} /> : null}<span>{student?.name ?? "学生详情"}</span></DialogTitle><DialogDescription>查看该学生的风险、对话、学习轨迹和教师处理记录。</DialogDescription><nav className="mt-5 flex gap-1 overflow-x-auto border-b border-stone-200">{TABS.map((item) => <button className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold", tab === item.id ? "border-blue-700 text-blue-700" : "border-transparent text-stone-500")} key={item.id} onClick={() => setTab(item.id)} type="button">{item.icon}{item.label}</button>)}</nav><div className="mt-4">{activeContent}</div></DrawerContent></Drawer>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-lg border border-dashed border-stone-200 py-10 text-center text-sm text-stone-500">{text}</div>; }
