import { evaluateLessonOutlines } from "@/lib/course-design/quality-gates";
import type { PblActivityCatalogEntry, SceneOutline } from "@/lib/openmaic/types/generation";

export function canResumeAfterValidatedLessonOutline(input: {
  trace: unknown;
  outlines: ReadonlyArray<SceneOutline>;
  interactiveMode: boolean;
  activityCatalog?: ReadonlyArray<PblActivityCatalogEntry>;
}): boolean {
  if (!Array.isArray(input.trace)) return false;
  const completed = input.trace.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const event = entry as { step?: unknown; status?: unknown };
    return event.step === "lessonOutline"
      && (event.status === "completed" || event.status === "warning");
  });
  return completed
    && input.outlines.length > 0
    && evaluateLessonOutlines(input.outlines, input.interactiveMode, input.activityCatalog).passed;
}

export function canResumeAfterValidatedTeachingOutline(input: {
  trace: unknown;
  positioningPassed: boolean;
  projectDesignPassed: boolean;
  evaluationPlanPassed: boolean;
  knowledgePointCount: number;
  knowledgeGraphNodeCount: number;
  teachingOutlineCount: number;
  timingPlanConfirmed: boolean;
}): boolean {
  if (!Array.isArray(input.trace)) return false;
  const completed = input.trace.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const event = entry as { step?: unknown; status?: unknown };
    return event.step === "teachingOutline"
      && (event.status === "completed" || event.status === "warning");
  });
  return completed
    && input.positioningPassed
    && input.projectDesignPassed
    && input.evaluationPlanPassed
    && input.knowledgePointCount > 0
    && input.knowledgeGraphNodeCount >= input.knowledgePointCount
    && input.teachingOutlineCount === 6
    && input.timingPlanConfirmed;
}

function normalizedRequest(value: unknown): {
  courseId: string;
  teacherBrief: string;
  interactiveMode: boolean;
  enableImageGeneration: boolean;
  enableTTS: boolean;
  enableVideoGeneration: boolean;
} | null {
  if (!value || typeof value !== "object") return null;
  const request = value as Record<string, unknown>;
  const options = request.options && typeof request.options === "object"
    ? request.options as Record<string, unknown>
    : {};
  if (typeof request.courseId !== "string" || typeof request.teacherBrief !== "string") return null;
  return {
    courseId: request.courseId,
    teacherBrief: request.teacherBrief.trim(),
    interactiveMode: options.interactiveMode === true,
    enableImageGeneration: options.enableImageGeneration !== false,
    enableTTS: options.enableTTS !== false,
    enableVideoGeneration: options.enableVideoGeneration === true,
  };
}

export function isSameCourseDesignRequest(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizedRequest(left);
  const normalizedRight = normalizedRequest(right);
  return Boolean(
    normalizedLeft
    && normalizedRight
    && JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight),
  );
}
