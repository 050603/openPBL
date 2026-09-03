import type {
  FinalArtifactSummary,
  ShowcaseDisplayMode,
  ShowcasePresentationSnapshot,
} from "@/lib/session/types";

export type ShowcaseStudentSummary = {
  studentId: string;
  name: string;
  groupId?: string;
  isAssigned: boolean;
  artifacts: FinalArtifactSummary[];
};

export type ShowcaseData = {
  courseId: string;
  stageKey: string;
  presentingGroupId?: string | null;
  presentingStudentId?: string | null;
  presentingStudentName?: string;
  students: ShowcaseStudentSummary[];
  ownArtifacts: FinalArtifactSummary[];
  /** Active presentation visible to every enrolled student, or teacher. */
  activePresentation?: ShowcasePresentationSnapshot | null;
  /** The current student's request, or all teacher-visible requests. */
  presentations: ShowcasePresentationSnapshot[];
};

export type ShowcaseAction =
  | {
      action: "assign";
      groupId: string | null;
      studentId?: string | null;
    }
  | {
      action: "request";
      artifactKind: "document" | "pdf";
      artifactVersionId: string;
      displayMode: ShowcaseDisplayMode;
      requestId?: string;
    }
  | {
      action: "review";
      presentationId: string;
      decision: "approve" | "reject";
      reason?: string;
    }
  | {
      action: "update";
      presentationId: string;
      viewState: {
        page?: number;
        scrollRatio?: number;
      };
    }
  | {
      action: "end";
      presentationId: string;
    };

export type ShowcaseEventPayload = {
  scope?: "course" | "student";
  studentId?: string;
  snapshot?: ShowcasePresentationSnapshot;
  presentingGroupId?: string | null;
  presentingStudentId?: string | null;
  presentingStudentName?: string;
};
