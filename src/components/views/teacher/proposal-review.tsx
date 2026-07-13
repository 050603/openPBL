"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Eye, MessageSquareText, MessageSquareWarning, UserRound } from "lucide-react";
import { Button, Card, Pill, TextArea, toast } from "@/components/ui";
import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";

export function ProposalReviewTeacherView({ course, onSelectGroup }: { course: Course; onSelectGroup?: (groupId: string) => void }) {
  const session = useSession();
  const projects = useMemo(() => course.students.map((student) => ({ student, project: course.groups?.find((item) => item.members.some((member) => member.studentId === student.id)) })), [course.groups, course.students]);
  const [activeStudentId, setActiveStudentId] = useState(projects[0]?.student.id ?? "");
  const [note, setNote] = useState("");
  const active = projects.find((item) => item.student.id === activeStudentId) ?? projects[0];
  const approved = projects.filter((item) => item.project?.teacherApproval?.status === "approved").length;
  const observationFor = (studentId: string) => ({
    signals: (course.learningSignals ?? []).filter((signal) => signal.studentId === studentId && signal.stageKey === "proposal" && signal.status === "open"),
    messages: (course.companionThreads ?? []).filter((thread) => thread.studentId === studentId && thread.stageKey === "proposal").reduce((count, thread) => count + thread.messages.length, 0),
  });

  function review(status: "approved" | "revision") {
    if (!active?.project) return;
    session.upsertGroup(course.id, { ...active.project, teacherApproval: { status, teacherName: session.user.name, note: note.trim() || undefined, updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() });
    if (note.trim()) session.addFeedback({ courseId: course.id, targetType: "student", targetId: active.student.id, stageKey: "proposal", kind: status === "approved" ? "comment" : "revision", content: note.trim(), sourceRole: "teacher", sourceName: session.user.name, status: status === "approved" ? "resolved" : "open" });
    session.addActivity(course.id, status === "approved" ? "确认个人项目方向" : "要求修订个人项目方案", active.student.name, session.user.name);
    setNote(""); toast.success(status === "approved" ? "已确认项目方向" : "修订要求已同步给学生");
  }

  return <div className="space-y-6"><header className="border-b border-[var(--pbl-border)] pb-5"><p className="text-sm font-semibold text-[var(--pbl-teacher)]">方案构思与校准</p><h2 className="font-editorial mt-1 text-2xl font-semibold">逐个校准个人项目方向，学生保留最终项目所有权</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pbl-text-muted)]">AI 负责多角度建议和风险扫描；教师检查目标、边界与可行性，并确认学生能够解释自己的选择。</p></header>
    <div className="grid gap-4 md:grid-cols-3"><Card><p className="text-sm text-stone-500">个人项目</p><p className="mt-2 text-3xl font-bold">{projects.length}</p></Card><Card><p className="text-sm text-stone-500">已提交方案</p><p className="mt-2 text-3xl font-bold text-blue-700">{projects.filter((item) => item.project?.proposal).length}</p></Card><Card><p className="text-sm text-stone-500">教师已确认</p><p className="mt-2 text-3xl font-bold text-emerald-700">{approved} / {projects.length}</p></Card></div>
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]"><Card><h3 className="mb-3 flex items-center gap-2 font-bold"><UserRound size={18} />学生个人项目</h3><div className="space-y-2">{projects.map(({ student, project }) => { const observation = observationFor(student.id); return <button className={`w-full rounded-[8px] border p-3 text-left ${student.id === active?.student.id ? "border-blue-400 bg-blue-50" : "border-stone-200 hover:border-blue-200"}`} key={student.id} onClick={() => setActiveStudentId(student.id)} type="button"><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-semibold">{observation.signals.length ? <CircleAlert aria-label="有干预信号" className="text-rose-600" size={16} /> : null}{student.name}</span><Pill tone={project?.teacherApproval?.status === "approved" ? "green" : project?.teacherApproval?.status === "revision" ? "orange" : project?.proposal ? "blue" : "gray"}>{project?.teacherApproval?.status === "approved" ? "已确认" : project?.teacherApproval?.status === "revision" ? "需修订" : project?.proposal ? "待校准" : "未提交"}</Pill></div><p className="mt-1 truncate text-xs text-stone-500">{project?.proposal?.projectQuestion || "尚未填写项目问题"}</p><p className={`mt-2 flex items-center gap-3 text-[11px] ${observation.signals.length ? "font-bold text-rose-700" : "text-stone-400"}`}><span className="inline-flex items-center gap-1"><MessageSquareText size={12} />AI 对话 {observation.messages}</span><span>{observation.signals.length ? `风险 ${observation.signals.length}` : "暂无风险"}</span></p></button>; })}</div></Card>
      {active ? <div className="space-y-4"><Card><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-blue-700">{active.student.name}的个人项目</p><h3 className="mt-1 text-xl font-bold">{active.project?.proposal?.projectQuestion || "尚未提交方案"}</h3></div>{active.project ? <Button onClick={() => onSelectGroup?.(active.project!.id)} size="sm" variant="secondary"><Eye size={15} />查看过程空间</Button> : null}</div>{active.project?.proposal ? <dl className="mt-5 grid gap-4 md:grid-cols-2"><ProposalField label="成果形式" value={active.project.proposal.outcomeFormat} /><ProposalField label="必备知识" value={active.project.proposal.requiredKnowledge.join("、")} /><ProposalField className="md:col-span-2" label="实施计划" value={active.project.proposal.implementationPlan} /><ProposalField className="md:col-span-2" label="AI 使用计划" value={active.project.proposal.aiUsePlan} /><ProposalField className="md:col-span-2" label="风险与限制" value={active.project.proposal.risks.join("、") || "学生暂未填写"} /></dl> : <div className="mt-6 rounded-[8px] border border-dashed border-stone-300 py-12 text-center text-sm text-stone-500">等待学生提交个人项目方案</div>}<div className="mt-5 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-sm text-indigo-900"><MessageSquareText size={15} />AI 对话与风险详情已在下方“学生—AI 伴学观察”中按学生展开。</div></Card>
      {active.project?.proposal ? <Card><h3 className="flex items-center gap-2 font-bold"><MessageSquareWarning size={18} className="text-amber-600" />教师校准意见</h3><TextArea className="mt-3 min-h-24" onChange={(event) => setNote(event.target.value)} placeholder="指出目标偏差、边界、证据或下一步要求；确认通过时可简要说明理由。" value={note} /><div className="mt-3 flex justify-end gap-2"><Button onClick={() => review("revision")} variant="secondary">要求修订</Button><Button onClick={() => review("approved")}><CheckCircle2 size={16} />确认进入项目实践</Button></div></Card> : null}</div> : null}</div>
  </div>;
}

function ProposalField({ label, value, className = "" }: { label: string; value: string; className?: string }) { return <div className={className}><dt className="text-xs font-semibold text-stone-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-800">{value || "—"}</dd></div>; }
