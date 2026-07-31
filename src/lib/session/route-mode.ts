export type SessionRouteMode = "none" | "optional" | "required";

/**
 * Decide whether the session store should contact protected course APIs.
 * Public pages must not generate expected 401 responses. The student entry
 * page is optional because a valid student cookie may restore a classroom.
 */
export function getSessionRouteMode(pathname: string): SessionRouteMode {
  if (pathname === "/student") return "optional";
  if (pathname === "/teacher" || pathname.startsWith("/teacher/")) {
    return pathname === "/teacher/login" || pathname === "/teacher/register"
      ? "none"
      : "required";
  }
  if (pathname.startsWith("/student/")) return "required";
  return "none";
}
