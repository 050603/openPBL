import type { FinalArtifactSummary, ShowcasePresentationSnapshot } from "@/lib/session/types";
import type { ShowcaseQueueConfig, ShowcaseQueueItem, ShowcaseQueueItemStatus, ShowcaseStudentSummary } from "./types";

export const DEFAULT_MINUTES_PER_STUDENT = 5;

type QueueStudent = Pick<ShowcaseStudentSummary, "studentId" | "name" | "groupId" | "artifacts" | "firstPresentableSubmissionAt">;

function isPresentable(artifact: FinalArtifactSummary): boolean {
  return artifact.kind === "document" || artifact.kind === "pdf";
}

export function earliestPresentableSubmission(artifacts: FinalArtifactSummary[]): string | undefined {
  return artifacts
    .filter(isPresentable)
    .map((artifact) => artifact.submittedAt)
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
}

export function defaultShowcaseQueueOrder(students: QueueStudent[]): string[] {
  return [...students]
    .sort((left, right) => {
      const leftReadyAt = left.firstPresentableSubmissionAt ?? earliestPresentableSubmission(left.artifacts);
      const rightReadyAt = right.firstPresentableSubmissionAt ?? earliestPresentableSubmission(right.artifacts);
      if (leftReadyAt && rightReadyAt) {
        const byDate = Date.parse(leftReadyAt) - Date.parse(rightReadyAt);
        if (byDate !== 0) return byDate;
      } else if (leftReadyAt) {
        return -1;
      } else if (rightReadyAt) {
        return 1;
      }
      return left.name.localeCompare(right.name, "zh-CN") || left.studentId.localeCompare(right.studentId);
    })
    .map((student) => student.studentId);
}

export function normalizeShowcaseQueueOrder(
  students: QueueStudent[],
  configuredOrder?: string[],
): string[] {
  const knownIds = new Set(students.map((student) => student.studentId));
  const configured = (configuredOrder ?? []).filter((studentId, index, list) => knownIds.has(studentId) && list.indexOf(studentId) === index);
  const remaining = defaultShowcaseQueueOrder(students.filter((student) => !configured.includes(student.studentId)));
  return [...configured, ...remaining];
}

/** Rebuild a desired order without moving students whose classroom slot is locked. */
export function preserveShowcaseQueueLockedPositions(
  currentOrder: string[],
  desiredOrder: string[],
  lockedStudentIds: ReadonlySet<string>,
): string[] {
  const result = [...currentOrder];
  const movable = desiredOrder.filter((studentId) => !lockedStudentIds.has(studentId));
  let movableIndex = 0;
  for (let index = 0; index < result.length; index += 1) {
    if (lockedStudentIds.has(result[index]!)) continue;
    const replacement = movable[movableIndex++];
    if (replacement) result[index] = replacement;
  }
  return result;
}

export function normalizeMinutesPerStudent(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MINUTES_PER_STUDENT;
  return Math.min(60, Math.max(1, Math.round(value ?? DEFAULT_MINUTES_PER_STUDENT)));
}

function latestPresentation(
  presentations: ShowcasePresentationSnapshot[],
  studentId: string,
): ShowcasePresentationSnapshot | undefined {
  return presentations
    .filter((presentation) => presentation.studentId === studentId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}

function statusForStudent(
  student: QueueStudent,
  presentation: ShowcasePresentationSnapshot | undefined,
  presentingStudentId: string | null | undefined,
): ShowcaseQueueItemStatus {
  if (!student.artifacts.some(isPresentable)) return "not-ready";
  if (presentation?.status === "evaluating") return "evaluating";
  if (presentation?.status === "active") return "presenting";
  if (presentation?.status === "pending") return "pending-approval";
  if (presentation?.status === "rejected" && presentingStudentId === student.studentId) return "rejected";
  if (presentation?.status === "ended") return "completed";
  if (presentingStudentId === student.studentId) return "called";
  return "waiting";
}

function isWaiting(status: ShowcaseQueueItemStatus): boolean {
  return status === "waiting" || status === "called" || status === "pending-approval" || status === "rejected";
}

function remainingMinutes(item: ShowcaseQueueItem, minutesPerStudent: number, now: number): number {
  if (item.status === "completed" || item.status === "not-ready" || item.status === "evaluating") return 0;
  if (item.status !== "presenting") return minutesPerStudent;
  const startedAt = item.startedAt ? Date.parse(item.startedAt) : NaN;
  if (!Number.isFinite(startedAt)) return minutesPerStudent;
  return Math.max(0, minutesPerStudent - Math.min(minutesPerStudent, Math.max(0, (now - startedAt) / 60_000)));
}

export function buildShowcaseQueue(
  students: QueueStudent[],
  presentations: ShowcasePresentationSnapshot[],
  presentingStudentId: string | null | undefined,
  config?: Partial<ShowcaseQueueConfig>,
  now = Date.now(),
): { items: ShowcaseQueueItem[]; minutesPerStudent: number; current: ShowcaseQueueItem | null; next: ShowcaseQueueItem | null } {
  const order = normalizeShowcaseQueueOrder(students, config?.orderedStudentIds);
  const byId = new Map(students.map((student) => [student.studentId, student]));
  const minutesPerStudent = normalizeMinutesPerStudent(config?.minutesPerStudent);
  const items: ShowcaseQueueItem[] = order.flatMap((studentId, index) => {
    const student = byId.get(studentId);
    if (!student) return [];
    const presentation = latestPresentation(presentations, student.studentId);
    const status = statusForStudent(student, presentation, presentingStudentId);
    const readyAt = student.firstPresentableSubmissionAt ?? earliestPresentableSubmission(student.artifacts);
    const primaryArtifact = student.artifacts.find(isPresentable);
    return [{
      studentId: student.studentId,
      studentName: student.name,
      groupId: student.groupId,
      position: index + 1,
      status,
      artifacts: student.artifacts,
      primaryArtifactTitle: primaryArtifact?.title,
      readyAt,
      presentationId: presentation?.id,
      startedAt: presentation?.startedAt,
      endedAt: presentation?.endedAt,
      evaluatedAt: presentation?.evaluatedAt,
      evaluationNote: presentation?.evaluationNote,
      estimatedWaitMinutes: undefined,
    }];
  });
  const current = items.find((item) => ["called", "pending-approval", "presenting", "evaluating", "rejected"].includes(item.status)) ?? null;
  const currentIndex = current ? items.indexOf(current) : -1;
  const next = items.find((item, index) => index > currentIndex && isWaiting(item.status) && item.status !== "not-ready")
    ?? (currentIndex < 0 ? items.find((item) => isWaiting(item.status) && item.status !== "not-ready") : null)
    ?? null;
  for (const [targetIndex, item] of items.entries()) {
    if (item.status === "completed" || item.status === "not-ready") continue;
    if (targetIndex === currentIndex) {
      item.estimatedWaitMinutes = 0;
      continue;
    }
    let wait = items.slice(0, targetIndex).reduce((total, predecessor) => total + remainingMinutes(predecessor, minutesPerStudent, now), 0);
    // A manually selected current student blocks an item that appears before
    // it in the saved order until the current presentation is finished.
    if (currentIndex > targetIndex && current) wait += remainingMinutes(current, minutesPerStudent, now);
    item.estimatedWaitMinutes = Math.max(0, Math.round(wait));
  }
  return { items, minutesPerStudent, current, next };
}
