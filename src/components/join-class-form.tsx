"use client";

import { useState } from "react";
import { KeyRound, LogIn } from "lucide-react";
import { isValidInviteCode, normalizeInviteCode } from "@/lib/session/invite-code";
import { PrimaryButton } from "@/components/ui";

export function JoinClassForm({
  onSubmit,
  busy,
  errorMessage,
}: {
  onSubmit: (code: string, name: string) => void;
  busy?: boolean;
  errorMessage?: string;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | undefined>();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeInviteCode(code);
    if (!isValidInviteCode(normalized)) {
      setLocalError("请输入 6 位有效的邀请码（字母 + 数字）");
      return;
    }
    if (!name.trim()) {
      setLocalError("请输入你的姓名");
      return;
    }
    setLocalError(undefined);
    onSubmit(normalized, name.trim());
  }

  const error = localError ?? errorMessage;

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-[var(--radius-md)] border border-slate-200/80 bg-white p-8 shadow-[var(--shadow-raised)]"
      onSubmit={submit}
    >
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-teal-50 text-teal-600">
          <KeyRound size={26} />
        </div>
        <h2 className="mt-4 text-[26px] font-bold text-slate-900">加入课堂</h2>
        <p className="mt-1 text-sm text-slate-500">
          输入教师提供的邀请码与你的姓名，即可进入课堂
        </p>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">邀请码</span>
        <input
          className="h-12 w-full rounded-[var(--radius-xs)] border border-slate-300 px-4 text-center text-xl font-bold tracking-[0.4em] text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          maxLength={6}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          placeholder="A2K9QP"
          value={code}
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">姓名</span>
        <input
          className="h-12 w-full rounded-[var(--radius-xs)] border border-slate-300 px-4 text-base outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：张同学"
          value={name}
        />
      </label>

      {error ? (
        <div className="rounded-[var(--radius-xs)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <PrimaryButton className="h-12 w-full justify-center text-base" tone="teal" disabled={busy} type="submit">
        <LogIn size={18} /> {busy ? "加入中..." : "进入课堂"}
      </PrimaryButton>
    </form>
  );
}
