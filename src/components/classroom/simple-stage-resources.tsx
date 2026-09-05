"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  LoaderCircle,
  Maximize2,
  MonitorOff,
  MonitorUp,
  Minimize2,
  Pause,
  Play,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
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
import { StageEmptyState, StagePageHeader, StageSplitLayout } from "@/components/classroom/classroom-ui";

const UPLOAD_ACCEPT = [
  ".pdf", ".mp4", ".mov", ".webm", ".docx", ".xlsx",
  ".mp3", ".wav", ".m4a", ".ogg", ".png", ".jpg", ".jpeg",
  ".webp", ".gif", ".txt", ".md", ".csv",
].join(",");

type ViewerMode = "self" | "controller" | "follower";
type ResourceKind = "image" | "video" | "audio" | "text" | "pdf" | "download";
type ViewStatePatch = Partial<Omit<ClassroomResourceViewState, "updatedAt" | "revision">>;
type PdfReadingProgress = { page: number; scrollRatio: number; zoom: number; fitWidth?: boolean; updatedAt: string };

function savedPdfReadingProgress(storageKey?: string): PdfReadingProgress | undefined {
  if (!storageKey || typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as PdfReadingProgress;
    if (!Number.isFinite(saved.page) || !Number.isFinite(saved.scrollRatio)) return undefined;
    if (saved.page <= 1 && saved.scrollRatio < 0.02) return undefined;
    return {
      ...saved,
      page: Math.max(1, saved.page),
      scrollRatio: Math.min(1, Math.max(0, saved.scrollRatio)),
      zoom: Number.isFinite(saved.zoom) ? Math.min(1.75, Math.max(0.25, saved.zoom)) : 1,
    };
  } catch {
    return undefined;
  }
}

function persistPdfReadingProgress(storageKey: string | undefined, value: PdfReadingProgress) {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // 隐私模式或存储空间不足时，阅读器仍可正常使用。
  }
}

function useAutoHidingControls(enabled: boolean) {
  const [visible, setVisible] = useState(true);
  const hideTimerRef = useRef<number | undefined>(undefined);
  const reveal = useCallback(() => {
    if (!enabled) return;
    setVisible(true);
    if (hideTimerRef.current !== undefined) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setVisible(false), 1_800);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => setVisible(false), 1_800);
    return () => {
      window.clearTimeout(timer);
      if (hideTimerRef.current !== undefined) window.clearTimeout(hideTimerRef.current);
    };
  }, [enabled]);

  return { visible: !enabled || visible, reveal };
}

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
  const [resourceListOpen, setResourceListOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string>();
  const [dialogResource, setDialogResource] = useState<CourseResource>();
  const [viewerRevision, setViewerRevision] = useState(0);
  const [readingProgressByResource, setReadingProgressByResource] = useState<Record<string, PdfReadingProgress>>({});
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
      toast.success("学习资料上传成功", {
        description: `“${payload?.title || file.name}”已加入本阶段学习资料。`,
        duration: 3_500,
      });
    } catch (error) {
      toast.error("学习资料上传失败", {
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
      toast.success("学习资料已删除", {
        description: `“${resource.title}”已从本阶段移除。`,
        duration: 3_500,
      });
      if (selectedId === resource.id) setSelectedId(undefined);
      if (dialogResource?.id === resource.id) setDialogResource(undefined);
    } catch (error) {
      toast.error("学习资料删除失败", {
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

  const uploadControl = (
    <label className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--pbl-teacher)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--pbl-teacher-hover)] has-[:disabled]:cursor-wait has-[:disabled]:opacity-60">
      {uploading ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}
      {uploading ? "上传中…" : "上传资料"}
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
  );

  const resourceList = (
    <Card className="classroom-panel" compact>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-[var(--pbl-text-strong)]">学习资料</h3>
            <div className="flex items-center gap-2">
              <Pill tone="blue">{resources.length} 份</Pill>
              <button
                aria-label="收起学习资料侧栏"
                className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-[var(--pbl-text-muted)] transition hover:bg-[var(--pbl-surface-soft)] hover:text-[var(--pbl-text-strong)]"
                onClick={() => setResourceListOpen(false)}
                title="收起学习资料"
                type="button"
              >
                <ChevronRight size={17} />
              </button>
            </div>
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
                      aria-label={`删除学习资料 ${resource.title}`}
                      className="grid w-10 shrink-0 place-items-center border-l border-[var(--pbl-border)] text-[var(--pbl-text-subtle)] transition hover:bg-[var(--pbl-danger-soft)] hover:text-[var(--pbl-danger)] disabled:opacity-50"
                      disabled={Boolean(deletingId)}
                      onClick={() => void deleteResource(resource)}
                      title="删除学习资料"
                      type="button"
                    >{deletingId === resource.id ? <LoaderCircle className="animate-spin" size={15} /> : <Trash2 size={15} />}</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--pbl-border-strong)] py-12 text-center text-sm text-[var(--pbl-text-muted)]">尚未上传学习资料</div>
          )}
    </Card>
  );

  const resourcePreview = (
    <Card className="overflow-hidden classroom-panel" compact>
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
                  initialReadingProgress={readingProgressByResource[selected.id]}
                  key={`${selected.id}:${projectionIsActive(course, selected) ? "controller" : "self"}:${viewerRevision}`}
                  mode={projectionIsActive(course, selected) ? "controller" : "self"}
                  onReadingProgressChange={(progress) => setReadingProgressByResource((current) => ({ ...current, [selected.id]: progress }))}
                  onViewStateChange={syncProjection}
                  progressKey={`teacher:${course.id}:${selected.id}`}
                  projection={projectionIsActive(course, selected) ? projection ?? undefined : undefined}
                  resource={selected}
                />
              </div>
            </>
          ) : (
            <div className="grid min-h-[32rem] place-items-center text-center text-sm text-[var(--pbl-text-muted)]"><div><FileText className="mx-auto text-stone-300" size={36} /><p className="mt-3">上传资源后可在这里预览和投屏</p></div></div>
          )}
    </Card>
  );

  return (
    <div className="classroom-stage space-y-4">
      <StagePageHeader
        action={uploadControl}
        description="整理可讲授、可投屏的学习资料；PPT 请先导出为 PDF。"
        title="学习资料"
      />

      {resources.length ? (
        <div className={cn(
          "grid items-start gap-4",
          resourceListOpen
            ? "xl:grid-cols-[minmax(0,1fr)_18rem]"
            : "xl:grid-cols-[minmax(0,1fr)_3.25rem]",
        )}>
          <div className="min-w-0">{resourcePreview}</div>
          <aside className="min-w-0 xl:sticky xl:top-20">
            {resourceListOpen ? resourceList : (
              <button
                aria-label="展开学习资料侧栏"
                aria-expanded="false"
                className="flex h-12 w-full flex-row items-center justify-center gap-3 rounded-[var(--radius-md)] border border-[var(--pbl-border)] bg-white px-4 text-[var(--pbl-teacher)] shadow-[var(--shadow-soft)] transition hover:border-[var(--pbl-teacher-border)] hover:bg-[var(--pbl-teacher-soft)]/40 xl:h-auto xl:min-h-48 xl:flex-col xl:px-0 xl:py-4"
                onClick={() => setResourceListOpen(true)}
                title="展开学习资料"
                type="button"
              >
                <ChevronLeft size={18} />
                <span className="text-xs font-bold [writing-mode:horizontal-tb] xl:[writing-mode:vertical-rl]">学习资料</span>
                <Pill size="sm" tone="blue">{resources.length}</Pill>
              </button>
            )}
          </aside>
        </div>
      ) : (
        <StageEmptyState
          description="上传 PDF、视频、图片或其他学习资料后，学生会在本阶段看到并阅读这些内容。"
          eyebrow="尚未发布资料"
          icon={BookOpen}
          title="先添加本阶段的学习资料"
          tone="teacher"
        />
      )}

      {dialogResource ? (
        <ResourceDialog
          action={projectionIsActive(course, dialogResource) ? (
            <PrimaryButton onClick={stopProjection} size="sm" tone="red" variant="outline"><MonitorOff size={14} />停止投屏</PrimaryButton>
          ) : (
            <PrimaryButton onClick={() => startProjection(dialogResource)} size="sm"><MonitorUp size={14} />投屏</PrimaryButton>
          )}
          initialReadingProgress={readingProgressByResource[dialogResource.id]}
          mode={projectionIsActive(course, dialogResource) ? "controller" : "self"}
          onClose={() => {
            setDialogResource(undefined);
            setViewerRevision((value) => value + 1);
          }}
          onReadingProgressChange={(progress) => setReadingProgressByResource((current) => ({ ...current, [dialogResource.id]: progress }))}
          onViewStateChange={syncProjection}
          progressKey={`teacher:${course.id}:${dialogResource.id}`}
          projection={projectionIsActive(course, dialogResource) ? projection ?? undefined : undefined}
          resource={dialogResource}
          title="学习资料预览"
        />
      ) : null}
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
  const [selectedId, setSelectedId] = useState<string>();
  const [dialogResource, setDialogResource] = useState<CourseResource>();
  const [viewerRevision, setViewerRevision] = useState(0);
  const [readingProgressByResource, setReadingProgressByResource] = useState<Record<string, PdfReadingProgress>>({});
  const selected = resources.find((resource) => resource.id === selectedId) ?? resources[0];

  useEffect(() => {
    if (!selected || !session.studentId) return;
    if (selected.downloadedBy.includes(session.studentId)) return;
    session.markResourceDownloaded(course.id, selected.id);
  }, [course.id, selected, session]);

  function openResource(resource: CourseResource) {
    session.markResourceDownloaded(course.id, resource.id);
    setSelectedId(resource.id);
  }

  return (
    <div className="classroom-stage space-y-4">
      <StagePageHeader
        description={stageKey === "launch"
          ? "先阅读项目说明和学习资料，明确要解决的问题、阶段目标与协作分工，为下一阶段做好准备。"
          : "按自己的节奏阅读教师发布的学习资料，完成本阶段任务。"}
        title={stageKey === "launch" ? "了解项目任务，完成资料阅读" : "学习资料"}
        variant={stageKey === "launch" ? "student-card" : "plain"}
      />
      {resources.length ? (
        <StageSplitLayout
          aside={(
            <Card className="classroom-panel" compact>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-bold text-[var(--pbl-text-strong)]">学习资料</h2>
                <Pill tone="teal">{resources.length} 份</Pill>
              </div>
              <div className="mt-3 space-y-2">
                {resources.map((resource) => {
                  const viewed = Boolean(session.studentId && resource.downloadedBy.includes(session.studentId));
                  const active = selected?.id === resource.id;
                  const readingStatus = active ? "阅读中" : viewed ? "已阅读" : "未阅读";
                  return (
                    <button
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-[var(--radius-sm)] border p-3 text-left transition",
                        active
                          ? "border-[var(--pbl-student-border)] bg-[var(--pbl-student-soft)]/70"
                          : "border-[var(--pbl-border)] bg-white hover:border-[var(--pbl-student-border)]",
                      )}
                      key={resource.id}
                      onClick={() => openResource(resource)}
                      type="button"
                    >
                      <span className="grid h-8 min-w-9 shrink-0 place-items-center rounded-[var(--radius-xs)] bg-[var(--pbl-student-soft)] px-1 text-center text-[10px] font-bold text-[var(--pbl-student)]">{courseResourceTypeLabel(resource.type)}</span>
                      <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[var(--pbl-text-strong)]">{resource.title}</strong><span className="mt-1 block text-xs text-[var(--pbl-text-muted)]">{resource.size} · {readingStatus}</span></span>
                      <Eye className={cn("shrink-0", active ? "text-[var(--pbl-student)]" : "text-[var(--pbl-text-subtle)]")} size={16} />
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
          main={(
            <Card className="classroom-panel overflow-hidden" compact>
              {selected ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--pbl-border)] pb-3">
                    <div className="min-w-0"><p className="classroom-eyebrow text-[var(--pbl-student)]">正在阅读</p><h2 className="mt-1 truncate text-lg font-semibold text-[var(--pbl-text-strong)]">{selected.title}</h2><p className="mt-1 text-xs text-[var(--pbl-text-muted)]">{courseResourceTypeLabel(selected.type)} · {selected.size}</p></div>
                    <div className="flex items-center gap-2">
                      <Pill tone="teal">阅读中</Pill>
                      <PrimaryButton onClick={() => setDialogResource(selected)} size="sm" tone="slate" variant="outline"><Maximize2 size={14} />全屏阅读</PrimaryButton>
                    </div>
                  </div>
                  <div className="mt-3 h-[36rem] min-h-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)]">
                    <ResourceViewer
                      initialReadingProgress={readingProgressByResource[selected.id]}
                      key={`${selected.id}:${viewerRevision}`}
                      mode="self"
                      onReadingProgressChange={(progress) => setReadingProgressByResource((current) => ({ ...current, [selected.id]: progress }))}
                      progressKey={`student:${session.studentId ?? "guest"}:${course.id}:${selected.id}`}
                      resource={selected}
                    />
                  </div>
                </>
              ) : <StageEmptyState description="从学习资料列表选择一份资料开始阅读。" icon={FileText} title="选择一份学习资料" tone="student" />}
            </Card>
          )}
        />
      ) : (
        <StageEmptyState
          description="教师发布资料后会自动出现在这里。当前阶段没有需要你额外操作的内容。"
          eyebrow="等待教师发布"
          icon={FileText}
          title="本阶段暂未发布学习资料"
          tone="student"
        />
      )}
      {dialogResource ? (
        <ResourceDialog
          initialReadingProgress={readingProgressByResource[dialogResource.id]}
          mode="self"
          onClose={() => {
            setDialogResource(undefined);
            setViewerRevision((value) => value + 1);
          }}
          onReadingProgressChange={(progress) => setReadingProgressByResource((current) => ({ ...current, [dialogResource.id]: progress }))}
          progressKey={`student:${session.studentId ?? "guest"}:${course.id}:${dialogResource.id}`}
          resource={dialogResource}
          title="全屏阅读"
        />
      ) : null}
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
    <div className="fixed inset-0 z-[150] bg-slate-100" role="presentation">
      <section aria-label={`教师投屏：${resource.title}`} aria-modal="true" className="relative h-full w-full overflow-hidden bg-[var(--pbl-surface)]" role="dialog">
        <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex items-center justify-between gap-3 px-4">
          <div className="max-w-[70vw] truncate rounded-full bg-slate-950/65 px-3 py-1.5 text-xs font-semibold text-white/90 shadow-lg backdrop-blur"><span className="mr-2 text-white/55">教师投屏</span>{resource.title}</div>
          <Pill className="shrink-0 bg-white/90 shadow-lg" tone="green">同步中</Pill>
        </div>
        <div className="h-full min-h-0"><ResourceViewer fullscreen mode="follower" projection={projection} resource={resource} /></div>
      </section>
    </div>
  );
}

function ResourceDialog({
  resource,
  title,
  onClose,
  progressKey,
  action,
  mode = "self",
  projection,
  onViewStateChange,
  initialReadingProgress,
  onReadingProgressChange,
}: {
  resource: CourseResource;
  title: string;
  onClose: () => void;
  progressKey?: string;
  action?: ReactNode;
  mode?: ViewerMode;
  projection?: ClassroomResourceProjection;
  onViewStateChange?: (patch: ViewStatePatch) => void;
  initialReadingProgress?: PdfReadingProgress;
  onReadingProgressChange?: (progress: PdfReadingProgress) => void;
}) {
  const immersive = resourceKind(resource) === "pdf";
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
    <div className={cn("fixed inset-0 z-[140] bg-slate-950/55 backdrop-blur-sm", !immersive && "p-2 sm:p-4")}>
      <button aria-label="关闭资源预览" className="absolute inset-0" onClick={onClose} type="button" />
      <section aria-label={title} aria-modal="true" className={cn("relative z-10 mx-auto flex h-full w-full flex-col overflow-hidden bg-[var(--pbl-surface)] shadow-2xl", immersive ? "max-w-none" : "max-w-[1400px] rounded-[var(--radius-lg)] border border-white/70")} role="dialog">
        {!immersive ? <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--pbl-border)] bg-white px-4 sm:px-6">
          <div className="min-w-0"><p className="text-xs font-semibold text-[var(--pbl-teacher)]">{title}</p><h2 className="truncate text-lg font-bold text-[var(--pbl-text-strong)]">{resource.title}</h2></div>
          <div className="flex items-center gap-2">{action}<button aria-label="关闭资源预览" className="grid size-10 place-items-center rounded-full border border-[var(--pbl-border)] text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)]" onClick={onClose} type="button"><X size={18} /></button></div>
        </header> : (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex items-center justify-between px-4">
            <div className="pointer-events-auto max-w-[55vw] rounded-full bg-slate-950/65 px-3 py-1.5 text-xs font-semibold text-white/90 shadow-lg backdrop-blur"><span className="mr-2 text-white/55">{title}</span>{resource.title}</div>
            <div className="pointer-events-auto flex items-center gap-2">{action}<button aria-label="退出全屏阅读" className="grid size-10 place-items-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-lg backdrop-blur transition hover:bg-slate-950/80" onClick={onClose} type="button"><X size={18} /></button></div>
          </div>
        )}
        <div className={cn("min-h-0 flex-1", !immersive && "p-2 sm:p-3")}><ResourceViewer fullscreen={immersive} initialReadingProgress={initialReadingProgress} key={`${resource.id}:${mode}`} mode={mode} onReadingProgressChange={onReadingProgressChange} onViewStateChange={onViewStateChange} progressKey={progressKey} projection={projection} resource={resource} /></div>
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
          <button className="rounded-[var(--radius-md)] border-2 border-[var(--pbl-teacher)] bg-[var(--pbl-teacher-soft)] p-4 text-left transition hover:shadow-[var(--shadow-raised)]" onClick={() => onSelect("slides")} type="button">
            <span className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-teacher)] text-white"><MonitorUp size={18} /></span>
            <strong className="mt-3 block text-[var(--pbl-text-strong)]">幻灯片演示</strong>
            <span className="mt-1 block text-sm leading-6 text-[var(--pbl-text-muted)]">逐页播放；教师翻页后，学生同步到同一页且不能自行前后翻页。</span>
            <Pill className="mt-3" size="sm" tone="blue">PPT 导出 PDF 选此项</Pill>
          </button>
          <button className="rounded-[var(--radius-md)] border border-[var(--pbl-border)] bg-white p-4 text-left transition hover:border-[var(--pbl-teacher-border)] hover:shadow-[var(--shadow-raised)]" onClick={() => onSelect("document")} type="button">
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
  progressKey,
  fullscreen = false,
  initialReadingProgress,
  onReadingProgressChange,
}: {
  resource: CourseResource;
  mode: ViewerMode;
  projection?: ClassroomResourceProjection;
  onViewStateChange?: (patch: ViewStatePatch) => void;
  progressKey?: string;
  fullscreen?: boolean;
  initialReadingProgress?: PdfReadingProgress;
  onReadingProgressChange?: (progress: PdfReadingProgress) => void;
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
  if (kind === "pdf") return <PdfViewer fullscreen={fullscreen} initialReadingProgress={initialReadingProgress} mode={mode} onReadingProgressChange={onReadingProgressChange} onViewStateChange={onViewStateChange} progressKey={progressKey} projection={projection} resource={resource} />;
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
  progressKey,
  fullscreen,
  initialReadingProgress,
  onReadingProgressChange,
}: {
  resource: CourseResource;
  mode: ViewerMode;
  projection?: ClassroomResourceProjection;
  onViewStateChange?: (patch: ViewStatePatch) => void;
  progressKey?: string;
  fullscreen: boolean;
  initialReadingProgress?: PdfReadingProgress;
  onReadingProgressChange?: (progress: PdfReadingProgress) => void;
}) {
  const storageKey = progressKey ? `openpbl:pdf-reading:${progressKey}` : undefined;
  const [pdf, setPdf] = useState<PdfDocument>();
  const [error, setError] = useState<string>();
  const [currentPage, setCurrentPage] = useState(1);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [savedProgress, setSavedProgress] = useState<PdfReadingProgress | undefined>(() => initialReadingProgress ?? savedPdfReadingProgress(storageKey));
  const { visible: controlsVisible, reveal: revealControls } = useAutoHidingControls(fullscreen);
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
      setScrollRatio(ratio);
      setCurrentPage(Math.min(pdf.numPages, Math.max(1, projection?.viewState?.page ?? 1)));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode, pdf, projection?.viewState?.page, projection?.viewState?.revision, projection?.viewState?.scrollRatio]);

  const scrollToPage = useCallback((page: number, ratio?: number, behavior: ScrollBehavior = "smooth") => {
    if (!pdf) return;
    const safePage = Math.min(pdf.numPages, Math.max(1, page));
    const targetRatio = ratio ?? (pdf.numPages > 1 ? (safePage - 1) / (pdf.numPages - 1) : 0);
    const container = scrollRef.current;
    if (!container) return;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTo({ top: maxScroll * targetRatio, behavior });
  }, [pdf]);

  useEffect(() => {
    if ((!fullscreen && !initialReadingProgress) || !pdf || !savedProgress || mode === "follower") return;
    const target = savedProgress;
    const frame = window.requestAnimationFrame(() => setZoom(target.zoom));
    const firstAttempt = window.setTimeout(() => scrollToPage(target.page, target.scrollRatio, "auto"), 120);
    const settledAttempt = window.setTimeout(() => {
      scrollToPage(target.page, target.scrollRatio, "auto");
      setSavedProgress(undefined);
    }, 600);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(firstAttempt);
      window.clearTimeout(settledAttempt);
    };
  }, [fullscreen, initialReadingProgress, mode, pdf, savedProgress, scrollToPage]);

  function readingPosition() {
    const container = scrollRef.current;
    if (!container || !pdf) return { ratio: 0, page: 1 };
    const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
    const ratio = Math.min(1, Math.max(0, container.scrollTop / maxScroll));
    const page = Math.min(pdf.numPages, Math.max(1, Math.round(ratio * Math.max(0, pdf.numPages - 1)) + 1));
    return { ratio, page };
  }

  function handleScroll() {
    const position = readingPosition();
    setScrollRatio(position.ratio);
    setCurrentPage(position.page);
    if (fullscreen) revealControls();
    onReadingProgressChange?.({
      page: position.page,
      scrollRatio: position.ratio,
      zoom,
      updatedAt: new Date().toISOString(),
    });
    if (syncTimerRef.current !== undefined) return;
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = undefined;
      const latest = readingPosition();
      if (mode === "controller") onViewStateChange?.({ scrollRatio: latest.ratio, page: latest.page });
      if (storageKey && mode !== "follower") {
        const value: PdfReadingProgress = {
          page: latest.page,
          scrollRatio: latest.ratio,
          zoom,
          updatedAt: new Date().toISOString(),
        };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(value));
        } catch {
          // 隐私模式或存储空间不足时，阅读器仍可正常使用。
        }
      }
    }, 180);
  }

  function resumeReading() {
    if (!savedProgress) return;
    setZoom(savedProgress.zoom);
    window.requestAnimationFrame(() => scrollToPage(savedProgress.page, savedProgress.scrollRatio));
    setSavedProgress(undefined);
  }

  function changeZoom(nextZoom: number) {
    const next = Math.min(1.75, Math.max(0.25, nextZoom));
    const position = readingPosition();
    setZoom(next);
    const progress: PdfReadingProgress = {
      page: position.page,
      scrollRatio: position.ratio,
      zoom: next,
      fitWidth: false,
      updatedAt: new Date().toISOString(),
    };
    onReadingProgressChange?.(progress);
    if (mode !== "follower") persistPdfReadingProgress(storageKey, progress);
    window.requestAnimationFrame(() => scrollToPage(currentPage, position.ratio));
  }

  function fitToWidth() {
    const position = readingPosition();
    setZoom(1);
    const progress: PdfReadingProgress = {
      page: position.page,
      scrollRatio: position.ratio,
      zoom: 1,
      fitWidth: true,
      updatedAt: new Date().toISOString(),
    };
    onReadingProgressChange?.(progress);
    if (mode !== "follower") persistPdfReadingProgress(storageKey, progress);
    window.requestAnimationFrame(() => scrollToPage(currentPage, position.ratio));
  }

  async function fitToPage() {
    if (!pdf || !scrollRef.current) return;
    const position = readingPosition();
    const page = await pdf.getPage(position.page);
    const viewport = page.getViewport({ scale: 1 });
    const container = scrollRef.current;
    const availableWidth = Math.max(1, container.clientWidth - (fullscreen ? 64 : 40));
    const availableHeight = Math.max(1, container.clientHeight - (fullscreen ? 96 : 40));
    const pageAspect = viewport.height / Math.max(1, viewport.width);
    const next = Math.min(1.75, Math.max(0.25, availableHeight / (availableWidth * pageAspect)));
    setZoom(next);
    const progress: PdfReadingProgress = {
      page: position.page,
      scrollRatio: position.ratio,
      zoom: next,
      fitWidth: false,
      updatedAt: new Date().toISOString(),
    };
    onReadingProgressChange?.(progress);
    if (mode !== "follower") persistPdfReadingProgress(storageKey, progress);
    window.requestAnimationFrame(() => scrollToPage(currentPage, position.ratio));
  }

  if (error) return <DownloadFallback message={error} resource={resource} />;
  if (!pdf) return <LoadingPreview label="正在解析 PDF…" />;
  if (isPresentationPdf(resource)) {
    return (
      <PdfPresentationViewer
        fullscreen={fullscreen}
        mode={mode}
        onReadingProgressChange={onReadingProgressChange}
        onViewStateChange={onViewStateChange}
        pdf={pdf}
        projection={projection}
        restoreImmediately={fullscreen || Boolean(initialReadingProgress)}
        savedProgress={savedProgress}
        setSavedProgress={setSavedProgress}
        storageKey={storageKey}
      />
    );
  }
  return (
    <div className="relative flex h-full min-h-72 flex-col overflow-hidden rounded-[var(--radius-sm)] bg-slate-100" onPointerMove={fullscreen ? revealControls : undefined}>
      {fullscreen ? <div aria-label={`阅读进度 ${Math.round(scrollRatio * 100)}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(scrollRatio * 100)} className="absolute inset-x-0 top-0 z-40 h-1 bg-slate-200/70" role="progressbar"><div className="h-full bg-[var(--pbl-student)] transition-[width] duration-150" style={{ width: `${Math.round(scrollRatio * 100)}%` }} /></div> : null}
      <div className={cn("shrink-0 border-b border-[var(--pbl-border)] bg-white px-3 py-2.5 shadow-sm sm:px-4", fullscreen && "absolute bottom-5 left-1/2 z-20 w-fit max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full border bg-white/[0.92] px-3 py-2 shadow-2xl backdrop-blur transition duration-200", fullscreen && !controlsVisible && "pointer-events-none translate-y-3 opacity-0")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={cn("flex items-center gap-2", fullscreen && "hidden")}>
            <span className="grid size-8 place-items-center rounded-[var(--radius-xs)] bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]"><BookOpen size={16} /></span>
            <div>
              <p className="text-xs font-bold text-[var(--pbl-text-strong)]">沉浸阅读</p>
              <p className="text-[11px] text-[var(--pbl-text-muted)]">已阅读 {Math.round(scrollRatio * 100)}%</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {savedProgress && !fullscreen ? (
              <button className="mr-1 inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-[var(--pbl-student-soft)] px-2.5 text-xs font-bold text-[var(--pbl-student)] transition hover:brightness-95" onClick={resumeReading} type="button"><Bookmark size={14} />继续阅读 · 第 {Math.min(pdf.numPages, savedProgress.page)} 页</button>
            ) : null}
            {mode !== "follower" ? (
              <>
                <button aria-label="上一页" className="grid size-8 place-items-center rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)] disabled:opacity-35" disabled={currentPage <= 1} onClick={() => scrollToPage(currentPage - 1)} type="button"><ChevronLeft size={16} /></button>
                <label className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white px-2 text-xs font-semibold text-[var(--pbl-text-muted)]">
                  <span className="sr-only">当前页码</span>
                  <input aria-label="跳转页码" className="w-8 bg-transparent text-center font-bold text-[var(--pbl-text-strong)] outline-none" max={pdf.numPages} min={1} onChange={(event) => scrollToPage(Number(event.target.value))} type="number" value={currentPage} />
                  <span>/ {pdf.numPages}</span>
                </label>
                <button aria-label="下一页" className="grid size-8 place-items-center rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)] disabled:opacity-35" disabled={currentPage >= pdf.numPages} onClick={() => scrollToPage(currentPage + 1)} type="button"><ChevronRight size={16} /></button>
                <span className="mx-1 h-5 w-px bg-[var(--pbl-border)]" />
                <button aria-label="缩小" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)] disabled:opacity-35" disabled={zoom <= 0.25} onClick={() => changeZoom(zoom - 0.25)} type="button"><ZoomOut size={16} /></button>
                <select aria-label="显示比例" className="h-8 rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white px-1.5 text-xs font-bold text-[var(--pbl-text-muted)] outline-none" onChange={(event) => changeZoom(Number(event.target.value))} value={zoom}>
                  {![0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75].includes(zoom) ? <option value={zoom}>{Math.round(zoom * 100)}%</option> : null}
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75].map((value) => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
                </select>
                <button aria-label="放大" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)] disabled:opacity-35" disabled={zoom >= 1.75} onClick={() => changeZoom(zoom + 0.25)} type="button"><ZoomIn size={16} /></button>
                <button aria-label="适应整个页面" className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white px-2 text-xs font-bold text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)]" onClick={() => void fitToPage()} title="完整显示当前页面" type="button"><Minimize2 size={14} /><span className="hidden sm:inline">适应整页</span></button>
                <button aria-label="适应屏幕宽度" className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white px-2 text-xs font-bold text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)]" onClick={fitToWidth} title="适应屏幕宽度" type="button"><Maximize2 size={14} /><span className="hidden sm:inline">适应宽度</span></button>
              </>
            ) : <Pill tone="green">第 {currentPage} / {pdf.numPages} 页 · 跟随教师</Pill>}
          </div>
        </div>
        <div aria-label={`阅读进度 ${Math.round(scrollRatio * 100)}%`} className={cn("mt-2 h-1 overflow-hidden rounded-full bg-slate-100", fullscreen && "hidden")} role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(scrollRatio * 100)}>
          <div className="h-full rounded-full bg-[var(--pbl-student)] transition-[width] duration-150" style={{ width: `${Math.round(scrollRatio * 100)}%` }} />
        </div>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-auto overscroll-contain p-3 sm:p-5", fullscreen && "px-4 pb-20 pt-14 sm:px-8 sm:pb-24 sm:pt-16")} onScroll={handleScroll} ref={scrollRef}>
        <div className="mx-auto space-y-4" style={{ maxWidth: "none", width: `${zoom * 100}%` }}>
          {Array.from({ length: pdf.numPages }, (_, index) => <PdfPageCanvas key={index + 1} pageNumber={index + 1} pdf={pdf} zoom={zoom} />)}
        </div>
      </div>
    </div>
  );
}

function PdfPresentationViewer({
  fullscreen,
  pdf,
  mode,
  projection,
  onViewStateChange,
  onReadingProgressChange,
  restoreImmediately,
  savedProgress,
  setSavedProgress,
  storageKey,
}: {
  fullscreen: boolean;
  pdf: PdfDocument;
  mode: ViewerMode;
  projection?: ClassroomResourceProjection;
  onViewStateChange?: (patch: ViewStatePatch) => void;
  onReadingProgressChange?: (progress: PdfReadingProgress) => void;
  restoreImmediately: boolean;
  savedProgress?: PdfReadingProgress;
  setSavedProgress: (value: PdfReadingProgress | undefined) => void;
  storageKey?: string;
}) {
  const [localPage, setLocalPage] = useState(() => restoreImmediately ? savedProgress?.page ?? 1 : 1);
  const [zoom, setZoom] = useState(() => restoreImmediately ? savedProgress?.zoom ?? 1 : 1);
  const [fitWidth, setFitWidth] = useState(() => restoreImmediately ? savedProgress?.fitWidth ?? false : false);
  const { visible: controlsVisible, reveal: revealControls } = useAutoHidingControls(fullscreen);
  const projectedPage = projection?.viewState?.page ?? 1;
  const page = mode === "self" ? localPage : projectedPage;
  const safePage = Math.min(pdf.numPages, Math.max(1, page));
  const progressPercent = Math.round((safePage / pdf.numPages) * 100);

  function changePage(nextPage: number) {
    const value = Math.min(pdf.numPages, Math.max(1, nextPage));
    setLocalPage(value);
    if (mode === "controller") onViewStateChange?.({ page: value });
    const progress: PdfReadingProgress = {
      page: value,
      scrollRatio: pdf.numPages > 1 ? (value - 1) / (pdf.numPages - 1) : 1,
      zoom,
      fitWidth,
      updatedAt: new Date().toISOString(),
    };
    onReadingProgressChange?.(progress);
    if (mode !== "follower") {
      persistPdfReadingProgress(storageKey, progress);
    }
  }

  function changeZoom(nextZoom: number) {
    const value = Math.min(1.75, Math.max(0.25, nextZoom));
    setZoom(value);
    setFitWidth(false);
    const progress: PdfReadingProgress = {
      page: safePage,
      scrollRatio: pdf.numPages > 1 ? (safePage - 1) / (pdf.numPages - 1) : 1,
      zoom: value,
      fitWidth: false,
      updatedAt: new Date().toISOString(),
    };
    onReadingProgressChange?.(progress);
    if (mode !== "follower") {
      persistPdfReadingProgress(storageKey, progress);
    }
  }

  function fitToWidth() {
    setZoom(1);
    setFitWidth(true);
    const progress: PdfReadingProgress = {
      page: safePage,
      scrollRatio: pdf.numPages > 1 ? (safePage - 1) / (pdf.numPages - 1) : 1,
      zoom: 1,
      fitWidth: true,
      updatedAt: new Date().toISOString(),
    };
    onReadingProgressChange?.(progress);
    if (mode !== "follower") persistPdfReadingProgress(storageKey, progress);
  }

  function fitToPage() {
    setZoom(1);
    setFitWidth(false);
    const progress: PdfReadingProgress = {
      page: safePage,
      scrollRatio: pdf.numPages > 1 ? (safePage - 1) / (pdf.numPages - 1) : 1,
      zoom: 1,
      fitWidth: false,
      updatedAt: new Date().toISOString(),
    };
    onReadingProgressChange?.(progress);
    if (mode !== "follower") persistPdfReadingProgress(storageKey, progress);
  }

  function resumeReading() {
    if (!savedProgress) return;
    setZoom(savedProgress.zoom);
    setFitWidth(savedProgress.fitWidth ?? false);
    changePage(savedProgress.page);
    setSavedProgress(undefined);
  }

  return (
    <div className="relative flex h-full min-h-72 flex-col overflow-hidden rounded-[var(--radius-sm)] bg-slate-100" onPointerMove={fullscreen ? revealControls : undefined}>
      {fullscreen ? <div aria-label={`阅读进度 ${progressPercent}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={progressPercent} className="absolute inset-x-0 top-0 z-40 h-1 bg-slate-200/70" role="progressbar"><div className="h-full bg-[var(--pbl-student)] transition-[width] duration-150" style={{ width: `${progressPercent}%` }} /></div> : null}
      <div className={cn("shrink-0 border-b border-[var(--pbl-border)] bg-white px-3 py-2.5 shadow-sm sm:px-4", fullscreen && "absolute bottom-5 left-1/2 z-20 w-fit max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full border bg-white/[0.92] px-3 py-2 shadow-2xl backdrop-blur transition duration-200", fullscreen && !controlsVisible && "pointer-events-none translate-y-3 opacity-0")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={cn("flex items-center gap-2", fullscreen && "hidden")}>
            <span className="grid size-8 place-items-center rounded-[var(--radius-xs)] bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]"><BookOpen size={16} /></span>
            <div>
              <p className="text-xs font-bold text-[var(--pbl-text-strong)]">逐页研读</p>
              <p className="text-[11px] text-[var(--pbl-text-muted)]">已阅读 {progressPercent}%</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {savedProgress && mode !== "follower" && !fullscreen ? (
              <button className="mr-1 inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-[var(--pbl-student-soft)] px-2.5 text-xs font-bold text-[var(--pbl-student)] transition hover:brightness-95" onClick={resumeReading} type="button"><Bookmark size={14} />继续阅读 · 第 {Math.min(pdf.numPages, savedProgress.page)} 页</button>
            ) : null}
            {mode !== "follower" ? (
              <>
                <button aria-label="上一页" className="grid size-8 place-items-center rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)] disabled:opacity-35" disabled={safePage <= 1} onClick={() => changePage(safePage - 1)} type="button"><ChevronLeft size={16} /></button>
                <label className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white px-2 text-xs font-semibold text-[var(--pbl-text-muted)]">
                  <span className="sr-only">当前页码</span>
                  <input aria-label="跳转页码" className="w-8 bg-transparent text-center font-bold text-[var(--pbl-text-strong)] outline-none" max={pdf.numPages} min={1} onChange={(event) => changePage(Number(event.target.value))} type="number" value={safePage} />
                  <span>/ {pdf.numPages}</span>
                </label>
                <button aria-label="下一页" className="grid size-8 place-items-center rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)] disabled:opacity-35" disabled={safePage >= pdf.numPages} onClick={() => changePage(safePage + 1)} type="button"><ChevronRight size={16} /></button>
                <span className="mx-1 h-5 w-px bg-[var(--pbl-border)]" />
                <button aria-label="缩小" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)] disabled:opacity-35" disabled={zoom <= 0.25} onClick={() => changeZoom(zoom - 0.25)} type="button"><ZoomOut size={16} /></button>
                <select aria-label="显示比例" className="h-8 rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white px-1.5 text-xs font-bold text-[var(--pbl-text-muted)] outline-none" onChange={(event) => changeZoom(Number(event.target.value))} value={zoom}>
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75].map((value) => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
                </select>
                <button aria-label="放大" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)] disabled:opacity-35" disabled={zoom >= 1.75} onClick={() => changeZoom(zoom + 0.25)} type="button"><ZoomIn size={16} /></button>
                <button aria-label="适应整个页面" className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white px-2 text-xs font-bold text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)]" onClick={fitToPage} title="完整显示当前页面" type="button"><Minimize2 size={14} /><span className="hidden sm:inline">适应整页</span></button>
                <button aria-label="适应屏幕宽度" className={cn("inline-flex h-8 items-center gap-1 rounded-[var(--radius-xs)] border px-2 text-xs font-bold hover:bg-[var(--pbl-surface-soft)]", fitWidth ? "border-[var(--pbl-student-border)] bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]" : "border-[var(--pbl-border)] bg-white text-[var(--pbl-text-muted)]")} onClick={fitToWidth} title="适应屏幕宽度" type="button"><Maximize2 size={14} /><span className="hidden sm:inline">适应宽度</span></button>
              </>
            ) : <Pill tone="green">第 {safePage} / {pdf.numPages} 页 · 跟随教师</Pill>}
          </div>
        </div>
        <div aria-label={`阅读进度 ${progressPercent}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={progressPercent} className={cn("mt-2 h-1 overflow-hidden rounded-full bg-slate-100", fullscreen && "hidden")} role="progressbar">
          <div className="h-full rounded-full bg-[var(--pbl-student)] transition-[width] duration-150" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
      <div className={cn("flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-5", fullscreen && "px-4 pb-20 pt-14 sm:px-8 sm:pb-24 sm:pt-16")} onScroll={fullscreen ? revealControls : undefined}>
        <PdfSlideCanvas fitWidth={fitWidth} key={`${safePage}:${zoom}:${fitWidth}`} pageNumber={safePage} pdf={pdf} zoom={zoom} />
      </div>
    </div>
  );
}

function PdfSlideCanvas({ pdf, pageNumber, zoom, fitWidth }: { pdf: PdfDocument; pageNumber: number; zoom: number; fitWidth: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel?: () => void } | undefined;
    void pdf.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: 1.75 * zoom });
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
  }, [pageNumber, pdf, zoom]);

  if (error) {
    return <div className="grid aspect-video w-full max-w-6xl place-items-center rounded-[var(--radius-xs)] bg-white text-sm text-[var(--pbl-danger)]">第 {pageNumber} 页加载失败</div>;
  }
  return <canvas aria-label={`PPT 第 ${pageNumber} 页`} className="block rounded-[var(--radius-xs)] bg-white shadow-2xl" ref={canvasRef} style={fitWidth ? { height: "auto", maxHeight: "none", maxWidth: "100%", width: "100%" } : { maxHeight: zoom <= 1 ? "100%" : "none", maxWidth: zoom <= 1 ? "100%" : "none" }} />;
}

function PdfPageCanvas({ pdf, pageNumber, zoom }: { pdf: PdfDocument; pageNumber: number; zoom: number }) {
  const figureRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  const [displayWidth, setDisplayWidth] = useState(0);

  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;
    const updateWidth = () => {
      const next = Math.round(figure.getBoundingClientRect().width);
      setDisplayWidth((current) => Math.abs(current - next) > 1 ? next : current);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(figure);
    return () => observer.disconnect();
  }, [zoom]);

  useEffect(() => {
    if (displayWidth <= 0) return;
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel?: () => void } | undefined;
    void pdf.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const targetPixelWidth = Math.min(2_400, Math.max(displayWidth, displayWidth * pixelRatio));
      const renderScale = targetPixelWidth / Math.max(1, baseViewport.width);
      const viewport = page.getViewport({ scale: renderScale });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      return renderTask.promise;
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [displayWidth, pageNumber, pdf]);
  return (
    <figure className="overflow-hidden rounded-[var(--radius-xs)] bg-white shadow-md" ref={figureRef}>
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
