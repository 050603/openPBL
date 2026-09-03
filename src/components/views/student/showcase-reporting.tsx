"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
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
import type {
  Course,
  FinalArtifactKind,
  FinalArtifactSummary,
  ShowcaseDisplayMode,
  ShowcasePresentationSnapshot,
} from "@/lib/session/types";
import { latestArtifact, useShowcasePresentation } from "@/hooks/use-showcase-presentation";

function newRequestId(): string | undefined {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Let the server create an id when a restricted browser does not expose
  // crypto.randomUUID; the API's idempotency key remains optional.
  return undefined;
}

function artifactLabel(artifact: FinalArtifactSummary): string {
  return artifact.kind === "pdf" ? "PDF" : "富文档";
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
  const [selectedKind, setSelectedKind] = useState<FinalArtifactKind>("document");
  const [pdfMode, setPdfMode] = useState<ShowcaseDisplayMode>("continuous");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const pendingSyncRef = useRef<ShowcaseViewStatePatch | undefined>(undefined);
  const syncInFlightRef = useRef(false);

  const ownArtifacts = data?.ownArtifacts ?? [];
  const selectedArtifact = latestArtifact(ownArtifacts, selectedKind) ?? ownArtifacts[0];
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
    if (!selectedArtifact || !assigned || busy || activePresentation || ownRequest?.status === "pending") return;
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
    <div className="space-y-5">
      <header className="border-b border-stone-200 pb-4">
        <h1 className="font-editorial text-2xl font-semibold">成果汇报</h1>
      </header>

      {(error || localError) ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{localError ?? error}</div> : null}

      <Card className="border-[var(--pbl-student-border)]" compact>
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]"><FileText size={21} /></span>
          <div>
            <h2 className="font-bold text-[var(--pbl-text-strong)]">我的最新提交</h2>
          </div>
        </div>
        {ownArtifacts.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {ownArtifacts.map((artifact) => {
              const active = selectedArtifact?.versionId === artifact.versionId;
              return (
                <button
                  aria-pressed={active}
                  className={`rounded-[var(--radius-sm)] border p-3 text-left transition ${active ? "border-[var(--pbl-student)] bg-[var(--pbl-student-soft)]/50" : "border-[var(--pbl-border)] bg-white hover:border-[var(--pbl-student-border)]"}`}
                  key={artifact.versionId}
                  onClick={() => { setSelectedKind(artifact.kind); if (artifact.kind === "pdf") setPdfMode("continuous"); }}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-[var(--pbl-student)]">{artifactLabel(artifact)} · 第 {artifact.sequence} 版</span><CheckCircle2 className="text-emerald-600" size={16} /></div>
                  <strong className="mt-2 block truncate text-sm text-[var(--pbl-text-strong)]">{artifact.title}</strong>
                  <span className="mt-1 block text-xs text-[var(--pbl-text-muted)]">提交于 {new Date(artifact.submittedAt).toLocaleString("zh-CN")}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-[var(--pbl-border-strong)] px-4 py-9 text-center text-sm text-[var(--pbl-text-muted)]">第三阶段还没有成功提交的最终成果，请返回项目实践完成提交。</div>
        )}
      </Card>

      {selectedArtifact ? (
        <Card compact>
          <div className="flex flex-col gap-3 border-b border-[var(--pbl-border)] pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="text-xs font-semibold text-[var(--pbl-student)]">{artifactLabel(selectedArtifact)}预览</p><h2 className="truncate text-lg font-bold text-[var(--pbl-text-strong)]">{selectedArtifact.title}</h2></div>
            {selectedArtifact.kind === "pdf" ? (
              <div className="inline-flex rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)] p-0.5 text-xs font-semibold">
                <button aria-pressed={pdfMode === "continuous"} className={`rounded px-3 py-1.5 ${pdfMode === "continuous" ? "bg-white text-[var(--pbl-text-strong)] shadow-sm" : "text-[var(--pbl-text-muted)]"}`} onClick={() => setPdfMode("continuous")} type="button">连续阅读</button>
                <button aria-pressed={pdfMode === "slides"} className={`rounded px-3 py-1.5 ${pdfMode === "slides" ? "bg-[var(--pbl-student)] text-white shadow-sm" : "text-[var(--pbl-text-muted)]"}`} onClick={() => setPdfMode("slides")} type="button">逐页演示</button>
              </div>
            ) : null}
          </div>
          <div className="mt-3 h-[34rem] min-h-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)]">
            <ShowcaseArtifactViewer key={selectedArtifact.versionId} courseId={course.id} artifact={selectedArtifact} displayMode={selectedArtifact.kind === "pdf" ? pdfMode : "continuous"} mode="self" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            {assigned ? (
              <PrimaryButton disabled={busy || Boolean(activePresentation) || ownRequest?.status === "pending"} onClick={() => void requestPresentation()} tone="teal"><Send size={16} />{busy ? "申请中…" : ownRequest?.status === "pending" ? "等待教师确认" : ownRequest?.status === "rejected" ? "重新申请投屏" : "申请全班投屏"}</PrimaryButton>
            ) : null}
          </div>
          {ownRequest?.status === "rejected" ? <p className="mt-2 text-xs text-rose-700">上次申请未通过{ownRequest.rejectionReason ? `：${ownRequest.rejectionReason}` : "，可调整成果后重新申请"}。</p> : null}
        </Card>
      ) : null}

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
