"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  CheckCircle2,
  ExternalLink,
  FileArchive,
  FileText,
  History,
  NotebookPen,
  Save,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { emitStudentArtifactEvent } from "@/lib/companion/events";
import { appendCompanionContribution, type CompanionWorkspacePatch } from "@/lib/companion/workspace-operation";
import { getCompanion, type AiCompanionId } from "@/lib/ai-companions";
import type { CompanionConfirmation, Course, CourseUpload } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { StudentStageView } from "./stage-dispatcher";
import { StudentActionConfirmationDialog, useStudentActionConfirmation } from "./student-confirmation";

type WorkbenchTab = "stage" | "notes" | "materials";

const STAGE_DOCUMENT_COPY: Record<string, { title: string; placeholder: string }> = {
  proposal: {
    title: "方案判断笔记",
    placeholder: "记录你为什么选择这个方向、采纳或拒绝了哪些建议，以及还要核验什么……",
  },
  make: {
    title: "制作与迭代笔记",
    placeholder: "记录本次修改、测试结果、证据来源、AI 建议处理方式和下一步……",
  },
  showcase: {
    title: "汇报准备笔记",
    placeholder: "记录成果亮点、关键证据、局限和答辩时需要说明的内容……",
  },
  reflection: {
    title: "反思证据备忘",
    placeholder: "先记录真实发生的行动、结果、AI 支持和你的判断，再完成个人反思……",
  },
};

type PendingWorkspacePatch = CompanionWorkspacePatch & { companionId: AiCompanionId };

function readWorkspacePatches(confirmation: CompanionConfirmation): PendingWorkspacePatch[] {
  const payload = confirmation.payload;
  if (payload?.kind !== "workspace-patches" || !Array.isArray(payload.patches)) return [];
  return payload.patches.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const patch = value as Record<string, unknown>;
    if (
      patch.mode !== undefined && patch.mode !== "append"
      || typeof patch.companionId !== "string"
      || typeof patch.title !== "string"
      || typeof patch.content !== "string"
      || typeof patch.reviewInstruction !== "string"
    ) {
      return [];
    }
    return [{
      mode: "append" as const,
      companionId: patch.companionId as AiCompanionId,
      title: patch.title,
      content: patch.content,
      reviewInstruction: patch.reviewInstruction,
    }];
  });
}

export function StudioProjectWorkbench({ course, stageKey }: { course: Course; stageKey: string }) {
  const session = useSession();
  const stage = course.stages[course.currentStageIndex];
  const studentId = session.studentId ?? "";
  const group = useMemo(
    () => course.groups?.find((item) => item.members.some((member) => member.studentId === studentId)),
    [course.groups, studentId],
  );
  const existingNotebook = useMemo(
    () => (course.submissions ?? [])
      .filter((submission) => submission.stageKey === stageKey && submission.type === "document")
      .filter((submission) => submission.studentId === studentId || (group && submission.groupId === group.id))
      .filter((submission) =>
        submission.id === `studio-notes-${studentId}-${stageKey}`
        || submission.id === `studio-document-${studentId}-${stageKey}`
        || /笔记|协作文档/.test(submission.title),
      )
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0],
    [course.submissions, group, stageKey, studentId],
  );
  const uploads = useMemo(
    () => (course.uploads ?? [])
      .filter((upload) => upload.stageKey === stageKey)
      .filter((upload) => upload.studentId === studentId || (group && upload.groupId === group.id))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [course.uploads, group, stageKey, studentId],
  );
  const feedback = useMemo(
    () => (course.feedback ?? [])
      .filter((item) => item.stageKey === stageKey)
      .filter((item) => item.targetId === studentId || (group && item.targetId === group.id)),
    [course.feedback, group, stageKey, studentId],
  );
  const processRecords = useMemo(
    () => (course.companionProcessRecords ?? [])
      .filter((record) => record.studentId === studentId && record.stageKey === stageKey)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 12),
    [course.companionProcessRecords, stageKey, studentId],
  );
  const pendingSuggestions = useMemo(
    () => (course.companionConfirmations ?? [])
      .filter((item) =>
        item.studentId === studentId
        && item.stageKey === stageKey
        && item.action === "adopt-draft"
        && item.status === "pending",
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [course.companionConfirmations, stageKey, studentId],
  );
  const copy = STAGE_DOCUMENT_COPY[stageKey] ?? {
    title: "项目过程笔记",
    placeholder: "记录当前阶段的判断、证据、修改和下一步……",
  };
  const [tab, setTab] = useState<WorkbenchTab>("stage");
  const [documentText, setDocumentText] = useState(existingNotebook?.content ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const loadedDocumentRef = useRef(existingNotebook?.content ?? "");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const confirmation = useStudentActionConfirmation({ course, stageKey });

  useEffect(() => {
    const latest = existingNotebook?.content ?? "";
    if (documentText === loadedDocumentRef.current) {
      setDocumentText(latest);
    }
    loadedDocumentRef.current = latest;
  }, [documentText, existingNotebook?.content, existingNotebook?.updatedAt]); // Keep unsaved student edits when an external update arrives.

  function performSave() {
    const submission = session.upsertSubmission({
      id: existingNotebook?.id ?? `studio-notes-${studentId}-${stageKey}`,
      courseId: course.id,
      studentId,
      studentName: session.studentName ?? session.user.name,
      groupId: group?.id,
      stageKey,
      type: "document",
      title: copy.title,
      content: documentText,
    });
    loadedDocumentRef.current = documentText;
    session.addActivity(course.id, "保存项目笔记", copy.title, session.studentName ?? "学生");
    emitStudentArtifactEvent({
      courseId: course.id,
      studentId,
      stageKey,
      kind: "document-saved",
      artifactId: submission?.id,
      summary: copy.title,
      content: documentText,
    });
    setStatus("项目笔记已同步");
  }

  function requestSave() {
    confirmation.request({
      action: existingNotebook ? "overwrite" : "save",
      title: existingNotebook ? `更新${copy.title}` : `保存${copy.title}`,
      summary: "项目笔记用于记录判断和过程，不会替代当前阶段的正式成果提交。教师与伴学伙伴会读取最新内容。",
      payload: { submissionId: existingNotebook?.id, stageKey, title: copy.title },
      onConfirm: performSave,
    });
  }

  function resolveSuggestion(item: CompanionConfirmation, decision: "accepted" | "rejected") {
    const reason = decisionReasons[item.id]?.trim();
    if (!reason) {
      setStatus("请先说明你采纳或拒绝这条建议的理由");
      return;
    }
    const patches = readWorkspacePatches(item);
    const task = (course.companionTasks ?? []).find((candidate) => candidate.id === item.taskId);
    if (decision === "accepted" && !patches.length) {
      setStatus("这条建议缺少可写入内容，请拒绝后重新向伙伴说明需求");
      return;
    }

    if (decision === "accepted" && patches.length) {
      let nextContent = documentText;
      patches.forEach((patch) => {
        nextContent = appendCompanionContribution({
          existingContent: nextContent,
          patch,
          companionId: patch.companionId,
          companionName: getCompanion(patch.companionId).name,
          taskId: item.taskId ?? item.id,
        });
      });
      const submission = session.upsertSubmission({
        id: existingNotebook?.id ?? `studio-notes-${studentId}-${stageKey}`,
        courseId: course.id,
        studentId,
        studentName: session.studentName ?? session.user.name,
        groupId: group?.id,
        stageKey,
        type: "document",
        title: copy.title,
        content: nextContent,
      });
      setDocumentText(nextContent);
      loadedDocumentRef.current = nextContent;
      emitStudentArtifactEvent({
        courseId: course.id,
        studentId,
        stageKey,
        kind: "document-saved",
        artifactId: submission?.id,
        summary: `学生采纳 AI 草稿建议：${patches.map((patch) => patch.title).join("、")}`,
        content: nextContent,
      });
    }

    session.resolveCompanionConfirmation(course.id, item.id, decision === "accepted" ? "confirmed" : "rejected");
    session.addCompanionProcessRecord({
      courseId: course.id,
      studentId,
      stageKey,
      title: decision === "accepted" ? "学生采纳了 AI 草稿建议" : "学生拒绝了 AI 草稿建议",
      summary: `理由：${reason}`,
      source: "student",
      taskId: item.taskId,
    });
    if (task) {
      session.upsertCompanionTask({
        ...task,
        status: decision === "accepted" ? "saved" : "result",
        result: `${task.result ?? ""}\n学生${decision === "accepted" ? "采纳" : "拒绝"}：${reason}`.trim(),
      });
    }
    session.addActivity(
      course.id,
      decision === "accepted" ? "采纳 AI 草稿建议" : "拒绝 AI 草稿建议",
      reason,
      session.studentName ?? "学生",
    );
    setDecisionReasons((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setStatus(decision === "accepted" ? "建议已写入项目笔记" : "已保留拒绝理由，项目内容未改变");
  }

  async function performUpload(file: File) {
    setUploading(true);
    setStatus("上传中…");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      if (!response.ok) throw new Error(`上传失败 (${response.status})`);
      const data = await response.json() as { id?: string; url?: string; fileName?: string; fileType?: string; size?: string };
      if (!data.id || !data.url || !data.fileName) throw new Error("上传响应异常");
      const upload: CourseUpload = session.upsertUpload({
        id: data.id,
        courseId: course.id,
        groupId: group?.id,
        studentId,
        studentName: session.studentName ?? session.user.name,
        stageKey,
        category: stageKey === "showcase" ? "presentation" : "artifact",
        title: file.name,
        fileName: data.fileName,
        fileType: data.fileType ?? file.type,
        size: data.size ?? `${file.size}`,
        url: data.url,
      });
      session.upsertSubmission({
        courseId: course.id,
        studentId,
        studentName: session.studentName ?? session.user.name,
        groupId: group?.id,
        stageKey,
        type: stageKey === "showcase" ? "showcase" : "evidence",
        title: `上传文件：${file.name}`,
        content: `文件上传：${data.fileName}`,
        files: [{ name: data.fileName, type: data.fileType ?? file.type, size: data.size, url: data.url }],
      });
      session.addActivity(course.id, "上传项目材料", data.fileName, session.studentName ?? "学生");
      emitStudentArtifactEvent({ courseId: course.id, studentId, stageKey, kind: "file-uploaded", artifactId: upload.id, summary: upload.fileName, milestone: true });
      setStatus("材料已上传");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function requestUpload(file: File) {
    confirmation.request({
      action: "upload",
      title: `上传“${file.name}”`,
      summary: "文件会作为本阶段正式材料同步给教师，并触发智能体进行材料跟进。",
      payload: { fileName: file.name, fileType: file.type, size: file.size },
      onConfirm: () => performUpload(file),
    });
  }

  return (
    <div className="studio-workbench">
      <div className="studio-workbench__summary">
        <div>
          <span>STUDENT-OWNED PROJECT SPACE</span>
          <strong>{stage?.label ?? "当前阶段"}</strong>
          <p>正式任务只在“当前任务”中完成。AI 建议先进入待决定区，只有你说明理由并明确采纳后，才会写入项目笔记。</p>
        </div>
        <div className="studio-workbench__counts">
          <span><b>{uploads.length}</b>份材料</span>
          <span><b>{pendingSuggestions.length}</b>项待决定</span>
          <span><b>{feedback.length}</b>条教师反馈</span>
        </div>
      </div>

      <nav aria-label="项目工作台分区" className="studio-workbench__tabs">
        <button className={tab === "stage" ? "is-active" : ""} onClick={() => setTab("stage")} type="button"><CheckCircle2 size={15} />当前任务</button>
        <button className={tab === "notes" ? "is-active" : ""} onClick={() => setTab("notes")} type="button"><NotebookPen size={15} />项目笔记{pendingSuggestions.length ? <b>{pendingSuggestions.length}</b> : null}</button>
        <button className={tab === "materials" ? "is-active" : ""} onClick={() => setTab("materials")} type="button"><FileArchive size={15} />材料与过程</button>
      </nav>

      {tab === "stage" ? (
        <div className="studio-workbench__stage-surface">
          {stage ? <StudentStageView course={course} embedded view={stage.view} /> : <p>当前阶段尚未配置。</p>}
        </div>
      ) : tab === "notes" ? (
        <div className="studio-workbench__notes">
          {pendingSuggestions.length ? (
            <section className="studio-workbench__suggestions" aria-label="待决定的 AI 建议">
              <div className="studio-workbench__section-title"><div><span>STUDENT DECISION REQUIRED</span><h3>待你决定的 AI 草稿</h3></div><Bot size={18} /></div>
              <p className="studio-workbench__section-help">先核验内容，再写下你为什么采纳或拒绝。未确认的建议不会改变项目。</p>
              <div className="studio-workbench__suggestion-list">
                {pendingSuggestions.map((item) => {
                  const patches = readWorkspacePatches(item);
                  return (
                    <article key={item.id}>
                      <header><strong>{item.title}</strong><span>{formatWorkbenchTime(item.createdAt)}</span></header>
                      {patches.map((patch) => (
                        <div className="studio-workbench__patch" key={`${item.id}-${patch.companionId}-${patch.title}`}>
                          <span>{getCompanion(patch.companionId).name} · {patch.title}</span>
                          <p>{patch.content}</p>
                          <small>请核验：{patch.reviewInstruction}</small>
                        </div>
                      ))}
                      <label>
                        <span>我的决定理由（必填）</span>
                        <textarea
                          onChange={(event) => setDecisionReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                          placeholder="例如：数据来源已核验，所以采纳；或这与我的真实调查不符，所以拒绝……"
                          value={decisionReasons[item.id] ?? ""}
                        />
                      </label>
                      <footer>
                        <button onClick={() => resolveSuggestion(item, "rejected")} type="button"><XCircle size={15} />不采纳</button>
                        <button className="is-primary" onClick={() => resolveSuggestion(item, "accepted")} type="button"><Check size={15} />采纳到笔记</button>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
          <div className="studio-workbench__document">
            <header><div><span>过程笔记 · 不替代正式成果</span><h3>{copy.title}</h3></div>{status ? <strong>{status}</strong> : null}</header>
            <RichTextEditor onChange={setDocumentText} placeholder={copy.placeholder} value={documentText} />
            <footer>
              <span>{plainTextLength(documentText)} 字 · 已采纳的 AI 内容会标明来源，你可以继续修改</span>
              <div><button onClick={requestSave} type="button"><Save size={15} />保存项目笔记</button></div>
            </footer>
          </div>
        </div>
      ) : (
        <div className="studio-workbench__materials">
          <section>
            <div className="studio-workbench__section-title"><div><span>PROJECT MATERIALS</span><h3>本阶段材料</h3></div><button disabled={uploading} onClick={() => fileInputRef.current?.click()} type="button"><UploadCloud size={15} />{uploading ? "上传中" : "上传文件"}</button></div>
            <input className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) requestUpload(file); }} ref={fileInputRef} type="file" />
            <div className="studio-workbench__file-list">
              {uploads.length ? uploads.map((upload) => <article key={upload.id}><FileText size={17} /><div><strong>{upload.title}</strong><span>{upload.fileName} · {formatWorkbenchTime(upload.createdAt)}</span></div><a aria-label={`打开${upload.title}`} href={upload.url} rel="noreferrer" target="_blank"><ExternalLink size={15} /></a></article>) : <p>还没有上传材料。报告、图片、数据表和演示文件都可以从这里提交。</p>}
            </div>
          </section>
          <section>
            <div className="studio-workbench__section-title"><div><span>TRACEABLE CHANGES</span><h3>智能体操作记录</h3></div><History size={17} /></div>
            <div className="studio-workbench__record-list">
              {processRecords.length ? processRecords.map((record) => <article key={record.id}><i data-source={record.source} /><div><strong>{record.title}</strong><p>{record.summary}</p><span>{formatWorkbenchTime(record.createdAt)}</span></div></article>) : <p>还没有过程记录。你与伙伴的任务、采纳或拒绝决定会自动出现在这里。</p>}
            </div>
          </section>
        </div>
      )}

      <StudentActionConfirmationDialog busy={confirmation.busy} onConfirm={() => void confirmation.confirm()} onReject={confirmation.reject} pending={confirmation.pending} />
    </div>
  );
}

function plainTextLength(html: string) {
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, "").length;
  const element = window.document.createElement("div");
  element.innerHTML = html;
  return (element.textContent ?? "").trim().length;
}

function formatWorkbenchTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
