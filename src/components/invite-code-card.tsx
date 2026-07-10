"use client";

import { Check, Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function InviteCodeCard({
  code,
  onRefresh,
  label = "邀请码",
  hint,
  size = "lg",
}: {
  code: string;
  onRefresh?: () => void;
  label?: string;
  hint?: string;
  size?: "lg" | "md";
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      // Fallback: select + execCommand
      try {
        const el = document.createElement("textarea");
        el.value = code;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // ignore
      }
      return;
    }
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {
        // ignore
      },
    );
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] p-6 text-center",
      )}
    >
      <div className="text-sm font-semibold text-blue-700">{label}</div>
      <div
        className={cn(
          "mt-3 font-bold tracking-[0.4em] text-blue-700",
          size === "lg" ? "text-[64px] leading-[64px]" : "text-[44px] leading-[44px]",
        )}
      >
        {code.slice(0, 3)} {code.slice(3, 6)}
      </div>
      {hint ? <p className="mt-3 text-sm text-slate-500">{hint}</p> : null}
      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-[6px] bg-[var(--pbl-student)] px-4 text-sm font-semibold text-white hover:bg-[var(--pbl-student-hover)]"
          onClick={copy}
          type="button"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "已复制" : "复制邀请码"}
        </button>
        {onRefresh ? (
          <button
            className="inline-flex h-10 items-center gap-2 rounded-[6px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            onClick={onRefresh}
            type="button"
          >
            <RefreshCw size={15} /> 重新生成
          </button>
        ) : null}
      </div>
    </div>
  );
}
