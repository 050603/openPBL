import { randomUUID } from "node:crypto";
import { getCourse, updateCourse } from "@/lib/session/server-store";
import type { TeacherAgentDirective } from "@/lib/session/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Partial<TeacherAgentDirective> | null;
  if (!body?.courseId || !body.stageKey || !body.goal?.trim() || !body.instruction?.trim()) {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const course = await getCourse(body.courseId);
  if (!course) return Response.json({ error: "COURSE_NOT_FOUND" }, { status: 404 });
  const targetStudentIds = body.targetScope === "course"
    ? course.students.map((student) => student.id)
    : (body.targetStudentIds ?? []).filter((id) => course.students.some((student) => student.id === id));
  if (!targetStudentIds.length) return Response.json({ error: "NO_TARGETS" }, { status: 400 });
  const now = new Date().toISOString();
  const directive: TeacherAgentDirective = {
    id: `teacher-directive-${randomUUID()}`,
    courseId: body.courseId,
    stageKey: body.stageKey,
    targetStudentIds,
    targetScope: body.targetScope === "course" ? "course" : targetStudentIds.length > 1 ? "multiple" : "student",
    goal: body.goal.trim(),
    instruction: body.instruction.trim(),
    successCriteria: (body.successCriteria ?? []).map((item) => item.trim()).filter(Boolean),
    status: "active",
    teacherName: body.teacherName?.trim() || "教师",
    createdAt: now,
    updatedAt: now,
  };
  await updateCourse(body.courseId, (current) => ({
    ...current,
    teacherAgentDirectives: [...(current.teacherAgentDirectives ?? []), directive],
  }));
  return Response.json({ directive });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { courseId?: string; directiveId?: string; status?: "revoked" | "goal-completed" } | null;
  if (!body?.courseId || !body.directiveId || !body.status) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const now = new Date().toISOString();
  await updateCourse(body.courseId, (course) => ({
    ...course,
    teacherAgentDirectives: (course.teacherAgentDirectives ?? []).map((directive) => directive.id === body.directiveId ? {
      ...directive,
      status: body.status!,
      updatedAt: now,
      ...(body.status === "revoked" ? { revokedAt: now } : { completedAt: now }),
    } : directive),
  }));
  return Response.json({ ok: true });
}
