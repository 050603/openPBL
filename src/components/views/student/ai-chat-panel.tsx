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
  const [messages, setMessages] = useState<ChatMsg[]>(() => enabled ? [{ role: "assistant", content: `你好，我是本阶段（${contextLabel}）的 AI 学习助手。可以问我关于选题、证据收集、AI 使用边界等问题，我会引导你自主思考，不会直接给出完整答案。`, ts: new Date().toISOString() }] : []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto" });
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
    const asksForCompleteWork = /完整|全部|直接生成|代写/.test(text);
    const hasOwnWork = (course.submissions ?? []).some((item) => item.stageKey === stageKey && item.content.replace(/<[^>]+>/g, "").trim().length >= 30);
    if (asksForCompleteWork && !hasOwnWork) {
      setMessages((current) => [...current, { role: "assistant", content: "在我帮助生成高影响内容前，请先提交你的想法、草稿，或说明一个具体卡点。我可以先帮你检查范围、补充知识或诊断下一步。", ts: new Date().toISOString() }]);
      setSending(false);
      return;
    }
    try {
      const teacherContext = (course.teacherInterventions ?? []).filter((item) => item.stageKey === stageKey && item.status === "open").map((item) => `${item.action}：${item.instruction}`).join("；") || "暂无额外教师介入";
      const systemPrompt = `你是 PBL 课堂学习助手。当前课程：${course.name}（驱动问题：${course.drivingQuestion || "无"}）。学生正在「${contextLabel}」阶段。教师最新导学要求：${teacherContext}。请基于当前项目与教师要求给出简短、可操作的引导（不超过 200 字），不要直接给出完整答案；说明建议关联的任务或证据，并引导学生自主判断。`;
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
    <section className="border-y border-[var(--pbl-border)] bg-[var(--pbl-surface)]">
      <button aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpen((value) => !value)} type="button"><span><span className="flex items-center gap-2 font-semibold text-[var(--pbl-ai)]"><MessageSquare size={18} />当前任务的 AI 支架</span><span className="mt-1 block text-sm text-[var(--pbl-text-muted)]">{contextLabel} · 基于项目内容和教师最新导学</span></span><span className="text-sm font-semibold text-[var(--pbl-ai)]">{open ? "收起" : "展开"}</span></button>
      {open ? (
        <div className="flex min-h-[360px] max-h-[560px] flex-col overflow-hidden border-t border-[var(--pbl-border)]">
          <div className="flex items-center justify-between bg-[var(--pbl-ai-soft)] px-4 py-3">
            <div className="flex items-center gap-2 font-semibold text-[var(--pbl-ai)]">
              <Bot size={16} /> AI 学习助手 · {contextLabel}
            </div>
            <button
              className="grid h-11 w-11 place-items-center rounded-[5px] text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)]"
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
                      ? "bg-[var(--pbl-student)] text-white"
                      : "bg-[var(--pbl-surface-soft)] text-[var(--pbl-text)]"
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
    </section>
  );
}
