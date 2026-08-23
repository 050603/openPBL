"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileClock,
  FileUp,
  Layers3,
  Save,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { PrimaryButton, Textarea } from "@/components/ui";
import {
  emitStudentArtifactEvent,
  MAKE_WORK_RESULT_ADOPT_EVENT,
  type MakeWorkResultAdoptEvent,
} from "@/lib/companion/events";
import { activeMakeIterationId } from "@/lib/companion/workspace-operation";
import { LEARNING_EVIDENCE_SCHEMA_VERSION } from "@/lib/learning-evidence/types";
import type { ArtifactSnapshot, Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { evidenceRecordId, useEvidenceDraft } from "./use-evidence-draft";

export function MakeEvidenceTask({
  course,
  studentId,
}: {
  course: Course;
  studentId: string;
  focusActionId?: string;
}) {
  const session = useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [latestDraft, setLatestDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const project = course.groups?.find((item) =>
    item.members.some((member) => member.studentId === studentId));
  const projectId = project?.id;
  const iterationId = activeMakeIterationId(course, studentId);
  const versions = useMemo(
    () => (course.uploads ?? [])
      .filter((item) =>
        item.stageKey === "make"
        && (item.studentId === studentId || Boolean(projectId && item.groupId === projectId)))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [course.uploads, projectId, studentId],
  );
  const versionNotes = useMemo(() => new Map(
    (course.learningEvidence ?? [])
      .filter((item) => item.studentId === studentId && item.stageKey === "make" && item.kind === "artifact-version")
      .map((item) => [
        (item.payload as { iterationId?: string }).iterationId,
        (item.payload as { changeSummary?: string }).changeSummary,
      ]),
  ), [course.learningEvidence, studentId]);
  const nextVersionNumber = versions.length + 1;

  async function uploadVersion(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);
      form.append("courseId", course.id);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      if (!response.ok) throw new Error(`上传失败 (${response.status})`);
      const data = await response.json() as {
        id?: string;
        url?: string;
        fileName?: string;
        fileType?: string;
        size?: string;
      };
      if (!data.id || !data.url || !data.fileName) throw new Error("上传响应不完整");

      const now = new Date().toISOString();
      const versionNumber = versions.length + 1;
      const note = latestDraft.trim().replace(/\s+/g, " ").slice(0, 220)
        || (versions.length ? "继续完善作品" : "首次提交作品");
      const snapshot: ArtifactSnapshot = {
        id: `snapshot-${data.id}`,
        courseId: course.id,
        studentId,
        stageKey: "make",
        title: file.name,
        fileName: data.fileName,
        fileType: data.fileType ?? (file.type || "application/octet-stream"),
        sourceUrl: data.url,
        inspectionStatus: "metadata-only",
        createdAt: now,
      };
      const evidenceId = evidenceRecordId({
        courseId: course.id,
        studentId,
        kind: "artifact-version",
        suffix: data.id,
      });

      session.upsertUpload({
        id: data.id,
        courseId: course.id,
        groupId: projectId,
        studentId,
        studentName: session.studentName ?? session.user.name,
        stageKey: "make",
        category: "artifact",
        title: file.name,
        fileName: data.fileName,
        fileType: snapshot.fileType,
        size: data.size ?? `${file.size}`,
        url: data.url,
      });
      session.upsertArtifactSnapshot({ ...snapshot, artifactVersionEvidenceId: evidenceId });
      session.upsertLearningEvidence({
        id: evidenceId,
        schemaVersion: LEARNING_EVIDENCE_SCHEMA_VERSION,
        courseId: course.id,
        studentId,
        stageKey: "make",
        kind: "artifact-version",
        title: `作品版本 V${versionNumber}`,
        summary: `${file.name}；${note}`,
        payload: {
          iterationId: data.id,
          versionLabel: `V${versionNumber}`,
          artifactTitle: file.name,
          changeSummary: note,
          snapshotId: snapshot.id,
        },
        status: "submitted",
        source: "student",
        countsTowardReadiness: true,
        evidenceRefs: [],
        artifactSnapshotIds: [snapshot.id],
        createdAt: now,
        updatedAt: now,
        submittedAt: now,
      });
      session.upsertSubmission({
        id: `make-version-${data.id}`,
        courseId: course.id,
        studentId,
        studentName: session.studentName ?? session.user.name,
        groupId: projectId,
        stageKey: "make",
        type: "document",
        title: `V${versionNumber} · ${file.name}`,
        content: note,
        files: [{ name: data.fileName, type: snapshot.fileType, size: data.size, url: data.url }],
      });
      session.addCompanionProcessRecord({
        courseId: course.id,
        studentId,
        stageKey: "make",
        title: `提交作品 V${versionNumber}`,
        summary: note,
        source: "student",
        evidenceIds: [evidenceId],
      });
      emitStudentArtifactEvent({
        courseId: course.id,
        studentId,
        stageKey: "make",
        kind: "file-uploaded",
        artifactId: data.id,
        summary: `提交作品 V${versionNumber}：${file.name}。过程说明：${note}`,
      });
      setMessage(`V${versionNumber} 已保存`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败，请重试");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="make-stage-workspace make-stage-workspace--simple">
      <div className="make-simple-workspace">
        <MakeProcessDraft
          course={course}
          iterationId={iterationId}
          key={iterationId}
          onDraftChange={setLatestDraft}
          studentId={studentId}
        />

        <aside className="make-delivery-column">
          <section className="make-version-submit">
            <header className="make-version-submit__header">
              <div className="make-version-submit__icon"><FileUp size={22} /></div>
              <div className="make-version-submit__copy">
                <h2>提交作品</h2>
              </div>
              <span className="make-version-submit__badge">V{nextVersionNumber}</span>
            </header>

            <div className="make-version-submit__summary">
              <CheckCircle2 size={15} />
              <span>{latestDraft.trim() ? "版本说明将引用工作稿，无需重复填写。" : "可以先提交作品，之后继续补充工作稿。"}</span>
            </div>

            <p className="make-version-submit__formats">支持 PDF、Word、PPT、视频、代码与压缩包</p>

            <PrimaryButton
              className="make-version-submit__action"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              <span className="make-version-submit__action-icon"><UploadCloud size={19} /></span>
              <span>
                <strong>{uploading ? "正在上传作品…" : "选择作品文件"}</strong>
                <small>{uploading ? "请保持页面开启" : `上传后保存为 V${nextVersionNumber}`}</small>
              </span>
            </PrimaryButton>
            <input
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadVersion(file);
              }}
              ref={inputRef}
              type="file"
            />

            <div className="make-version-submit__assurance">
              <ShieldCheck size={14} />
              <span>文件只用于成果归档，新版本不会覆盖之前的作品。</span>
            </div>
            {message ? (
              <p
                className="make-version-submit__message"
                data-tone={message.includes("失败") ? "error" : "success"}
                role="status"
              >
                {message.includes("失败") ? null : <CheckCircle2 size={14} />}
                {message}
              </p>
            ) : null}
          </section>

          <details className="make-version-history">
            <summary>
              <span className="make-version-history__heading-icon"><Layers3 size={17} /></span>
              <span><strong>作品版本</strong><small>{versions.length ? `已保存 ${versions.length} 版` : "还没有提交"}</small></span>
              <ChevronDown size={16} />
            </summary>
            {versions.length ? (
              <ol>
                {versions.map((version, index) => {
                  const versionNumber = versions.length - index;
                  return (
                    <li aria-current={index === 0 ? "true" : undefined} key={version.id}>
                      <span className="make-version-history__number">V{versionNumber}</span>
                      <div>
                        <span className="make-version-history__meta">
                          {index === 0 ? <b>当前版本</b> : null}
                          <time>{new Date(version.createdAt).toLocaleString("zh-CN")}</time>
                        </span>
                        <strong>{version.title}</strong>
                        <p>{versionNotes.get(version.id) || "作品版本"}</p>
                      </div>
                      <a aria-label={`打开 V${versionNumber}`} href={version.url} rel="noreferrer" target="_blank">
                        <ExternalLink size={15} />
                      </a>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="make-version-history__empty">
                <div><FileClock size={22} /></div>
                <p>提交后可在这里打开之前的版本。</p>
              </div>
            )}
          </details>
        </aside>
      </div>
    </div>
  );
}

function MakeProcessDraft({
  course,
  studentId,
  iterationId,
  onDraftChange,
}: {
  course: Course;
  studentId: string;
  iterationId: string;
  onDraftChange: (value: string) => void;
}) {
  const session = useSession();
  const [notice, setNotice] = useState<string | null>(null);
  const draft = useEvidenceDraft({
    course,
    studentId,
    stageKey: "make",
    kind: "revision-decision",
    suffix: iterationId,
    title: `作品工作稿 ${iterationId.replace("cycle-", "#")}`,
    initialPayload: {
      iterationId,
      interpretation: "",
      decision: "revise",
      reason: "",
      plannedChange: "",
      nextGoal: "",
      processDraft: "",
    },
  });
  const content = draft.payload.processDraft ?? draft.payload.plannedChange ?? "";
  const setDraftPayload = draft.setPayload;

  const updateContent = useCallback((value: string) => {
    setDraftPayload((current) => ({ ...current, processDraft: value }));
    onDraftChange(value);
    setNotice(null);
  }, [onDraftChange, setDraftPayload]);

  useEffect(() => {
    onDraftChange(content);
  }, [content, onDraftChange]);

  useEffect(() => {
    const adopt = (event: Event) => {
      const detail = (event as CustomEvent<MakeWorkResultAdoptEvent>).detail;
      if (!detail || detail.courseId !== course.id || detail.studentId !== studentId) return;
      const result = detail.content.trim();
      if (!result) return;
      const next = content.trim()
        ? `${content.trim()}\n\nAI 工作结果\n${result}`
        : `AI 工作结果\n${result}`;
      updateContent(next);
      setNotice("AI 工作结果已加入工作稿，可继续修改。");
    };
    window.addEventListener(MAKE_WORK_RESULT_ADOPT_EVENT, adopt);
    return () => window.removeEventListener(MAKE_WORK_RESULT_ADOPT_EVENT, adopt);
  }, [content, course.id, studentId, updateContent]);

  function saveProgress() {
    if (!draft.submit()) return;
    session.addCompanionProcessRecord({
      courseId: course.id,
      studentId,
      stageKey: "make",
      title: "保存作品制作进展",
      summary: content.trim().slice(0, 260),
      source: "student",
      evidenceIds: [draft.evidenceId],
    });
    emitStudentArtifactEvent({
      courseId: course.id,
      studentId,
      stageKey: "make",
      kind: "document-saved",
      artifactId: draft.evidenceId,
      summary: "学生保存了本轮作品工作稿。",
      milestone: true,
      content,
    });
    setNotice("本次进展已保存。");
  }

  return (
    <section className="make-process-draft">
      <header>
        <div className="make-process-draft__title">
          <h2>作品工作稿</h2>
          <span>第 {iterationId.replace("cycle-", "")} 轮</span>
        </div>
        <span className="make-process-draft__save-state" data-state={draft.saveState}>
          {draft.saveState === "saving" ? "正在保存…" : draft.saveState === "saved" ? "已自动保存" : "输入后自动保存"}
        </span>
      </header>

      <Textarea
        aria-label="作品工作稿"
        onChange={(event) => updateContent(event.target.value)}
        placeholder={[
          "可以从任何一项开始：",
          "",
          "我正在制作……",
          "这次完成或改变了……",
          "目前遇到的问题是……",
          "下一步准备……",
        ].join("\n")}
        rows={14}
        value={content}
      />

      <footer>
        <PrimaryButton onClick={saveProgress} type="button">
          <Save size={15} /> 保存本次进展
        </PrimaryButton>
      </footer>
      {draft.error ? <p className="make-process-draft__error" role="alert">请先写下一条真实的作品进展。</p> : null}
      {notice ? <p className="make-process-draft__notice" role="status">{notice}</p> : null}
    </section>
  );
}
