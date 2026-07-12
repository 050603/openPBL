export const STUDENT_ARTIFACT_EVENT = "openpbl:student-artifact";

export type StudentArtifactEventKind = "document-saved" | "file-uploaded";

export type StudentArtifactEvent = {
  courseId: string;
  studentId: string;
  stageKey: string;
  kind: StudentArtifactEventKind;
  artifactId?: string;
  summary?: string;
};

export function emitStudentArtifactEvent(event: StudentArtifactEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<StudentArtifactEvent>(STUDENT_ARTIFACT_EVENT, { detail: event }));
}
