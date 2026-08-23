import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { publishCourseEvent } from "@/lib/realtime/event-bus";
import type { StudentAiProgress } from "@/lib/session/types";

export async function persistStudentAiProgress(
  courseId: string,
  studentId: string,
  progress: StudentAiProgress,
  stageProgress: number,
): Promise<void> {
  const event = await prisma.$transaction(async (tx) => {
    const updatedCourse = await tx.$executeRaw`
      UPDATE "Course"
      SET "aiLearningProgress" = jsonb_set(
            COALESCE("aiLearningProgress", '{}'::jsonb),
            ARRAY[${studentId}]::text[],
            ${JSON.stringify(progress)}::jsonb,
            true
          ),
          "version" = "version" + 1,
          "updatedAt" = NOW()
      WHERE "id" = ${courseId}
    `;
    if (updatedCourse !== 1) throw new Error("COURSE_NOT_FOUND");

    const updatedStudent = await tx.$executeRaw`
      UPDATE "Student"
      SET "progress" = jsonb_set(
            COALESCE("progress", '{}'::jsonb),
            ARRAY['ai-learning']::text[],
            to_jsonb(${stageProgress}::double precision),
            true
          ),
          "version" = "version" + 1,
          "updatedAt" = NOW()
      WHERE "courseId" = ${courseId} AND "id" = ${studentId}
    `;
    if (updatedStudent !== 1) throw new Error("STUDENT_NOT_FOUND");

    const course = await tx.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { version: true },
    });
    return tx.courseEvent.create({
      data: {
        courseId,
        requestId: randomUUID(),
        type: "UPDATE_STUDENT_PROGRESS",
        actorId: studentId,
        actorRole: "student",
        courseVersion: course.version,
        payload: { studentId, stageKey: "ai-learning", progress: stageProgress },
      },
      select: { cursor: true, courseVersion: true },
    });
  });

  try {
    await publishCourseEvent(courseId, {
      type: "course-updated",
      courseId,
      at: new Date().toISOString(),
      payload: {
        actionType: "UPDATE_STUDENT_PROGRESS",
        studentId,
        courseVersion: event.courseVersion,
        eventCursor: event.cursor.toString(),
      },
    });
  } catch (error) {
    console.error("[ai-progress] realtime invalidation failed; clients will reconcile by cursor", {
      courseId,
      studentId,
      eventCursor: event.cursor.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
