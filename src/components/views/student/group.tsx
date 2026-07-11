﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, BarChart3, CheckCircle2, ClipboardCheck, FileText, Image as ImageIcon, Lightbulb, Megaphone, PenLine, Plus, Save, Trash2, Video, Wand2 } from "lucide-react";
import { AvatarStack } from "@/components/dashboard-shell";
import { Card, Pill, PrimaryButton, ProgressBar, Select, TextArea, TextInput, toast } from "@/components/ui";
import { useSession } from "@/lib/session/store";
import type { Course, ProjectGroup } from "@/lib/session/types";
import { diagnoseGroupIdea } from "@/lib/teaching-ai/client-api";
import { GroupBoardEditor } from "./group-board-editor";
import { CompanionRoundtable } from "./companion-roundtable";

const forms = [
  { label: "方案报告", icon: FileText, color: "bg-blue-600" },
  { label: "海报手册", icon: ImageIcon, color: "bg-emerald-600" },
  { label: "短视频", icon: Video, color: "bg-violet-600" },
  { label: "数据看板", icon: BarChart3, color: "bg-orange-500" },
];
// 通用构思引导问题：与具体主题无关，用于在没有 LLM 接入时
// 引导小组讨论方向。完整 AI 建议将在 LLM 接入后基于课程内容生成。
const brainstormBatches = [
  [
    "明确你们要解决的核心问题：目标用户是谁？痛点有多严重？",
    "把大目标拆成 3 个可执行的小步骤，估算每步所需的时间和资源。",
    "用调研数据或观察记录证明问题规模，再设计解决路径。",
  ],
  [
    "先做小范围试点（一个班级 / 一个楼层 / 一周时间），再考虑推广。",
    "讨论成果形式：哪种最能有效呈现你们的结论？为什么？",
    "给每个角色设置可检查的交付物，减少协作空转。",
  ],
  [
    "列出方案可能遇到的最大风险，并为每个风险准备一个备选方案。",
    "在汇报前安排一次组内试讲，互相提出 2 条改进意见。",
    "用一张数据表跟踪每位成员的任务状态，每周同步一次。",
  ],
];
const commonRoles = ["组长", "调研员", "设计师", "数据分析师", "汇报人", "记录员"];

export function GroupView({ course }: { course: Course }) {
  const session = useSession();
  const [status, setStatus] = useState<string | null>(null);
  const [editingTopic, setEditingTopic] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [promptBatch, setPromptBatch] = useState(0);
  const [taskDraft, setTaskDraft] = useState({ role: "", memberName: "", task: "" });
  const [rejectingSuggestion, setRejectingSuggestion] = useState<string>();
  const [rejectionReason, setRejectionReason] = useState("");
  const [editingSuggestion, setEditingSuggestion] = useState<string>();
  const [editedSuggestion, setEditedSuggestion] = useState("");

  // Find the group that THIS student belongs to. Do NOT fall back to
  // course.groups[0], because that would show another group's data when
  // the student hasn't been assigned to any group yet.
  const maybeGroup = useMemo(() => {
    return course.groups?.find((item) => item.members.some((member) => member.studentId === session.studentId));
  }, [course.groups, session.studentId]);

  if (!maybeGroup) {
    return (
      <Card className="text-center">
        <h2 className="text-2xl font-black">还没有小组</h2>
        <p className="mt-2 text-sm text-slate-500">先创建或加入一个小组，再进入构思阶段。</p>
        <PrimaryButton className="mt-5" onClick={() => {
          const groupName = session.studentName ? `${session.studentName}的小组` : "新小组";
          const next = session.createGroup(course.id, groupName);
          session.joinGroup(course.id, next.id, "组长");
        }}>
          <Plus size={18} /> 创建并加入小组
        </PrimaryButton>
      </Card>
    );
  }

  const group: ProjectGroup = maybeGroup;
  const tasks = (course.workPlan ?? []).filter((item) => item.groupId === group.id);
  const announcements = (course.groupAnnouncements ?? []).filter((item) => item.groupId === group.id);
  const latestIdeaSupport = (course.aiSupports ?? [])
    .filter((item) => item.groupId === group.id && item.kind === "idea-check")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

  function updateGroup(patch: Partial<ProjectGroup>) {
    session.setGroupTopic(course.id, group.id, patch);
  }

  function toggleForm(label: string) {
    const selectedForms = group.selectedForms.includes(label)
      ? group.selectedForms.filter((item) => item !== label)
      : [...group.selectedForms, label];
    updateGroup({ selectedForms });
  }

  function saveIdea(generated = false) {
    session.upsertSubmission({
      stageKey: "group",
      type: "idea",
      title: generated ? "AI方案检查记录" : "小组构思",
      content: `当前方向：${group.topic}；成果形式：${group.selectedForms.join("、") || "方案报告"}；目标：${group.goal || "待完善"}`,
      groupId: group.id,
    });
    session.updateStudentProgress("group", generated ? 85 : 65);
    setStatus(generated ? "已保存 AI 方案检查记录" : "小组构思已保存");
  }

  async function checkIdea() {
    setStatus("AI 正在检查方案...");
    try {
      const draft = await diagnoseGroupIdea({ course, group, tasks });
      session.upsertAiSupport({
        ...draft,
        courseId: course.id,
        studentId: session.studentId,
        studentName: session.studentName ?? session.user.name,
      });
      session.upsertSubmission({
        courseId: course.id,
        stageKey: "group",
        type: "idea",
        title: "AI方案检查记录",
        content: `${draft.diagnosis}\n建议：${draft.suggestions.join("；")}\n依据：${draft.evidence.join("；")}`,
        groupId: group.id,
      });
      session.updateStudentProgress("group", 85);
      // 提醒教师有新数据可刷新
      session.setUiState(course.id, { aiAnalysisPending: true });
      setStatus("已完成 AI 方案检查");
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI 方案检查失败";
      setStatus(message);
      toast.error("AI 方案建议生成失败", { description: message });
    }
  }

  function publishGroupAnnouncement() {
    if (!announcementTitle.trim() || !announcementContent.trim()) return;
    session.upsertGroupAnnouncement(course.id, { groupId: group.id, title: announcementTitle.trim(), content: announcementContent.trim() });
    setAnnouncementTitle("");
    setAnnouncementContent("");
  }

  function addTask() {
    if (!taskDraft.role.trim() || !taskDraft.memberName.trim() || !taskDraft.task.trim()) return;
    session.upsertWorkPlanItem(course.id, { groupId: group.id, role: taskDraft.role.trim(), memberName: taskDraft.memberName.trim(), task: taskDraft.task.trim(), progress: 0 });
    setTaskDraft({ role: "", memberName: "", task: "" });
  }

  // Pre-populate member dropdown options from real group members
  const memberOptions = group.members.map((m) => ({ value: m.name, label: m.name }));
  const proposal = group.proposal ?? {
    projectQuestion: group.topic,
    outcomeFormat: group.selectedForms.join("、"),
    implementationPlan: group.goal ?? "",
    requiredKnowledge: group.keywords,
    aiUsePlan: "",
    risks: [],
  };
  function updateProposal(patch: Partial<typeof proposal>) {
    updateGroup({ proposal: { ...proposal, ...patch } });
  }
  function decideSuggestion(suggestion: string, decision: "adopted" | "adopted-after-edit" | "rejected", appliedText = suggestion) {
    if (!latestIdeaSupport) return;
    const before = proposal.implementationPlan;
    const after = decision === "rejected" ? before : `${before}${before ? "\n" : ""}${appliedText}`;
    if (decision !== "rejected") updateProposal({ implementationPlan: after });
    session.upsertAiSupport({ ...latestIdeaSupport, status: decision === "rejected" ? "dismissed" : "student-applied", adoption: { decision, reason: decision === "rejected" ? rejectionReason.trim() : undefined, before, after, handledBy: session.studentName ?? session.user.name, handledAt: new Date().toISOString() } });
    setRejectingSuggestion(undefined); setRejectionReason(""); setEditingSuggestion(undefined); setEditedSuggestion("");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <button className="grid h-10 w-10 place-items-center rounded-[6px] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" onClick={() => window.history.back()} type="button">
          <ArrowLeft size={18} />
        </button>
        <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Lightbulb size={27} /></div>
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-black leading-tight md:text-4xl">{group.name}</h1>
          <p className="text-sm text-slate-500">{group.members.length} 名成员 · {group.topic}</p>
        </div>
        <AvatarStack names={group.members.map((member) => member.name)} />
        <button className="ml-auto inline-flex h-10 items-center gap-2 rounded-[6px] border border-blue-200 px-4 font-semibold text-blue-700 hover:bg-blue-50" onClick={() => setAnnouncementOpen((value) => !value)} type="button">
          <Megaphone size={18} /> 组内公告
        </button>
      </div>

      {announcementOpen ? (
        <Card>
          <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
            <div className="space-y-3">
              <h2 className="text-lg font-black">发布组内公告</h2>
              <TextInput placeholder="公告标题" value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} />
              <TextArea className="min-h-24" placeholder="公告内容" value={announcementContent} onChange={(event) => setAnnouncementContent(event.target.value)} />
              <PrimaryButton className="w-full" onClick={publishGroupAnnouncement}>发布</PrimaryButton>
            </div>
            <div className="space-y-2">
              {announcements.map((item) => (
                <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-3" key={item.id}>
                  <div className="font-bold">{item.title}</div>
                  <p className="mt-1 text-sm text-slate-600">{item.content}</p>
                  <div className="mt-2 text-xs text-slate-400">{item.actor} · {new Date(item.createdAt).toLocaleString("zh-CN")}</div>
                </div>
              ))}
              {!announcements.length ? <div className="rounded-[8px] border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">暂无组内公告</div> : null}
            </div>
          </div>
        </Card>
      ) : null}

      <section className="border-y border-[var(--pbl-border)] py-6">
        <div className="mb-5"><p className="text-sm font-semibold text-[var(--pbl-student)]">结构化项目方案</p><h2 className="font-editorial mt-1 text-2xl font-semibold">让每个决定都能被讨论、修改和追溯</h2></div>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="text-sm font-semibold">项目问题<TextArea className="mt-2 min-h-24" onChange={(event) => updateProposal({ projectQuestion: event.target.value })} value={proposal.projectQuestion} /></label>
          <label className="text-sm font-semibold">成果形式<TextArea className="mt-2 min-h-24" onChange={(event) => updateProposal({ outcomeFormat: event.target.value })} value={proposal.outcomeFormat} /></label>
          <label className="text-sm font-semibold">实施计划<TextArea className="mt-2 min-h-28" onChange={(event) => updateProposal({ implementationPlan: event.target.value })} value={proposal.implementationPlan} /></label>
          <label className="text-sm font-semibold">所需知识<span className="ml-2 text-xs font-normal text-[var(--pbl-text-muted)]">每行一项</span><TextArea className="mt-2 min-h-28" onChange={(event) => updateProposal({ requiredKnowledge: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} value={proposal.requiredKnowledge.join("\n")} /></label>
          <label className="text-sm font-semibold">AI 使用计划<TextArea className="mt-2 min-h-28" onChange={(event) => updateProposal({ aiUsePlan: event.target.value })} placeholder="我们在哪些环节需要知识补充、诊断或案例？哪些判断必须由小组完成？" value={proposal.aiUsePlan} /></label>
          <label className="text-sm font-semibold">风险与困难<span className="ml-2 text-xs font-normal text-[var(--pbl-text-muted)]">每行一项</span><TextArea className="mt-2 min-h-28" onChange={(event) => updateProposal({ risks: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} value={proposal.risks.join("\n")} /></label>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(20rem,1fr)]">
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-black">选题 / 方向</h2>
            <button className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700" onClick={() => setEditingTopic((value) => !value)} type="button">
              <PenLine size={15} /> {editingTopic ? "完成" : "编辑"}
            </button>
          </div>
          {editingTopic ? (
            <div className="space-y-3">
              <TextInput value={group.topic} onChange={(event) => updateGroup({ topic: event.target.value })} />
              <TextArea className="min-h-24" value={group.goal ?? ""} onChange={(event) => updateGroup({ goal: event.target.value })} />
              <TextInput value={group.keywords.join("、")} onChange={(event) => updateGroup({ keywords: event.target.value.split(/[、,\s]+/).filter(Boolean) })} />
            </div>
          ) : (
            <div className="space-y-5">
              <div><div className="text-sm text-slate-500">当前方向</div><div className="mt-2 text-xl font-black">{group.topic}</div></div>
              <div><div className="text-sm text-slate-500">目标</div><p className="mt-2 text-[15px] text-slate-700">{group.goal}</p></div>
              <div><div className="mb-2 text-sm text-slate-500">关键词</div><div className="flex flex-wrap gap-2">{group.keywords.map((tag) => <Pill key={tag} tone="gray">{tag}</Pill>)}</div></div>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-5 text-xl font-black">成果形式选择 <span className="text-base font-medium text-slate-500">（可多选）</span></h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {forms.map(({ label, icon: Icon, color }) => {
              const selected = group.selectedForms.includes(label);
              return (
                <button className={`relative flex h-32 flex-col items-center justify-center gap-3 rounded-[8px] border text-base font-black transition sm:h-[8.5rem] ${selected ? "border-blue-600 bg-blue-50 text-slate-950" : "border-slate-200 bg-white hover:border-blue-300"}`} key={label} onClick={() => toggleForm(label)} type="button">
                  <span className={`grid h-11 w-11 place-items-center rounded-[5px] text-white ${color}`}>
                    <Icon size={22} strokeWidth={2.2} />
                  </span>
                  {label}
                  {selected ? <CheckCircle2 className="absolute right-2 top-2 text-blue-600" size={18} /> : null}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xl font-black">方案构思检查器</h2>
            <button className="text-sm font-semibold text-blue-700" onClick={checkIdea} type="button">刷新诊断</button>
          </div>
          <p className="mb-4 text-xs text-slate-400">
            读取当前选题、目标、成果形式和分工，只给检查与修改建议，不代写方案。
          </p>
          {latestIdeaSupport ? (
            <div className="space-y-4">
              <div className="rounded-[8px] border border-blue-100 bg-blue-50/70 p-3">
                <div className="mb-1 flex items-center gap-2 font-black text-blue-800"><ClipboardCheck size={17} /> 诊断结论</div>
                <p className="text-sm leading-6 text-slate-700">{latestIdeaSupport.diagnosis}</p>
              </div>
              <div className="space-y-3">
                {latestIdeaSupport.suggestions.map((item, index) => (
                  <div className="flex gap-3 text-[15px] leading-7" key={item}>
                    <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-black text-blue-700">{index + 1}</span>
                    <div className="flex-1"><p>{item}</p><div className="mt-2 flex flex-wrap gap-2"><button className="min-h-9 rounded-[var(--radius-xs)] border border-[var(--pbl-student)] px-3 text-xs font-semibold text-[var(--pbl-student)]" onClick={() => decideSuggestion(item, "adopted")} type="button">采纳到实施计划</button><button className="min-h-9 px-3 text-xs font-semibold text-[var(--pbl-student)]" onClick={() => { setEditingSuggestion(item); setEditedSuggestion(item); }} type="button">修改后采纳</button><button className="min-h-9 px-3 text-xs font-semibold text-[var(--pbl-text-muted)]" onClick={() => setRejectingSuggestion(item)} type="button">不采纳</button></div>{editingSuggestion === item ? <div className="mt-2 flex flex-col gap-2 sm:flex-row"><TextInput onChange={(event) => setEditedSuggestion(event.target.value)} value={editedSuggestion} /><button className="min-h-11 shrink-0 rounded-[var(--radius-xs)] bg-[var(--pbl-student)] px-3 text-xs font-semibold text-white" disabled={!editedSuggestion.trim()} onClick={() => decideSuggestion(item, "adopted-after-edit", editedSuggestion.trim())} type="button">保存并采纳</button></div> : null}{rejectingSuggestion === item ? <div className="mt-2 flex flex-col gap-2 sm:flex-row"><TextInput onChange={(event) => setRejectionReason(event.target.value)} placeholder="说明不采纳的理由" value={rejectionReason} /><button className="min-h-11 shrink-0 rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] px-3 text-xs font-semibold text-white" disabled={!rejectionReason.trim()} onClick={() => decideSuggestion(item, "rejected")} type="button">记录决定</button></div> : null}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                依据：{latestIdeaSupport.evidence.join("；")}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {brainstormBatches[promptBatch].map((item, index) => (
                <div className="flex gap-3 text-[15px] leading-7" key={item}>
                  <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-black text-blue-700">{index + 1}</span>
                  <p>{item}</p>
                </div>
              ))}
              <button className="text-sm font-semibold text-blue-700" onClick={() => setPromptBatch((value) => (value + 1) % brainstormBatches.length)} type="button">换一批通用提示</button>
            </div>
          )}
        </Card>
      </div>

      {/* Collaborative mind map + whiteboard (tldraw-based). Replaces the legacy
          absolute-positioned div whiteboard. */}
      <GroupBoardEditor course={course} groupId={group.id} />

      <Card>
        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">分工计划表</h2><Pill tone="blue">{tasks.length} 项</Pill></div>
        <div className="overflow-hidden rounded-[8px] border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead><tr className="bg-slate-50 text-slate-600"><th className="p-3 font-semibold">角色</th><th className="p-3 font-semibold">成员</th><th className="p-3 font-semibold">主要任务</th><th className="p-3 font-semibold">进度</th><th className="p-3" /></tr></thead>
            <tbody>
              {tasks.map((item) => (
                <tr className="border-b border-slate-100 last:border-b-0" key={item.id}>
                  <td className="p-3 font-semibold">{item.role}</td>
                  <td className="p-3">{item.memberName}</td>
                  <td className="p-3 text-slate-600">{item.task}</td>
                  <td className="p-3"><button className="flex w-full items-center gap-2" onClick={() => session.upsertWorkPlanItem(course.id, { ...item, progress: Math.min(100, item.progress + 10) })} type="button"><ProgressBar className="w-20" tone={item.progress === 100 ? "green" : "blue"} value={item.progress} /><span className="w-9 text-right">{item.progress}%</span></button></td>
                  <td className="p-3"><button className="text-slate-400 hover:text-red-500" onClick={() => session.deleteWorkPlanItem(course.id, item.id)} type="button"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
          <Select value={taskDraft.role} onChange={(event) => setTaskDraft((draft) => ({ ...draft, role: event.target.value }))} aria-label="选择角色">
            <option value="">选择角色</option>
            {commonRoles.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
          <Select value={taskDraft.memberName} onChange={(event) => setTaskDraft((draft) => ({ ...draft, memberName: event.target.value }))} aria-label="选择成员" disabled={!memberOptions.length}>
            <option value="">{memberOptions.length ? "选择成员" : "暂无组员"}</option>
            {memberOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
          <TextInput placeholder="任务描述" value={taskDraft.task} onChange={(event) => setTaskDraft((draft) => ({ ...draft, task: event.target.value }))} />
          <button className="inline-flex h-11 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50" onClick={addTask} disabled={!taskDraft.role || !taskDraft.memberName || !taskDraft.task} type="button"><Plus size={15} /> 添加</button>
        </div>
        {!memberOptions.length ? <p className="mt-2 text-xs text-amber-700">本组暂无成员，请先邀请同学加入小组，再分配任务。</p> : null}
      </Card>

      <div className="flex min-h-[88px] flex-wrap items-center justify-center gap-5 rounded-[10px] border border-slate-200/80 bg-white px-6 py-5">
        {status ? <Pill tone="green">{status}</Pill> : null}
        <PrimaryButton className="min-w-[16rem] flex-1 sm:flex-none" onClick={() => saveIdea(false)} variant="outline"><Save size={21} /> 保存构思</PrimaryButton>
        <PrimaryButton className="min-w-[16rem] flex-1 sm:flex-none" onClick={checkIdea}><Wand2 size={21} /> 检查方案完整性</PrimaryButton>
      </div>
      <CompanionRoundtable course={course} stageKey="group" contextLabel="小组构思" />
    </div>
  );
}
