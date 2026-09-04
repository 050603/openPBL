"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  CheckCircle2,
  FileText,
  LoaderCircle,
  MonitorUp,
  Send,
  ShieldCheck,
  Square,
} from "lucide-react";
import {
  ShowcaseArtifactViewer,
  type ShowcaseViewStatePatch,
} from "@/components/showcase/showcase-artifact-viewer";
import { Card, Pill, PrimaryButton } from "@/components/ui";
import { useSession } from "@/lib/session/store";
import { StageEmptyState, StagePageHeader, StageSplitLayout } from "@/components/classroom/classroom-ui";
import type {
  Course,
  FinalArtifactSummary,
  ShowcaseDisplayMode,
  ShowcasePresentationSnapshot,
} from "@/lib/session/types";
import { useShowcasePresentation } from "@/hooks/use-showcase-presentation";

function newRequestId(): string | undefined {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Let the server create an id when a restricted browser does not expose
  // crypto.randomUUID; the API's idempotency key remains optional.
  return undefined;
}

function artifactLabel(artifact: FinalArtifactSummary): string {
  if (artifact.kind === "pdf") return "PDF";
  if (artifact.kind === "document") return "Word 文档";
  if (artifact.mimeType?.includes("zip") || artifact.mimeType?.includes("compressed")) return "压缩包";
  if (artifact.mimeType?.startsWith("text/") || artifact.mimeType?.includes("javascript") || artifact.mimeType?.includes("json")) return "代码或文本";
  return "额外成果";
}

function formatFileSize(size?: number): string | undefined {
  if (!size) return undefined;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function artifactForPresentation(presentation: ShowcasePresentationSnapshot): FinalArtifactSummary {
  return {
    kind: presentation.artifactKind,
    versionId: presentation.artifactVersionId,
    title: presentation.artifactTitle,
    sequence: 0,
    submittedAt: presentation.requestedAt,
    displayModes: presentation.artifactKind === "pdf" ? ["continuous", "slides"] : ["continuous"],
  };
}

export function NewShowcaseStudentView({ course }: { course: Course }) {
  const session = useSession();
  const studentId = session.studentId ?? "";
  const { data, loading, error, runAction } = useShowcasePresentation(course.id);
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [pdfMode, setPdfMode] = useState<ShowcaseDisplayMode>("continuous");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const pendingSyncRef = useRef<ShowcaseViewStatePatch | undefined>(undefined);
  const syncInFlightRef = useRef(false);

  const ownArtifacts = data?.ownArtifacts ?? [];
  const selectedArtifact = ownArtifacts.find((artifact) => artifact.versionId === selectedVersionId) ?? ownArtifacts[0];
  const ownGroup = useMemo(
    () => course.groups?.find((group) => group.members.some((member) => member.studentId === studentId)),
    [course.groups, studentId],
  );
  const assigned = Boolean(data?.presentingStudentId
    ? data.presentingStudentId === studentId
    : data?.presentingGroupId && ownGroup?.id === data.presentingGroupId);
  const ownRequest = data?.presentations
    .filter((presentation) => presentation.studentId === studentId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  const activePresentation = data?.activePresentation;
  const activeArtifact = activePresentation ? artifactForPresentation(activePresentation) : undefined;
  const isController = activePresentation?.studentId === studentId;

  useEffect(() => {
    if (!activePresentation) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [activePresentation]);

  async function flushSync() {
    if (syncInFlightRef.current || !pendingSyncRef.current || !activePresentation || !isController) return;
    const patch = pendingSyncRef.current;
    pendingSyncRef.current = undefined;
    syncInFlightRef.current = true;
    setSyncing(true);
    try {
      await runAction({ action: "update", presentationId: activePresentation.id, viewState: patch });
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "汇报位置同步失败");
    } finally {
      syncInFlightRef.current = false;
      setSyncing(false);
      if (pendingSyncRef.current) void flushSync();
    }
  }

  function queueSync(patch: ShowcaseViewStatePatch) {
    if (!isController || !activePresentation) return;
    pendingSyncRef.current = patch;
    void flushSync();
  }

  async function requestPresentation() {
    if (!selectedArtifact || selectedArtifact.kind === "file" || !assigned || busy || activePresentation || ownRequest?.status === "pending") return;
    setBusy(true);
    setLocalError(undefined);
    try {
      const requestId = newRequestId();
      await runAction({
        action: "request",
        artifactKind: selectedArtifact.kind,
        artifactVersionId: selectedArtifact.versionId,
        displayMode: selectedArtifact.kind === "pdf" ? pdfMode : "continuous",
        ...(requestId ? { requestId } : {}),
      });
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "投屏申请失败");
    } finally {
      setBusy(false);
    }
  }

  async function endPresentation() {
    if (!activePresentation || !isController || busy) return;
    setBusy(true);
    try {
      await runAction({ action: "end", presentationId: activePresentation.id });
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "结束投屏失败");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return <Card className="grid min-h-56 place-items-center"><span className="inline-flex items-center gap-2 text-sm text-stone-500"><LoaderCircle className="animate-spin" size={18} />正在读取最终成果…</span></Card>;
  }

  return (
    <div className="classroom-stage space-y-5">
      <StagePageHeader
        description="汇总 Word 文档和额外成果；文档与 PDF 可在获指定后申请全班投屏。"
        status={<Pill tone={activePresentation ? "green" : ownArtifacts.length ? "blue" : "gray"}>{activePresentation ? "投屏进行中" : ownArtifacts.length ? "已有成果" : "待提交"}</Pill>}
        title="成果汇报"
        variant="student-card"
      />

      {(error || localError) ? <div className="rounded-[var(--radius-sm)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{localError ?? error}</div> : null}

      <StageSplitLayout
        aside={(
          <Card className="classroom-panel" compact>
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-[var(--pbl-text-strong)]">我的汇报资料</h2><p className="mt-1 text-xs text-[var(--pbl-text-muted)]">包含主文档与第三阶段提交的额外成果。</p></div><Pill tone="teal">{ownArtifacts.length} 份</Pill></div>
            {ownArtifacts.length ? (
              <div className="mt-4 space-y-2">
                {ownArtifacts.map((artifact) => {
                  const active = selectedArtifact?.versionId === artifact.versionId;
                  return (
                    <button
                      aria-pressed={active}
                      className={`w-full rounded-[var(--radius-sm)] border p-3 text-left transition ${active ? "border-[var(--pbl-student-border)] bg-[var(--pbl-student-soft)]/70" : "border-[var(--pbl-border)] bg-white hover:border-[var(--pbl-student-border)]"}`}
                      key={artifact.versionId}
                      onClick={() => { setSelectedVersionId(artifact.versionId); if (artifact.kind === "pdf") setPdfMode("continuous"); }}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-[var(--pbl-student)]">{artifactLabel(artifact)} · 第 {artifact.sequence} 版</span><CheckCircle2 className="text-emerald-600" size={16} /></div>
                      <strong className="mt-2 block truncate text-sm text-[var(--pbl-text-strong)]">{artifact.title}</strong>
                      <span className="mt-1 block text-xs text-[var(--pbl-text-muted)]">提交于 {new Date(artifact.submittedAt).toLocaleString("zh-CN")}</span>
                    </button>
                  );
                })}
              </div>
            ) : <StageEmptyState className="mt-4" description="返回项目实践完成主文档，或提交 PDF、代码、压缩包等额外成果。" icon={FileText} title="还没有汇报资料" tone="student" />}
            <div className="mt-4 border-t border-[var(--pbl-border)] pt-4">
              <p className="classroom-eyebrow text-[var(--pbl-student)]">汇报资格</p>
              <p className="mt-1 text-sm font-semibold text-[var(--pbl-text-strong)]">
                {activePresentation
                  ? "正在同步投屏"
                  : assigned
                    ? ownRequest?.status === "pending"
                      ? "申请已提交，等待教师确认"
                      : ownRequest?.status === "rejected"
                        ? "申请未通过，可以重新申请"
                        : "你可以申请全班投屏"
                    : "等待教师指定汇报学生"}
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--pbl-text-muted)]">
                {assigned ? "主要操作会出现在成果预览下方。" : "先完成并提交最终成果，再等待教师设置资格。"}
              </p>
            </div>
          </Card>
        )}
        main={(
          <Card className="classroom-panel" compact>
          {selectedArtifact ? (
            <>
              <div className="flex flex-col gap-3 border-b border-[var(--pbl-border)] pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="classroom-eyebrow text-[var(--pbl-student)]">成果预览</p><h2 className="truncate text-lg font-semibold text-[var(--pbl-text-strong)]">{selectedArtifact.title}</h2></div>
                {selectedArtifact.kind === "pdf" ? (
                  <div className="inline-flex rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)] p-0.5 text-xs font-semibold">
                    <button aria-pressed={pdfMode === "continuous"} className={`rounded px-3 py-1.5 ${pdfMode === "continuous" ? "bg-white text-[var(--pbl-text-strong)] shadow-sm" : "text-[var(--pbl-text-muted)]"}`} onClick={() => setPdfMode("continuous")} type="button">连续阅读</button>
                    <button aria-pressed={pdfMode === "slides"} className={`rounded px-3 py-1.5 ${pdfMode === "slides" ? "bg-[var(--pbl-student)] text-white shadow-sm" : "text-[var(--pbl-text-muted)]"}`} onClick={() => setPdfMode("slides")} type="button">逐页演示</button>
                  </div>
                ) : null}
              </div>
              {selectedArtifact.kind === "file" ? (
                <div className="mt-3 grid h-72 place-items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)] p-6 text-center">
                  <div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-[var(--pbl-student)] shadow-sm"><FileText size={26} /></span><h3 className="mt-4 font-semibold text-[var(--pbl-text-strong)]">{artifactLabel(selectedArtifact)}</h3><p className="mt-1 text-sm text-[var(--pbl-text-muted)]">{formatFileSize(selectedArtifact.size) ?? "已提交"} · 此类成果用于下载与收集，不支持直接投屏。</p>{selectedArtifact.downloadUrl ? <a className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--pbl-student)] px-4 py-2 text-sm font-semibold text-white" download href={selectedArtifact.downloadUrl}><Download size={16} />下载成果</a> : null}</div>
                </div>
              ) : (
                <div className="mt-3 h-[34rem] min-h-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)]">
                  <ShowcaseArtifactViewer key={selectedArtifact.versionId} courseId={course.id} artifact={selectedArtifact} displayMode={selectedArtifact.kind === "pdf" ? pdfMode : "continuous"} mode="self" />
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                {selectedArtifact.downloadUrl && selectedArtifact.kind !== "file" ? <a className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--pbl-text-strong)]" download href={selectedArtifact.downloadUrl}><Download size={16} />下载文件</a> : null}
                {assigned && selectedArtifact.kind !== "file" ? (
                  <PrimaryButton disabled={busy || Boolean(activePresentation) || ownRequest?.status === "pending"} onClick={() => void requestPresentation()} tone="teal"><Send size={16} />{busy ? "申请中…" : ownRequest?.status === "pending" ? "等待教师确认" : ownRequest?.status === "rejected" ? "重新申请投屏" : "申请全班投屏"}</PrimaryButton>
                ) : selectedArtifact.kind === "file" ? <span className="text-xs text-[var(--pbl-text-muted)]">代码、压缩包等成果仅供教师收集下载。</span> : null}
              </div>
              {ownRequest?.status === "rejected" ? <p className="mt-2 text-xs text-rose-700">上次申请未通过{ownRequest.rejectionReason ? `：${ownRequest.rejectionReason}` : "，可调整成果后重新申请"}。</p> : null}
            </>
          ) : <StageEmptyState description="从右侧选择一个已提交成果开始预览。" icon={FileText} title="选择一个成果" tone="student" />}
          </Card>
        )}
      />

      {activePresentation && activeArtifact ? (
        <StudentPresentationOverlay
          artifact={activeArtifact}
          busy={busy}
          courseId={course.id}
          isController={isController}
          onEnd={() => void endPresentation()}
          onViewStateChange={queueSync}
          presentation={activePresentation}
          syncing={syncing}
        />
      ) : null}
    </div>
  );
}

function StudentPresentationOverlay({
  artifact,
  busy,
  courseId,
  isController,
  onEnd,
  onViewStateChange,
  presentation,
  syncing,
}: {
  artifact: FinalArtifactSummary;
  busy: boolean;
  courseId: string;
  isController: boolean;
  onEnd: () => void;
  onViewStateChange: (patch: ShowcaseViewStatePatch) => void;
  presentation: ShowcasePresentationSnapshot;
  syncing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[180] flex flex-col bg-slate-950/75 p-2 backdrop-blur-sm sm:p-4" role="presentation">
      <section aria-labelledby="student-showcase-title" aria-modal="true" className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-white/70 bg-[var(--pbl-surface)] shadow-2xl" role="dialog">
        <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-[var(--pbl-border)] bg-white px-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-student)] text-white"><MonitorUp size={18} /></span>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[var(--pbl-student)]">{isController ? "你的汇报控制台" : "课堂成果汇报"}</p><h2 className="truncate text-lg font-bold text-[var(--pbl-text-strong)]" id="student-showcase-title">{artifact.title}</h2></div>
          <Pill tone="green">{isController ? (syncing ? "同步中" : "你正在控制") : "强制跟随"}</Pill>
          {isController ? <PrimaryButton disabled={busy} onClick={onEnd} size="sm" tone="red" variant="outline"><Square size={14} />结束投屏</PrimaryButton> : <span className="inline-flex items-center gap-1 text-xs text-stone-500"><ShieldCheck size={14} />只读</span>}
        </header>
        <div className="min-h-0 flex-1 p-2 sm:p-3"><ShowcaseArtifactViewer key={artifact.versionId} artifact={artifact} courseId={courseId} mode={isController ? "controller" : "follower"} onViewStateChange={onViewStateChange} presentation={presentation} /></div>
        <footer className="shrink-0 border-t border-[var(--pbl-border)] bg-white px-4 py-2 text-center text-xs text-[var(--pbl-text-muted)]">{isController ? "滚动或翻页会同步到教师和全班同学。" : "由汇报学生控制浏览位置；此页面不可关闭、收起或独立浏览。"}</footer>
      </section>
    </div>
  );
}
