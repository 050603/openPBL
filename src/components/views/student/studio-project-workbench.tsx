"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FileArchive,
  FileText,
  History,
  Save,
  Send,
  UploadCloud,
} from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { emitStudentArtifactEvent } from "@/lib/companion/events";
import type { Course, CourseUpload } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { StudentStageView } from "./stage-dispatcher";
import { StudentActionConfirmationDialog, useStudentActionConfirmation } from "./student-confirmation";

type WorkbenchTab = "stage" | "document" | "materials";

const STAGE_DOCUMENT_COPY: Record<string, { title: string; placeholder: string; submit: string }> = {
  proposal: {
    title: "方案协作文档",
    placeholder: "记录项目问题、依据、方案选择和需要继续核验的内容……",
    submit: "提交当前方案资料",
  },
  make: {
    title: "项目作品与过程文档",
    placeholder: "记录制作过程、资料来源、测试结果、修改依据和下一步……",
    submit: "提交阶段成果",
  },
  showcase: {
    title: "成果说明与汇报备注",
    placeholder: "记录成果说明、关键证据、局限和汇报时需要说明的内容……",
    submit: "提交展示说明",
  },
  reflection: {
    title: "反思证据备忘",
    placeholder: "先记录真实发生的行动、结果和反馈，再进入阶段成果撰写个人反思……",
    submit: "保存反思证据",
  },
};

export function StudioProjectWorkbench({ course, stageKey }: { course: Course; stageKey: string }) {
  const session = useSession();
  const stage = course.stages[course.currentStageIndex];
  const studentId = session.studentId ?? "";
  const group = useMemo(
    () => course.groups?.find((item) => item.members.some((member) => member.studentId === studentId)),
    [course.groups, studentId],
  );
  const existingDocument = useMemo(
    () => (course.submissions ?? [])
      .filter((submission) => submission.stageKey === stageKey && submission.type === "document")
      .filter((submission) => submission.studentId === studentId || (group && submission.groupId === group.id))
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
  const agentRecords = useMemo(
    () => (course.companionProcessRecords ?? [])
      .filter((record) => record.studentId === studentId && record.stageKey === stageKey && record.source === "agent")
      .slice(0, 8),
    [course.companionProcessRecords, stageKey, studentId],
  );
  const copy = STAGE_DOCUMENT_COPY[stageKey] ?? {
    title: "项目协作文档",
    placeholder: "记录当前阶段的判断、证据、修改和下一步……",
    submit: "提交当前阶段资料",
  };
  const [tab, setTab] = useState<WorkbenchTab>(stageKey === "make" ? "document" : "stage");
  const [documentText, setDocumentText] = useState(existingDocument?.content ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const loadedDocumentRef = useRef(existingDocument?.content ?? "");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const confirmation = useStudentActionConfirmation({ course, stageKey });

  useEffect(() => {
    const latest = existingDocument?.content ?? "";
    if (documentText === loadedDocumentRef.current) {
      setDocumentText(latest);
    }
    loadedDocumentRef.current = latest;
  }, [documentText, existingDocument?.content, existingDocument?.updatedAt]); // Keep unsaved student edits when an external update arrives.

  function performSave(milestone: boolean) {
    const submission = session.upsertSubmission({
      id: existingDocument?.id ?? `studio-document-${studentId}-${stageKey}`,
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
    session.addActivity(course.id, milestone ? "提交阶段资料" : "保存项目文档", copy.title, session.studentName ?? "学生");
    session.updateStudentProgress(stageKey, milestone ? 100 : Math.max(70, course.students.find((item) => item.id === studentId)?.stageProgress[stageKey] ?? 0));
    emitStudentArtifactEvent({
      courseId: course.id,
      studentId,
      stageKey,
      kind: "document-saved",
      artifactId: submission?.id,
      summary: milestone ? `已提交${copy.title}` : copy.title,
      content: documentText,
      milestone,
    });
    setStatus(milestone ? "已提交给教师" : "已保存");
  }

  function requestSave(milestone: boolean) {
    confirmation.request({
      action: milestone ? "submit" : existingDocument ? "overwrite" : "save",
      title: milestone ? copy.submit : existingDocument ? `覆盖${copy.title}` : `保存${copy.title}`,
      summary: milestone
        ? "提交会把当前内容作为本阶段正式资料同步给教师。最终判断与提交责任仍由你承担。"
        : "保存会更新课堂中的协作文档，智能体和教师随后会读取这份最新内容。",
      payload: { submissionId: existingDocument?.id, stageKey, title: copy.title },
      onConfirm: () => performSave(milestone),
    });
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
          <p>这里的保存、上传和提交与教师端实时共享。智能体只能追加可审核的辅助内容，不能替你提交。</p>
        </div>
        <div className="studio-workbench__counts">
          <span><b>{uploads.length}</b>份材料</span>
          <span><b>{agentRecords.length}</b>次伙伴操作</span>
          <span><b>{feedback.length}</b>条教师反馈</span>
        </div>
      </div>

      <nav aria-label="项目工作台分区" className="studio-workbench__tabs">
        <button className={tab === "stage" ? "is-active" : ""} onClick={() => setTab("stage")} type="button"><CheckCircle2 size={15} />阶段成果</button>
        <button className={tab === "document" ? "is-active" : ""} onClick={() => setTab("document")} type="button"><FileText size={15} />协作文档</button>
        <button className={tab === "materials" ? "is-active" : ""} onClick={() => setTab("materials")} type="button"><FileArchive size={15} />材料与记录</button>
      </nav>

      {tab === "stage" ? (
        <div className="studio-workbench__stage-surface">
          {stage ? <StudentStageView course={course} embedded view={stage.view} /> : <p>当前阶段尚未配置。</p>}
        </div>
      ) : tab === "document" ? (
        <div className="studio-workbench__document">
          <header><div><span>共享给教师与伴学小组</span><h3>{copy.title}</h3></div>{status ? <strong>{status}</strong> : null}</header>
          <RichTextEditor onChange={setDocumentText} onFileUpload={requestUpload} placeholder={copy.placeholder} value={documentText} />
          <footer>
            <span>{plainTextLength(documentText)} 字 · 智能体补充会标明来源，内容可继续修改</span>
            <div><button onClick={() => requestSave(false)} type="button"><Save size={15} />保存</button><button className="is-primary" onClick={() => requestSave(true)} type="button"><Send size={15} />{copy.submit}</button></div>
          </footer>
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
              {agentRecords.length ? agentRecords.map((record) => <article key={record.id}><i /><div><strong>{record.title}</strong><p>{record.summary}</p><span>{formatWorkbenchTime(record.createdAt)}</span></div></article>) : <p>智能体尚未修改材料。发生写入时，这里会说明谁做了什么以及需要你核验什么。</p>}
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
