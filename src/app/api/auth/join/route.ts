// Student join endpoint — student joins a class via invite code.
// On success, sets an httpOnly cookie with a signed student JWT (1-day expiry).

import { prisma, isDatabaseConfigured } from "@/lib/db/client";
import {
  isAuthConfigured,
  signStudentToken,
  STUDENT_COOKIE_NAME,
  getAuthCookieOptions,
} from "@/lib/auth/session";
import { z } from "zod";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JoinSchema = z.object({
  inviteCode: z.string().min(4).max(32),
  studentName: z.string().min(1).max(64),
});

export async function POST(req: Request) {
  if (!isAuthConfigured()) {
    return Response.json(
      { error: "AUTH_NOT_CONFIGURED", message: "未配置 JWT_SECRET,鉴权未启用" },
      { status: 503 },
    );
  }

  let parsed: z.infer<typeof JoinSchema>;
  try {
    parsed = JoinSchema.parse(await req.json());
  } catch {
    return Response.json(
      { error: "INVALID_INPUT", message: "邀请码或姓名格式不正确" },
      { status: 400 },
    );
  }

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DB_NOT_CONFIGURED", message: "数据库未配置,无法加入课堂" },
      { status: 503 },
    );
  }

  // Find course by invite code
  const course = await prisma.course.findFirst({
    where: { inviteCode: parsed.inviteCode },
    select: { id: true, inviteCode: true, status: true },
  });
  if (!course) {
    return Response.json(
      { error: "INVITE_CODE_INVALID", message: "邀请码无效或课程不存在" },
      { status: 404 },
    );
  }

  // Generate a stable studentId for this name+course pair (idempotency):
  // if the same name joins again, reuse the same studentId.
  const existing = await prisma.studentAccount.findFirst({
    where: {
      courseId: course.id,
      studentName: parsed.studentName,
    },
  });

  const studentId = existing?.studentId ?? randomUUID();

  if (!existing) {
    await prisma.studentAccount.create({
      data: {
        courseId: course.id,
        studentId,
        studentName: parsed.studentName,
        inviteCode: parsed.inviteCode,
      },
    });
  } else {
    await prisma.studentAccount.update({
      where: { id: existing.id },
      data: { lastLoginAt: new Date() },
    });
  }

  const { token, cookieName, maxAge } = await signStudentToken({
    courseId: course.id,
    studentId,
    studentName: parsed.studentName,
  });
  if (cookieName !== STUDENT_COOKIE_NAME) {
    return Response.json(
      { error: "INTERNAL_ERROR", message: "Cookie 名称不一致" },
      { status: 500 },
    );
  }

  const cookieOpts = getAuthCookieOptions(maxAge);
  const cookieValue = `${STUDENT_COOKIE_NAME}=${encodeURIComponent(token)}; Path=${cookieOpts.path}; Max-Age=${cookieOpts.maxAge}; HttpOnly; SameSite=${cookieOpts.sameSite}${cookieOpts.secure ? "; Secure" : ""}`;

  return Response.json(
    {
      user: {
        role: "student",
        courseId: course.id,
        studentId,
        studentName: parsed.studentName,
      },
    },
    {
      status: 200,
      headers: { "Set-Cookie": cookieValue, "Content-Type": "application/json; charset=utf-8" },
    },
  );
}
