"use client";

import { useMemo, useState } from "react";
import { ChartColumn, Check, Clock3, FileText, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";
import { Card, Pill, PrimaryButton, ProgressBar } from "@/components/ui";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { AiSupportRecord, Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { type ArtifactFocus, diagnoseProjectArtifact } from "@/lib/teaching-ai/client-api";
import { StudentAiChatPanel } from "./ai-chat-panel";

const defaultDoc = "";

/** Strip HTML tags and return plain-text length for the word counter. */
function plainTextLength(html: string): number {
  if (typeof window === "undefined") return html.length;
  const div = window.document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").trim().length;
}

export function WorkspaceView({ course }: { course: Course }) {
  const session = useSession();
  const stageKey = course.stages[course.currentStageIndex]?.key ?? "make";
  const group = useMemo(() => course.groups?.find((item) => item.members.some((member) => member.studentId === session.studentId)) ?? course.groups?.[0], [course.groups, session.studentId]);
  const existing = course.submissions?.find((item) => item.groupId === group?.id && item.stageKey === stageKey && item.type === "document");
  const [documentText, setDocumentText] = useState(existing?.content ?? defaultDoc);
  const [aiCollapsed, setAiCollapsed] = useState(course.uiState?.aiPanelCollapsed ?? false);
  const [status, setStatus] = useState<string | null>(null);
  const feedback = (course.feedback ?? []).filter((item) => item.targetId === group?.id || item.targetId === session.studentId);
  const activity = (course.activityLog ?? []).slice(0, 6);
  const groupUploads = (course.uploads ?? []).filter((item) => item.groupId === group?.id);
  const groupTasks = (course.workPlan ?? []).filter((item) => item.groupId === group?.id);
  const latestArtifactSupport = (course.aiSupports ?? [])
    .filter((item) => item.groupId === group?.id && (item.kind === "artifact-diagnosis" || item.kind === "proposal-diagnosis"))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

  // 真实进度计算：基于当前学生的 stageProgress
  const myStageProgress = session.studentId
    ? (course.students.find((s) => s.id === session.studentId)?.stageProgress ?? {})
    : {};
  const stageKeys = course.stages.map((s) => s.key);
  const myOverallProgress = stageKeys.length > 0
    ? Math.round(stageKeys.reduce((acc, k) => acc + (myStageProgress[k] ?? 0), 0) / stageKeys.length)
    : 0;
  // 已完成的阶段数
  const completedStagesCount = stageKeys.filter((k) => (myStageProgress[k] ?? 0) >= 100).length;

  // 待办数：从 course.todos 中统计学生已完成
  const myTodos = course.todos ?? [];
  const completedTodos = myTodos.filter((t) => session.studentId && t.completedBy.includes(session.studentId)).length;

  function saveDocument(action = "保存项目文档") {
    session.upsertSubmission({
      courseId: course.id,
      stageKey,
      type: "document",
      title: "项目设计报告",
      content: documentText,
      groupId: group?.id,
    });
    session.addActivity(course.id, action, "项目设计报告已更新", group?.name ?? "学生小组");
    session.updateStudentProgress(stageKey, 75);
    setStatus("已保存");
  }

  function submitDocument() {
    session.upsertSubmission({
      courseId: course.id,
      stageKey,
      type: "document",
      title: "项目设计报告",
      content: documentText,
      groupId: group?.id,
    });
    session.addActivity(course.id, "提交项目方案", "小组已提交项目设计报告", group?.name ?? "学生小组");
    session.updateStudentProgress(stageKey, 100);
    setStatus("已提交");
  }

  function applyAdvice(text: string, support?: AiSupportRecord) {
    const nextText = `${documentText}<p><strong>采纳的修改方向：</strong>${text}</p>`;
    setDocumentText(nextText);
    session.upsertSubmission({
      courseId: course.id,
      stageKey,
      type: "document",
      title: "项目设计报告",
      content: nextText,
      groupId: group?.id,
    });
    session.addActivity(course.id, "采纳AI支架建议", "作品已根据支架建议补充修改方向", group?.name ?? "学生小组");
    session.updateStudentProgress(stageKey, 85);
    setStatus("已采纳并保存修改");
    if (support) {
      session.upsertAiSupport({
        ...support,
        status: "student-applied",
      });
    }
  }

  async function runArtifactCheck(focus: ArtifactFocus) {
    if (!group) return;
    setStatus("AI 正在诊断当前作品...");
    try {
      const draft = await diagnoseProjectArtifact({
        course,
        group,
        stageKey,
        documentHtml: documentText,
        uploads: groupUploads,
        tasks: groupTasks,
        focus,
      });
      session.upsertAiSupport({
        ...draft,
        courseId: course.id,
        studentId: session.studentId,
        studentName: session.studentName ?? session.user.name,
      });
      session.updateStudentProgress(stageKey, Math.max(80, myStageProgress[stageKey] ?? 0));
      // 同时置位 aiAnalysisPending，提醒教师有新数据可刷新
      session.setUiState(course.id, { aiAnalysisPending: true });
      setStatus(draft.source === "llm" ? "已生成 AI 诊断" : "已生成诊断（本地兜底）");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "AI 诊断失败");
    }
  }

  async function handleFileUpload(file: File) {
    if (!group) return;
    setStatus("上传中...");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      if (!res.ok) throw new Error(`上传失败 (${res.status})`);
      const data = await res.json();
      if (!data?.id || !data?.url) throw new Error("上传响应异常");
      session.upsertUpload({
        id: data.id,
        courseId: course.id,
        groupId: group.id,
        studentId: session.studentId,
        studentName: session.studentName ?? session.user.name,
        stageKey,
        category: "artifact",
        title: file.name,
        fileName: data.fileName,
        fileType: data.fileType,
        size: data.size,
        url: data.url,
      });
      session.upsertSubmission({
        courseId: course.id,
        stageKey,
        type: "evidence",
        title: `上传文件：${file.name}`,
        content: `文件上传：${data.fileName}`,
        groupId: group.id,
        files: [{ name: data.fileName, type: data.fileType, size: data.size, url: data.url }],
      });
      session.addActivity(course.id, "上传文件", data.fileName, group.name ?? "学生小组");
      setStatus("文件已上传");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "上传失败");
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="grid gap-6 lg:grid-cols-[1fr_220px_1fr] lg:items-center">
          <div><div className="text-sm text-slate-500">当前项目</div><div className="mt-2 flex items-center gap-4"><h1 className="text-2xl font-black">{course.name}</h1><Pill tone="green">进行中</Pill></div></div>
          <div className="border-l border-slate-200 pl-6"><div className="text-sm text-slate-500">剩余时间</div><div className="mt-2 flex items-center gap-2 text-2xl font-black"><Clock3 size={24} /> {completedStagesCount}/{stageKeys.length} 阶段</div><div className="mt-1 text-sm text-slate-500">已完成 {completedStagesCount} 个阶段</div></div>
          <div className="border-l border-slate-200 pl-6"><div className="mb-3 text-sm font-semibold text-slate-600">整体进度</div><div className="flex items-center gap-4"><ProgressBar className="h-3 flex-1" value={myOverallProgress} /><span className="text-lg font-bold">{myOverallProgress}%</span></div><div className="mt-2 text-sm text-slate-500">已完成 {completedTodos}/{myTodos.length} 项任务</div></div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="p-6">
              <h1 className="text-[26px] font-black">项目方案编辑区</h1>
              <div className="mt-5">
                <RichTextEditor value={documentText} onChange={setDocumentText} onFileUpload={handleFileUpload} placeholder="在此编写项目方案内容，支持文字格式化、列表、表格、图片等..." />
              </div>
            </div>
            <div className="flex h-10 items-center justify-between border-t border-slate-100 px-5 text-sm text-slate-500">
              <span>字数：{plainTextLength(documentText)}{group?.keywords?.length ? ` · 主题词：${group.keywords.join("、")}` : ""}</span>
              <span className="inline-flex items-center gap-1 text-emerald-600">本地可保存 <Check size={16} /></span>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-xl font-black">修改建议（{feedback.length}）</h2>
            <div className="space-y-3">
              {feedback.map((item) => (
                <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-3" key={item.id}>
                  <Pill tone={item.kind === "revision" ? "orange" : item.kind === "praise" ? "green" : "blue"}>{item.kind}</Pill>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{item.content}</p>
                  <div className="mt-2 text-xs text-slate-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</div>
                </div>
              ))}
              {!feedback.length ? <div className="rounded-[8px] border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">暂无教师修改建议</div> : null}
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">AI任务支架</h2>
              <button className="text-sm font-semibold text-blue-700" onClick={() => { setAiCollapsed((value) => !value); session.setUiState(course.id, { aiPanelCollapsed: !aiCollapsed }); }} type="button">
                {aiCollapsed ? "展开" : "收起"}
              </button>
            </div>
            {!aiCollapsed ? (
              <>
                <div className="grid gap-2">
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] border border-blue-200 text-sm font-semibold text-blue-700 hover:bg-blue-50" onClick={() => runArtifactCheck("steps")} type="button">
                    <ChartColumn size={16} /> 检查实施步骤
                  </button>
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] border border-emerald-200 text-sm font-semibold text-emerald-700 hover:bg-emerald-50" onClick={() => runArtifactCheck("evidence")} type="button">
                    <FileText size={16} /> 查找证据缺口
                  </button>
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] border border-orange-200 text-sm font-semibold text-orange-700 hover:bg-orange-50" onClick={() => runArtifactCheck("risk")} type="button">
                    <ShieldCheck size={16} /> 扫描风险与伦理
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {latestArtifactSupport ? (
                    <div className="rounded-[8px] border border-slate-200 p-4">
                      <div className="mb-2 flex gap-3">
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-blue-50 text-blue-600"><Sparkles size={18} /></div>
                        <div>
                          <div className="font-black">{latestArtifactSupport.trigger}</div>
                          <div className="text-xs text-slate-400">{latestArtifactSupport.status === "student-applied" ? "已采纳" : "待处理"}</div>
                        </div>
                      </div>
                      <p className="text-sm leading-6 text-slate-600">{latestArtifactSupport.diagnosis}</p>
                      <div className="mt-3 space-y-2">
                        {latestArtifactSupport.suggestions.slice(0, 3).map((item) => (
                          <button className="block w-full rounded-[6px] border border-slate-200 px-3 py-2 text-left text-sm leading-6 text-slate-700 hover:border-blue-300 hover:bg-blue-50/40" key={item} onClick={() => applyAdvice(item, latestArtifactSupport)} type="button">
                            {item}
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 rounded-[6px] bg-slate-50 p-2 text-xs leading-5 text-slate-500">
                        依据：{latestArtifactSupport.evidence.join("；")}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[8px] border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                      选择一个与当前作品相关的检查动作，AI 会基于文档、任务和上传材料给出可修改建议。
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-5 text-xl font-black">过程记录</h2>
            <div className="space-y-4">
              {activity.map((item, index) => (
                <div className="relative flex gap-3" key={item.id}>
                  <span className={index === 0 ? "mt-1 h-3 w-3 rounded-full bg-emerald-500" : "mt-1 h-3 w-3 rounded-full bg-slate-300"} />
                  <div><div className="font-bold">{item.actor} {item.action}</div>{item.detail ? <div className="mt-1 text-sm text-slate-500">{item.detail}</div> : null}</div>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>
      <div className="flex items-center justify-end gap-3">{status ? <Pill tone="green">{status}</Pill> : null}<PrimaryButton variant="outline" onClick={() => saveDocument()}>保存当前项目文档</PrimaryButton><PrimaryButton tone="green" onClick={submitDocument}>提交方案</PrimaryButton></div>
      <StudentAiChatPanel course={course} stageKey="workspace" contextLabel="项目制作" />
    </div>
  );
}
