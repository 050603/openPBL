import type { CompanionMessageVisibility, CompanionThread, CompanionTriggerKind, TeacherAgentDirective } from "@/lib/session/types";

export function shouldSendStageOpening(thread?: CompanionThread): boolean {
  return !thread?.openingSentAt;
}

export function recorderVisibility(trigger?: CompanionTriggerKind): CompanionMessageVisibility {
  return trigger === "milestone" || trigger === "no-progress"
    ? "student-and-teacher"
    : "teacher-only";
}

export function shouldUseReviewer(trigger?: CompanionTriggerKind): boolean {
  return trigger === "artifact-stalled" || trigger === "file-uploaded" || trigger === "milestone";
}

export function activeDirectivesForStudent(
  directives: TeacherAgentDirective[],
  studentId: string,
  stageKey: string,
): TeacherAgentDirective[] {
  return directives.filter((directive) =>
    directive.status === "active" &&
    directive.stageKey === stageKey &&
    (directive.targetScope === "course" || directive.targetStudentIds.includes(studentId)),
  );
}
