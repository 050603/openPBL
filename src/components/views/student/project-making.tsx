"use client";

import { useState } from "react";
import { FileCheck2, LoaderCircle, Upload } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import type { Course } from "@/lib/session/types";
import { inferStageCollectionMode } from "@/lib/system-mode";
import { WorkspaceView } from "./workspace";

export function ProjectMakingView({ course }: { course: Course }) {
  const isNewFiveStageCourse = inferStageCollectionMode(course.stages) === "new";
  return <div className="space-y-6"><header className="border-b border-[var(--pbl-border)] pb-5"><h1 className="font-editorial text-2xl font-semibold">项目实践</h1></header><WorkspaceView course={course} />{isNewFiveStageCourse ? <FinalPdfSubmission course={course} /> : null}</div>;
}

/** Shared final-PDF submission entry for the stage view and AI workbench. */
export function FinalPdfSubmission({ course }: { course: Course }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string }>();

  async function submit(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setMessage({ tone: "error", text: "最终成果仅支持 PDF 文件。" });
      return;
    }
    if (file.size <= 0 || file.size > 50 * 1024 * 1024) {
      setMessage({ tone: "error", text: "PDF 不能为空且不能超过 50 MiB。" });
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("title", file.name);
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        body.append("requestId", crypto.randomUUID());
      }
      const response = await fetch(`/api/courses/${encodeURIComponent(course.id)}/showcase/artifacts/pdf`, { method: "POST", body });
      const payload = await response.json().catch(() => null) as { message?: string; sequence?: number } | null;
      if (!response.ok) throw new Error(payload?.message ?? `提交失败（${response.status}）`);
      setMessage({ tone: "ok", text: `最终 PDF 已提交为第 ${payload?.sequence ?? "最新"} 版，第四阶段可直接查看。` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "PDF 提交失败，请稍后重试。" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-[var(--pbl-student-border)]" compact>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]"><FileCheck2 size={19} /></span><div><h2 className="font-bold text-[var(--pbl-text-strong)]">提交最终 PDF</h2><p className="mt-1 text-sm leading-6 text-[var(--pbl-text-muted)]">PDF 会以不可变版本保存。你可以在第四阶段选择连续阅读或逐页演示。</p></div></div>
        <label className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--pbl-student)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--pbl-student-hover)] has-[:disabled]:cursor-wait has-[:disabled]:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Upload size={17} />}{busy ? "提交中…" : "选择 PDF 并提交"}<input accept=".pdf,application/pdf" className="sr-only" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void submit(file); }} type="file" /></label>
      </div>
      {message ? <div className="mt-3 flex items-center gap-2 text-sm"><Pill tone={message.tone === "ok" ? "green" : "red"}>{message.tone === "ok" ? "已保存" : "提交失败"}</Pill><span className={message.tone === "ok" ? "text-emerald-700" : "text-rose-700"}>{message.text}</span></div> : null}
    </Card>
  );
}
