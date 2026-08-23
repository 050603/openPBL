"use client";

import { useMemo, useState } from "react";
import { Bot, FileCheck2, MessageCircle, RotateCcw, Undo2, UserRound } from "lucide-react";
import { getCompanion } from "@/lib/ai-companions";
import {
  parseWorkspaceOperation,
  revertCompanionWorkspaceOperation,
  type CompanionWorkspaceOperation,
} from "@/lib/companion/workspace-operation";
import type { Course } from "@/lib/session/types";
import type { CompanionChatMessage } from "./companion-runtime";

type ArchiveFilter = "all" | "edits" | "evidence" | "conversation";

export function StudioProcessArchive({
  course,
  studentId,
  stageKey,
  messages,
  onUndo,
}: {
  course: Course;
  studentId: string;
  stageKey: string;
  messages: CompanionChatMessage[];
  onUndo: (confirmationId: string, operation: CompanionWorkspaceOperation) => { ok: boolean; message: string };
}) {
  const [filter, setFilter] = useState<ArchiveFilter>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const operations = useMemo(() => (course.companionConfirmations ?? [])
    .filter((item) => item.studentId === studentId && item.stageKey === stageKey)
    .map((confirmation) => ({ confirmation, operation: parseWorkspaceOperation(confirmation.payload) }))
    .filter((item): item is typeof item & { operation: CompanionWorkspaceOperation } => Boolean(item.operation))
    .sort((a, b) => Date.parse(b.confirmation.createdAt) - Date.parse(a.confirmation.createdAt)),
  [course.companionConfirmations, stageKey, studentId]);
  const evidence = useMemo(() => (course.learningEvidence ?? [])
    .filter((item) => item.studentId === studentId && item.stageKey === stageKey)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
  [course.learningEvidence, stageKey, studentId]);
  const records = useMemo(() => (course.companionProcessRecords ?? [])
    .filter((item) => item.studentId === studentId && item.stageKey === stageKey)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
  [course.companionProcessRecords, stageKey, studentId]);
  const stageMessages = messages.filter((item) => item.role === "assistant" || item.role === "user");

  return (
    <div className="studio-archive-workspace">
      <header className="studio-workspace-view-heading">
        <div>
          <p>查看提交、AI 协作和版本记录。</p>
        </div>
        <div className="studio-archive-counts">
          <span><strong>{operations.length}</strong>AI 编辑</span>
          <span><strong>{evidence.length}</strong>阶段证据</span>
          <span><strong>{stageMessages.length}</strong>对话</span>
        </div>
      </header>

      <nav aria-label="过程档案筛选" className="studio-archive-filters">
        {([
          ["all", "全部"],
          ["edits", "AI 编辑"],
          ["evidence", "提交与草稿"],
          ["conversation", "对话"],
        ] as Array<[ArchiveFilter, string]>).map(([id, label]) => (
          <button aria-pressed={filter === id} key={id} onClick={() => setFilter(id)} type="button">{label}</button>
        ))}
      </nav>

      {notice ? <p className="studio-archive-notice" role="status">{notice}</p> : null}

      <div className="studio-archive-timeline">
        {(filter === "all" || filter === "edits") ? operations.map(({ confirmation, operation }) => {
          const companion = getCompanion(operation.companionId);
          const preview = revertCompanionWorkspaceOperation({ course, operation });
          const canUndo = confirmation.status === "confirmed" && preview.status === "applied";
          return (
            <article className="studio-archive-event is-ai-edit" key={confirmation.id}>
              <i><Bot size={15} /></i>
              <div>
                <header><strong>{companion.name}编辑了“{operation.label}”</strong><time>{formatArchiveTime(confirmation.createdAt)}</time></header>
                <p>{confirmation.summary}</p>
                <div className="studio-archive-change"><span>修改后</span><p>{renderValue(operation.afterValue)}</p></div>
                <footer>
                  <span data-status={confirmation.status}>{confirmation.status === "rejected" ? "已撤销" : "已写入共享草稿"}</span>
                  {confirmation.status === "confirmed" ? (
                    <button
                      disabled={!canUndo}
                      onClick={() => {
                        const result = onUndo(confirmation.id, operation);
                        setNotice(result.message);
                      }}
                      title={!canUndo && preview.status !== "applied" ? preview.reason : undefined}
                      type="button"
                    ><Undo2 size={13} /> 撤销这次编辑</button>
                  ) : null}
                </footer>
              </div>
            </article>
          );
        }) : null}

        {(filter === "all" || filter === "evidence") ? evidence.map((item) => (
          <article className="studio-archive-event" key={`evidence-${item.id}`}>
            <i>{item.source === "student" ? <UserRound size={15} /> : <Bot size={15} />}</i>
            <div>
              <header><strong>{item.title}</strong><time>{formatArchiveTime(item.updatedAt)}</time></header>
              <p>{item.summary || "已保存阶段草稿"}</p>
              <footer><span data-status={item.status}>{evidenceStatus(item.status)}</span></footer>
            </div>
          </article>
        )) : null}

        {filter === "all" ? records.slice(0, 24).map((record) => (
          <article className="studio-archive-event is-record" key={`record-${record.id}`}>
            <i>{record.source === "agent" ? <Bot size={15} /> : record.source === "student" ? <UserRound size={15} /> : <RotateCcw size={15} />}</i>
            <div><header><strong>{record.title}</strong><time>{formatArchiveTime(record.createdAt)}</time></header><p>{record.summary}</p></div>
          </article>
        )) : null}

        {(filter === "all" || filter === "conversation") ? stageMessages.slice().reverse().slice(0, 30).map((message, index) => (
          <article className="studio-archive-event is-message" key={`message-${message.ts}-${index}`}>
            <i>{message.role === "user" ? <UserRound size={15} /> : <MessageCircle size={15} />}</i>
            <div>
              <header><strong>{message.role === "user" ? "我的任务" : message.companionId ? getCompanion(message.companionId).name : "AI 组员"}</strong><time>{formatArchiveTime(message.ts)}</time></header>
              <p>{message.content}</p>
            </div>
          </article>
        )) : null}

        {!operations.length && !evidence.length && !records.length && !stageMessages.length ? (
          <div className="studio-archive-empty"><FileCheck2 size={22} /><p>还没有过程记录。保存草稿、指派 AI 编辑或提交测试后会自动出现在这里。</p></div>
        ) : null}
      </div>
    </div>
  );
}

function renderValue(value: string | string[]): string {
  return Array.isArray(value) ? value.join("；") : value;
}

function evidenceStatus(status: string): string {
  if (status === "draft") return "草稿";
  if (status === "submitted") return "已提交";
  if (status === "teacher-confirmed") return "教师已确认";
  if (status === "needs-revision") return "需要修订";
  return status;
}

function formatArchiveTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
