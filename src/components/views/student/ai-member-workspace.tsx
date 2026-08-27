"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileInput,
  FilePenLine,
  LoaderCircle,
  MessageCircleQuestion,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Streamdown } from "streamdown";
import type {
  DelegatedWorkDocumentAction,
  DocumentCollaborationResponse,
} from "@/lib/ai-collaboration/document-policy";
import { cn } from "@/lib/utils";

export type AiMemberWorkspaceMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  kind?: DocumentCollaborationResponse["kind"];
};

export type AiMemberPendingChange = {
  title: string;
  reason: string;
  operation: "replace" | "insert";
  presentation: "inline" | "blocks";
  error?: string | null;
};

export type AiMemberPendingDelivery = {
  title: string;
  summary: string;
  content: string;
  documentActions: DelegatedWorkDocumentAction[];
  sources: Array<{ title: string; url: string; note: string }>;
  researchMode: "web" | "model" | "none";
  error?: string | null;
};

type AiMemberWorkspaceProps = {
  busy: boolean;
  draft: string;
  error: string | null;
  historyLoaded: boolean;
  messages: AiMemberWorkspaceMessage[];
  mode: "discuss" | "task";
  pendingChange: AiMemberPendingChange | null;
  pendingDelivery: AiMemberPendingDelivery | null;
  projectTitle: string;
  taskStarters: string[];
  taskStartersBusy: boolean;
  onAcceptChange: () => void;
  onAdoptDelivery: () => void;
  onChangeDraft: (value: string) => void;
  onClose: () => void;
  onDismissError: () => void;
  onDeleteMessage: (messageId: string) => void;
  onModeChange: (mode: "discuss" | "task") => void;
  onNewConversation: () => void;
  onRejectDelivery: () => void;
  onRejectChange: () => void;
  onReviseDelivery: () => void;
  onSubmit: () => void;
};

const DISCUSSION_STARTERS = [
  "我们现在最需要先验证哪一点？",
  "对照项目要求，目前还缺什么？",
  "帮我梳理一下下一步，但先不要改文档。",
];

function formatMessageTime(value: string): string {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
}

export function AiMemberWorkspace({
  busy,
  draft,
  error,
  historyLoaded,
  messages,
  mode,
  pendingChange,
  pendingDelivery,
  projectTitle,
  taskStarters,
  taskStartersBusy,
  onAcceptChange,
  onAdoptDelivery,
  onChangeDraft,
  onClose,
  onDismissError,
  onDeleteMessage,
  onModeChange,
  onNewConversation,
  onRejectDelivery,
  onRejectChange,
  onReviseDelivery,
  onSubmit,
}: AiMemberWorkspaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [confirmNewConversation, setConfirmNewConversation] = useState(false);
  const starters = mode === "task" ? taskStarters : DISCUSSION_STARTERS;
  const deliveryChangesDocument = pendingDelivery?.documentActions
    .some((action) => action.operation !== "none") ?? false;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [busy, messages.length, pendingChange, pendingDelivery]);

  return (
    <section
      aria-label="AI 组员工作区"
      className="fixed inset-x-3 bottom-3 top-[76px] z-[80] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white text-stone-950 shadow-[0_24px_80px_-24px_rgba(28,25,23,0.36)] sm:left-auto sm:right-4 sm:w-[min(500px,calc(100vw-32px))]"
    >
      <header className="shrink-0 border-b border-stone-200 bg-white px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-stone-950 text-white shadow-sm">
              <Bot size={19} />
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-[15px]">AI 组员</h2>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">协作中</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-stone-500">{projectTitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              aria-label="开始新对话"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40"
              disabled={busy || Boolean(pendingChange) || Boolean(pendingDelivery)}
              onClick={() => setConfirmNewConversation(true)}
              title="开始新对话"
              type="button"
            >
              <MessageSquarePlus size={14} />新对话
            </button>
            <button
              aria-label="收起 AI 组员"
              className="grid size-8 place-items-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
              onClick={onClose}
              type="button"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {confirmNewConversation ? (
          <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-600">
            <p className="font-semibold text-stone-900">开始一段新对话？</p>
            <p className="mt-0.5">当前消息会从这里清空，也不再发送给 AI；系统仍保留原记录用于课程过程分析。</p>
            <div className="mt-2 flex justify-end gap-2">
              <button className="rounded-lg px-2.5 py-1.5 font-medium hover:bg-stone-200" onClick={() => setConfirmNewConversation(false)} type="button">取消</button>
              <button className="rounded-lg bg-stone-950 px-2.5 py-1.5 font-semibold text-white hover:bg-stone-800" onClick={() => { setConfirmNewConversation(false); onNewConversation(); }} type="button">开始新对话</button>
            </div>
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1.5">
          <button
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left transition",
              mode === "discuss"
                ? "bg-white text-stone-950 shadow-sm ring-1 ring-stone-200/70"
                : "text-stone-500 hover:bg-white/60 hover:text-stone-800",
            )}
            onClick={() => onModeChange("discuss")}
            type="button"
          >
            <MessageCircleQuestion className="size-4 shrink-0" />
            <span className="min-w-0">
              <strong className="block truncate text-xs font-semibold">一起讨论</strong>
              <span className="block truncate text-[10px] opacity-70">分析问题，不改文档</span>
            </span>
          </button>
          <button
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left transition",
              mode === "task"
                ? "bg-white text-stone-950 shadow-sm ring-1 ring-stone-200/70"
                : "text-stone-500 hover:bg-white/60 hover:text-stone-800",
            )}
            onClick={() => onModeChange("task")}
            type="button"
          >
            <BriefcaseBusiness className="size-4 shrink-0" />
            <span className="min-w-0">
              <strong className="block truncate text-xs font-semibold">安排工作</strong>
              <span className="block truncate text-[10px] opacity-70">组员交付，由你审阅</span>
            </span>
          </button>
        </div>

      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-stone-50/80 px-4 py-4" ref={scrollRef} aria-live="polite">
        {!historyLoaded ? (
          <div className="grid min-h-32 place-items-center text-xs text-stone-500">
            <span className="inline-flex items-center gap-2"><LoaderCircle className="animate-spin" size={14} />加载协作记录…</span>
          </div>
        ) : null}

        {historyLoaded && !messages.length ? (
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <span className="grid size-9 place-items-center rounded-lg bg-stone-100 text-stone-700"><Sparkles size={17} /></span>
            <h3 className="mt-3 text-sm font-semibold">
              {mode === "task" ? "像组长一样安排一项辅助工作" : "从正在形成的想法开始讨论"}
            </h3>
            <p className="mt-1.5 text-xs leading-5 text-stone-500">
              {mode === "task"
                ? "我会先对照项目学习目标判断能否接单。辅助工作完成后作为独立交付物提交给你，不会直接改动正文；核心学习任务仍由你完成。"
                : "我会结合项目目标、当前任务和实时草稿一起分析，先帮助你看清问题，再由你作出判断。"}
            </p>
          </div>
        ) : null}

        <div className="space-y-3">
          {messages.slice(-30).map((message) => (
            <article
              className={cn(
                "max-w-[92%] rounded-2xl border px-3.5 py-3 text-sm leading-6 shadow-sm",
                message.role === "user"
                  ? "ml-auto rounded-br-md border-stone-200 bg-stone-900 text-white"
                  : message.kind === "boundary"
                    ? "rounded-bl-md border-amber-200 bg-amber-50 text-amber-950"
                    : "rounded-bl-md border-stone-200 bg-white text-stone-800",
              )}
              key={message.id}
            >
              <div className={cn(
                "mb-1.5 flex items-center justify-between gap-3 pr-0.5 text-[10px] font-medium",
                message.role === "user" ? "text-stone-300" : message.kind === "boundary" ? "text-amber-700" : "text-stone-500",
              )}>
                <span>{message.role === "user" ? "我" : message.kind === "boundary" ? "AI 组员 · 协作边界" : "AI 组员"}</span>
                <span className="flex items-center gap-1.5">
                  <time>{formatMessageTime(message.createdAt)}</time>
                  <button
                    aria-label="从当前对话中移除这条消息"
                    className={cn(
                      "grid size-5 place-items-center rounded transition",
                      message.role === "user" ? "hover:bg-white/15 hover:text-white" : "hover:bg-stone-100 hover:text-stone-800",
                    )}
                    onClick={() => onDeleteMessage(message.id)}
                    title="移除后不再发送给 AI，后台仍保留记录"
                    type="button"
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              </div>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </article>
          ))}

          {busy ? (
            <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-stone-200 bg-white px-3.5 py-3 text-xs text-stone-500 shadow-sm">
              <span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={14} />正在对照项目要求、当前任务和实时文稿…</span>
            </div>
          ) : null}

          {pendingChange ? (
            <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm" aria-label="待确认的 AI 修改">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-stone-900 text-white"><FilePenLine size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">正文中待确认的修改</p>
                  <h3 className="mt-1 text-sm font-semibold text-stone-950">{pendingChange.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-stone-500">{pendingChange.reason}</p>
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-5 text-stone-600 ring-1 ring-inset ring-stone-200">
                <p className="font-medium text-stone-800">
                  {pendingChange.operation === "insert"
                    ? "新增内容已在正文中标出"
                    : pendingChange.presentation === "blocks"
                      ? "较大修改已按段落在正文中标出"
                      : "局部修改已按字词在正文中标出"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-red-200 ring-1 ring-red-300" />红色：拟删除</span>
                  <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-emerald-200 ring-1 ring-emerald-300" />绿色：拟新增</span>
                </div>
              </div>

              {pendingChange.error ? (
                <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700" role="alert">{pendingChange.error}</p>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50" onClick={onRejectChange} type="button">保留原文</button>
                <button className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-stone-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40" disabled={Boolean(pendingChange.error)} onClick={onAcceptChange} type="button"><CheckCircle2 size={14} />接受并写入</button>
              </div>
            </section>
          ) : null}

          {pendingDelivery ? (
            <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-[0_12px_36px_-24px_rgba(2,132,199,0.45)]" aria-label="待审阅的 AI 组员交付物">
              <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 to-white px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-600 text-white shadow-sm"><ClipboardCheck size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-700">组员交付 · 待组长审阅</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-medium text-stone-500 ring-1 ring-stone-200">尚未写入文档</span>
                    </div>
                    <h3 className="mt-1 text-sm font-bold text-stone-950">{pendingDelivery.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-stone-600">{pendingDelivery.summary}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 p-4">
                <div className="max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3">
                  <div className="prose prose-sm max-w-none text-stone-800 prose-headings:mb-2 prose-headings:mt-3 prose-p:my-2 prose-li:my-0.5 prose-table:text-xs prose-th:bg-stone-100 prose-th:p-2 prose-td:p-2">
                    <Streamdown>{pendingDelivery.content}</Streamdown>
                  </div>
                </div>

                {pendingDelivery.sources.length ? (
                  <div className="rounded-xl border border-stone-200 bg-white p-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500"><ExternalLink size={12} />使用的资料来源</p>
                    <div className="mt-2 space-y-2">
                      {pendingDelivery.sources.map((source) => (
                        <a className="block rounded-lg bg-stone-50 px-2.5 py-2 text-xs text-stone-700 transition hover:bg-stone-100" href={source.url} key={source.url} rel="noreferrer" target="_blank">
                          <span className="font-semibold text-sky-700">{source.title}</span>
                          {source.note ? <span className="mt-0.5 block line-clamp-2 text-[10px] leading-4 text-stone-500">{source.note}</span> : null}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-600"><FileInput size={12} />AI 已规划文档操作</p>
                  <div className="mt-2 space-y-2">
                    {pendingDelivery.documentActions.map((action, index) => (
                      <div className="rounded-lg border border-stone-200 bg-white px-2.5 py-2" key={`${action.operation}-${index}`}>
                        <p className="text-xs font-semibold leading-5 text-stone-800">{action.description}</p>
                        {action.targetText ? (
                          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-500">定位段落：{action.targetText}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-stone-500">
                    {deliveryChangesDocument
                      ? "位置和内容已经由 AI 确定；确认后会一次性应用，仍可撤销。"
                      : "这次交付只提供资料，不会修改当前文档。"}
                  </p>
                </div>
                {pendingDelivery.error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700" role="alert">{pendingDelivery.error}</p> : null}

                <div className="grid grid-cols-2 gap-2">
                  <button className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50" onClick={onRejectDelivery} type="button">暂不采用</button>
                  <button className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50" onClick={onReviseDelivery} type="button"><Undo2 size={13} />退回修改</button>
                  <button className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-stone-950 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-stone-800" onClick={onAdoptDelivery} type="button"><CheckCircle2 size={14} />{deliveryChangesDocument ? "确认并应用到文档" : "完成审阅"}</button>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <form
        className="shrink-0 border-t border-stone-200 bg-white p-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {error ? (
          <div className="mb-2.5 flex items-start justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800" role="alert">
            <span>{error}</span>
            <button aria-label="关闭提示" className="mt-0.5 shrink-0" onClick={onDismissError} type="button"><X size={13} /></button>
          </div>
        ) : null}

        {!draft && !pendingChange && !pendingDelivery && starters.length ? (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
            {starters.map((starter) => (
              <button className="shrink-0 rounded-full border border-stone-200 bg-white px-2.5 py-1.5 text-[10px] text-stone-600 transition hover:border-stone-300 hover:bg-stone-50" key={starter} onClick={() => onChangeDraft(starter)} type="button">{starter}</button>
            ))}
          </div>
        ) : null}
        {mode === "task" && taskStartersBusy && !draft && !pendingDelivery ? (
          <p className="mb-2 inline-flex items-center gap-1.5 px-1 text-[10px] text-stone-500"><LoaderCircle className="animate-spin" size={11} />正在根据当前文稿更新工作建议…</p>
        ) : null}

        <div className="rounded-xl border border-stone-300 bg-white p-2.5 shadow-sm transition focus-within:border-stone-500 focus-within:ring-2 focus-within:ring-stone-100">
          <textarea
            className="max-h-40 min-h-20 w-full resize-none bg-transparent px-1 text-sm leading-6 text-stone-900 outline-none placeholder:text-stone-400"
            disabled={busy || Boolean(pendingChange) || Boolean(pendingDelivery)}
            maxLength={1200}
            onChange={(event) => onChangeDraft(event.target.value)}
            placeholder={mode === "task"
              ? "说明要完成什么、交付范围和希望的格式…"
              : "把你的判断、疑问或正在犹豫的地方告诉 AI 组员…"}
            value={draft}
          />
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-stone-100 pt-2">
            <span className="flex items-center gap-1 text-[10px] text-stone-500"><ShieldCheck size={11} />AI 提供支架，你保留核心判断与最终决定</span>
            <button
              aria-label="发送给 AI 组员"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-stone-950 px-3 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={busy || Boolean(pendingChange) || Boolean(pendingDelivery) || !draft.trim()}
              type="submit"
            >
              {busy ? <LoaderCircle className="animate-spin" size={13} /> : <Send size={13} />}
              发送
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
