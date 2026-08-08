"use client";

import { useMemo, useRef, useState } from "react";
import { ExternalLink, FileClock, FileUp, UploadCloud } from "lucide-react";
import { PrimaryButton, Textarea } from "@/components/ui";
import { LEARNING_EVIDENCE_SCHEMA_VERSION } from "@/lib/learning-evidence/types";
import type { ArtifactSnapshot, Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { evidenceRecordId } from "./use-evidence-draft";

export function MakeEvidenceTask({ course, studentId }: { course: Course; studentId: string }) {
  const session = useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [changeSummary, setChangeSummary] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const project = course.groups?.find((item) =>
    item.members.some((member) => member.studentId === studentId));
  const versions = useMemo(
    () => (course.uploads ?? [])
      .filter((item) =>
        item.stageKey === "make"
        && (item.studentId === studentId || Boolean(project?.id && item.groupId === project.id)))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [course.uploads, project?.id, studentId],
  );
  const versionNotes = useMemo(() => new Map(
    (course.learningEvidence ?? [])
      .filter((item) => item.studentId === studentId && item.stageKey === "make" && item.kind === "artifact-version")
      .map((item) => [
        (item.payload as { iterationId?: string }).iterationId,
        (item.payload as { changeSummary?: string }).changeSummary,
      ]),
  ), [course.learningEvidence, studentId]);

  async function uploadVersion(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);
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
      const note = changeSummary.trim() || (versions.length ? "更新作品版本" : "首次提交作品");
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
        groupId: project?.id,
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
        groupId: project?.id,
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
      setChangeSummary("");
      setMessage(`V${versionNumber} 已保存`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败，请重试");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="make-version-workspace">
      <section className="make-version-submit">
        <div className="make-version-submit__copy">
          <FileUp size={22} />
          <div>
            <h2>{versions.length ? "提交新版本" : "提交作品"}</h2>
            <p>每次上传都会保存为独立版本，之前的文件不会被覆盖。</p>
          </div>
        </div>
        <Textarea
          aria-label="本次修改说明"
          onChange={(event) => setChangeSummary(event.target.value)}
          placeholder={versions.length ? "可选：这次主要修改了什么？" : "可选：简单介绍作品内容"}
          rows={3}
          value={changeSummary}
        />
        <PrimaryButton disabled={uploading} onClick={() => inputRef.current?.click()} type="button">
          <UploadCloud size={17} />
          {uploading ? "上传中…" : versions.length ? "上传新版本" : "选择作品文件"}
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
        {message ? <p className="make-version-submit__message">{message}</p> : null}
      </section>

      <section className="make-version-history">
        <header>
          <FileClock size={18} />
          <h2>版本记录</h2>
          <span>{versions.length} 个版本</span>
        </header>
        {versions.length ? (
          <ol>
            {versions.map((version, index) => {
              const versionNumber = versions.length - index;
              return (
                <li key={version.id}>
                  <span className="make-version-history__number">V{versionNumber}</span>
                  <div>
                    <strong>{version.title}</strong>
                    <p>{versionNotes.get(version.id) || "作品版本"}</p>
                    <time>{new Date(version.createdAt).toLocaleString("zh-CN")}</time>
                  </div>
                  <a aria-label={`打开 V${versionNumber}`} href={version.url} rel="noreferrer" target="_blank">
                    <ExternalLink size={16} />
                  </a>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="make-version-history__empty">
            <FileUp size={24} />
            <p>还没有提交作品</p>
          </div>
        )}
      </section>
    </div>
  );
}
