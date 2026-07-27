import { authenticateRequest } from "@/lib/auth/request-guards";
import { scopeCourseForClaims } from "@/lib/auth/course-scope";
import { readSessionState } from "@/lib/session/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;
  try {
    const state = await readSessionState();
    if (auth.claims.role === "teacher") {
      return Response.json({
        ...state,
        user: { role: "teacher", name: auth.claims.displayName },
        joinedCourseId: undefined,
        studentId: undefined,
        studentName: undefined,
      });
    }
    return Response.json({
      ...state,
      courses: state.courses
        .filter((course) => course.id === auth.claims.courseId)
        .map((course) => scopeCourseForClaims(course, auth.claims)),
      user: { role: "student", name: auth.claims.studentName },
      joinedCourseId: auth.claims.courseId,
      studentId: auth.claims.studentId,
      studentName: auth.claims.studentName,
    });
  } catch (error) {
    console.error("[courses] unable to load course list", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      {
        code: "COURSES_UNAVAILABLE",
        message: "Course data is temporarily unavailable.",
        requestId: request.headers.get("x-request-id") ?? "unknown",
      },
      { status: 503 },
    );
  }
}
