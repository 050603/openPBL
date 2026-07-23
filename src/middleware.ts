// Next.js Middleware — auth gate for protected routes.
//
// When JWT_SECRET is not configured (demo mode), middleware is a no-op
// and all routes pass through (preserving backward compatibility).
//
// When configured:
//   - /teacher/* requires a valid teacher JWT, else redirect to /teacher/login
//   - /student/* requires a valid student JWT, else redirect to / (home with join form)
//   - /api/teacher/* / /api/uploads POST / /api/session/actions sensitive actions
//     require proper role; unauthenticated → 401
//   - /api/openmaic/provider-config POST/DELETE requires teacher role
//
// Edge runtime: must use only Edge-compatible APIs (jose works on Edge).

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

export const config = {
  matcher: [
    // 裸路径必须单独列出——Next.js 16 中 `:path*` 不匹配无子路径的裸路径
    "/teacher",
    "/teacher/:path*",
    // /student 裸路径是公开入口页（输入邀请码），不经过 middleware；
    // 仅 /student/* 子路径（classroom、ai-learning）需要认证。
    "/student/:path*",
    "/api/session",
    "/api/session/:path*",
    "/api/uploads",
    "/api/uploads/:path*",
    "/api/teacher-directives",
    "/api/teacher-directives/:path*",
    "/api/chat/companion",
    "/api/chat/companion/:path*",
    "/api/companion",
    "/api/companion/:path*",
    "/api/learning-events",
    "/api/learning-events/:path*",
    "/api/openmaic/provider-config",
    "/api/openmaic/provider-config/:path*",
  ],
};

const TEACHER_COOKIE = "openpbl_teacher";
const STUDENT_COOKIE = "openpbl_student";
const LOGIN_PATH = "/teacher/login";

function getSecret(): Uint8Array | null {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 32) return null;
  return new TextEncoder().encode(raw);
}

async function verifyCookie(
  token: string | undefined,
  secret: Uint8Array,
): Promise<{ role: "teacher" | "student"; [k: string]: unknown } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: "openpbl",
      audience: "openpbl-app",
    });
    if (payload.role !== "teacher" && payload.role !== "student") return null;
    return payload as { role: "teacher" | "student"; [k: string]: unknown };
  } catch {
    return null;
  }
}

function readCookie(req: NextRequest, name: string): string | undefined {
  const cookie = req.cookies.get(name);
  return cookie?.value;
}

export async function middleware(req: NextRequest) {
  const secret = getSecret();
  // Demo mode: skip auth
  if (!secret) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // ---------- Page guards ----------
  // 注意：pathname.startsWith("/teacher/") 不匹配裸路径 "/teacher"，
  // 需要显式检查裸路径。
  if ((pathname === "/teacher" || pathname.startsWith("/teacher/")) && pathname !== LOGIN_PATH) {
    const token = readCookie(req, TEACHER_COOKIE);
    const claims = await verifyCookie(token ?? "", secret);
    if (!claims || claims.role !== "teacher") {
      const url = req.nextUrl.clone();
      url.pathname = LOGIN_PATH;
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
  }

  // /student 裸路径是学生入口页（输入邀请码），公开访问；
  // 仅 /student/* 子路径（classroom、ai-learning）需要学生身份。
  if (pathname.startsWith("/student/")) {
    const token = readCookie(req, STUDENT_COOKIE);
    const claims = await verifyCookie(token ?? "", secret);
    if (!claims || claims.role !== "student") {
      const url = req.nextUrl.clone();
      url.pathname = "/student";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
  }

  // ---------- API guards ----------
  if (pathname.startsWith("/api/")) {
    const teacherToken = readCookie(req, TEACHER_COOKIE);
    const studentToken = readCookie(req, STUDENT_COOKIE);
    const teacherClaims = await verifyCookie(teacherToken ?? "", secret);
    const studentClaims = await verifyCookie(studentToken ?? "", secret);

    const isTeacher = !!teacherClaims && teacherClaims.role === "teacher";
    const isStudent = !!studentClaims && studentClaims.role === "student";

    // Teacher-only APIs
    if (
      pathname.startsWith("/api/teacher-directives") ||
      pathname.startsWith("/api/openmaic/provider-config")
    ) {
      if (!isTeacher) {
        return NextResponse.json(
          { error: "UNAUTHORIZED", message: "需要教师身份" },
          { status: 401 },
        );
      }
    }

    // Session API (GET /api/session 和 POST /api/session/actions):
    // 允许教师或学生身份，权限矩阵在路由处理器内部细化。
    if (pathname === "/api/session" || pathname.startsWith("/api/session/")) {
      if (!isTeacher && !isStudent) {
        return NextResponse.json(
          { error: "UNAUTHORIZED", message: "请先登录" },
          { status: 401 },
        );
      }
    }

    // Companion + learning-events: require known identity (student for chat,
    // teacher for oversight)
    if (
      pathname.startsWith("/api/chat/companion") ||
      pathname.startsWith("/api/companion") ||
      pathname.startsWith("/api/learning-events")
    ) {
      if (!isTeacher && !isStudent) {
        return NextResponse.json(
          { error: "UNAUTHORIZED", message: "请先登录" },
          { status: 401 },
        );
      }
    }

    // Uploads: POST requires auth, GET (download) allowed for sharing
    if (pathname.startsWith("/api/uploads") && req.method !== "GET") {
      if (!isTeacher && !isStudent) {
        return NextResponse.json(
          { error: "UNAUTHORIZED", message: "请先登录" },
          { status: 401 },
        );
      }
    }
  }

  return NextResponse.next();
}
