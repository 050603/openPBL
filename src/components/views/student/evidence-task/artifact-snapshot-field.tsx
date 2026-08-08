"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  UploadCloud,
} from "lucide-react";
import { PrimaryButton, Textarea } from "@/components/ui";
import type { ArtifactSnapshot, Course, CourseUpload } from "@/lib/session/types";
import { isSnapshotInspectable } from "@/lib/learning-evidence/readiness";
import { useSession } from "@/lib/session/store";
import { cn } from "@/lib/utils";

function uploadCategory(
  stageKey: string,
  file: File,
): CourseUpload["category"] {
  if (stageKey === "showcase") return "presentation";
  return file.type.startsWith("image/") ? "artifact" : "artifact";
}

export function ArtifactSnapshotField({
  course,
  studentId,
  stageKey,
  value,
  onChange,
  allowEarlierStages = false,
}: {
  course: Course;
  studentId: string;
  stageKey: string;
  value?: string;
  onChange: (snapshotId: string) => void;
  allowEarlierStages?: boolean;
}) {
  const session = useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const project = course.groups?.find((item) =>
    item.members.some((member) => member.studentId === studentId));
  const snapshots = useMemo(
    () => (course.artifactSnapshots ?? [])
      .filter((item) =>
        item.studentId === studentId
        && (allowEarlierStages || item.stageKey === stageKey))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [allowEarlierStages, course.artifactSnapshots, stageKey, studentId],
  );
  const selected = snapshots.find((item) => item.id === value);
  const [annotationDrafts, setAnnotationDrafts] = useState<
    Record<string, { studentExcerpt: string; annotation: string }>
  >({});
  const selectedDraft = selected ? annotationDrafts[selected.id] : undefined;
  const studentExcerpt = selectedDraft?.studentExcerpt ?? selected?.studentExcerpt ?? "";
  const annotation = selectedDraft?.annotation ?? selected?.annotation ?? "";

  function updateSelectedDraft(
    field: "studentExcerpt" | "annotation",
    nextValue: string,
  ) {
    if (!selected) return;
    setAnnotationDrafts((current) => ({
      ...current,
      [selected.id]: {
        studentExcerpt:
          current[selected.id]?.studentExcerpt ?? selected.studentExcerpt ?? "",
        annotation:
          current[selected.id]?.annotation ?? selected.annotation ?? "",
        [field]: nextValue,
      },
    }));
  }

  async function upload(file: File) {
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
      session.upsertUpload({
        id: data.id,
        courseId: course.id,
        groupId: project?.id,
        studentId,
        studentName: session.studentName ?? session.user.name,
        stageKey,
        category: uploadCategory(stageKey, file),
        title: file.name,
        fileName: data.fileName,
        fileType: data.fileType ?? (file.type || "application/octet-stream"),
        size: data.size ?? `${file.size}`,
        url: data.url,
      });
      const snapshot: ArtifactSnapshot = {
        id: `snapshot-${data.id}`,
        courseId: course.id,
        studentId,
        stageKey,
        title: file.name,
        fileName: data.fileName,
        fileType: data.fileType ?? (file.type || "application/octet-stream"),
        sourceUrl: data.url,
        inspectionStatus: "metadata-only",
        createdAt: new Date().toISOString(),
      };
      session.upsertArtifactSnapshot(snapshot);
      onChange(snapshot.id);
      setMessage("文件已上传，请补充摘录或定位标注以便查看。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败，请重试");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function saveAnnotation() {
    if (!selected) return;
    if (!studentExcerpt.trim() && !annotation.trim()) {
      setMessage("请至少填写一项真实内容摘录或定位标注。");
      return;
    }
    session.upsertArtifactSnapshot({
      ...selected,
      inspectionStatus: "student-annotated",
      studentExcerpt: studentExcerpt.trim() || undefined,
      annotation: annotation.trim() || undefined,
    });
    setMessage("作品快照标注已保存。");
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
            <FileText size={16} />
            作品快照
          </h3>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            添加本轮作品文件，也可以直接粘贴或描述关键内容。
          </p>
        </div>
        <PrimaryButton
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          size="sm"
          tone="teal"
          type="button"
          variant="outline"
        >
          <UploadCloud size={15} />
          {uploading ? "上传中…" : "上传新版本"}
        </PrimaryButton>
        <input
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
          ref={inputRef}
          type="file"
        />
      </div>

      {snapshots.length ? (
        <label className="mt-4 grid gap-2">
          <span className="text-sm font-semibold text-stone-800">选择要作为证据的快照</span>
          <select
            className="h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm"
            onChange={(event) => onChange(event.target.value)}
            value={value ?? ""}
          >
            <option value="">请选择</option>
            {snapshots.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {isSnapshotInspectable(item) ? "可检查" : "待标注"}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white px-3 py-5 text-center text-sm text-stone-500">
          还没有作品快照。也可以先在任务正文中粘贴本轮作品摘录。
        </p>
      )}

      {selected ? (
        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold",
                isSnapshotInspectable(selected)
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-900",
              )}
            >
              {isSnapshotInspectable(selected)
                ? <CheckCircle2 size={13} />
                : <AlertCircle size={13} />}
              {isSnapshotInspectable(selected) ? "可检查快照" : "只有元数据，尚不可检查"}
            </span>
            {selected.sourceUrl ? (
              <a
                className="inline-flex items-center gap-1 font-semibold text-[var(--pbl-student)]"
                href={selected.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                打开原文件 <ExternalLink size={12} />
              </a>
            ) : null}
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-stone-800">学生摘录</span>
            <Textarea
              onChange={(event) =>
                updateSelectedDraft("studentExcerpt", event.target.value)}
              placeholder="粘贴作品中最能代表本版本的文字、数据或画面说明。"
              rows={3}
              value={studentExcerpt}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-stone-800">定位标注</span>
            <Textarea
              onChange={(event) =>
                updateSelectedDraft("annotation", event.target.value)}
              placeholder="例如：第3页右侧图表；图片左下角的结构；视频 01:10–01:35。"
              rows={2}
              value={annotation}
            />
          </label>
          <div>
            <PrimaryButton
              onClick={saveAnnotation}
              size="sm"
              tone="teal"
              type="button"
            >
              保存可检查标注
            </PrimaryButton>
          </div>
        </div>
      ) : null}

      {message ? (
        <p aria-live="polite" className="mt-3 text-xs leading-5 text-stone-600">
          {message}
        </p>
      ) : null}
    </section>
  );
}
