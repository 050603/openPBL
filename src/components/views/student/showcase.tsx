"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Compass,
  ExternalLink,
  Eye,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import { Card, FileBadge, Pill, PrimaryButton, toast } from "@/components/ui";
import type { ArtifactSnapshot, CompanionProcessRecord, Course, CourseUpload } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { buildShowcaseCoach } from "@/lib/teaching-ai/client-api";
import { emitStudentArtifactEvent } from "@/lib/companion/events";
import { StudentActionConfirmationDialog, useStudentActionConfirmation } from "./student-confirmation";
import { MakeEvidenceTask } from "./evidence-task/make-task";

function uploadCategory(file: File): CourseUpload["category"] {
  const name = file.name.toLowerCase();
  return /\.(ppt|pptx|key|mp4|mov|webm)$/.test(name) || file.type.startsWith("video/")
    ? "presentation"
    : "artifact";
}

export function buildShowcaseArtifactSnapshot(input: {
  courseId: string;
  studentId: string;
  uploadId: string;
  title: string;
  fileName: string;
  fileType: string;
  url: string;
  createdAt?: string;
}): ArtifactSnapshot {
  return {
    id: `snapshot-${input.uploadId}`,
    courseId: input.courseId,
    studentId: input.studentId,
    stageKey: "showcase",
    title: input.title,
    fileName: input.fileName,
    fileType: input.fileType,
    sourceUrl: input.url,
    inspectionStatus: "metadata-only",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function selectMeaningfulShowcaseProcessRecords(
  records: CompanionProcessRecord[],
  studentId: string,
): CompanionProcessRecord[] {
  return records
    .filter((record) => {
      if (record.studentId !== studentId) return false;
      if (record.source !== "agent") return true;
      const genericReply = /学习请求|回应了|回复了/.test(record.title);
      return !genericReply && Boolean(record.taskId || record.evidenceIds?.length);
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function ShowcaseView({ course, embedded = false }: { course: Course; embedded?: boolean }) {
  void embedded;
  const session = useSession();
  const studentId = session.studentId ?? "";
  const project = useMemo(
    () => course.groups?.find((item) => item.members.some((member) => member.studentId === studentId)),
    [course.groups, studentId],
  );
  const uploads = useMemo(
    () => (course.uploads ?? [])
      .filter((item) =>
        item.stageKey === "showcase"
        && (item.studentId === studentId || item.groupId === project?.id),
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [course.uploads, project?.id, studentId],
  );
  const processRecords = useMemo(
    () => selectMeaningfulShowcaseProcessRecords(course.companionProcessRecords ?? [], studentId),
    [course.companionProcessRecords, studentId],
  );
  const previewUpload = uploads.find((item) => item.id === course.uiState?.previewUploadId) ?? uploads[0];
  const latestShowcaseSupport = (course.aiSupports ?? [])
    .filter((item) => item.groupId === project?.id && item.kind === "showcase-coach")
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  const stageProgress = course.students.find((student) => student.id === studentId)?.stageProgress.showcase ?? 0;
  const isPresenting = Boolean(project && course.presentingGroupId === project.id);
  const [timer, setTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [improvingWork, setImprovingWork] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const confirmation = useStudentActionConfirmation({ course, stageKey: "showcase" });

  useEffect(() => {
    if (!timerRunning) return;
    timerRef.current = setInterval(() => setTimer((value) => value + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning]);

  async function performUpload(file: File) {
    if (!project) throw new Error("个人项目空间尚未就绪");
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      if (!response.ok) throw new Error(`上传失败 (${response.status})`);
      const data = await response.json() as { id?: string; url?: string; fileName?: string; fileType?: string; size?: string };
      if (!data.id || !data.url || !data.fileName) throw new Error("上传响应异常");
      const category = uploadCategory(file);
      const fileType = data.fileType || file.type || "application/octet-stream";
      const upload = session.upsertUpload({
        id: data.id,
        courseId: course.id,
        groupId: project.id,
        studentId,
        studentName: session.studentName ?? session.user.name,
        stageKey: "showcase",
        category,
        title: file.name,
        fileName: data.fileName,
        fileType,
        size: data.size ?? `${file.size}`,
        url: data.url,
      });
      session.upsertSubmission({
        courseId: course.id,
        studentId,
        studentName: session.studentName ?? session.user.name,
        stageKey: "showcase",
        type: "showcase",
        title: file.name,
        content: `成果文件：${data.fileName}`,
        groupId: project.id,
        files: [{ name: data.fileName, type: fileType, size: data.size, url: data.url }],
      });
      const snapshot = buildShowcaseArtifactSnapshot({
        courseId: course.id,
        studentId,
        uploadId: upload.id,
        title: file.name,
        fileName: data.fileName,
        fileType,
        url: data.url,
      });
      session.upsertArtifactSnapshot(snapshot);
      session.addCompanionProcessRecord({
        courseId: course.id,
        studentId,
        stageKey: "showcase",
        title: `上传最终成果“${file.name}”`,
        summary: "最终成果材料已提交，教师可以直接打开真实文件查看。",
        source: "student",
      });
      session.setPreviewUpload(course.id, upload.id);
      session.updateStudentProgress("showcase", Math.max(85, stageProgress));
      emitStudentArtifactEvent({
        courseId: course.id,
        studentId,
        stageKey: "showcase",
        kind: "file-uploaded",
        artifactId: upload.id,
        summary: file.name,
        milestone: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传失败，请重试";
      setUploadError(message);
      throw error;
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function requestUpload(file: File) {
    confirmation.request({
      action: "upload",
      title: `上传成果“${file.name}”`,
      summary: "上传后，教师可以查看这份成果材料。",
      payload: { fileName: file.name, fileType: file.type, size: file.size },
      onConfirm: () => performUpload(file),
    });
  }

  async function prepareShowcaseCoach() {
    if (!project) return;
    try {
      const draft = await buildShowcaseCoach({
        course,
        group: project,
        uploads,
        activities: course.activityLog ?? [],
        aiSupports: course.aiSupports ?? [],
      });
      session.upsertAiSupport({
        ...draft,
        courseId: course.id,
        studentId,
        studentName: session.studentName ?? session.user.name,
      });
    } catch (error) {
      toast.error("AI 汇报检查生成失败", {
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-editorial text-2xl font-semibold">阶段五 · 成果展示与评价</h1>
          <p className="mt-2 text-sm text-stone-500">上传成果，准备课堂展示。</p>
        </div>
        <Pill tone={isPresenting ? "green" : uploads.length ? "blue" : "gray"}>
          {isPresenting ? "教师已开始你的展示" : uploads.length ? `已上传 ${uploads.length} 份成果` : "等待成果上传"}
        </Pill>
      </header>

      {isPresenting ? (
        <div className="flex items-center gap-3 rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          <CheckCircle2 size={20} />
          <div><strong className="block text-sm">现在轮到你的个人项目展示</strong><span className="text-xs">请按教师安排完成汇报与答辩。</span></div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,.75fr)]">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
            <div><h2 className="text-xl font-bold">最终成果材料</h2><p className="mt-1 text-xs text-stone-500">参考任务要求：{course.expectedOutcome?.trim() || project?.goal || "以教师发布的成果要求为准"}</p></div>
            <PrimaryButton disabled={uploading || !project} onClick={() => fileInputRef.current?.click()} type="button">
              <UploadCloud size={16} />{uploading ? "上传中…" : "上传成果"}
            </PrimaryButton>
            <input className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) requestUpload(file); }} ref={fileInputRef} type="file" />
          </div>
          {uploads.length ? (
            <ul className="divide-y divide-stone-100">
              {uploads.map((upload) => (
                <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-4" key={upload.id}>
                  <FileBadge type={upload.fileType} />
                  <div className="min-w-0"><strong className="block truncate text-sm">{upload.title}</strong><span className="mt-1 block truncate text-xs text-stone-500">{upload.fileName} · {upload.size}</span></div>
                  <div className="flex items-center gap-2">
                    <button className="grid h-9 w-9 place-items-center rounded-[8px] border border-stone-200 text-[var(--pbl-student)]" onClick={() => session.setPreviewUpload(course.id, upload.id)} type="button" aria-label={`预览${upload.title}`}><Eye size={16} /></button>
                    <a className="grid h-9 w-9 place-items-center rounded-[8px] border border-stone-200 text-stone-600" href={upload.url} rel="noreferrer" target="_blank" aria-label={`打开${upload.title}`}><ExternalLink size={16} /></a>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-12 text-center text-sm text-stone-500">
              <UploadCloud className="mx-auto mb-2 text-stone-300" size={26} />
              尚未上传真实成果材料
            </div>
          )}
          {uploadError ? <div className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">{uploadError}</div> : null}
        </Card>

        <div className="space-y-5">
          <Card>
            <h2 className="text-lg font-bold">成果预览</h2>
            {previewUpload ? (
              <div className="mt-4 rounded-[10px] border border-stone-200 bg-stone-50 p-4">
                <div className="flex items-center gap-3"><FileBadge type={previewUpload.fileType} /><div className="min-w-0"><strong className="block truncate text-sm">{previewUpload.fileName}</strong><span className="text-xs text-stone-500">{previewUpload.size}</span></div></div>
                <a className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--pbl-student)] text-sm font-bold text-white" href={previewUpload.url} rel="noreferrer" target="_blank"><Eye size={16} />打开真实文件</a>
              </div>
            ) : <p className="mt-4 rounded-[10px] border border-dashed border-stone-200 py-8 text-center text-sm text-stone-500">上传成果后才能预览</p>}
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Clock3 size={18} />自主彩排计时</h2>
            <time className="mt-4 block text-center font-mono text-4xl font-bold tabular-nums" data-testid="presentation-timer">
              {String(Math.floor(timer / 60)).padStart(2, "0")}:{String(timer % 60).padStart(2, "0")}
            </time>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <PrimaryButton onClick={() => setTimerRunning((value) => !value)} variant="outline">{timerRunning ? <PauseCircle size={18} /> : <PlayCircle size={18} />}{timerRunning ? "暂停" : "开始彩排"}</PrimaryButton>
              <PrimaryButton onClick={() => { setTimerRunning(false); setTimer(0); }} variant="ghost"><RotateCcw size={17} />重置</PrimaryButton>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold"><Compass className="text-[var(--pbl-warning)]" size={19} />AI 汇报检查</h2>
            <button className="text-sm font-semibold text-[var(--pbl-student)]" onClick={() => void prepareShowcaseCoach()} type="button">基于现有成果生成</button>
          </div>
          {latestShowcaseSupport ? (
            <div className="mt-4 space-y-3">
              <p className="rounded-[9px] border border-blue-100 bg-blue-50/60 p-3 text-sm leading-6 text-stone-700">{latestShowcaseSupport.diagnosis}</p>
              {latestShowcaseSupport.suggestions.map((tip) => <p className="border-l-2 border-[var(--pbl-student)] pl-3 text-sm leading-6 text-stone-700" key={tip}>{tip}</p>)}
              <p className="text-xs leading-5 text-stone-500">依据：{latestShowcaseSupport.evidence.join("；") || "当前已上传成果与过程记录"}</p>
            </div>
          ) : <p className="mt-4 rounded-[9px] border border-dashed border-stone-200 py-8 text-center text-sm text-stone-500">尚未生成汇报建议</p>}
        </Card>

        <Card>
          <h2 className="text-lg font-bold">项目过程</h2>
          {processRecords.length ? (
            <ol className="mt-4 space-y-3">
              {processRecords.slice(0, 6).map((record) => <li className="border-l-2 border-stone-200 pl-3" key={record.id}><div className="flex flex-wrap items-baseline justify-between gap-2"><strong className="block text-sm">{record.title}</strong><time className="text-[10px] text-stone-400">{new Date(record.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div><p className="mt-1 text-xs leading-5 text-stone-500">{record.summary}</p></li>)}
            </ol>
          ) : <p className="mt-4 rounded-[9px] border border-dashed border-stone-200 py-8 text-center text-sm text-stone-500">当前还没有可展示的过程记录</p>}
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">继续完善作品</h2>
            <p className="mt-1 text-xs text-stone-500">展示后仍可提交新版本，原有版本会继续保留。</p>
          </div>
          <PrimaryButton onClick={() => setImprovingWork((value) => !value)} variant="outline">
            <RotateCcw size={16} />{improvingWork ? "收起" : "提交新版本"}
          </PrimaryButton>
        </div>
        {improvingWork ? <div className="mt-5"><MakeEvidenceTask course={course} studentId={studentId} /></div> : null}
      </Card>

      <StudentActionConfirmationDialog busy={confirmation.busy} onConfirm={() => void confirmation.confirm()} onReject={confirmation.reject} pending={confirmation.pending} />
    </div>
  );
}
