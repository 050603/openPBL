"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Save, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { FeedbackLanes } from "@/components/classroom/classroom-chrome";
import { Card, Pill, PrimaryButton, TextArea, TextInput, toast } from "@/components/ui";
import type { Course, ProjectProposal } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { CompanionRoundtable } from "./companion-roundtable";
import { emitStudentArtifactEvent } from "@/lib/companion/events";

const EMPTY_PROPOSAL: ProjectProposal = { projectQuestion: "", outcomeFormat: "", implementationPlan: "", requiredKnowledge: [], aiUsePlan: "", risks: [] };

/**
 * 从自由描述文本中提取结构化方案要点。
 * 基于关键词匹配将句子分类到对应字段，未匹配的归入"项目问题"。
 * 这不是 AI 解析，只是帮助学生快速把一段话拆成可编辑的结构化预览；
 * 最终内容由学生确认和修改。
 */
function extractProposalFromText(raw: string): ProjectProposal {
  const text = raw.trim();
  if (!text) return EMPTY_PROPOSAL;
  // 按句号、问号、换行切分，保留有内容的句子
  const sentences = text
    .split(/[。？?！!\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  const question: string[] = [];
  const outcome: string[] = [];
  const plan: string[] = [];
  const knowledge: string[] = [];
  const risks: string[] = [];
  const aiUse: string[] = [];

  const outcomeRe = /(成果|产出|制作|输出|报告|原型|海报|视频|演示|作品|呈现|展示)/;
  const planRe = /(先|再|然后|接着|步骤|计划|流程|准备|开始|最后|第一步|第二步|第三步)/;
  const knowledgeRe = /(需要|学习|知识|了解|掌握|学会|知道|懂得|理解)/;
  const riskRe = /(风险|困难|问题|挑战|限制|担心|可能|障碍|不足|瓶颈)/;
  const aiRe = /(AI|人工智能|工具|辅助|帮助|借助|使用|利用|ChatGPT|大模型)/;

  for (const s of sentences) {
    if (aiRe.test(s)) aiUse.push(s);
    else if (riskRe.test(s)) risks.push(s);
    else if (knowledgeRe.test(s)) knowledge.push(s);
    else if (planRe.test(s)) plan.push(s);
    else if (outcomeRe.test(s)) outcome.push(s);
    else question.push(s);
  }

  return {
    projectQuestion: question.join("；") || text.slice(0, 80),
    outcomeFormat: outcome.join("；"),
    implementationPlan: plan.join("\n"),
    requiredKnowledge: knowledge.map((s) => s.replace(/^(需要|学习|了解|掌握|学会|知道|懂得|理解)/, "").trim()).filter(Boolean),
    aiUsePlan: aiUse.join("；"),
    risks: risks.map((s) => s.replace(/^(风险|困难|问题|挑战|限制|担心|可能|障碍|不足|瓶颈)/, "").trim()).filter(Boolean),
  };
}

export function ProposalReviewView({ course }: { course: Course }) {
  const session = useSession();
  const project = useMemo(() => course.groups?.find((item) => item.members.some((member) => member.studentId === session.studentId)), [course.groups, session.studentId]);
  const [draft, setDraft] = useState<ProjectProposal>(() => project?.proposal ?? EMPTY_PROPOSAL);
  const [knowledgeText, setKnowledgeText] = useState(() => (project?.proposal?.requiredKnowledge ?? []).join("、"));
  const [riskText, setRiskText] = useState(() => (project?.proposal?.risks ?? []).join("、"));
  // 自由描述：学生用一段话写出项目想法，是主要输入方式
  const [description, setDescription] = useState(() => {
    // 如果已有结构化方案，把核心内容拼成描述供学生参考编辑
    const p = project?.proposal;
    if (!p) return "";
    const parts = [
      p.projectQuestion,
      p.outcomeFormat ? `成果形式：${p.outcomeFormat}` : "",
      p.implementationPlan,
      p.requiredKnowledge.length ? `需要掌握：${p.requiredKnowledge.join("、")}` : "",
      p.aiUsePlan ? `AI 使用：${p.aiUsePlan}` : "",
      p.risks.length ? `可能风险：${p.risks.join("、")}` : "",
    ].filter(Boolean);
    return parts.join("\n");
  });
  const [detailsOpen, setDetailsOpen] = useState(false);
  // 传给 CompanionRoundtable 的自动发送消息（用时间戳后缀确保每次都是新值）
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);

  const complete = Boolean(draft.projectQuestion.trim() && draft.outcomeFormat.trim() && draft.implementationPlan.trim() && knowledgeText.trim() && draft.aiUsePlan.trim());
  const myFeedback = (course.feedback ?? []).filter((item) => ["proposal", "review"].includes(item.stageKey) && (item.targetId === session.studentId || item.targetId === project?.id));

  function extractFromDescription() {
    if (!description.trim()) {
      toast.error("请先写下你的项目想法", { description: "在上方文本框中用一段话描述你想做什么。" });
      return;
    }
    const extracted = extractProposalFromText(description);
    setDraft(extracted);
    setKnowledgeText(extracted.requiredKnowledge.join("、"));
    setRiskText(extracted.risks.join("、"));
    setDetailsOpen(true);
    toast.success("已从描述中提取要点", { description: "请在下方检查并修改各字段，确保准确表达你的想法。" });
  }

  function askAiForHelp() {
    if (!description.trim()) {
      toast.error("请先写下你的项目想法", { description: "AI 伴学小组需要看到你的初步想法才能帮忙完善。" });
      return;
    }
    // 用唯一后缀确保 CompanionRoundtable 检测到新消息
    setAiPrompt(`这是我目前的项目想法，请帮我完善方案：\n${description}\n--${Date.now()}`);
    toast.info("已发送给 AI 伴学小组", { description: "请在下方对话面板中查看多角色反馈。" });
  }

  function save() {
    if (!project) { toast.error("个人项目空间尚未就绪，请重新进入课堂"); return; }
    const proposal = { ...draft, requiredKnowledge: knowledgeText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean), risks: riskText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean) };
    session.upsertGroup(course.id, { ...project, name: `${session.studentName ?? "我的"}个人项目`, topic: proposal.projectQuestion, goal: proposal.outcomeFormat, selectedForms: [proposal.outcomeFormat], proposal, teacherApproval: { status: "pending", updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() });
    const submission = session.upsertSubmission({ id: `proposal-${session.studentId}`, stageKey: "proposal", type: "plan", title: "个人项目方案", content: JSON.stringify({ ...proposal, description }), groupId: project.id });
    session.updateStudentProgress("proposal", complete ? 90 : 55);
    session.addActivity(course.id, "保存个人项目方案", proposal.projectQuestion, session.studentName);
    if (session.studentId) emitStudentArtifactEvent({ courseId: course.id, studentId: session.studentId, stageKey: "proposal", kind: "document-saved", artifactId: submission?.id, summary: "个人项目方案", content: [description, proposal.projectQuestion, proposal.implementationPlan].filter(Boolean).join("\n"), milestone: true });
    toast.success("个人项目方案已保存", { description: "你可以继续与 AI 伴学伙伴讨论，再提交教师校准。" });
  }

  return <div className="space-y-6">
    <header className="border-b border-[var(--pbl-border)] pb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--pbl-student)]">方案构思与校准</p>
          <h1 className="font-editorial mt-1 text-2xl font-semibold">先写出你的想法，再借助 AI 多角色反馈完善</h1>
        </div>
        <Pill tone={project?.teacherApproval?.status === "approved" ? "green" : project?.teacherApproval?.status === "revision" ? "orange" : "gray"}>{project?.teacherApproval?.status === "approved" ? "教师已确认" : project?.teacherApproval?.status === "revision" ? "需要修订" : "等待教师校准"}</Pill>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pbl-text-muted)]">用一段话写下你的项目想法，AI 伴学小组会从知识、启发、质疑、方案等角度帮你完善。最终方向和关键判断由你决定。</p>
    </header>
    {myFeedback.length ? <FeedbackLanes feedback={myFeedback} /> : null}

    {/* 主要输入：自由描述 */}
    <Card>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-stone-800">用一段话描述你的项目想法</span>
        <TextArea
          className="min-h-40"
          onChange={(event) => setDescription(event.target.value)}
          placeholder={"想做什么？为什么重要？打算怎样做？可以用任何方式写下来，不用分段。\n\n例如：我想做一个校园垃圾分类小游戏，因为很多同学不知道怎么正确分类。我打算先调查现有垃圾桶分布，再设计游戏关卡，最后在班会课试玩。我需要了解游戏设计和垃圾分类知识。可能的时间不够，AI 可以帮我查找资料和测试关卡。"}
          value={description}
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PrimaryButton type="button" variant="outline" onClick={askAiForHelp}>
          <Sparkles size={16} /> 让 AI 伴学小组帮我完善
        </PrimaryButton>
        <PrimaryButton type="button" variant="outline" onClick={extractFromDescription}>
          <Wand2 size={16} /> 从描述提取结构化要点
        </PrimaryButton>
        <span className="text-xs text-stone-400">提取后可在下方“方案详情”中修改</span>
      </div>
    </Card>

    {/* 结构化方案详情（可折叠） */}
    <Card>
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setDetailsOpen((v) => !v)}
      >
        <div>
          <span className="text-sm font-bold text-stone-900">方案详情</span>
          <span className="ml-2 text-xs text-stone-500">
            {complete ? "已完整 · 可提交校准" : "待补充"}
          </span>
        </div>
        {detailsOpen ? <ChevronUp size={18} className="text-stone-400" /> : <ChevronDown size={18} className="text-stone-400" />}
      </button>
      {detailsOpen ? (
        <div className="mt-4 grid gap-4">
          <label>
            <span className="mb-1.5 block text-sm font-semibold">我的项目问题 *</span>
            <TextInput onChange={(event) => setDraft((current) => ({ ...current, projectQuestion: event.target.value }))} placeholder="我真正想解决的具体问题是什么？" value={draft.projectQuestion} />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-semibold">核心成果形式 *</span>
            <TextInput onChange={(event) => setDraft((current) => ({ ...current, outcomeFormat: event.target.value }))} placeholder="例如：交互原型、调查报告、科普海报" value={draft.outcomeFormat} />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-semibold">实施计划 *</span>
            <TextArea className="min-h-28" onChange={(event) => setDraft((current) => ({ ...current, implementationPlan: event.target.value }))} placeholder="按顺序写出你准备怎样调研、设计、制作和检验" value={draft.implementationPlan} />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-sm font-semibold">需要掌握的知识 *</span>
              <TextArea className="min-h-20" onChange={(event) => setKnowledgeText(event.target.value)} placeholder="用逗号分隔" value={knowledgeText} />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-semibold">可能的风险与限制</span>
              <TextArea className="min-h-20" onChange={(event) => setRiskText(event.target.value)} placeholder="时间、数据、伦理、可行性等" value={riskText} />
            </label>
          </div>
          <label>
            <span className="mb-1.5 block text-sm font-semibold">AI 使用计划 *</span>
            <TextArea className="min-h-20" onChange={(event) => setDraft((current) => ({ ...current, aiUsePlan: event.target.value }))} placeholder="哪些环节请 AI 提问、解释或反馈？哪些关键工作必须由我完成？" value={draft.aiUsePlan} />
          </label>
        </div>
      ) : null}
    </Card>

    {/* 项目所有权 + 完整度 */}
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <div className="flex items-center gap-2 font-bold text-emerald-800"><ShieldCheck size={19} />项目所有权检查</div>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-600">
          <li className="flex gap-2"><CheckCircle2 className="mt-1 shrink-0 text-[var(--pbl-success)]" size={16} />由我提出问题并选择最终方向</li>
          <li className="flex gap-2"><CheckCircle2 className="mt-1 shrink-0 text-[var(--pbl-success)]" size={16} />由我完成核心制作与判断</li>
          <li className="flex gap-2"><Sparkles className="mt-1 shrink-0 text-[var(--pbl-ai)]" size={16} />AI 只提供解释、启发、质疑与反馈</li>
        </ul>
      </Card>
      <Card>
        <p className="text-sm font-semibold">方案完整度</p>
        <div className="mt-2 text-3xl font-bold text-[var(--pbl-student)]">{complete ? "已完整" : "待补充"}</div>
        <p className="mt-2 text-sm leading-6 text-stone-500">教师会重点检查你能否说明“为什么这样做”。</p>
      </Card>
    </div>

    <div className="flex justify-end">
      <PrimaryButton className="min-w-44" onClick={save}><Save size={18} />保存并提交校准</PrimaryButton>
    </div>
    <CompanionRoundtable course={course} stageKey="proposal" contextLabel="方案构思与校准" autoSendMessage={aiPrompt} />
  </div>;
}
