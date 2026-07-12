import type { LearningEvent, LearningEventType } from "@/lib/session/types";

export type LearningEventDraft = Omit<LearningEvent, "id" | "idempotencyKey" | "occurredAt"> & {
  occurredAt?: string;
  idempotencyKey?: string;
};

function clientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createLearningEvent(
  type: LearningEventType,
  draft: Omit<LearningEventDraft, "type">,
): LearningEvent {
  const id = clientId();
  return {
    ...draft,
    id,
    type,
    occurredAt: draft.occurredAt ?? new Date().toISOString(),
    idempotencyKey: draft.idempotencyKey ?? id,
  };
}

export async function postLearningEvents(input: {
  courseId: string;
  studentId: string;
  events: LearningEvent[];
}): Promise<void> {
  if (!input.events.length) return;
  const response = await fetch("/api/learning-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  });
  if (!response.ok) throw new Error(`学习事件上报失败（HTTP ${response.status}）`);
}
