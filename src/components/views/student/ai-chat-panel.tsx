"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, MessageSquare, Send, X } from "lucide-react";
import { PrimaryButton } from "@/components/ui";
import type { Course } from "@/lib/session/types";
import { callStudentChat } from "@/lib/teaching-ai/client-api";

type ChatMsg = { role: "user" | "assistant"; content: string; ts: string };

/**
 * 学生端常驻 AI 聊天面板（浮动按钮 + 弹出式面板）。
 * 仅当教师在该阶段开启了 aiChatStagesEnabled 时渲染。
 * 通过 /api/chat/student API 路由调用统一配置的 LLM，避免客户端直接持有服务端依赖。
 */
export function StudentAiChatPanel({
  course,
  stageKey,
  contextLabel,
}: {
  course: Course;
  stageKey: string;
  contextLabel: string;
}) {
  const enabledStages = course.uiState?.aiChatStagesEnabled ?? [];
  const enabled = enabledStages.includes(stageKey);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // 初始问候语（仅在面板首次启用时插入一次）
  useEffect(() => {
    if (enabled && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: `你好，我是本阶段（${contextLabel}）的 AI 学习助手。可以问我关于选题、证据收集、AI 使用边界等问题，我会引导你自主思考，不会直接给出完整答案。`,
          ts: new Date().toISOString(),
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stageKey]);

  // 自动滚动到底部
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!enabled) return null;

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const userMsg: ChatMsg = { role: "user", content: text, ts: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const systemPrompt = `你是 PBL 课堂学习助手。当前课程：${course.name}（驱动问题：${course.drivingQuestion || "无"}）。学生正在「${contextLabel}」阶段。请基于学生的提问给出简短、可操作的引导（不超过 200 字），不要直接给出完整答案，引导学生自主思考。`;
      const reply = await callStudentChat([
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: text },
      ]);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: reply || "（空回复）", ts: new Date().toISOString() },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 暂时不可用");
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "（AI 暂时不可用，请稍后重试，或检查系统 LLM 配置）",
          ts: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* 浮动触发按钮 */}
      <button
        className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-blue-600 text-white shadow-lg transition hover:bg-blue-700"
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-label="AI 学习助手"
      >
        <MessageSquare size={22} />
      </button>

      {/* 聊天面板 */}
      {open ? (
        <div className="fixed bottom-24 right-6 z-40 flex h-[460px] w-[380px] flex-col overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 bg-blue-50 px-4 py-3">
            <div className="flex items-center gap-2 font-black text-blue-700">
              <Bot size={16} /> AI 学习助手 · {contextLabel}
            </div>
            <button
              className="grid h-7 w-7 place-items-center rounded-[5px] text-slate-400 hover:bg-slate-100"
              onClick={() => setOpen(false)}
              type="button"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-[8px] px-3 py-2 text-sm leading-6 ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          {error ? (
            <div className="border-t border-amber-100 bg-amber-50 px-3 py-1 text-xs text-amber-700">
              {error}
            </div>
          ) : null}
          <div className="border-t border-slate-100 px-3 py-2">
            <div className="flex gap-2">
              <input
                className="h-10 flex-1 rounded-[6px] border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                disabled={sending}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="问一个问题..."
                value={input}
              />
              <PrimaryButton
                className="h-10 px-3"
                disabled={sending || !input.trim()}
                onClick={() => void send()}
                type="button"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
