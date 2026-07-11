"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Save, ShieldCheck, Sparkles } from "lucide-react";
import { FeedbackLanes } from "@/components/classroom/classroom-chrome";
import { Card, Pill, PrimaryButton, TextArea, TextInput, toast } from "@/components/ui";
import type { Course, ProjectProposal } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { CompanionRoundtable } from "./companion-roundtable";

const EMPTY_PROPOSAL: ProjectProposal = { projectQuestion: "", outcomeFormat: "", implementationPlan: "", requiredKnowledge: [], aiUsePlan: "", risks: [] };

export function ProposalReviewView({ course }: { course: Course }) {
  const session = useSession();
  const project = useMemo(() => course.groups?.find((item) => item.members.some((member) => member.studentId === session.studentId)), [course.groups, session.studentId]);
  const [draft, setDraft] = useState<ProjectProposal>(() => project?.proposal ?? EMPTY_PROPOSAL);
  const [knowledgeText, setKnowledgeText] = useState(() => (project?.proposal?.requiredKnowledge ?? []).join("、"));
  const [riskText, setRiskText] = useState(() => (project?.proposal?.risks ?? []).join("、"));
  const complete = Boolean(draft.projectQuestion.trim() && draft.outcomeFormat.trim() && draft.implementationPlan.trim() && knowledgeText.trim() && draft.aiUsePlan.trim());
  const myFeedback = (course.feedback ?? []).filter((item) => ["proposal", "review"].includes(item.stageKey) && (item.targetId === session.studentId || item.targetId === project?.id));

  function save() {
    if (!project) { toast.error("个人项目空间尚未就绪，请重新进入课堂"); return; }
    const proposal = { ...draft, requiredKnowledge: knowledgeText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean), risks: riskText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean) };
    session.upsertGroup(course.id, { ...project, name: `${session.studentName ?? "我的"}个人项目`, topic: proposal.projectQuestion, goal: proposal.outcomeFormat, selectedForms: [proposal.outcomeFormat], proposal, teacherApproval: { status: "pending", updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() });
    session.upsertSubmission({ id: `proposal-${session.studentId}`, stageKey: "proposal", type: "plan", title: "个人项目方案", content: JSON.stringify(proposal), groupId: project.id });
    session.updateStudentProgress("proposal", complete ? 90 : 55);
    session.addActivity(course.id, "保存个人项目方案", proposal.projectQuestion, session.studentName);
    toast.success("个人项目方案已保存", { description: "你可以继续与 AI 伴学伙伴讨论，再提交教师校准。" });
  }

  return <div className="space-y-6">
    <header className="border-b border-[var(--pbl-border)] pb-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-[var(--pbl-student)]">方案构思与校准</p><h1 className="font-editorial mt-1 text-2xl font-semibold">先形成自己的方案，再借助 AI 多角色反馈完善</h1></div><Pill tone={project?.teacherApproval?.status === "approved" ? "green" : project?.teacherApproval?.status === "revision" ? "orange" : "gray"}>{project?.teacherApproval?.status === "approved" ? "教师已确认" : project?.teacherApproval?.status === "revision" ? "需要修订" : "等待教师校准"}</Pill></div><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pbl-text-muted)]">AI 可以解释、启发、质疑和比较方案，但最终方向、关键判断与成果形式必须由你决定。</p></header>
    {myFeedback.length ? <FeedbackLanes feedback={myFeedback} /> : null}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]"><Card><div className="grid gap-5"><label><span className="mb-2 block text-sm font-semibold">我的项目问题 *</span><TextInput onChange={(event) => setDraft((current) => ({ ...current, projectQuestion: event.target.value }))} placeholder="我真正想解决的具体问题是什么？" value={draft.projectQuestion} /></label><label><span className="mb-2 block text-sm font-semibold">核心成果形式 *</span><TextInput onChange={(event) => setDraft((current) => ({ ...current, outcomeFormat: event.target.value }))} placeholder="例如：交互原型、调查报告、科普海报" value={draft.outcomeFormat} /></label><label><span className="mb-2 block text-sm font-semibold">实施计划 *</span><TextArea className="min-h-32" onChange={(event) => setDraft((current) => ({ ...current, implementationPlan: event.target.value }))} placeholder="按顺序写出你准备怎样调研、设计、制作和检验" value={draft.implementationPlan} /></label><div className="grid gap-4 md:grid-cols-2"><label><span className="mb-2 block text-sm font-semibold">需要掌握的知识 *</span><TextArea className="min-h-24" onChange={(event) => setKnowledgeText(event.target.value)} placeholder="用逗号分隔" value={knowledgeText} /></label><label><span className="mb-2 block text-sm font-semibold">可能的风险与限制</span><TextArea className="min-h-24" onChange={(event) => setRiskText(event.target.value)} placeholder="时间、数据、伦理、可行性等" value={riskText} /></label></div><label><span className="mb-2 block text-sm font-semibold">AI 使用计划 *</span><TextArea className="min-h-24" onChange={(event) => setDraft((current) => ({ ...current, aiUsePlan: event.target.value }))} placeholder="哪些环节请 AI 提问、解释或反馈？哪些关键工作必须由我完成？" value={draft.aiUsePlan} /></label></div></Card><aside className="space-y-4"><Card><div className="flex items-center gap-2 font-bold text-emerald-800"><ShieldCheck size={19} />项目所有权检查</div><ul className="mt-3 space-y-3 text-sm leading-6 text-slate-600"><li className="flex gap-2"><CheckCircle2 className="mt-1 shrink-0 text-emerald-600" size={16} />由我提出问题并选择最终方向</li><li className="flex gap-2"><CheckCircle2 className="mt-1 shrink-0 text-emerald-600" size={16} />由我完成核心制作与判断</li><li className="flex gap-2"><Sparkles className="mt-1 shrink-0 text-violet-600" size={16} />AI 只提供解释、启发、质疑与反馈</li></ul></Card><Card><p className="text-sm font-semibold">方案完整度</p><div className="mt-2 text-3xl font-bold text-blue-700">{complete ? "已完整" : "待补充"}</div><p className="mt-2 text-sm leading-6 text-slate-500">教师会重点检查你能否说明“为什么这样做”。</p></Card></aside></div>
    <div className="flex justify-end"><PrimaryButton className="min-w-44" onClick={save}><Save size={18} />保存并提交校准</PrimaryButton></div>
    <CompanionRoundtable course={course} stageKey="proposal" contextLabel="方案构思与校准" />
  </div>;
}
