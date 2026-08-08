"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudCog,
  Send,
} from "lucide-react";
import { Input, NativeSelect, PrimaryButton, Textarea } from "@/components/ui";
import type { LearningEvidence } from "@/lib/session/types";
import { cn } from "@/lib/utils";

const EvidenceTaskFocusContext = createContext<string | null>(null);

export function EvidenceTaskFocusProvider({
  actionId,
  children,
}: {
  actionId?: string;
  children: ReactNode;
}) {
  return (
    <EvidenceTaskFocusContext.Provider value={actionId ?? null}>
      {children}
    </EvidenceTaskFocusContext.Provider>
  );
}

export function splitLines(value: string): string[] {
  return value
    .split(/\r?\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinLines(value: string[] | undefined): string {
  return (value ?? []).join("\n");
}

export function EvidenceCard({
  actionId,
  eyebrow,
  title,
  description,
  status,
  saveState,
  error,
  onSubmit,
  children,
  active = false,
}: {
  actionId?: string;
  eyebrow: string;
  title: string;
  description: string;
  status: LearningEvidence["status"];
  saveState: "idle" | "saving" | "saved";
  error: string | null;
  onSubmit: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  const focusedActionId = useContext(EvidenceTaskFocusContext);
  if (focusedActionId && focusedActionId !== actionId) return null;
  const integrated = Boolean(focusedActionId);

  const statusLabel = status === "teacher-confirmed"
    ? "教师已确认"
    : status === "needs-revision"
      ? "需修订"
      : status === "submitted"
        ? "已提交"
        : "草稿";
  return (
    <section
      className={cn(
        "evidence-card min-w-0 rounded-2xl border bg-white p-4 shadow-sm md:p-5",
        active
          ? "border-[var(--pbl-student)] ring-2 ring-[color-mix(in_srgb,var(--pbl-student)_12%,transparent)]"
          : "border-stone-200",
      )}
    >
      {!integrated ? <header className="evidence-card__header flex min-w-0 flex-col gap-3 border-b border-stone-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--pbl-student)]">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-bold text-stone-900 [overflow-wrap:anywhere]">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500 [overflow-wrap:anywhere]">{description}</p>
        </div>
        <span className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1.5 self-start rounded-full px-2.5 text-xs font-semibold ring-1",
          status === "teacher-confirmed"
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : status === "needs-revision"
              ? "bg-rose-50 text-rose-700 ring-rose-200"
              : status === "submitted"
                ? "bg-amber-50 text-amber-700 ring-amber-200"
                : "bg-stone-50 text-stone-600 ring-stone-200",
        )}>
          {status === "teacher-confirmed" ? <CheckCircle2 size={13} /> : null}
          {statusLabel}
        </span>
      </header> : null}
      <div className="evidence-card__body mt-5 grid min-w-0 gap-4">{children}</div>
      {error ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700" role="alert">
          <AlertCircle size={16} />{error}
        </p>
      ) : null}
      <footer className="evidence-card__footer mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
        <span className="inline-flex items-center gap-1.5 text-xs text-stone-500">
          {saveState === "saving" ? <CloudCog size={14} /> : <Cloud size={14} />}
          {saveState === "saving" ? "正在自动保存…" : saveState === "saved" ? "草稿已自动保存" : "输入后自动保存"}
        </span>
        <PrimaryButton
          disabled={status === "teacher-confirmed"}
          onClick={onSubmit}
          size="sm"
          tone="teal"
          type="button"
        >
          <Send size={14} />
          {status === "submitted" ? "重新提交" : "提交"}
        </PrimaryButton>
      </footer>
    </section>
  );
}

export function Field({
  label,
  description,
  value,
  onChange,
  placeholder,
  rows = 3,
  input = false,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  input?: boolean;
}) {
  return (
    <label className="evidence-field grid min-w-0 gap-2">
      <span className="evidence-field__label text-sm font-semibold text-stone-800 [overflow-wrap:anywhere]">{label}</span>
      {input ? (
        <Input
          className="evidence-control min-w-0"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      ) : (
        <Textarea
          className="evidence-control evidence-control--textarea min-h-0 min-w-0"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          value={value}
        />
      )}
      {description ? <span className="evidence-field__help text-xs leading-5 text-stone-500 [overflow-wrap:anywhere]">{description}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="evidence-field grid min-w-0 gap-2">
      <span className="evidence-field__label text-sm font-semibold text-stone-800 [overflow-wrap:anywhere]">{label}</span>
      <NativeSelect
        className="evidence-control min-w-0"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </NativeSelect>
    </label>
  );
}

export function EvidenceTimeline({
  items,
  selectedIds,
  onToggle,
}: {
  items: Array<{ id: string; title: string; kind: string; stageKey: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (!items.length) {
    return (
      <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-5 text-sm text-stone-500">
        还没有可选择的真实学习证据。请先回到前序阶段形成项目立意、方案或测试记录。
      </p>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => {
        const checked = selectedIds.includes(item.id);
        return (
          <button
            aria-pressed={checked}
            className={cn(
              "rounded-xl border px-3 py-3 text-left transition",
              checked
                ? "border-[var(--pbl-student)] bg-[var(--pbl-student-soft)]"
                : "border-stone-200 bg-white hover:border-stone-300",
            )}
            key={item.id}
            onClick={() => onToggle(item.id)}
            type="button"
          >
            <span className="block text-xs font-semibold text-stone-500">{item.stageKey} · {item.kind}</span>
            <strong className="mt-1 block text-sm text-stone-900">{item.title}</strong>
          </button>
        );
      })}
    </div>
  );
}
