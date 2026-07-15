export const STUDENT_ARTIFACT_EVENT = "openpbl:student-artifact";

export type StudentArtifactEventKind = "document-saved" | "file-uploaded";

export type StudentArtifactEvent = {
  courseId: string;
  studentId: string;
  stageKey: string;
  kind: StudentArtifactEventKind;
  artifactId?: string;
  summary?: string;
  /** Only milestone saves should proactively interrupt the student; routine autosaves stay silent. */
  milestone?: boolean;
  /** 文档的纯文本内容（仅 document-saved 时携带），供伴学智能体直接读取 */
  content?: string;
};

export function emitStudentArtifactEvent(event: StudentArtifactEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<StudentArtifactEvent>(STUDENT_ARTIFACT_EVENT, { detail: event }));
}
