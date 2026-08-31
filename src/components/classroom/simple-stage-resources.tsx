"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  LoaderCircle,
  Maximize2,
  MonitorOff,
  MonitorUp,
  Pause,
  Play,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Card, Pill, PrimaryButton, toast } from "@/components/ui";
import { resourcesForStage } from "@/lib/classroom/stage-resources";
import type {
  ClassroomResourceProjection,
  ClassroomResourceViewState,
  Course,
  CourseResource,
} from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { courseResourceTypeLabel } from "@/lib/user-facing-labels";
import { cn } from "@/lib/utils";

const UPLOAD_ACCEPT = [
  ".pdf", ".mp4", ".mov", ".webm", ".docx", ".xlsx",
  ".mp3", ".wav", ".m4a", ".ogg", ".png", ".jpg", ".jpeg",
  ".webp", ".gif", ".txt", ".md", ".csv",
].join(",");

type ViewerMode = "self" | "controller" | "follower";
type ResourceKind = "image" | "video" | "audio" | "text" | "pdf" | "download";
type ViewStatePatch = Partial<Omit<ClassroomResourceViewState, "updatedAt" | "revision">>;

type PdfViewport = { width: number; height: number };
type PdfPage = {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: {
    canvas?: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => { promise: Promise<void>; cancel?: () => void };
};
type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy?: () => Promise<void>;
};
type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: ArrayBuffer }) => { promise: Promise<PdfDocument>; destroy?: () => void };
};

function projectionIsActive(course: Course, resource: CourseResource): boolean {
  return course.uiState?.resourceProjection?.resourceId === resource.id;
}

function stageName(stageKey: string): string {
  const labels: Record<string, string> = {
    launch: "项目启动",
    showcase: "成果汇报与评价",
    reflection: "学习反思",
  };
  return labels[stageKey] ?? "当前阶段";
}

function resourceKind(resource: CourseResource): ResourceKind {
  const type = (resource.previewType ?? resource.type).toUpperCase();
  const extension = resource.previewUrl
    ? (resource.previewType ?? "").toUpperCase()
    : resource.title.split(".").pop()?.toUpperCase() ?? "";
  const value = `${type} ${extension}`;
  if (/\b(PNG|JPG|JPEG|WEBP|GIF)\b/.test(value)) return "image";
  if (/\b(MP4|MOV|WEBM)\b/.test(value)) return "video";
  if (/\b(MP3|WAV|M4A|OGG)\b/.test(value)) return "audio";
  if (/\b(PDF)\b/.test(value)) return "pdf";
  if (/\b(TXT|MD|MARKDOWN|CSV|JSON|PY|JS|TS|HTML|CSS|XML|YAML|YML|SQL|JAVA|C|CPP|H)\b/.test(value)) return "text";
  return "download";
}

function resourceFormatLabel(resource: CourseResource): string {
  if (resource.previewType?.toUpperCase() === "PDF" && resource.type.toUpperCase() === "PPTX") {
    return "PPT · 自动转换版";
  }
  if (resource.type.toUpperCase() === "PDF" && resource.displayMode === "slides") {
    return "PDF · 幻灯片";
  }
  return courseResourceTypeLabel(resource.type);
}

function isConvertedPresentation(resource: CourseResource): boolean {
  return resource.type.toUpperCase() === "PPTX"
    && resource.previewType?.toUpperCase() === "PDF";
}

function isPresentationPdf(resource: CourseResource): boolean {
  return resource.displayMode === "slides" || isConvertedPresentation(resource);
}

function resourcePreviewUrl(resource: CourseResource): string | undefined {
  return resource.previewUrl ?? resource.url;
}

export function SimplifiedTeacherStageView({
  course,
  stageKey,
}: {
  course: Course;
  stageKey: string;
}) {
  const session = useSession();
  const resources = resourcesForStage(course.resources, stageKey);
  const [uploading, setUploading] = useState(false);
  const [pendingPdf, setPendingPdf] = useState<File>();
  const [deletingId, setDeletingId] = useState<string>();
  const [updatingDisplayMode, setUpdatingDisplayMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [dialogResource, setDialogResource] = useState<CourseResource>();
  const projection = course.uiState?.resourceProjection;
  const activeResource = resources.find((resource) => projectionIsActive(course, resource));
  const selected = resources.find((resource) => resource.id === selectedId)
    ?? activeResource
    ?? resources[0];

  async function uploadResource(
    file: File,
    pdfDisplayMode?: "document" | "slides",
  ) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);
      form.append("courseId", course.id);
      form.append("stageKey", stageKey);
      form.append("bindAsCourseResource", "true");
      if (pdfDisplayMode) form.append("pdfDisplayMode", pdfDisplayMode);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const payload = await response.json().catch(() => null) as {
        id?: string;
        message?: string;
        requestId?: string;
        title?: string;
        convertedToPdf?: boolean;
      } | null;
      if (!response.ok) {
        const requestHint = payload?.requestId ? `（请求编号：${payload.requestId}）` : "";
        throw new Error(`${payload?.message || `上传失败（${response.status}）`}${requestHint}`);
      }
      await session.refresh("teacher");
      if (payload?.id) setSelectedId(payload.id);
      toast.success("资源上传成功", {
        description: `“${payload?.title || file.name}”已加入本阶段资源。`,
        duration: 3_500,
      });
    } catch (error) {
      toast.error("资源上传失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
        duration: 5_000,
      });
    } finally {
      setUploading(false);
    }
  }

  async function deleteResource(resource: CourseResource) {
    if (!window.confirm(`确定删除“${resource.title}”吗？`)) return;
    setDeletingId(resource.id);
    if (projectionIsActive(course, resource)) {
      session.setUiState(course.id, { resourceProjection: null });
    }
    try {
      const response = await fetch(`/api/uploads/${resource.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message || `删除失败（${response.status}）`);
      }
      await session.refresh("teacher");
      toast.success("资源已删除", {
        description: `“${resource.title}”已从本阶段移除。`,
        duration: 3_500,
      });
      if (selectedId === resource.id) setSelectedId(undefined);
      if (dialogResource?.id === resource.id) setDialogResource(undefined);
    } catch (error) {
      toast.error("资源删除失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
        duration: 5_000,
      });
    } finally {
      setDeletingId(undefined);
    }
  }

  async function updatePdfDisplayMode(
    resource: CourseResource,
    displayMode: "document" | "slides",
  ) {
    if (resource.displayMode === displayMode) return;
    setUpdatingDisplayMode(true);
    try {
      const response = await fetch(`/api/uploads/${resource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayMode }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message || `切换失败（${response.status}）`);
      }
      await session.refresh("teacher");
      if (projectionIsActive(course, resource) && projection) {
        session.setUiState(course.id, {
          resourceProjection: {
            ...projection,
            viewState: {
              ...(projection.viewState ?? {}),
              page: 1,
              scrollRatio: 0,
              updatedAt: new Date().toISOString(),
              revision: Date.now(),
            },
          },
        });
      }
      toast.success(displayMode === "slides" ? "已切换为逐页演示" : "已切换为连续阅读", {
        description: displayMode === "slides"
          ? "投屏时学生将跟随教师当前页。"
          : "投屏时学生将跟随教师阅读位置。",
        duration: 3_500,
      });
    } catch (error) {
      toast.error("展示方式切换失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
        duration: 5_000,
      });
    } finally {
      setUpdatingDisplayMode(false);
    }
  }

  function startProjection(resource: CourseResource) {
    setSelectedId(resource.id);
    session.setUiState(course.id, {
      resourceProjection: {
        resourceId: resource.id,
        stageKey,
        title: resource.title,
        startedAt: new Date().toISOString(),
        viewState: {
          page: 1,
          scrollRatio: 0,
          mediaTime: 0,
          mediaPlaying: false,
          mediaPlaybackRate: 1,
          updatedAt: new Date().toISOString(),
          revision: Date.now(),
        },
      },
    });
  }

  function stopProjection() {
    session.setUiState(course.id, { resourceProjection: null });
  }

  function syncProjection(patch: ViewStatePatch) {
    if (!projection || projection.resourceId !== selected?.id) return;
    session.setUiState(course.id, {
      resourceProjection: {
        ...projection,
        viewState: {
          ...(projection.viewState ?? {}),
          ...patch,
          updatedAt: new Date().toISOString(),
          revision: Date.now(),
        },
      },
    });
  }

  return (
    <div className="space-y-4">
      <Card className="border-[var(--pbl-teacher-border)]" compact>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]">
              <BookOpen size={21} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--pbl-teacher)]">{stageName(stageKey)}</p>
              <h2 className="mt-0.5 text-xl font-bold text-[var(--pbl-text-strong)]">课堂资源</h2>
              <p className="mt-1 text-sm text-[var(--pbl-text-muted)]">演示文稿请先从 PowerPoint 导出为 PDF；同时支持 MP4、图片与常用资料。</p>
            </div>
          </div>
          <label className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--pbl-teacher)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--pbl-teacher-hover)] has-[:disabled]:cursor-wait has-[:disabled]:opacity-60">
            {uploading ? <LoaderCircle className="animate-spin" size={17} /> : <Upload size={17} />}
            {uploading ? "上传中…" : "上传资源"}
            <input
              accept={UPLOAD_ACCEPT}
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file?.name.toLowerCase().endsWith(".pdf")) {
                  setPendingPdf(file);
                } else if (file) {
                  void uploadResource(file);
                }
                event.target.value = "";
              }}
              type="file"
            />
          </label>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <Card compact>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-[var(--pbl-text-strong)]">资源列表</h3>
            <Pill tone="blue">{resources.length} 份</Pill>
          </div>
          {resources.length ? (
            <div className="mt-3 max-h-[42rem] space-y-2 overflow-y-auto pr-1">
              {resources.map((resource) => {
                const active = projectionIsActive(course, resource);
                const isSelected = selected?.id === resource.id;
                return (
                  <div
                    className={cn(
                      "flex w-full items-stretch overflow-hidden rounded-[var(--radius-sm)] border text-left transition",
                      isSelected
                        ? "border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)]/60"
                        : "border-[var(--pbl-border)] bg-white hover:border-[var(--pbl-teacher-border)]",
                    )}
                    key={resource.id}
                  >
                    <button className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left" onClick={() => setSelectedId(resource.id)} type="button">
                      <span className="grid h-9 min-w-10 shrink-0 place-items-center whitespace-nowrap rounded-[var(--radius-xs)] bg-white px-1.5 text-center text-[10px] font-bold text-[var(--pbl-teacher)] ring-1 ring-[var(--pbl-border)]">{courseResourceTypeLabel(resource.type)}</span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm text-[var(--pbl-text-strong)]">{resource.title}</strong>
                        <span className="mt-1 flex items-center gap-2 text-xs text-[var(--pbl-text-muted)]">{resource.size}{active ? <span className="font-semibold text-[var(--pbl-success)]">· 投屏中</span> : null}</span>
                      </span>
                    </button>
                    <button
                      aria-label={`删除资源 ${resource.title}`}
                      className="grid w-10 shrink-0 place-items-center border-l border-[var(--pbl-border)] text-[var(--pbl-text-subtle)] transition hover:bg-[var(--pbl-danger-soft)] hover:text-[var(--pbl-danger)] disabled:opacity-50"
                      disabled={Boolean(deletingId)}
                      onClick={() => void deleteResource(resource)}
                      title="删除资源"
                      type="button"
                    >{deletingId === resource.id ? <LoaderCircle className="animate-spin" size={15} /> : <Trash2 size={15} />}</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--pbl-border-strong)] py-12 text-center text-sm text-[var(--pbl-text-muted)]">尚未上传资源</div>
          )}
        </Card>

        <Card className="overflow-hidden" compact>
          {selected ? (
            <>
              <div className="border-b border-[var(--pbl-border)] pb-4">
                <div className="flex min-w-0 items-center gap-3">
                  <h3 className="min-w-0 flex-1 truncate font-bold leading-7 text-[var(--pbl-text-strong)]">{selected.title}</h3>
                  {isConvertedPresentation(selected) ? <Pill className="shrink-0 whitespace-nowrap" size="sm" tone="amber">建议改传PDF</Pill> : null}
                  {projectionIsActive(course, selected) ? <Pill className="shrink-0 gap-1.5 whitespace-nowrap" size="sm" tone="green"><MonitorUp size={12} />投屏中</Pill> : null}
                  <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                    <PrimaryButton onClick={() => setDialogResource(selected)} size="sm" tone="slate" variant="outline"><Maximize2 size={14} />全屏预览</PrimaryButton>
                    {projectionIsActive(course, selected) ? (
                      <PrimaryButton onClick={stopProjection} size="sm" tone="red" variant="outline"><MonitorOff size={14} />停止投屏</PrimaryButton>
                    ) : (
                      <PrimaryButton onClick={() => startProjection(selected)} size="sm"><MonitorUp size={14} />投屏</PrimaryButton>
                    )}
                  </div>
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-2 whitespace-nowrap text-xs text-[var(--pbl-text-muted)]">
                  <span>{resourceFormatLabel(selected)} · {selected.size}</span>
                  {selected.previewUrl && selected.url ? (
                    <a className="inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--pbl-teacher)] hover:underline" href={selected.url} rel="noreferrer" target="_blank"><ExternalLink size={12} />原始PPT</a>
                  ) : null}
                  {selected.type.toUpperCase() === "PDF" ? (
                    <span aria-label="PDF 展示方式" className="inline-flex shrink-0 items-center rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)] p-0.5">
                      <button
                        aria-pressed={selected.displayMode === "slides"}
                        className={cn(
                          "rounded px-2 py-1 font-semibold transition",
                          selected.displayMode === "slides"
                            ? "bg-[var(--pbl-teacher)] text-white shadow-sm"
                            : "text-[var(--pbl-text-muted)] hover:text-[var(--pbl-text-strong)]",
                        )}
                        disabled={updatingDisplayMode}
                        onClick={() => void updatePdfDisplayMode(selected, "slides")}
                        type="button"
                      >逐页演示</button>
                      <button
                        aria-pressed={selected.displayMode !== "slides"}
                        className={cn(
                          "rounded px-2 py-1 font-semibold transition",
                          selected.displayMode !== "slides"
                            ? "bg-white text-[var(--pbl-text-strong)] shadow-sm"
                            : "text-[var(--pbl-text-muted)] hover:text-[var(--pbl-text-strong)]",
                        )}
                        disabled={updatingDisplayMode}
                        onClick={() => void updatePdfDisplayMode(selected, "document")}
                        type="button"
                      >连续阅读</button>
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 h-[32rem] min-h-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)]">
                <ResourceViewer
                  key={`${selected.id}:${projectionIsActive(course, selected) ? "controller" : "self"}`}
                  mode={projectionIsActive(course, selected) ? "controller" : "self"}
                  onViewStateChange={syncProjection}
                  projection={projectionIsActive(course, selected) ? projection ?? undefined : undefined}
                  resource={selected}
                />
              </div>
            </>
          ) : (
            <div className="grid min-h-[32rem] place-items-center text-center text-sm text-[var(--pbl-text-muted)]"><div><FileText className="mx-auto text-stone-300" size={36} /><p className="mt-3">上传资源后可在这里预览和投屏</p></div></div>
          )}
        </Card>
      </div>

      {dialogResource ? <ResourceDialog onClose={() => setDialogResource(undefined)} resource={dialogResource} title="资源预览" /> : null}
      {pendingPdf ? (
        <PdfDisplayModeDialog
          file={pendingPdf}
          onCancel={() => setPendingPdf(undefined)}
          onSelect={(displayMode) => {
            const file = pendingPdf;
            setPendingPdf(undefined);
            void uploadResource(file, displayMode);
          }}
        />
      ) : null}
    </div>
  );
}

export function SimplifiedStudentStageView({
  course,
  stageKey,
}: {
  course: Course;
  stageKey: string;
}) {
  const session = useSession();
  const resources = resourcesForStage(course.resources, stageKey);
  const [preview, setPreview] = useState<CourseResource>();

  function openResource(resource: CourseResource) {
    session.markResourceDownloaded(course.id, resource.id);
    setPreview(resource);
  }

  return (
    <div className="space-y-4">
      <Card className="border-[var(--pbl-student-border)]" compact>
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]"><BookOpen size={21} /></span>
          <div><p className="text-xs font-semibold text-[var(--pbl-student)]">{stageName(stageKey)}</p><h1 className="mt-0.5 text-xl font-bold text-[var(--pbl-text-strong)]">学习资源</h1><p className="mt-1 text-sm text-[var(--pbl-text-muted)]">选择资料开始查看。</p></div>
        </div>
      </Card>
      {resources.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {resources.map((resource) => {
            const viewed = Boolean(session.studentId && resource.downloadedBy.includes(session.studentId));
            return (
              <button className="rounded-[var(--radius-md)] border border-[var(--pbl-border)] bg-white p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-[var(--pbl-student-border)] hover:shadow-[var(--shadow-raised)]" key={resource.id} onClick={() => openResource(resource)} type="button">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--pbl-student-soft)] px-1 text-center text-[10px] font-bold text-[var(--pbl-student)]">{courseResourceTypeLabel(resource.type)}</span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-[var(--pbl-text-strong)]">{resource.title}</strong><span className="mt-1 block text-xs text-[var(--pbl-text-muted)]">{resource.size} · {viewed ? "已查看" : "未查看"}</span></span>
                  <Eye className="shrink-0 text-[var(--pbl-text-subtle)]" size={17} />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Card className="py-16 text-center"><FileText className="mx-auto text-stone-300" size={32} /><p className="mt-3 text-sm text-[var(--pbl-text-muted)]">本阶段暂无学习资源</p></Card>
      )}
      {preview ? <ResourceDialog onClose={() => setPreview(undefined)} resource={preview} title="学习资源" /> : null}
    </div>
  );
}

export function StudentResourceProjection({
  resource,
  projection,
}: {
  resource: CourseResource;
  projection: ClassroomResourceProjection;
}) {
  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-slate-950/45 p-2 backdrop-blur-sm sm:p-4" role="presentation">
      <section aria-labelledby="resource-projection-title" aria-modal="true" className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-white/70 bg-[var(--pbl-surface)] shadow-2xl" role="dialog">
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--pbl-border)] bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-teacher)] text-white"><MonitorUp size={18} /></span><div className="min-w-0"><p className="text-xs font-semibold text-[var(--pbl-teacher)]">课堂演示</p><h2 className="truncate text-lg font-bold text-[var(--pbl-text-strong)]" id="resource-projection-title">{resource.title}</h2></div></div>
          <Pill tone="green">同步中</Pill>
        </header>
        <div className="min-h-0 flex-1 p-2 sm:p-3"><ResourceViewer mode="follower" projection={projection} resource={resource} /></div>
      </section>
    </div>
  );
}

function ResourceDialog({
  resource,
  title,
  onClose,
}: {
  resource: CourseResource;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[140] bg-slate-950/45 p-2 backdrop-blur-sm sm:p-4">
      <button aria-label="关闭资源预览" className="absolute inset-0" onClick={onClose} type="button" />
      <section aria-modal="true" className="relative z-10 mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-white/70 bg-[var(--pbl-surface)] shadow-2xl" role="dialog">
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--pbl-border)] bg-white px-4 sm:px-6">
          <div className="min-w-0"><p className="text-xs font-semibold text-[var(--pbl-teacher)]">{title}</p><h2 className="truncate text-lg font-bold text-[var(--pbl-text-strong)]">{resource.title}</h2></div>
          <button aria-label="关闭资源预览" className="grid size-10 place-items-center rounded-full border border-[var(--pbl-border)] text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)]" onClick={onClose} type="button"><X size={18} /></button>
        </header>
        <div className="min-h-0 flex-1 p-2 sm:p-3"><ResourceViewer mode="self" resource={resource} /></div>
      </section>
    </div>
  );
}

function PdfDisplayModeDialog({
  file,
  onCancel,
  onSelect,
}: {
  file: File;
  onCancel: () => void;
  onSelect: (displayMode: "document" | "slides") => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[145] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <button aria-label="取消上传 PDF" className="absolute inset-0" onClick={onCancel} type="button" />
      <section aria-labelledby="pdf-display-mode-title" aria-modal="true" className="relative z-10 w-full max-w-xl rounded-[var(--radius-lg)] border border-white/70 bg-white p-6 shadow-2xl" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--pbl-teacher)]">PDF 展示方式</p>
            <h2 className="mt-1 text-xl font-bold text-[var(--pbl-text-strong)]" id="pdf-display-mode-title">这份 PDF 如何用于课堂？</h2>
            <p className="mt-1 truncate text-sm text-[var(--pbl-text-muted)]">{file.name}</p>
          </div>
          <button aria-label="取消上传 PDF" className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)]" onClick={onCancel} type="button"><X size={18} /></button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button className="rounded-[var(--radius-md)] border-2 border-[var(--pbl-teacher)] bg-[var(--pbl-teacher-soft)] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]" onClick={() => onSelect("slides")} type="button">
            <span className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-teacher)] text-white"><MonitorUp size={18} /></span>
            <strong className="mt-3 block text-[var(--pbl-text-strong)]">幻灯片演示</strong>
            <span className="mt-1 block text-sm leading-6 text-[var(--pbl-text-muted)]">逐页播放；教师翻页后，学生同步到同一页且不能自行前后翻页。</span>
            <Pill className="mt-3" size="sm" tone="blue">PPT 导出 PDF 选此项</Pill>
          </button>
          <button className="rounded-[var(--radius-md)] border border-[var(--pbl-border)] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--pbl-teacher-border)] hover:shadow-[var(--shadow-raised)]" onClick={() => onSelect("document")} type="button">
            <span className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-surface-soft)] text-[var(--pbl-text-muted)]"><FileText size={18} /></span>
            <strong className="mt-3 block text-[var(--pbl-text-strong)]">连续阅读</strong>
            <span className="mt-1 block text-sm leading-6 text-[var(--pbl-text-muted)]">按普通 PDF 上下滚动；投屏时同步教师当前阅读位置。</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function ResourceViewer({
  resource,
  mode,
  projection,
  onViewStateChange,
}: {
  resource: CourseResource;
  mode: ViewerMode;
  projection?: ClassroomResourceProjection;
  onViewStateChange?: (patch: ViewStatePatch) => void;
}) {
  const kind = useMemo(() => resourceKind(resource), [resource]);
  const previewUrl = resourcePreviewUrl(resource);
  if (!previewUrl || kind === "download") {
    const isUnconvertedPpt = resource.type.toUpperCase() === "PPTX" && !resource.previewUrl;
    return (
      <DownloadFallback
        message={isUnconvertedPpt
          ? "这份 PPT 尚未生成 PDF 课堂版。为避免版式错位，请教师重新上传或改传 PDF。"
          : undefined}
        resource={resource}
      />
    );
  }
  if (kind === "pdf") return <PdfViewer mode={mode} onViewStateChange={onViewStateChange} projection={projection} resource={resource} />;
  if (kind === "video") return <VideoViewer mode={mode} onViewStateChange={onViewStateChange} projection={projection} resource={resource} />;
  if (kind === "text") return <TextViewer resource={resource} />;
  if (kind === "image") return <div className="relative h-full min-h-72 overflow-hidden rounded-[var(--radius-sm)] bg-stone-950 p-3"><Image alt={resource.title} className="object-contain p-3" fill src={previewUrl} unoptimized /></div>;
  if (kind === "audio") return <div className="grid h-full min-h-72 place-items-center rounded-[var(--radius-sm)] bg-white"><audio className="w-[min(640px,90%)]" controls src={previewUrl} /></div>;
  return <DownloadFallback resource={resource} />;
}

function PdfViewer({
  resource,
  mode,
  projection,
  onViewStateChange,
}: {
  resource: CourseResource;
  mode: ViewerMode;
  projection?: ClassroomResourceProjection;
  onViewStateChange?: (patch: ViewStatePatch) => void;
}) {
  const [pdf, setPdf] = useState<PdfDocument>();
  const [error, setError] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const syncTimerRef = useRef<number | undefined>(undefined);
  const previewUrl = resourcePreviewUrl(resource);

  useEffect(() => {
    const controller = new AbortController();
    let loadedPdf: PdfDocument | undefined;
    void fetch(previewUrl!, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`PDF 读取失败（${response.status}）`);
        const data = await response.arrayBuffer();
        const pdfModuleUrl = "/vendor/pdfjs/pdf.min.mjs";
        const pdfjs = await import(
          /* webpackIgnore: true */
          /* @vite-ignore */
          pdfModuleUrl
        ) as unknown as PdfJsModule;
        pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
        loadedPdf = await pdfjs.getDocument({ data }).promise;
        if (!controller.signal.aborted) setPdf(loadedPdf);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "PDF 读取失败");
      });
    return () => {
      controller.abort();
      if (syncTimerRef.current !== undefined) window.clearTimeout(syncTimerRef.current);
      void loadedPdf?.destroy?.();
    };
  }, [previewUrl]);

  useEffect(() => {
    if (mode !== "follower" || !pdf) return;
    const ratio = projection?.viewState?.scrollRatio ?? 0;
    const frame = window.requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
      container.scrollTop = maxScroll * Math.min(1, Math.max(0, ratio));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode, pdf, projection?.viewState?.revision, projection?.viewState?.scrollRatio]);

  function queueScrollSync() {
    if (mode !== "controller" || !onViewStateChange || syncTimerRef.current !== undefined) return;
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = undefined;
      const container = scrollRef.current;
      if (!container || !pdf) return;
      const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
      const ratio = Math.min(1, Math.max(0, container.scrollTop / maxScroll));
      const page = Math.min(pdf.numPages, Math.max(1, Math.round(ratio * Math.max(0, pdf.numPages - 1)) + 1));
      onViewStateChange({ scrollRatio: ratio, page });
    }, 180);
  }

  if (error) return <DownloadFallback message={error} resource={resource} />;
  if (!pdf) return <LoadingPreview label="正在解析 PDF…" />;
  if (isPresentationPdf(resource)) {
    return (
      <PdfPresentationViewer
        mode={mode}
        onViewStateChange={onViewStateChange}
        pdf={pdf}
        projection={projection}
      />
    );
  }
  return (
    <div className="relative h-full min-h-72 overflow-hidden rounded-[var(--radius-sm)] bg-stone-200">
      <div className="absolute right-3 top-3 z-10 rounded-full bg-stone-950/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">{pdf.numPages} 页{mode === "follower" ? " · 跟随教师" : ""}</div>
      <div className="h-full overflow-y-auto overscroll-contain p-3 sm:p-5" onScroll={queueScrollSync} ref={scrollRef}>
        <div className="mx-auto max-w-5xl space-y-4">
          {Array.from({ length: pdf.numPages }, (_, index) => <PdfPageCanvas key={index + 1} pageNumber={index + 1} pdf={pdf} />)}
        </div>
      </div>
    </div>
  );
}

function PdfPresentationViewer({
  pdf,
  mode,
  projection,
  onViewStateChange,
}: {
  pdf: PdfDocument;
  mode: ViewerMode;
  projection?: ClassroomResourceProjection;
  onViewStateChange?: (patch: ViewStatePatch) => void;
}) {
  const [localPage, setLocalPage] = useState(1);
  const projectedPage = projection?.viewState?.page ?? 1;
  const page = mode === "self" ? localPage : projectedPage;
  const safePage = Math.min(pdf.numPages, Math.max(1, page));

  function changePage(nextPage: number) {
    const value = Math.min(pdf.numPages, Math.max(1, nextPage));
    setLocalPage(value);
    if (mode === "controller") onViewStateChange?.({ page: value });
  }

  return (
    <div className="flex h-full min-h-72 flex-col overflow-hidden rounded-[var(--radius-sm)] bg-stone-950">
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-5">
        <PdfSlideCanvas key={safePage} pageNumber={safePage} pdf={pdf} />
      </div>
      <div className="flex h-14 shrink-0 items-center justify-center gap-4 border-t border-white/10 bg-stone-900 px-4 text-white">
        {mode !== "follower" ? (
          <button aria-label="上一页" className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30" disabled={safePage <= 1} onClick={() => changePage(safePage - 1)} type="button"><ChevronLeft size={19} /></button>
        ) : null}
        <span className="min-w-28 text-center text-sm font-semibold">{safePage} / {pdf.numPages}{mode === "follower" ? " · 跟随教师" : ""}</span>
        {mode !== "follower" ? (
          <button aria-label="下一页" className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30" disabled={safePage >= pdf.numPages} onClick={() => changePage(safePage + 1)} type="button"><ChevronRight size={19} /></button>
        ) : null}
      </div>
    </div>
  );
}

function PdfSlideCanvas({ pdf, pageNumber }: { pdf: PdfDocument; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel?: () => void } | undefined;
    void pdf.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: 1.75 });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      return renderTask.promise;
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [pageNumber, pdf]);

  if (error) {
    return <div className="grid aspect-video w-full max-w-6xl place-items-center rounded-[var(--radius-xs)] bg-white text-sm text-[var(--pbl-danger)]">第 {pageNumber} 页加载失败</div>;
  }
  return <canvas aria-label={`PPT 第 ${pageNumber} 页`} className="block max-h-full max-w-full rounded-[var(--radius-xs)] bg-white shadow-2xl" ref={canvasRef} />;
}

function PdfPageCanvas({ pdf, pageNumber }: { pdf: PdfDocument; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel?: () => void } | undefined;
    void pdf.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: 1.55 });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      return renderTask.promise;
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [pageNumber, pdf]);
  return (
    <figure className="overflow-hidden rounded-[var(--radius-xs)] bg-white shadow-md">
      {error ? <div className="grid aspect-[3/4] place-items-center text-sm text-[var(--pbl-danger)]">第 {pageNumber} 页加载失败</div> : <canvas aria-label={`PDF 第 ${pageNumber} 页`} className="block h-auto w-full" ref={canvasRef} />}
      <figcaption className="border-t border-[var(--pbl-border)] px-3 py-1.5 text-center text-[11px] text-[var(--pbl-text-muted)]">第 {pageNumber} 页</figcaption>
    </figure>
  );
}

function VideoViewer({
  resource,
  mode,
  projection,
  onViewStateChange,
}: {
  resource: CourseResource;
  mode: ViewerMode;
  projection?: ClassroomResourceProjection;
  onViewStateChange?: (patch: ViewStatePatch) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTimeSyncRef = useRef(0);
  const [playBlocked, setPlayBlocked] = useState(false);
  const viewState = projection?.viewState;
  const mediaPlaying = viewState?.mediaPlaying;
  const mediaTime = viewState?.mediaTime;
  const mediaPlaybackRate = viewState?.mediaPlaybackRate;
  const mediaUpdatedAt = viewState?.updatedAt;
  const mediaRevision = viewState?.revision;

  useEffect(() => {
    if (mode !== "follower" || !videoRef.current || !mediaUpdatedAt) return;
    const video = videoRef.current;
    const elapsed = mediaPlaying
      ? Math.max(0, (Date.now() - Date.parse(mediaUpdatedAt)) / 1000)
      : 0;
    const expectedTime = Math.max(0, (mediaTime ?? 0) + elapsed * (mediaPlaybackRate ?? 1));
    if (Number.isFinite(expectedTime) && Math.abs(video.currentTime - expectedTime) > 0.55) {
      video.currentTime = Math.min(expectedTime, Number.isFinite(video.duration) ? video.duration : expectedTime);
    }
    video.playbackRate = mediaPlaybackRate ?? 1;
    if (mediaPlaying) {
      void video.play().then(() => setPlayBlocked(false)).catch(() => setPlayBlocked(true));
    } else {
      video.pause();
    }
  }, [mediaPlaybackRate, mediaPlaying, mediaRevision, mediaTime, mediaUpdatedAt, mode]);

  function emit(playing = !videoRef.current?.paused) {
    const video = videoRef.current;
    if (mode !== "controller" || !video) return;
    onViewStateChange?.({
      mediaTime: video.currentTime,
      mediaPlaying: playing,
      mediaPlaybackRate: video.playbackRate,
    });
  }

  return (
    <div className="relative grid h-full min-h-72 place-items-center overflow-hidden rounded-[var(--radius-sm)] bg-black">
      <video
        className="max-h-full max-w-full"
        controls={mode !== "follower"}
        onPause={() => emit(false)}
        onPlay={() => emit(true)}
        onRateChange={() => emit()}
        onSeeked={() => emit()}
        onTimeUpdate={() => {
          if (Date.now() - lastTimeSyncRef.current < 1_500) return;
          lastTimeSyncRef.current = Date.now();
          emit();
        }}
        playsInline
        preload="metadata"
        ref={videoRef}
        src={resource.url}
      />
      {mode === "follower" ? (
        <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-stone-950/75 px-4 py-2 text-xs font-semibold text-white backdrop-blur">
          {viewState?.mediaPlaying ? <Play size={14} /> : <Pause size={14} />}跟随教师播放
        </div>
      ) : null}
      {playBlocked && mediaPlaying ? (
        <button className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-white" onClick={() => void videoRef.current?.play().then(() => setPlayBlocked(false))} type="button"><span className="grid size-14 place-items-center rounded-full bg-white text-stone-950"><Play className="ml-1" size={25} /></span><span className="mt-3 text-sm font-semibold">点击继续同步播放</span></button>
      ) : null}
    </div>
  );
}

function TextViewer({ resource }: { resource: CourseResource }) {
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch(resource.url!, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`资源读取失败（${response.status}）`);
        return response.text();
      })
      .then((value) => setText(value))
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "资源读取失败");
      });
    return () => controller.abort();
  }, [resource.url]);
  if (error) return <DownloadFallback message={error} resource={resource} />;
  if (text === undefined) return <LoadingPreview label="正在加载资源…" />;
  return <pre className="h-full min-h-72 overflow-auto rounded-[var(--radius-sm)] bg-slate-950 p-5 font-mono text-sm leading-6 text-slate-100">{text}</pre>;
}

function LoadingPreview({ label }: { label: string }) {
  return <div className="grid h-full min-h-72 place-items-center rounded-[var(--radius-sm)] bg-white text-sm text-[var(--pbl-text-muted)]"><span className="inline-flex items-center gap-2"><LoaderCircle className="animate-spin" size={18} />{label}</span></div>;
}

function DownloadFallback({ resource, message }: { resource: CourseResource; message?: string }) {
  return (
    <div className="grid h-full min-h-72 place-items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--pbl-border-strong)] bg-white p-8 text-center">
      <div><FileText className="mx-auto text-stone-300" size={42} /><h3 className="mt-4 text-lg font-bold text-[var(--pbl-text-strong)]">{resource.title}</h3><p className="mt-2 text-sm text-[var(--pbl-text-muted)]">{message || "此格式需要使用本机应用打开。"}</p>{resource.url ? <a className="mt-5 inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-stone-950 px-4 text-sm font-semibold text-white" href={resource.url} rel="noreferrer" target="_blank"><ExternalLink size={15} />打开原文件</a> : null}</div>
    </div>
  );
}
