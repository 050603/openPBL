import { getCourse } from "@/lib/session/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const courseId = url.searchParams.get("courseId")?.trim();
  const studentId = url.searchParams.get("studentId")?.trim();
  const stageKey = url.searchParams.get("stageKey")?.trim();
  if (!courseId || !studentId || !stageKey) {
    return Response.json({ error: "MISSING_PARAMETERS" }, { status: 400 });
  }
  const course = await getCourse(courseId);
  if (!course) return Response.json({ error: "COURSE_NOT_FOUND" }, { status: 404 });
  if (!course.students.some((student) => student.id === studentId)) {
    return Response.json({ error: "STUDENT_NOT_IN_COURSE" }, { status: 403 });
  }
  const thread = course.companionThreads?.find(
    (item) => item.studentId === studentId && item.stageKey === stageKey,
  );
  const directives = (course.teacherAgentDirectives ?? []).filter(
    (directive) => directive.status === "active" && directive.stageKey === stageKey &&
      (directive.targetScope === "course" || directive.targetStudentIds.includes(studentId)),
  );
  return Response.json({ thread: thread ?? null, directives });
}
