import { aggregateCommonIssues, analyzeStudentLearning } from "@/lib/learning-analytics/analyzer";
import { getCourse, updateCourse } from "@/lib/session/server-store";
import type { LearningEvent, LearningSignal } from "@/lib/session/types";

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

  const incoming = body.events.filter((event) => isValidEvent(event, courseId, studentId));
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
        const existingAttempts = (current.learningSignals ?? [])
          .filter((signal) => signal.studentId === scopeStudentId && signal.stageKey === stageKey && (signal.sceneId ?? "") === sceneId)
          .reduce((max, signal) => Math.max(max, signal.aiInterventionAttempts), 0);
        return analyzeStudentLearning({
          events: scopedEvents,
          expectedDurationSec,
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
