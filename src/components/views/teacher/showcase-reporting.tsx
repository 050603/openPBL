"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Eye,
  LoaderCircle,
  MonitorOff,
  MonitorUp,
  Pause,
  Play,
  Square,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import { ShowcaseArtifactViewer } from "@/components/showcase/showcase-artifact-viewer";
import {
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Pill,
  PrimaryButton,
  TextInput,
} from "@/components/ui";
import { useShowcasePresentation } from "@/hooks/use-showcase-presentation";
import type { Course, FinalArtifactSummary, ShowcasePresentationSnapshot } from "@/lib/session/types";

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

function statusLabel(status: ShowcasePresentationSnapshot["status"]): string {
  return ({ pending: "待教师确认", active: "投屏中", rejected: "已拒绝", ended: "已结束", cancelled: "已取消" })[status];
}

export function NewShowcaseTeacherView({ course }: { course: Course }) {
  const { data, loading, error, runAction } = useShowcasePresentation(course.id);
  const [selectedStudentId, setSelectedStudentId] = useState<string>();
  const [reason, setReason] = useState("");
  const [teacherFollowing, setTeacherFollowing] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [dismissedPendingId, setDismissedPendingId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string>();

  const students = data?.students ?? [];
  const pending = data?.presentations.find((presentation) => presentation.status === "pending");
  const active = data?.activePresentation;
  const selectedStudent = students.find((student) => student.studentId === selectedStudentId)
    ?? students.find((student) => student.isAssigned)
    ?? students[0];
  const activeStudent = active ? students.find((student) => student.studentId === active.studentId) : undefined;
  const activeArtifact = active
    ? activeStudent?.artifacts.find((artifact) => artifact.kind === active.artifactKind && artifact.versionId === active.artifactVersionId)
      ?? artifactForPresentation(active)
    : undefined;

  useEffect(() => {
    if (!active || minimized) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [active, minimized]);

  async function assign(groupId: string | null, studentId?: string) {
    setBusy(true);
    setLocalError(undefined);
    try {
      await runAction({ action: "assign", groupId, studentId: studentId ?? null });
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "设置汇报学生失败");
    } finally {
      setBusy(false);
    }
  }

  async function review(decision: "approve" | "reject") {
    if (!pending) return;
    setBusy(true);
    setLocalError(undefined);
    try {
      await runAction({ action: "review", presentationId: pending.id, decision, reason: reason.trim() || undefined });
      setReason("");
      setDismissedPendingId(pending.id);
      if (decision === "approve") {
        setTeacherFollowing(true);
        setMinimized(false);
      }
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "审批汇报申请失败");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!active || busy) return;
    setBusy(true);
    try {
      await runAction({ action: "end", presentationId: active.id });
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "停止投屏失败");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return <Card className="grid min-h-56 place-items-center"><span className="inline-flex items-center gap-2 text-sm text-stone-500"><LoaderCircle className="animate-spin" size={18} />正在读取汇报状态…</span></Card>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-editorial text-2xl font-semibold">成果汇报管理</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={active ? "green" : pending ? "amber" : "gray"}>{active ? "学生投屏进行中" : pending ? "有待审批申请" : "暂无活动投屏"}</Pill>
          <Pill tone="blue">{data?.presentingStudentName ? `汇报学生：${data.presentingStudentName}` : "尚未设置汇报学生"}</Pill>
          {pending ? <PrimaryButton onClick={() => setDismissedPendingId(undefined)} size="sm" tone="orange"><MonitorUp size={14} />查看申请</PrimaryButton> : null}
        </div>
      </header>

      {(error || localError) ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{localError ?? error}</div> : null}

      <Card compact>
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="font-bold text-[var(--pbl-text-strong)]">学生与最终成果</h2><p className="mt-1 text-sm text-[var(--pbl-text-muted)]">选择一名学生作为本节课的汇报学生。</p></div>
          <div className="flex shrink-0 items-center gap-2"><Pill tone="blue">{students.length} 名学生</Pill>{data?.presentingGroupId ? <PrimaryButton disabled={busy} onClick={() => void assign(null)} size="sm" tone="red" variant="outline"><X size={14} />取消设置</PrimaryButton> : null}</div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {students.length ? students.map((student) => {
            const selected = selectedStudent?.studentId === student.studentId;
            const studentPresentation = data?.presentations.find((presentation) =>
              presentation.studentId === student.studentId
              && (presentation.status === "pending" || presentation.status === "active"),
            );
            const studentStatus = studentPresentation?.status === "active"
              ? "投屏中"
              : studentPresentation?.status === "pending"
                ? "待审批"
                : student.isAssigned
                  ? "汇报学生"
                  : student.artifacts.length
                    ? "已提交"
                    : "待提交";
            const studentStatusTone = studentPresentation?.status === "active"
              ? "green"
              : studentPresentation?.status === "pending"
                ? "amber"
                : student.isAssigned
                  ? "green"
                  : student.artifacts.length
                    ? "blue"
                    : "gray";
            return (
              <article className={`flex min-h-40 flex-col rounded-[var(--radius-sm)] border p-3 transition ${selected ? "border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)]/45" : "border-[var(--pbl-border)] bg-white"}`} key={student.studentId}>
                <button className="flex min-w-0 items-start gap-3 text-left" onClick={() => setSelectedStudentId(student.studentId)} type="button">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]"><UserRound size={17} /></span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[var(--pbl-text-strong)]">{student.name}</strong><span className="mt-1 block truncate text-xs text-[var(--pbl-text-muted)]">{student.groupId ? "已加入项目组" : "尚未加入项目组"}</span></span>
                  <Pill size="sm" tone={studentStatusTone}>{studentStatus}</Pill>
                </button>
                <div className="mt-3 min-h-8 text-xs text-[var(--pbl-text-muted)]">{student.artifacts.length ? student.artifacts.map((artifact) => <span className="mr-1.5 inline-flex rounded-full bg-[var(--pbl-surface-soft)] px-2 py-1" key={artifact.versionId}>{artifact.kind === "pdf" ? "PDF" : "富文档"}</span>) : "暂无可展示的最终成果"}</div>
                <PrimaryButton className="mt-auto w-full" disabled={busy || student.isAssigned || !student.groupId} onClick={() => void assign(student.groupId ?? null, student.studentId)} size="sm" tone={student.isAssigned ? "green" : "blue"} variant={student.isAssigned ? "outline" : "solid"}>{student.isAssigned ? <><UserCheck size={14} />已设置为汇报学生</> : <><UserCheck size={14} />设为汇报学生</>}</PrimaryButton>
              </article>
            );
          }) : <div className="rounded-lg border border-dashed border-[var(--pbl-border-strong)] py-12 text-center text-sm text-[var(--pbl-text-muted)] sm:col-span-2 lg:col-span-3 2xl:col-span-4">暂未读取到学生名单。</div>}
        </div>
        {data?.presentations.filter((presentation) => presentation.status === "rejected").slice(0, 3).map((presentation) => <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[var(--pbl-surface-soft)] px-3 py-2 text-xs" key={presentation.id}><span className="truncate">{presentation.studentName ?? "学生"} · {presentation.artifactTitle}</span><Pill size="sm" tone="red">{statusLabel(presentation.status)}</Pill></div>)}
      </Card>

      <Card compact>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-[var(--pbl-text-strong)]">投屏状态</h2><p className="mt-1 text-sm text-[var(--pbl-text-muted)]">教师默认跟随汇报学生，也可以暂时独立浏览或最小化。</p></div>{active ? <div className="flex gap-2"><PrimaryButton onClick={() => setTeacherFollowing((value) => !value)} size="sm" tone="slate" variant="outline">{teacherFollowing ? <><Pause size={14} />暂停跟随</> : <><Play size={14} />恢复跟随</>}</PrimaryButton><PrimaryButton onClick={() => setMinimized((value) => !value)} size="sm" tone="slate" variant="outline">{minimized ? <><Eye size={14} />恢复投屏</> : <><MonitorOff size={14} />最小化</>}</PrimaryButton><PrimaryButton disabled={busy} onClick={() => void stop()} size="sm" tone="red" variant="outline"><Square size={14} />终止投屏</PrimaryButton></div> : null}</div>
        {active ? <div className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm"><MonitorUp className="text-emerald-700" size={18} /><span className="min-w-0 flex-1 truncate"><strong>{active.studentName ?? activeStudent?.name ?? "汇报学生"}</strong> 正在展示“{active.artifactTitle}”</span><Pill size="sm" tone={teacherFollowing ? "green" : "amber"}>{teacherFollowing ? "跟随中" : "独立浏览"}</Pill></div> : <div className="mt-4 rounded-lg border border-dashed border-[var(--pbl-border-strong)] py-8 text-center text-sm text-[var(--pbl-text-muted)]">批准学生申请后，这里会出现同步投屏。</div>}
      </Card>

      <Dialog
        onOpenChange={(open) => {
          if (open) setDismissedPendingId(undefined);
          else if (pending) setDismissedPendingId(pending.id);
        }}
        open={Boolean(pending && dismissedPendingId !== pending.id)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认成果汇报</DialogTitle>
            <DialogDescription>批准后，该成果会立即同步到教师和全班学生的页面。</DialogDescription>
          </DialogHeader>
          {pending ? <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 p-4"><span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-white text-[var(--pbl-warning)]"><MonitorUp size={18} /></span><div className="min-w-0"><strong className="block truncate text-sm text-[var(--pbl-text-strong)]">{pending.studentName ?? "汇报学生"}申请展示</strong><p className="mt-1 truncate text-xs text-[var(--pbl-text-muted)]">{pending.artifactTitle} · {pending.artifactKind === "pdf" ? (pending.displayMode === "slides" ? "PDF 逐页演示" : "PDF 连续阅读") : "富文档连续阅读"}</p></div></div>
            <div><label className="text-xs font-semibold text-[var(--pbl-text-muted)]" htmlFor="showcase-rejection-reason">拒绝原因（可选）</label><TextInput className="mt-1" id="showcase-rejection-reason" maxLength={1_000} onChange={(event) => setReason(event.target.value)} placeholder="例如：请先更新最终成果版本" value={reason} /></div>
          </div> : null}
          <DialogFooter>
            <PrimaryButton disabled={busy} onClick={() => void review("reject")} size="sm" tone="red" variant="outline"><X size={14} />拒绝申请</PrimaryButton>
            <PrimaryButton disabled={busy} onClick={() => void review("approve")} size="sm" tone="green"><Check size={14} />批准并开始投屏</PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {active && activeArtifact && !minimized ? <TeacherPresentationOverlay artifact={activeArtifact} courseId={course.id} onEnd={() => void stop()} onMinimize={() => setMinimized(true)} onToggleFollow={() => setTeacherFollowing((value) => !value)} presentation={active} teacherFollowing={teacherFollowing} /> : null}
      {active && activeArtifact && minimized ? <button aria-label="恢复汇报投屏" className="fixed bottom-5 right-5 z-[181] flex items-center gap-2 rounded-full bg-stone-900 px-4 py-3 text-sm font-semibold text-white shadow-xl" onClick={() => setMinimized(false)} type="button"><MonitorUp size={16} />恢复“{active.artifactTitle}”</button> : null}
    </div>
  );
}

function TeacherPresentationOverlay({
  artifact,
  courseId,
  onEnd,
  onMinimize,
  onToggleFollow,
  presentation,
  teacherFollowing,
}: {
  artifact: FinalArtifactSummary;
  courseId: string;
  onEnd: () => void;
  onMinimize: () => void;
  onToggleFollow: () => void;
  presentation: ShowcasePresentationSnapshot;
  teacherFollowing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[180] flex flex-col bg-slate-950/75 p-2 backdrop-blur-sm sm:p-4" role="presentation">
      <section aria-labelledby="teacher-showcase-title" aria-modal="true" className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-white/70 bg-[var(--pbl-surface)] shadow-2xl" role="dialog">
        <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-[var(--pbl-border)] bg-white px-4 sm:px-6"><span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-teacher)] text-white"><MonitorUp size={18} /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[var(--pbl-teacher)]">教师预览 · {teacherFollowing ? "跟随汇报" : "独立浏览"}</p><h2 className="truncate text-lg font-bold text-[var(--pbl-text-strong)]" id="teacher-showcase-title">{artifact.title}</h2></div><Pill tone={teacherFollowing ? "green" : "amber"}>{teacherFollowing ? "跟随中" : "已脱离"}</Pill><PrimaryButton onClick={onToggleFollow} size="sm" tone="slate" variant="outline">{teacherFollowing ? <><Pause size={14} />独立浏览</> : <><Play size={14} />恢复跟随</>}</PrimaryButton><PrimaryButton onClick={onMinimize} size="sm" tone="slate" variant="outline"><MonitorOff size={14} />最小化</PrimaryButton><PrimaryButton onClick={onEnd} size="sm" tone="red" variant="outline"><Square size={14} />终止投屏</PrimaryButton></header>
        <div className="min-h-0 flex-1 p-2 sm:p-3"><ShowcaseArtifactViewer key={artifact.versionId} artifact={artifact} courseId={courseId} mode="teacher" presentation={presentation} teacherFollowing={teacherFollowing} /></div>
        <footer className="shrink-0 border-t border-[var(--pbl-border)] bg-white px-4 py-2 text-center text-xs text-[var(--pbl-text-muted)]">教师脱离跟随后，自己的滚动或翻页不会广播给学生；恢复跟随会跳到汇报学生最新位置。</footer>
      </section>
    </div>
  );
}
