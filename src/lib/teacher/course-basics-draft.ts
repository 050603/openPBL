import type { Course } from "@/lib/session/types";
import {
  DEFAULT_PBL_EVIDENCE_REQUIREMENTS,
  DEFAULT_PBL_OUTCOME,
  normalizePblCourseConfig,
} from "@/lib/pbl-course-config";

export type CourseBasicsDraft = {
  name: string;
  subject: string;
  grade: string;
  hours: number;
  learningObjectivesText: string;
  summary: string;
  priorKnowledge: string;
  learningNeeds: string;
  familiarContexts: string;
  drivingQuestion: string;
  outcomeArtifact: string;
  outcomePresentation: string;
  outcomeReflection: string;
};

export function createCourseBasicsDraft(course: Course): CourseBasicsDraft {
  return {
    name: course.name,
    subject: course.subject,
    grade: course.grade,
    hours: course.hours,
    learningObjectivesText: (course.learningObjectives ?? []).join("\n"),
    summary: course.summary,
    priorKnowledge: course.learnerProfile?.priorKnowledge ?? "",
    learningNeeds: course.learnerProfile?.learningNeeds ?? "",
    familiarContexts: course.learnerProfile?.familiarContexts ?? "",
    drivingQuestion: course.drivingQuestion,
    outcomeArtifact: course.pblConfig?.outcome.artifact ?? DEFAULT_PBL_OUTCOME.artifact,
    outcomePresentation:
      course.pblConfig?.outcome.presentation ?? DEFAULT_PBL_OUTCOME.presentation,
    outcomeReflection:
      course.pblConfig?.outcome.reflection ?? DEFAULT_PBL_OUTCOME.reflection,
  };
}

export function parseLearningObjectives(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildCourseBasicsPatch(course: Course, draft: CourseBasicsDraft) {
  return {
    name: draft.name.trim(),
    subject: draft.subject.trim(),
    grade: draft.grade.trim(),
    hours: Math.min(5, Math.max(1, Math.round(draft.hours) || 1)),
    learningObjectives: parseLearningObjectives(draft.learningObjectivesText),
    summary: draft.summary.trim(),
    learnerProfile: {
      priorKnowledge: draft.priorKnowledge.trim(),
      learningNeeds: draft.learningNeeds.trim(),
      familiarContexts: draft.familiarContexts.trim(),
    },
    drivingQuestion: draft.drivingQuestion.trim(),
    pblConfig: normalizePblCourseConfig({
      ...course.pblConfig,
      evidenceRequirements:
        course.pblConfig?.evidenceRequirements ??
        DEFAULT_PBL_EVIDENCE_REQUIREMENTS.filter((item) => item.required),
      outcome: {
        artifact: draft.outcomeArtifact,
        presentation: draft.outcomePresentation,
        reflection: draft.outcomeReflection,
      },
    }),
  } satisfies Partial<Course>;
}

export function validateCourseBasicsDraft(draft: CourseBasicsDraft): string | null {
  if (!draft.name.trim()) return "请填写课程名称";
  if (!draft.subject.trim()) return "请填写学科";
  if (!draft.grade.trim()) return "请填写年级";
  if (!Number.isFinite(draft.hours) || draft.hours < 1) return "预计课时不能少于 1";
  if (draft.hours > 5) return "人工智能通识课程预计课时请设置为 1–5 课时";
  return null;
}
