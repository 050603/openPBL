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

/** Shared additional-outcome submission entry for the stage view and AI workbench. */
export function FinalPdfSubmission({ course }: { course: Course }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string }>();

  async function submit(file: File) {
    const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
    const supported = new Set([".pdf", ".doc", ".docx", ".zip", ".rar", ".7z", ".txt", ".md", ".csv", ".json", ".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".java", ".c", ".cpp", ".h"]);
    if (!supported.has(extension)) {
      setMessage({ tone: "error", text: "支持 PDF、Word、ZIP 和常见代码或文本文件。" });
      return;
    }
    if (file.size <= 0 || file.size > 100 * 1024 * 1024) {
      setMessage({ tone: "error", text: "成果文件不能为空且不能超过 100 MiB。" });
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
      setMessage({ tone: "ok", text: `额外成果已提交为第 ${payload?.sequence ?? "最新"} 份，第四阶段可查看或下载。` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "成果提交失败，请稍后重试。" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-[var(--pbl-student-border)]" compact>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]"><FileCheck2 size={19} /></span><div><h2 className="font-bold text-[var(--pbl-text-strong)]">提交额外成果</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--pbl-text-muted)]">如果最终目标不只是上方 Word 文档，可在这里提交汇报 PDF、代码、ZIP 包或其他补充成果。它们会与 Word 文档一起进入第四阶段的汇报资料。</p><p className="mt-1 text-xs text-[var(--pbl-text-subtle)]">PDF 可选择投屏展示；其他文件供教师收集和下载。单个文件不超过 100 MiB。</p></div></div>
        <label className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--pbl-student)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--pbl-student-hover)] has-[:disabled]:cursor-wait has-[:disabled]:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Upload size={17} />}{busy ? "提交中…" : "选择成果文件"}<input accept=".pdf,.doc,.docx,.zip,.rar,.7z,.txt,.md,.csv,.json,.py,.js,.jsx,.ts,.tsx,.html,.css,.java,.c,.cpp,.h" className="sr-only" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void submit(file); }} type="file" /></label>
      </div>
      {message ? <div className="mt-3 flex items-center gap-2 text-sm"><Pill tone={message.tone === "ok" ? "green" : "red"}>{message.tone === "ok" ? "已保存" : "提交失败"}</Pill><span className={message.tone === "ok" ? "text-emerald-700" : "text-rose-700"}>{message.text}</span></div> : null}
    </Card>
  );
}
