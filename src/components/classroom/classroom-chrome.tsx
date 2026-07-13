"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronRight, Circle, ClipboardCheck, UserRoundCheck } from "lucide-react";
import type { AiSupportRecord, Course, TeacherFeedback } from "@/lib/session/types";
import { detectInterventionSignals, evaluateStageGate, type InterventionSignal } from "@/lib/classroom/stage-gates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { FormField, Textarea } from "@/components/ui/form";

export function StageProgress({ course, onSelect, readonly = false }: { course: Course; onSelect?: (index: number) => void; readonly?: boolean }) {
  const total = course.stages.length;
  const completed = course.currentStageIndex;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <nav aria-label="课堂阶段" className="border-b border-[var(--pbl-border)] bg-[var(--pbl-surface)]">
      <div className="flex items-center gap-3 px-3 py-2 md:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {course.stages.map((stage, index) => {
            const current = index === course.currentStageIndex;
            const done = index < course.currentStageIndex;
            return (
              <div className="flex shrink-0 items-center" key={stage.key}>
                <button
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm transition-colors",
                    current
                      ? "bg-[var(--pbl-teacher-soft)] font-semibold text-[var(--pbl-teacher)] ring-1 ring-[var(--pbl-teacher-border)]"
                      : "text-[var(--pbl-text-muted)]",
                    !readonly && "hover:bg-[var(--pbl-surface-soft)]",
                  )}
                  disabled={readonly}
                  onClick={() => onSelect?.(index)}
                  type="button"
                >
                  <span
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors",
                      done && "bg-[var(--pbl-success)] text-white",
                      current && "bg-[var(--pbl-teacher)] text-white",
                      !done && !current && "border border-[var(--pbl-border-strong)] text-[var(--pbl-text-muted)]",
                    )}
                  >
                    {done ? <Check aria-hidden="true" size={12} /> : index + 1}
                  </span>
                  <span className="whitespace-nowrap">{stage.label}</span>
                </button>
                {index < total - 1 ? (
                  <ChevronRight aria-hidden="true" className="mx-0.5 shrink-0 text-[var(--pbl-border-strong)]" size={14} />
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-[var(--pbl-teacher)] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-[var(--pbl-text-muted)]">
            {completed}/{total}
          </span>
        </div>
      </div>
    </nav>
  );
}

export function StageGateDialog({ course, onOpenChange, onConfirm, open, targetIndex }: { course: Course; onOpenChange: (open: boolean) => void; onConfirm: (overrideReason?: string) => void; open: boolean; targetIndex: number }) {
  const [reason, setReason] = useState("");
  const movingForward = targetIndex > course.currentStageIndex;
  const gate = useMemo(() => evaluateStageGate(course), [course]);
  const target = course.stages[targetIndex];
  const blocked = movingForward && !gate.canAdvance;
  return (
    <Dialog onOpenChange={(next) => { if (!next) setReason(""); onOpenChange(next); }} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{movingForward ? "确认进入下一阶段" : "回看上一阶段"}</DialogTitle>
          <DialogDescription>{movingForward ? `系统已检查“${gate.stage.label}”的推进条件。切换后，学生将看到“${target?.label ?? "目标阶段"}”的任务。` : "回看不会删除已完成记录，学生端将同步到所选阶段。"}</DialogDescription>
        </DialogHeader>
        {movingForward ? (
          <div className="space-y-4">
            {gate.completed.length ? <GateSection icon={<Check size={16} />} items={gate.completed} title="已满足" tone="success" /> : null}
            {gate.blockers.length ? <GateSection icon={<AlertTriangle size={16} />} items={gate.blockers.map((item) => item.message)} title="阻断项" tone="danger" /> : null}
            {gate.warnings.length ? <GateSection icon={<Circle size={13} />} items={gate.warnings.map((item) => item.message)} title="需要确认" tone="warning" /> : null}
            {blocked ? (
              <FormField description="覆盖会写入阶段切换记录，并成为 AI 后续支架的课堂上下文。" label="教师覆盖理由">
                {({ id, describedBy, invalid }) => <Textarea aria-describedby={describedBy} aria-invalid={invalid} id={id} onChange={(event) => setReason(event.target.value)} placeholder="说明为何仍然推进，以及接下来如何处理未完成项" value={reason} />}
              </FormField>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="secondary">取消</Button>
          <Button disabled={blocked && reason.trim().length < 8} onClick={() => onConfirm(blocked ? reason.trim() : undefined)}>{blocked ? "记录覆盖并切换" : "确认切换"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GateSection({ icon, items, title, tone }: { icon: ReactNode; items: string[]; title: string; tone: "success" | "warning" | "danger" }) {
  return (
    <section className={cn("border-l-2 pl-4", tone === "success" && "border-[var(--pbl-success)]", tone === "warning" && "border-[var(--pbl-warning)]", tone === "danger" && "border-[var(--pbl-danger)]")}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h3>
      <ul className="mt-2 space-y-1 text-sm leading-6 text-[var(--pbl-text-muted)]">{items.map((item) => <li key={item}>· {item}</li>)}</ul>
    </section>
  );
}

export function TeacherInterventionQueue({ course, onSelect }: { course: Course; onSelect?: (signal: InterventionSignal) => void }) {
  const signals = detectInterventionSignals(course);
  if (!signals.length) return <p className="border-y border-[var(--pbl-border)] py-6 text-sm text-[var(--pbl-text-muted)]">当前没有需要教师决策的介入提示。AI 将继续承担常规讲解、支架和过程记录。</p>;
  return (
    <div className="divide-y divide-[var(--pbl-border)] border-y border-[var(--pbl-border)]">
      {signals.map((signal) => (
        <button className="grid w-full gap-2 py-4 text-left hover:bg-[var(--pbl-surface-soft)] sm:grid-cols-[minmax(0,1fr)_auto]" key={signal.id} onClick={() => onSelect?.(signal)} type="button">
          <span>
            <span className="flex items-center gap-2 font-semibold text-[var(--pbl-text-strong)]"><AlertTriangle className="text-[var(--pbl-warning)]" size={16} />{signal.title}</span>
            <span className="mt-1 block text-sm leading-6 text-[var(--pbl-text-muted)]">{signal.whatHappened}</span>
            <span className="mt-2 block text-sm"><strong className="font-semibold">建议：</strong>{signal.suggestedAction}</span>
          </span>
          <span className="self-start text-xs text-[var(--pbl-text-muted)]">{signal.targetIds.length} 个对象 · {signal.confidence === "high" ? "高置信" : "需核查"}</span>
        </button>
      ))}
    </div>
  );
}

export function AiContribution({ record, actions }: { record: AiSupportRecord; actions?: ReactNode }) {
  return (
    <article className="border-l-2 border-[var(--pbl-ai)] pl-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-[var(--pbl-text-strong)]">AI 正在做：{record.trigger}</h3>
        <span className="text-xs text-[var(--pbl-text-muted)]">依据 {record.evidence.length} 条学习证据</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--pbl-text-muted)]">{record.editedContent ?? record.diagnosis}</p>
      <EvidenceList evidence={record.evidence} />
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </article>
  );
}

export function EvidenceList({ evidence }: { evidence: string[] }) {
  return evidence.length ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-[var(--pbl-teacher)]">查看判断依据</summary><ul className="mt-2 space-y-1 text-[var(--pbl-text-muted)]">{evidence.map((item) => <li key={item}>· {item}</li>)}</ul></details> : <p className="mt-2 text-sm text-[var(--pbl-warning)]">尚未关联过程证据</p>;
}

export function FeedbackLanes({ feedback }: { feedback: TeacherFeedback[] }) {
  const lanes = [
    { key: "ai" as const, title: "AI 反馈", icon: <ClipboardCheck size={16} /> },
    { key: "teacher" as const, title: "教师反馈", icon: <UserRoundCheck size={16} /> },
    { key: "peer" as const, title: "同伴反馈", icon: <Circle size={13} /> },
  ];
  return <div className="grid gap-6 lg:grid-cols-3">{lanes.map((lane) => { const items = feedback.filter((item) => (item.sourceRole ?? "teacher") === lane.key); return <section key={lane.key}><h3 className="flex items-center gap-2 border-b border-[var(--pbl-border)] pb-2 font-semibold">{lane.icon}{lane.title}</h3>{items.length ? <div className="divide-y divide-[var(--pbl-border-soft)]">{items.map((item) => <article className="py-3" key={item.id}><p className="text-sm leading-6">{item.content}</p><EvidenceList evidence={item.evidence ?? []} /></article>)}</div> : <p className="py-4 text-sm text-[var(--pbl-text-muted)]">暂无反馈</p>}</section>; })}</div>;
}
