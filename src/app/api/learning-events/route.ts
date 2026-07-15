import { aggregateCommonIssues, analyzeStudentLearning } from "@/lib/learning-analytics/analyzer";
import { getCourse, updateCourse } from "@/lib/session/server-store";
import type { Course, LearningEvent, LearningSignal } from "@/lib/session/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LearningEventsRequest = {
  courseId?: string;
  studentId?: string;
  events?: LearningEvent[];
};

function isValidEvent(event: LearningEvent, courseId: string, studentId: string): boolean {
  return Boolean(
    event &&
    event.id &&
    event.idempotencyKey &&
    event.courseId === courseId &&
    event.studentId === studentId &&
    event.stageKey &&
    event.type &&
    Number.isFinite(Date.parse(event.occurredAt)),
  );
}

function enrichContentReference(event: LearningEvent, course: Course): LearningEvent {
  const content = event.content;
  if (!content) return event;
  const activity = course.content.teachingOutline?.find((item) =>
    item.id === content.activityId,
  ) ?? course.content.lessonOutline?.find((item) => item.id === content.activityId);
  const knowledgeLabels = (content.knowledgePointIds ?? []).flatMap((id) => {
    const point = course.content.knowledgePoints.find((item) => item.id === id);
    return point?.name ? [point.name] : [];
  });
  return {
    ...event,
    content: {
      ...content,
      ...(activity?.title ? { activityTitle: activity.title } : {}),
      ...(knowledgeLabels.length ? { knowledgePointLabels: knowledgeLabels } : {}),
    },
  };
}

export async function POST(request: Request) {
  let body: LearningEventsRequest;
  try {
    body = (await request.json()) as LearningEventsRequest;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const courseId = body.courseId?.trim();
  const studentId = body.studentId?.trim();
  if (!courseId || !studentId || !Array.isArray(body.events) || body.events.length === 0) {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const course = await getCourse(courseId);
  if (!course) return Response.json({ error: "COURSE_NOT_FOUND" }, { status: 404 });
  if (!course.students.some((student) => student.id === studentId)) {
    return Response.json({ error: "STUDENT_NOT_IN_COURSE" }, { status: 403 });
  }

  const incoming = body.events
    .filter((event) => isValidEvent(event, courseId, studentId))
    .map((event) => enrichContentReference(event, course));
  if (!incoming.length) return Response.json({ error: "NO_VALID_EVENTS" }, { status: 400 });

  const existingKeys = new Set((course.learningEvents ?? []).map((event) => event.idempotencyKey));
  const accepted = incoming.filter((event) => {
    if (existingKeys.has(event.idempotencyKey)) return false;
    existingKeys.add(event.idempotencyKey);
    return true;
  });

  let derivedSignals: LearningSignal[] = course.learningSignals ?? [];
  let commonIssues = course.classCommonIssues ?? [];
  if (accepted.length) {
    await updateCourse(courseId, (current) => {
      const learningEvents = [...(current.learningEvents ?? []), ...accepted].slice(-10_000);
      const affectedScopes = new Set(
        accepted.map((event) => [event.studentId, event.stageKey, event.sceneId ?? ""].join("|")),
      );
      for (const event of accepted) {
        if (event.type !== "stage-goal-complete") continue;
        for (const existingEvent of learningEvents) {
          if (existingEvent.studentId === event.studentId && existingEvent.stageKey === event.stageKey) {
            affectedScopes.add([existingEvent.studentId, existingEvent.stageKey, existingEvent.sceneId ?? ""].join("|"));
          }
        }
      }
      const retainedSignals = (current.learningSignals ?? []).filter(
        (signal) => !affectedScopes.has([signal.studentId, signal.stageKey, signal.sceneId ?? ""].join("|")),
      );
      const nextSignals = [...affectedScopes].flatMap((scope) => {
        const [scopeStudentId, stageKey, sceneId] = scope.split("|");
        const scopedEvents = learningEvents.filter(
          (event) =>
            event.studentId === scopeStudentId &&
            event.stageKey === stageKey &&
            (event.sceneId ?? "") === sceneId,
        );
        const expectedDurationSec = [...scopedEvents]
          .reverse()
          .find((event) => typeof event.expectedDurationSec === "number")?.expectedDurationSec ?? 0;
        const ttsDurationSec = [...scopedEvents]
          .reverse()
          .find((event) => typeof event.ttsDurationSec === "number")?.ttsDurationSec;
        const plannedStudentActivitySec = [...scopedEvents]
          .reverse()
          .find((event) => typeof event.plannedStudentActivitySec === "number")?.plannedStudentActivitySec;
        const existingAttempts = (current.learningSignals ?? [])
          .filter((signal) => signal.studentId === scopeStudentId && signal.stageKey === stageKey && (signal.sceneId ?? "") === sceneId)
          .reduce((max, signal) => Math.max(max, signal.aiInterventionAttempts), 0);
        return analyzeStudentLearning({
          events: scopedEvents,
          expectedDurationSec,
          ttsDurationSec,
          plannedStudentActivitySec,
          aiInterventionAttempts: existingAttempts,
        }).signals;
      });
      derivedSignals = [...retainedSignals, ...nextSignals];
      commonIssues = aggregateCommonIssues(derivedSignals, current.students.length);
      return {
        ...current,
        learningEvents,
        learningSignals: derivedSignals,
        classCommonIssues: commonIssues,
      };
    });
  }

  return Response.json({
    acceptedIds: accepted.map((event) => event.id),
    duplicateCount: incoming.length - accepted.length,
    signals: derivedSignals.filter((signal) => signal.studentId === studentId),
    commonIssues,
  });
}
