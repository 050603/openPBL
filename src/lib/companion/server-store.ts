import { randomUUID } from "node:crypto";
import { getCourse, updateCourse } from "@/lib/session/server-store";
import type { CompanionMessage, CompanionThread, CompanionTriggerKind } from "@/lib/session/types";

export async function getCompanionThread(courseId: string, studentId: string, stageKey: string) {
  const course = await getCourse(courseId);
  return course?.companionThreads?.find(
    (thread) => thread.studentId === studentId && thread.stageKey === stageKey,
  );
}

export async function appendCompanionMessages(input: {
  courseId: string;
  studentId: string;
  stageKey: string;
  messages: CompanionMessage[];
  openingTrigger?: CompanionTriggerKind;
}): Promise<void> {
  const now = new Date().toISOString();
  await updateCourse(input.courseId, (course) => {
    const threads = course.companionThreads ?? [];
    const existing = threads.find(
      (thread) => thread.studentId === input.studentId && thread.stageKey === input.stageKey,
    );
    const thread: CompanionThread = {
      id: existing?.id ?? `companion-thread-${randomUUID()}`,
      courseId: input.courseId,
      studentId: input.studentId,
      stageKey: input.stageKey,
      messages: [...(existing?.messages ?? []), ...input.messages].slice(-500),
      openingSentAt: input.openingTrigger === "stage-opening" ? existing?.openingSentAt ?? now : existing?.openingSentAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    return {
      ...course,
      companionThreads: existing
        ? threads.map((item) => item.id === existing.id ? thread : item)
        : [...threads, thread],
    };
  });
}

export function companionMessage(
  message: Omit<CompanionMessage, "id" | "createdAt"> & { createdAt?: string },
): CompanionMessage {
  return {
    ...message,
    id: `companion-message-${randomUUID()}`,
    createdAt: message.createdAt ?? new Date().toISOString(),
  };
}
