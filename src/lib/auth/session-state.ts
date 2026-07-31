import type { AuthClaims } from "./session";
import type { SessionState } from "@/lib/session/actions";

export function scopeSessionStateForAuth(
  state: SessionState,
  claims: AuthClaims,
): SessionState {
  if (claims.role === "teacher") {
    return {
      ...state,
      user: {
        role: "teacher",
        name: claims.displayName || claims.username || "教师",
      },
      joinedCourseId: undefined,
      studentId: undefined,
      studentName: undefined,
    };
  }

  return {
    ...state,
    courses: state.courses.filter((course) => course.id === claims.courseId),
    user: { role: "student", name: claims.studentName },
    joinedCourseId: claims.courseId,
    studentId: claims.studentId,
    studentName: claims.studentName,
  };
}
