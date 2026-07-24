// JWT-based session management (httpOnly cookie).
// Uses `jose` library for Edge-compatible JWT sign/verify.
// Teacher JWT: 7-day expiry, payload { sub, role: "teacher", username, displayName }
// Student JWT: 1-day expiry, payload { sub, role: "student", courseId, studentId, studentName }

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const TEACHER_COOKIE = "openpbl_teacher";
const STUDENT_COOKIE = "openpbl_student";
const TEACHER_TTL_SECONDS = 7 * 24 * 60 * 60;
const STUDENT_TTL_SECONDS = 24 * 60 * 60;
const ISSUER = "openpbl";
const AUDIENCE = "openpbl-app";

export type AuthRole = "teacher" | "student";

export interface TeacherClaims extends JWTPayload {
  role: "teacher";
  username: string;
  displayName: string;
}

export interface StudentClaims extends JWTPayload {
  role: "student";
  courseId: string;
  studentId: string;
  studentName: string;
}

export type AuthClaims = TeacherClaims | StudentClaims;

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "JWT_SECRET is not configured or too short (need >= 32 chars). Set JWT_SECRET env variable.",
    );
  }
  return new TextEncoder().encode(raw);
}

export function isAuthConfigured(): boolean {
  const raw = process.env.JWT_SECRET;
  return !!raw && raw.length >= 32;
}

export async function signTeacherToken(payload: {
  teacherId: string;
  username: string;
  displayName: string;
}): Promise<{ token: string; cookieName: string; maxAge: number }> {
  const token = await new SignJWT({
    role: "teacher",
    username: payload.username,
    displayName: payload.displayName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.teacherId)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${TEACHER_TTL_SECONDS}s`)
    .sign(getSecret());
  return { token, cookieName: TEACHER_COOKIE, maxAge: TEACHER_TTL_SECONDS };
}

export async function signStudentToken(payload: {
  courseId: string;
  studentId: string;
  studentName: string;
}): Promise<{ token: string; cookieName: string; maxAge: number }> {
  const token = await new SignJWT({
    role: "student",
    courseId: payload.courseId,
    studentId: payload.studentId,
    studentName: payload.studentName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.studentId)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${STUDENT_TTL_SECONDS}s`)
    .sign(getSecret());
  return { token, cookieName: STUDENT_COOKIE, maxAge: STUDENT_TTL_SECONDS };
}

export async function verifyToken(token: string): Promise<AuthClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (payload.role !== "teacher" && payload.role !== "student") return null;
    return payload as AuthClaims;
  } catch {
    return null;
  }
}

export const TEACHER_COOKIE_NAME = TEACHER_COOKIE;
export const STUDENT_COOKIE_NAME = STUDENT_COOKIE;

export function clearAuthCookies(role?: AuthRole): Array<{ name: string; value: string; maxAge: number; path: string; httpOnly: boolean; sameSite: "lax" | "strict" | "none"; secure: boolean }> {
  const cookieNames = role
    ? [role === "teacher" ? TEACHER_COOKIE : STUDENT_COOKIE]
    : [TEACHER_COOKIE, STUDENT_COOKIE];
  return cookieNames.map((name) => ({
    name,
    value: "",
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  }));
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge: number;
}

export function getAuthCookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

/**
 * Read auth claims from a Request's cookies. Returns null if not configured
 * (demo mode) or token missing/invalid.
 */
export async function readAuthFromRequest(
  req: Request,
  preferredRole?: AuthRole,
): Promise<AuthClaims | null> {
  if (!isAuthConfigured()) return null;
  const cookieHeader = req.headers.get("cookie") ?? "";
  // A role selected by the route is a security boundary, not a preference.
  // Teacher and student cookies may legitimately coexist in one browser.
  const roles: AuthRole[] = preferredRole
    ? [preferredRole]
    : ["teacher", "student"];

  for (const role of roles) {
    const cookieName = role === "teacher" ? TEACHER_COOKIE : STUDENT_COOKIE;
    const token = readCookie(cookieHeader, cookieName);
    if (!token) continue;
    const claims = await verifyToken(token);
    if (claims?.role === role) return claims;
  }
  return null;
}

export function getRequestedAuthRole(req: Request): AuthRole | undefined {
  const requested = req.headers.get("x-openpbl-role");
  return requested === "teacher" || requested === "student"
    ? requested
    : undefined;
}

function readCookie(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
