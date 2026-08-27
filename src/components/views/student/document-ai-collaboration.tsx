"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  FilePenLine,
  LoaderCircle,
  RefreshCcw,
  Save,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import {
  PlateDocumentEditor,
  type PlateDocumentEditorHandle,
  type PlateDocumentSelection,
} from "@/components/plate-document-editor";
import { PrimaryButton } from "@/components/ui";
import {
  AiMemberWorkspace,
  type AiMemberWorkspaceMessage,
} from "@/components/views/student/ai-member-workspace";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import type {
  DelegatedWorkDeliverable,
  DocumentCollaborationIntent,
  DocumentCollaborationResponse,
  DocumentCollaborationSuggestion,
} from "@/lib/ai-collaboration/document-policy";
import type {
  DocumentAiCommentReplyResult,
  DocumentAiCommentThread,
} from "@/lib/ai-collaboration/document-comment-types";
import { DOCUMENT_COMMENT_REVIEW_VERSION } from "@/lib/ai-collaboration/document-comment-policy";
import type { AiContribution } from "@/lib/learning-evidence/types";
import { useCourse, useHydrated, useSession } from "@/lib/session/store";
import { cn } from "@/lib/utils";

type CollaborationMessage = AiMemberWorkspaceMessage;

type PendingSuggestion = {
  id: string;
  confirmationId: string;
  contribution: AiContribution;
  suggestion: DocumentCollaborationSuggestion;
  selection: PlateDocumentSelection | null;
  presentation: "inline" | "blocks";
  previewReady: boolean;
  sourceThreadId?: string;
  sourceCommentId?: string;
};

type PendingDelivery = {
  id: string;
  confirmationId: string;
  contribution: AiContribution;
  deliverable: DelegatedWorkDeliverable;
  error?: string | null;
};

type DeliveryRevision = {
  title: string;
  content: string;
};

type UndoableEdit = {
  title: string;
  beforeHtml: string;
  afterHtml: string;
  confirmationId: string;
  contribution: AiContribution;
  decisionId: string;
};

const MODIFICATION_INTENTS = new Set<DocumentCollaborationIntent>(["edit"]);

function plainTextLength(html: string): number {
  if (typeof window === "undefined") return html.replace(/<[^>]*>/g, " ").trim().length;
  const node = window.document.createElement("div");
  node.innerHTML = html;
  return (node.textContent ?? "").replace(/\s+/g, "").length;
}

function nowId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function DocumentAiCollaboration({ courseId }: { courseId: string }) {
  useRealtimeSync(courseId);
  const router = useRouter();
  const hydrated = useHydrated();
  const course = useCourse(courseId);
  const resolvedCourseId = course?.id;
  const session = useSession();
  const studentId = session.studentId ?? "";
  const stage = course?.stages[course.currentStageIndex];
  const stageKey = stage?.key ?? "";
  const supportedStage = stageKey === "proposal" || stageKey === "make";
  const editorRef = useRef<PlateDocumentEditorHandle>(null);
  const submissionIdRef = useRef<string | undefined>(undefined);
  const loadedScopeRef = useRef("");
  const proactiveRequestRef = useRef<Set<string>>(new Set());
  const analyzedParagraphsRef = useRef<Set<string>>(new Set());
  const paragraphSnapshotRef = useRef<Map<string, string>>(new Map());
  const taskStarterContextRef = useRef<{ signature: string; length: number; at: number } | null>(null);
  const savedContentRef = useRef("");
  const [documentHtml, setDocumentHtml] = useState("");
  const [documentReady, setDocumentReady] = useState(false);
  const [selection, setSelection] = useState<PlateDocumentSelection | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving" | "error">("saved");
  const [intent, setIntent] = useState<DocumentCollaborationIntent>("discuss");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<CollaborationMessage[]>([]);
  const [aiCommentThreads, setAiCommentThreads] = useState<DocumentAiCommentThread[]>([]);
  const [conversationId, setConversationId] = useState("legacy");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSuggestion, setPendingSuggestion] = useState<PendingSuggestion | null>(null);
  const [pendingDelivery, setPendingDelivery] = useState<PendingDelivery | null>(null);
  const [deliveryRevision, setDeliveryRevision] = useState<DeliveryRevision | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [undoableEdit, setUndoableEdit] = useState<UndoableEdit | null>(null);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberMode, setMemberMode] = useState<"discuss" | "task">("discuss");
  const [taskStarters, setTaskStarters] = useState<string[]>([]);
  const [taskStartersBusy, setTaskStartersBusy] = useState(false);

  const group = course?.groups?.find((item) =>
    item.members.some((member) => member.studentId === studentId));
  const existingDocument = !course || !studentId || !supportedStage
    ? undefined
    : [...(course.submissions ?? [])]
      .filter((item) =>
        item.stageKey === stageKey
        && item.type === "document"
        && (
          item.studentId === studentId
          || Boolean(group?.id && item.groupId === group.id)
        ))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  const documentTitle = stageKey === "proposal"
    ? "项目方案协作文档"
    : "项目成果协作文档";
  const projectTitle = group?.topic || course?.drivingQuestion || course?.name || documentTitle;

  useEffect(() => {
    if (!hydrated) return;
    if (session.joinedCourseId && session.joinedCourseId !== courseId) {
      router.replace("/student");
    }
  }, [courseId, hydrated, router, session.joinedCourseId]);

  useEffect(() => {
    if (!course || !studentId || !supportedStage) return;
    const scopeKey = `${course.id}:${studentId}:${stageKey}`;
    if (loadedScopeRef.current === scopeKey) return;
    loadedScopeRef.current = scopeKey;
    const initialContent = existingDocument?.content ?? "";
    submissionIdRef.current = existingDocument?.id;
    savedContentRef.current = initialContent;
    setDocumentHtml(initialContent);
    setDocumentReady(true);
    setSaveStatus("saved");
    setSelection(null);
    setPendingSuggestion(null);
    setPendingDelivery(null);
    setDeliveryRevision(null);
    setTaskStarters([]);
    taskStarterContextRef.current = null;
    proactiveRequestRef.current = new Set();
    analyzedParagraphsRef.current = new Set();
    paragraphSnapshotRef.current = new Map();
    setAiCommentThreads([]);
    setUndoableEdit(null);
  }, [course, existingDocument?.content, existingDocument?.id, stageKey, studentId, supportedStage]);

  useEffect(() => {
    if (!resolvedCourseId || !studentId || !supportedStage) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ courseId: resolvedCourseId, studentId, stageKey });
    void fetch(`/api/ai-collaboration/document?${query.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as {
        conversationId?: string;
        messages?: Array<{
          id: string;
          role: string;
          content: string;
          createdAt: string;
        }>;
        commentThreads?: DocumentAiCommentThread[];
      };
      if (controller.signal.aborted) return;
      setConversationId(payload.conversationId || "legacy");
      setMessages((payload.messages ?? []).map((message) => ({
        id: message.id,
        role: message.role === "student" ? "user" : "assistant",
        content: message.content,
        createdAt: message.createdAt,
      })));
      const commentThreads = payload.commentThreads ?? [];
      setAiCommentThreads(commentThreads);
      analyzedParagraphsRef.current = new Set(commentThreads
        .filter((thread) => thread.reviewVersion === DOCUMENT_COMMENT_REVIEW_VERSION)
        .map((thread) =>
          `${thread.blockId ?? thread.blockIndex}:${(thread.blockText ?? thread.targetText).replace(/\s+/g, " ").trim()}`
        ));
    }).catch(() => undefined).finally(() => {
      if (!controller.signal.aborted) setHistoryLoaded(true);
    });
    return () => controller.abort();
  }, [resolvedCourseId, stageKey, studentId, supportedStage]);

  useEffect(() => {
    if (!memberOpen || memberMode !== "task" || !course || !studentId || !supportedStage) return;
    const textLength = plainTextLength(documentHtml);
    const signature = `${course.id}:${stageKey}:${documentHtml.slice(0, 900)}:${documentHtml.slice(-900)}`;
    const previous = taskStarterContextRef.current;
    if (previous?.signature === signature) return;
    if (
      previous
      && Math.abs(textLength - previous.length) < 80
      && Date.now() - previous.at < 60_000
    ) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setTaskStartersBusy(true);
      void fetch("/api/ai-collaboration/document", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenPBL-Role": "student" },
        signal: controller.signal,
        body: JSON.stringify({
          action: "suggest-delegated-work",
          courseId: course.id,
          studentId,
          stageKey,
          documentHtml,
        }),
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { starters?: string[] };
        if (!response.ok || !Array.isArray(payload.starters) || !payload.starters.length) return;
        taskStarterContextRef.current = { signature, length: textLength, at: Date.now() };
        setTaskStarters(payload.starters.slice(0, 3));
      }).catch(() => undefined).finally(() => {
        if (!controller.signal.aborted) setTaskStartersBusy(false);
      });
    }, 700);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [course, documentHtml, memberMode, memberOpen, stageKey, studentId, supportedStage]);

  const persistDocument = useCallback((content: string, source: "auto" | "manual" | "ai" | "undo") => {
    if (!course || !studentId || !supportedStage || content === savedContentRef.current) {
      setSaveStatus("saved");
      return;
    }
    setSaveStatus("saving");
    const submission = session.upsertSubmission({
      id: submissionIdRef.current,
      courseId: course.id,
      studentId,
      studentName: session.studentName ?? session.user.name,
      groupId: group?.id,
      stageKey,
      type: "document",
      title: documentTitle,
      content,
    });
    if (!submission) {
      setSaveStatus("error");
      return;
    }
    submissionIdRef.current = submission.id;
    savedContentRef.current = content;
    setSaveStatus("saved");
    if (source !== "auto") {
      session.addActivity(
        course.id,
        source === "ai" ? "应用 AI 局部修改" : source === "undo" ? "撤销 AI 局部修改" : "保存 AI 协作文档",
        documentTitle,
        group?.name ?? session.studentName ?? "学生",
      );
    }
  }, [course, documentTitle, group, session, stageKey, studentId, supportedStage]);

  useEffect(() => {
    if (!documentReady || !course || !studentId || !supportedStage) return;
    if (documentHtml === savedContentRef.current) return;
    const timer = window.setTimeout(() => persistDocument(documentHtml, "auto"), 900);
    return () => window.clearTimeout(timer);
  }, [course, documentHtml, documentReady, persistDocument, stageKey, studentId, supportedStage]);

  useEffect(() => {
    if (!documentReady || !historyLoaded || !course || !studentId || !supportedStage) return;
    if (plainTextLength(documentHtml) < 120 || busy || pendingSuggestion || pendingDelivery) return;
    const scopeKey = `${course.id}:${studentId}:${stageKey}`;
    const storageKey = `openpbl:ai-collaboration:paragraph-review:v${DOCUMENT_COMMENT_REVIEW_VERSION}:${scopeKey}`;
    const timer = window.setTimeout(() => {
      const candidates = editorRef.current?.getBlockCandidates() ?? [];
      const snapshot = new Map(candidates.map((candidate) => [
        candidate.blockId ?? `index:${candidate.blockIndex}`,
        candidate.text,
      ]));
      const previousSnapshot = paragraphSnapshotRef.current;
      const changedCandidates = previousSnapshot.size
        ? candidates.filter((candidate) =>
            previousSnapshot.get(candidate.blockId ?? `index:${candidate.blockIndex}`) !== candidate.text
          )
        : candidates;
      paragraphSnapshotRef.current = snapshot;

      try {
        const stored = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "[]") as unknown;
        if (Array.isArray(stored)) {
          stored.filter((item): item is string => typeof item === "string")
            .forEach((item) => analyzedParagraphsRef.current.add(item));
        }
      } catch {
        window.sessionStorage.removeItem(storageKey);
      }

      const candidatesToReview = changedCandidates.filter((item) => {
        const type = item.type.toLowerCase();
        if (!["p", "blockquote", "h1", "h2", "h3"].includes(type)) return false;
        if (item.text.length < 40 || item.text.length > 2_000) return false;
        const signature = `${item.blockId ?? item.blockIndex}:${item.text}`;
        const hasCompletedReview = aiCommentThreads.some((thread) =>
          thread.reviewVersion === DOCUMENT_COMMENT_REVIEW_VERSION
          && (
            (item.blockId && thread.blockId
              ? item.blockId === thread.blockId
              : item.blockIndex === thread.blockIndex)
          )
        );
        return !analyzedParagraphsRef.current.has(signature)
          && !hasCompletedReview
          && !proactiveRequestRef.current.has(signature);
      });
      if (!candidatesToReview.length) return;

      const requests = candidatesToReview.map((candidate) => ({
        candidate,
        signature: `${candidate.blockId ?? candidate.blockIndex}:${candidate.text}`,
      }));
      requests.forEach(({ signature }) => proactiveRequestRef.current.add(signature));
      void fetch("/api/ai-collaboration/document", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenPBL-Role": "student" },
        body: JSON.stringify({
          action: "proactive-document-comments",
          courseId: course.id,
          studentId,
          stageKey,
          paragraphs: requests.map(({ candidate }) => ({
            candidateId: candidate.blockId
              ? `block:${candidate.blockId}`
              : `index:${candidate.blockIndex}`,
            blockId: candidate.blockId,
            blockIndex: candidate.blockIndex,
            targetText: candidate.text,
          })),
          documentHtml,
        }),
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({})) as {
          commentThreads?: DocumentAiCommentThread[];
        };
        if (!response.ok) throw new Error("PROACTIVE_COMMENT_BATCH_FAILED");
        requests.forEach(({ signature }) => analyzedParagraphsRef.current.add(signature));
        window.sessionStorage.setItem(
          storageKey,
          JSON.stringify([...analyzedParagraphsRef.current].slice(-200)),
        );
        const incoming = payload.commentThreads ?? [];
        if (!incoming.length) return;
        const incomingIds = new Set(incoming.map((thread) => thread.id));
        setAiCommentThreads((current) => [
          ...current.filter((thread) => !incomingIds.has(thread.id)),
          ...incoming,
        ]);
      }).catch(() => undefined).finally(() => {
        requests.forEach(({ signature }) => proactiveRequestRef.current.delete(signature));
      });
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [aiCommentThreads, busy, course, documentHtml, documentReady, historyLoaded, pendingDelivery, pendingSuggestion, stageKey, studentId, supportedStage]);

  const replyToDocumentComment = useCallback(async ({
    threadId,
    message,
  }: {
    threadId: string;
    message: string;
  }) => {
    if (!course || !studentId || !supportedStage) {
      throw new Error("当前项目状态已经变化，请刷新页面后重试。");
    }
    if (pendingSuggestion) {
      throw new Error("请先接受或拒绝正文中当前标出的修改，再继续回复批注。");
    }
    const sourceThread = aiCommentThreads.find((thread) => thread.id === threadId);
    if (!sourceThread) throw new Error("这条批注已经失效，请刷新页面后重试。");
    const response = await fetch("/api/ai-collaboration/document", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-OpenPBL-Role": "student" },
      body: JSON.stringify({
        action: "reply-document-comment",
        commentThreadId: threadId,
        courseId: course.id,
        studentId,
        stageKey,
        documentHtml,
        message,
      }),
    });
    const payload = await response.json().catch(() => ({})) as {
      commentThread?: DocumentAiCommentThread;
      message?: string;
      result?: DocumentAiCommentReplyResult;
    };
    if (!response.ok || !payload.commentThread) {
      throw new Error(payload.message ?? "AI 组员暂时无法回复这条批注，请稍后重试。");
    }
    setAiCommentThreads((current) => [
      ...current.filter((thread) => thread.id !== payload.commentThread!.id),
      payload.commentThread!,
    ]);
    if (!payload.result?.suggestion) return;

    const suggestion = payload.result.suggestion;
    const sourceCommentId = [...payload.commentThread.comments]
      .reverse()
      .find((comment) => comment.role === "assistant")?.id;
    const selectionSnapshot = editorRef.current?.resolveCommentSelection({
      blockId: sourceThread.blockId,
      blockIndex: sourceThread.blockIndex,
      expectedBlockText: sourceThread.blockText ?? sourceThread.targetText,
      targetText: suggestion.targetText,
    }) ?? null;
    const preview = selectionSnapshot
      ? editorRef.current?.previewAiSuggestion({
          operation: "replace",
          ...selectionSnapshot,
          replacement: suggestion.replacement,
        })
      : undefined;
    const contribution: AiContribution = {
      id: nowId("document-comment-ai-contribution"),
      courseId: course.id,
      studentId,
      stageKey,
      companionId: "critic",
      impact: "high",
      request: message,
      suggestion: `${payload.result.message}\n${suggestion.replacement || "（删除所选内容）"}`,
      sourceEvidenceIds: (course.learningEvidence ?? [])
        .filter((item) => item.studentId === studentId && item.stageKey === stageKey)
        .slice(-8)
        .map((item) => item.id),
      proposedChange: suggestion.title,
      status: "pending-decision",
      createdAt: new Date().toISOString(),
    };
    session.upsertAiContribution(contribution);
    const confirmation = session.upsertCompanionConfirmation({
      courseId: course.id,
      studentId,
      stageKey,
      action: "edit-workspace",
      title: suggestion.title,
      summary: suggestion.reason,
      payload: {
        kind: "document-comment-edit",
        documentTitle,
        commentThreadId: threadId,
        targetText: suggestion.targetText,
        replacement: suggestion.replacement,
        selectionAnchor: selectionSnapshot?.anchor,
        selectionFocus: selectionSnapshot?.focus,
        contributionId: contribution.id,
      },
      status: "pending",
    });
    setPendingSuggestion({
      id: nowId("comment-suggestion"),
      confirmationId: confirmation.id,
      contribution,
      suggestion,
      selection: selectionSnapshot,
      presentation: preview?.presentation
        ?? (suggestion.targetText.length >= 220 ? "blocks" : "inline"),
      previewReady: preview?.ok === true,
      sourceThreadId: threadId,
      sourceCommentId,
    });
    setSuggestionError(
      preview?.ok
        ? null
        : preview?.reason ?? "批注对应的文字已经变化，未能在正文中标出修改。请拒绝本次建议后重新讨论。",
    );
    session.addCompanionProcessRecord({
      courseId: course.id,
      studentId,
      stageKey,
      title: "AI 组员从段落批注提出修改",
      summary: suggestion.reason,
      source: "agent",
      companionId: "critic",
    });
  }, [aiCommentThreads, course, documentHtml, documentTitle, pendingSuggestion, session, stageKey, studentId, supportedStage]);

  const markDocumentCommentRead = useCallback(async ({ threadId }: { threadId: string }) => {
    if (!course || !studentId || !supportedStage) return;
    const optimisticReadAt = new Date().toISOString();
    setAiCommentThreads((current) => current.map((thread) =>
      thread.id === threadId ? { ...thread, readAt: optimisticReadAt } : thread
    ));
    const response = await fetch("/api/ai-collaboration/document", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-OpenPBL-Role": "student" },
      body: JSON.stringify({
        action: "read-document-comment",
        commentThreadId: threadId,
        courseId: course.id,
        studentId,
        stageKey,
      }),
    });
    const payload = await response.json().catch(() => ({})) as { readAt?: string };
    if (response.ok && payload.readAt) {
      setAiCommentThreads((current) => current.map((thread) =>
        thread.id === threadId ? { ...thread, readAt: payload.readAt } : thread
      ));
    }
  }, [course, stageKey, studentId, supportedStage]);

  function handleDocumentChange(html: string) {
    setDocumentHtml(html);
    setSaveStatus(html === savedContentRef.current ? "saved" : "unsaved");
    if (undoableEdit && html !== undoableEdit.afterHtml) setUndoableEdit(null);
  }

  async function sendRequest(
    requestedIntent = intent,
    preset?: string,
    selectionOverride?: PlateDocumentSelection | null,
  ) {
    const requestText = (preset ?? draft).trim();
    if (!requestText || !course || !studentId || busy || !supportedStage) return null;
    if (pendingSuggestion) {
      setError("请先接受或拒绝正文中当前标出的修改，再继续和 AI 组员协作。");
      return null;
    }
    if (pendingDelivery) {
      setError("请先审阅、退回或暂不采用当前的组员交付，再安排下一项工作。");
      return null;
    }
    const currentSelection = requestedIntent === "delegate"
      ? null
      : selectionOverride === undefined ? selection : selectionOverride;
    const selectionSnapshot = currentSelection
      ? {
          ...currentSelection,
          anchor: { ...currentSelection.anchor, path: [...currentSelection.anchor.path] },
          focus: { ...currentSelection.focus, path: [...currentSelection.focus.path] },
        }
      : null;
    if (MODIFICATION_INTENTS.has(requestedIntent) && !selectionSnapshot) {
      setIntent(requestedIntent);
      setError("局部修改必须先选中文字。这样 AI 只能处理你指定的范围，不会接管整篇文档。");
      return null;
    }
    const optimistic: CollaborationMessage = {
      id: nowId("student-message"),
      role: "user",
      content: requestText,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setDraft("");
    setIntent(requestedIntent);
    setBusy(true);
    setError(null);
    setSuggestionError(null);
    try {
      const response = await fetch("/api/ai-collaboration/document", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenPBL-Role": "student" },
        body: JSON.stringify({
          courseId: course.id,
          studentId,
          stageKey,
          conversationId,
          intent: requestedIntent,
          message: requestText,
          documentHtml,
          selectedText: selectionSnapshot?.text,
          revisionOf: requestedIntent === "delegate" ? deliveryRevision : undefined,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        result?: DocumentCollaborationResponse;
        companionId?: AiContribution["companionId"];
        message?: string;
        conversationId?: string;
        messages?: Array<{ id: string; role: string }>;
      };
      if (payload.conversationId) setConversationId(payload.conversationId);
      if (!response.ok || !payload.result) {
        throw new Error(payload.message ?? "AI 组员暂时无法回应，请稍后重试。");
      }
      const assistantMessage: CollaborationMessage = {
        id: payload.messages?.find((message) => message.role === "agent")?.id
          ?? nowId("ai-message"),
        role: "assistant",
        content: payload.result.message,
        createdAt: new Date().toISOString(),
        kind: payload.result.kind,
      };
      const persistedStudentId = payload.messages?.find((message) => message.role === "student")?.id;
      setMessages((current) => [
        ...current
          .filter((message) => message.id !== optimistic.id),
        {
          ...optimistic,
          id: persistedStudentId ?? optimistic.id,
        },
        assistantMessage,
      ]);
      const contribution: AiContribution = {
        id: nowId("document-ai-contribution"),
        courseId: course.id,
        studentId,
        stageKey,
        companionId: payload.companionId ?? "recorder",
        impact: payload.result.suggestion || payload.result.deliverable ? "high" : "low",
        request: requestText,
        suggestion: payload.result.deliverable
          ? `${payload.result.message}\n${payload.result.deliverable.content}`
          : payload.result.suggestion
            ? `${payload.result.message}\n${payload.result.suggestion.replacement}`
            : payload.result.message,
        sourceEvidenceIds: (course.learningEvidence ?? [])
          .filter((item) => item.studentId === studentId && item.stageKey === stageKey)
          .slice(-8)
          .map((item) => item.id),
        proposedChange: payload.result.deliverable?.title ?? payload.result.suggestion?.title,
        status: payload.result.suggestion || payload.result.deliverable ? "pending-decision" : "decided",
        createdAt: new Date().toISOString(),
      };
      session.upsertAiContribution(contribution);
      session.addCompanionProcessRecord({
        courseId: course.id,
        studentId,
        stageKey,
        title: payload.result.kind === "boundary"
          ? "AI 组员守住了协作边界"
          : payload.result.kind === "work-delivery"
            ? "AI 组员提交了辅助工作"
            : "AI 组员参与文档协作",
        summary: payload.result.message.slice(0, 260),
        source: "agent",
        companionId: contribution.companionId,
      });
      if (payload.result.suggestion && selectionSnapshot) {
        const preview = editorRef.current?.previewAiSuggestion({
          operation: "replace",
          ...selectionSnapshot,
          replacement: payload.result.suggestion.replacement,
        });
        const confirmation = session.upsertCompanionConfirmation({
          courseId: course.id,
          studentId,
          stageKey,
          action: "edit-workspace",
          title: payload.result.suggestion.title,
          summary: payload.result.suggestion.reason,
          payload: {
            kind: "document-collaboration-edit",
            documentTitle,
            targetText: payload.result.suggestion.targetText,
            replacement: payload.result.suggestion.replacement,
            selectionAnchor: selectionSnapshot.anchor,
            selectionFocus: selectionSnapshot.focus,
            contributionId: contribution.id,
          },
          status: "pending",
        });
        setPendingSuggestion({
          id: nowId("suggestion"),
          confirmationId: confirmation.id,
          contribution,
          suggestion: payload.result.suggestion,
          selection: selectionSnapshot,
          presentation: preview?.presentation
            ?? (selectionSnapshot.text.length >= 220 || selectionSnapshot.text.includes("\n\n") ? "blocks" : "inline"),
          previewReady: preview?.ok === true,
        });
        setSuggestionError(preview?.ok ? null : preview?.reason ?? "未能在正文中生成修改标记，请重新选择目标内容后再试。");
      }
      if (payload.result.suggestion && !selectionSnapshot && payload.result.suggestion.operation === "insert") {
        const preview = editorRef.current?.previewAiSuggestion({
          operation: "insert",
          replacement: payload.result.suggestion.replacement,
        });
        const confirmation = session.upsertCompanionConfirmation({
          courseId: course.id,
          studentId,
          stageKey,
          action: "edit-workspace",
          title: payload.result.suggestion.title,
          summary: payload.result.suggestion.reason,
          payload: {
            kind: "document-collaboration-insert",
            documentTitle,
            replacement: payload.result.suggestion.replacement,
            contributionId: contribution.id,
          },
          status: "pending",
        });
        setPendingSuggestion({
          id: nowId("suggestion"),
          confirmationId: confirmation.id,
          contribution,
          suggestion: payload.result.suggestion,
          selection: null,
          presentation: preview?.presentation
            ?? (payload.result.suggestion.replacement.length >= 220 || payload.result.suggestion.replacement.includes("\n\n") ? "blocks" : "inline"),
          previewReady: preview?.ok === true,
        });
        setSuggestionError(preview?.ok ? null : preview?.reason ?? "未能在正文中生成新增标记，请把光标放到目标位置后再试。");
      }
      if (payload.result.deliverable) {
        const deliverable = payload.result.deliverable;
        const confirmation = session.upsertCompanionConfirmation({
          courseId: course.id,
          studentId,
          stageKey,
          action: "edit-workspace",
          title: deliverable.title,
          summary: deliverable.summary,
          payload: {
            kind: "delegated-work-delivery",
            documentTitle,
            content: deliverable.content,
            documentActions: deliverable.documentActions,
            sources: deliverable.sources,
            contributionId: contribution.id,
          },
          status: "pending",
        });
        setPendingDelivery({
          id: nowId("delivery"),
          confirmationId: confirmation.id,
          contribution,
          deliverable,
          error: null,
        });
        setDeliveryRevision(null);
      }
      return assistantMessage;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI 组员暂时无法回应，请稍后再试。");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function submitMemberRequest() {
    const nextIntent: DocumentCollaborationIntent = memberMode === "task" ? "delegate" : "discuss";
    void sendRequest(nextIntent, undefined, null);
  }

  async function startNewConversation() {
    if (!course || busy || pendingSuggestion || pendingDelivery) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai-collaboration/document", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenPBL-Role": "student" },
        body: JSON.stringify({
          action: "reset-conversation",
          courseId: course.id,
          studentId,
          stageKey,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        conversationId?: string;
        message?: string;
      };
      if (!response.ok || !payload.conversationId) {
        throw new Error(payload.message ?? "暂时无法开始新对话，请稍后重试。");
      }
      setConversationId(payload.conversationId);
      setMessages([]);
      setDraft("");
      setDeliveryRevision(null);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "暂时无法开始新对话，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function deleteConversationMessage(messageId: string) {
    if (!course || busy) return;
    const query = new URLSearchParams({
      courseId: course.id,
      studentId,
      stageKey,
      conversationId,
      messageId,
    });
    setMessages((current) => current.filter((message) => message.id !== messageId));
    const response = await fetch(`/api/ai-collaboration/document?${query.toString()}`, {
      method: "DELETE",
      headers: { "X-OpenPBL-Role": "student" },
    });
    if (!response.ok) {
      setError("这条记录暂时无法从当前对话中移除，请刷新后重试。");
    }
  }

  async function uploadDocumentImage(file: File): Promise<string> {
    if (!course) throw new Error("课程尚未加载，暂时不能上传图片。");
    const form = new FormData();
    form.set("file", file);
    form.set("title", file.name || "项目文档图片");
    form.set("courseId", course.id);
    const response = await fetch("/api/uploads", { method: "POST", body: form });
    const payload = await response.json().catch(() => ({})) as { url?: string; message?: string };
    if (!response.ok || !payload.url) throw new Error(payload.message ?? "图片上传失败，请稍后再试。");
    return payload.url;
  }

  function resolveSuggestion(decision: "adopted" | "rejected") {
    if (!pendingSuggestion || !course) return;
    const decisionId = `document-ai-decision-${pendingSuggestion.contribution.id}`;
    if (decision === "rejected") {
      if (pendingSuggestion.previewReady) {
        const previewResult = editorRef.current?.resolveAiSuggestion("rejected");
        if (!previewResult?.ok) {
          setSuggestionError(previewResult?.reason ?? "未能撤销正文中的修改标记，请稍后重试。");
          return;
        }
      }
      session.resolveCompanionConfirmation(course.id, pendingSuggestion.confirmationId, "rejected");
      session.upsertAiContribution({ ...pendingSuggestion.contribution, status: "decided" });
      session.recordStudentAiDecision({
        id: decisionId,
        courseId: course.id,
        studentId,
        stageKey,
        contributionId: pendingSuggestion.contribution.id,
        decision: "rejected",
        reason: "学生查看正文中的红删绿增标记后选择保留自己的原文。",
        resultingEvidenceIds: [],
        decidedAt: new Date().toISOString(),
      });
      session.addCompanionProcessRecord({
        courseId: course.id,
        studentId,
        stageKey,
        title: `拒绝 AI 修改“${pendingSuggestion.suggestion.title}”`,
        summary: "文档没有发生变化，学生保留了原文。",
        source: "student",
        companionId: pendingSuggestion.contribution.companionId,
      });
      setPendingSuggestion(null);
      setSuggestionError(null);
      return;
    }

    if (!pendingSuggestion.previewReady) {
      setSuggestionError("正文中没有可确认的修改标记，请保留原文后重新发起任务。");
      return;
    }
    const result = editorRef.current?.resolveAiSuggestion("accepted");
    if (!result?.ok || !result.beforeHtml || !result.afterHtml) {
      setSuggestionError(result?.reason ?? "修改未能确认，请重新选择目标内容并生成建议。");
      return;
    }
    session.resolveCompanionConfirmation(course.id, pendingSuggestion.confirmationId, "confirmed");
    session.upsertAiContribution({ ...pendingSuggestion.contribution, status: "decided" });
    session.recordStudentAiDecision({
      id: decisionId,
      courseId: course.id,
      studentId,
      stageKey,
      contributionId: pendingSuggestion.contribution.id,
      decision: "adopted",
      reason: pendingSuggestion.presentation === "blocks"
        ? "学生查看正文中的段落级修改标记后主动确认应用。"
        : "学生查看正文中的字词级修改标记后主动确认应用。",
      appliedChangeSummary: pendingSuggestion.suggestion.title,
      resultingEvidenceIds: [],
      decidedAt: new Date().toISOString(),
    });
    session.addCompanionProcessRecord({
      courseId: course.id,
      studentId,
      stageKey,
      title: `确认 AI 修改“${pendingSuggestion.suggestion.title}”`,
      summary: pendingSuggestion.suggestion.reason,
      source: "student",
      companionId: pendingSuggestion.contribution.companionId,
    });
    setUndoableEdit({
      title: pendingSuggestion.suggestion.title,
      beforeHtml: result.beforeHtml,
      afterHtml: result.afterHtml,
      confirmationId: pendingSuggestion.confirmationId,
      contribution: pendingSuggestion.contribution,
      decisionId,
    });
    setPendingSuggestion(null);
    setSuggestionError(null);
    setSelection(null);
    persistDocument(result.afterHtml, "ai");
  }

  function resolveDelivery(decision: "adopted" | "rejected" | "revision") {
    if (!pendingDelivery || !course) return;
    const decisionId = `document-ai-decision-${pendingDelivery.contribution.id}`;
    const { deliverable, contribution } = pendingDelivery;

    if (decision !== "adopted") {
      session.resolveCompanionConfirmation(course.id, pendingDelivery.confirmationId, "rejected");
      session.upsertAiContribution({ ...contribution, status: "decided" });
      session.recordStudentAiDecision({
        id: decisionId,
        courseId: course.id,
        studentId,
        stageKey,
        contributionId: contribution.id,
        decision: "rejected",
        reason: decision === "revision"
          ? "学生作为组长审阅交付后退回修改，原交付未写入文档。"
          : "学生作为组长审阅交付后决定暂不采用，文档未发生变化。",
        resultingEvidenceIds: [],
        decidedAt: new Date().toISOString(),
      });
      session.addCompanionProcessRecord({
        courseId: course.id,
        studentId,
        stageKey,
        title: decision === "revision"
          ? `退回组员交付“${deliverable.title}”`
          : `暂不采用组员交付“${deliverable.title}”`,
        summary: decision === "revision"
          ? "等待组长补充修改意见后重新交付。"
          : "文档没有发生变化。",
        source: "student",
        companionId: contribution.companionId,
      });
      if (decision === "revision") {
        setDeliveryRevision({ title: deliverable.title, content: deliverable.content });
        setMemberMode("task");
        setIntent("delegate");
        setDraft(`请修改这份交付：${deliverable.title}\n\n需要调整的地方：`);
      }
      setPendingDelivery(null);
      return;
    }

    const documentActions = deliverable.documentActions
      .filter((action) => action.operation !== "none");
    const result = documentActions.length
      ? editorRef.current?.applyDelegatedWorkPlan(documentActions)
      : null;
    if (documentActions.length && (!result?.ok || !result.beforeHtml || !result.afterHtml)) {
      setPendingDelivery((current) => current ? {
        ...current,
        error: result?.reason ?? "AI 规划的文档位置已经失效，请退回交付后重新规划。",
      } : current);
      return;
    }
    session.resolveCompanionConfirmation(course.id, pendingDelivery.confirmationId, "confirmed");
    session.upsertAiContribution({ ...contribution, status: "decided" });
    session.recordStudentAiDecision({
      id: decisionId,
      courseId: course.id,
      studentId,
      stageKey,
      contributionId: contribution.id,
      decision: "adopted",
      reason: documentActions.length
        ? "学生作为组长审阅独立交付和文档操作计划后，主动确认应用。"
        : "学生作为组长审阅了本次不涉及文档修改的独立交付。",
      appliedChangeSummary: deliverable.title,
      resultingEvidenceIds: [],
      decidedAt: new Date().toISOString(),
    });
    session.addCompanionProcessRecord({
      courseId: course.id,
      studentId,
      stageKey,
      title: `采纳组员交付“${deliverable.title}”`,
      summary: documentActions.length
        ? `学生确认执行：${documentActions.map((action) => action.description).join("；")}`
        : "本次交付只作为参考资料完成审阅，文档没有变化。",
      source: "student",
      companionId: contribution.companionId,
    });
    if (result?.beforeHtml && result.afterHtml) {
      setUndoableEdit({
        title: deliverable.title,
        beforeHtml: result.beforeHtml,
        afterHtml: result.afterHtml,
        confirmationId: pendingDelivery.confirmationId,
        contribution,
        decisionId,
      });
    }
    setPendingDelivery(null);
    setSelection(null);
    if (result?.afterHtml) persistDocument(result.afterHtml, "ai");
  }

  function undoAiEdit() {
    if (!undoableEdit || !course) return;
    if (documentHtml !== undoableEdit.afterHtml) {
      setUndoableEdit(null);
      setError("文档在 AI 修改后又发生了变化。为避免覆盖新内容，本次不能整体撤销。");
      return;
    }
    setDocumentHtml(undoableEdit.beforeHtml);
    setSelection(null);
    session.resolveCompanionConfirmation(course.id, undoableEdit.confirmationId, "rejected");
    session.recordStudentAiDecision({
      id: undoableEdit.decisionId,
      courseId: course.id,
      studentId,
      stageKey,
      contributionId: undoableEdit.contribution.id,
      decision: "rejected",
      reason: "学生在应用后使用撤销，决定恢复修改前原文。",
      resultingEvidenceIds: [],
      decidedAt: new Date().toISOString(),
    });
    session.addCompanionProcessRecord({
      courseId: course.id,
      studentId,
      stageKey,
      title: `撤销 AI 内容“${undoableEdit.title}”`,
      summary: "已恢复修改前的文档内容。",
      source: "student",
      companionId: undoableEdit.contribution.companionId,
    });
    persistDocument(undoableEdit.beforeHtml, "undo");
    setUndoableEdit(null);
  }

  function leaveCollaboration() {
    if (documentHtml !== savedContentRef.current) persistDocument(documentHtml, "manual");
    router.push(`/student/classroom/${courseId}`);
  }

  if (!hydrated || !course) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--pbl-bg)] text-sm text-stone-500">
        <LoaderCircle className="mr-2 animate-spin" size={20} />正在准备 AI 协作空间…
      </div>
    );
  }

  if (!studentId) {
    return <UnavailableState message="学生身份尚未初始化，请重新进入课堂。" onBack={() => router.replace("/student")} />;
  }

  if (!supportedStage) {
    return (
      <UnavailableState
        message="AI 文档协作实验目前在方案构思与项目实践阶段开放。"
        onBack={() => router.replace(`/student/classroom/${course.id}`)}
      />
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-[var(--pbl-bg)] text-[var(--pbl-text)]">
      <header className="sticky top-0 z-[70] h-16 border-b border-[var(--pbl-border)] bg-white/95 px-3 backdrop-blur lg:px-6">
        <div className="flex h-full w-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="返回课堂"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50"
              onClick={leaveCollaboration}
              type="button"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-medium leading-none text-stone-500">选题方向</p>
              <h1 className="mt-1 truncate text-base font-bold leading-tight text-stone-950 sm:text-lg">{projectTitle}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden sm:inline-flex"><SaveState status={session.saveState === "error" ? "error" : saveStatus} /></span>
            <PrimaryButton
              disabled={saveStatus === "saving"}
              onClick={() => persistDocument(documentHtml, "manual")}
              size="sm"
              tone="slate"
              variant="outline"
            >
              <Save size={14} />保存
            </PrimaryButton>
          </div>
        </div>
      </header>

      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-16 z-[59] h-3 bg-[var(--pbl-bg)]" />

      <div className="relative w-full flex-1 px-2 py-3 sm:px-3 lg:px-4">
        <section className="min-w-0 overflow-visible border-y border-[var(--pbl-border)] bg-white lg:border-x-0">
          {undoableEdit ? (
            <div className="px-5 pt-3">
              <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} />已应用 AI 建议“{undoableEdit.title}”</span>
                <button className="inline-flex items-center gap-1 font-bold underline underline-offset-2" onClick={undoAiEdit} type="button"><Undo2 size={12} />撤销</button>
              </div>
            </div>
          ) : null}

          <div className="px-1 sm:px-2">
            {documentReady ? (
              <PlateDocumentEditor
                aiCommentThreads={aiCommentThreads}
                aiContext={{
                  courseId,
                  studentId,
                  stageKey,
                  projectGoal: projectTitle,
                  currentTask: stage?.label,
                }}
                minHeight={700}
                stickyToolbarTop={76}
                onChange={handleDocumentChange}
                onAiCommentRead={markDocumentCommentRead}
                onAiCommentReply={replyToDocumentComment}
                onAiSuggestionDecision={(decision) => {
                  resolveSuggestion(decision === "accepted" ? "adopted" : "rejected");
                }}
                onImageUpload={uploadDocumentImage}
                onOpenAiMember={() => { setMemberOpen(true); setMemberMode("discuss"); setError(null); }}
                onSelectionChange={setSelection}
                pendingAiCommentSuggestion={pendingSuggestion?.sourceThreadId ? {
                  threadId: pendingSuggestion.sourceThreadId,
                  assistantCommentId: pendingSuggestion.sourceCommentId,
                  title: pendingSuggestion.suggestion.title,
                  targetText: pendingSuggestion.suggestion.targetText,
                  replacement: pendingSuggestion.suggestion.replacement,
                  reason: pendingSuggestion.suggestion.reason,
                  error: suggestionError,
                } : undefined}
                ref={editorRef}
                value={documentHtml}
              />
            ) : null}
          </div>
          <footer className="border-t border-stone-100 px-5 py-3 text-xs text-stone-500">
            <span>{plainTextLength(documentHtml)} 字 · 当前草稿自动保存</span>
          </footer>
        </section>

        {memberOpen ? (
          <AiMemberWorkspace
            busy={busy}
            draft={draft}
            error={error}
            historyLoaded={historyLoaded}
            messages={messages}
            mode={memberMode}
            taskStarters={taskStarters}
            taskStartersBusy={taskStartersBusy}
            onAcceptChange={() => resolveSuggestion("adopted")}
            onChangeDraft={setDraft}
            onClose={() => setMemberOpen(false)}
            onDismissError={() => setError(null)}
            onModeChange={(mode) => {
              setMemberMode(mode);
              setIntent(mode === "task" ? "delegate" : "discuss");
              setError(null);
            }}
            onDeleteMessage={(messageId) => { void deleteConversationMessage(messageId); }}
            onNewConversation={() => { void startNewConversation(); }}
            onRejectChange={() => resolveSuggestion("rejected")}
            onAdoptDelivery={() => resolveDelivery("adopted")}
            onRejectDelivery={() => resolveDelivery("rejected")}
            onReviseDelivery={() => resolveDelivery("revision")}
            onSubmit={submitMemberRequest}
            pendingChange={pendingSuggestion && !pendingSuggestion.sourceThreadId ? {
              title: pendingSuggestion.suggestion.title,
              reason: pendingSuggestion.suggestion.reason,
              operation: pendingSuggestion.suggestion.operation,
              presentation: pendingSuggestion.presentation,
              error: suggestionError,
            } : null}
            pendingDelivery={pendingDelivery ? {
              ...pendingDelivery.deliverable,
              error: pendingDelivery.error,
            } : null}
            projectTitle={projectTitle}
          />
        ) : null}
        {!memberOpen && (pendingDelivery || (pendingSuggestion && !pendingSuggestion.sourceThreadId)) ? (
          <button
            className="fixed bottom-5 right-5 z-[79] inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs font-semibold text-stone-900 shadow-[0_16px_48px_-18px_rgba(28,25,23,0.5)] transition hover:-translate-y-0.5 hover:shadow-xl"
            onClick={() => {
              setMemberMode("task");
              setIntent(pendingDelivery ? "delegate" : "edit");
              setMemberOpen(true);
            }}
            type="button"
          >
            <span className="grid size-7 place-items-center rounded-lg bg-stone-950 text-white"><FilePenLine size={14} /></span>
            {pendingDelivery ? "查看待审阅的组员交付" : "查看待确认的 AI 修改"}
          </button>
        ) : null}
      </div>
    </main>
  );
}

function SaveState({ status }: { status: "saved" | "unsaved" | "saving" | "error" }) {
  const copy = status === "saving" ? "保存中" : status === "unsaved" ? "有未保存修改" : status === "error" ? "保存失败" : "已保存";
  return (
    <span className={cn(
      "hidden items-center gap-1.5 text-xs sm:inline-flex",
      status === "error" ? "text-rose-700" : status === "unsaved" ? "text-amber-700" : "text-stone-500",
    )}>
      {status === "saving" ? <LoaderCircle className="animate-spin" size={13} /> : status === "error" ? <RefreshCcw size={13} /> : <Check size={13} />}{copy}
    </span>
  );
}

function UnavailableState({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--pbl-bg)] p-6">
      <section className="max-w-md rounded-[var(--radius-lg)] border border-stone-200 bg-white p-7 text-center shadow-[var(--shadow-raised)]">
        <ShieldCheck className="mx-auto text-[var(--pbl-ai)]" size={30} />
        <h1 className="mt-4 text-xl font-bold text-stone-950">AI 协作空间暂不可用</h1>
        <p className="mt-2 text-sm leading-6 text-stone-500">{message}</p>
        <PrimaryButton className="mt-5" onClick={onBack} tone="slate" variant="outline"><ArrowLeft size={15} />返回</PrimaryButton>
      </section>
    </div>
  );
}
