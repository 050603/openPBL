// Student join endpoint — student joins a class via invite code.
// On success, sets an httpOnly cookie with a signed student JWT (1-day expiry).

import { prisma, isDatabaseConfigured } from "@/lib/db/client";
import {
  dispatchSessionAction,
  readSessionState,
} from "@/lib/session/server-store";
import { normalizeInviteCode } from "@/lib/session/invite-code";
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

  const inviteCode = normalizeInviteCode(parsed.inviteCode);
  const studentName = parsed.studentName.trim();

  try {
    const state = await readSessionState();
    const course = state.courses.find(
      (candidate) =>
        candidate.inviteCode &&
        normalizeInviteCode(candidate.inviteCode) === inviteCode &&
        candidate.status === "teaching",
    );
    if (!course) {
      return Response.json(
        { error: "INVITE_CODE_INVALID", message: "邀请码无效或课堂尚未开始" },
        { status: 404 },
      );
    }

    const rosterStudent = course.students.find(
      (student) => student.name.trim().toLocaleLowerCase() === studentName.toLocaleLowerCase(),
    );
    const account = isDatabaseConfigured()
      ? await prisma.studentAccount.findFirst({
          where: { courseId: course.id, studentName },
        })
      : null;
    const studentId = account?.studentId ?? rosterStudent?.id ?? randomUUID();
    const joinedAt =
      rosterStudent?.joinedAt ?? account?.createdAt.toISOString() ?? new Date().toISOString();

    if (isDatabaseConfigured()) {
      await prisma.studentAccount.upsert({
        where: {
          courseId_studentId: {
            courseId: course.id,
            studentId,
          },
        },
        create: {
          courseId: course.id,
          studentId,
          studentName,
          inviteCode,
          lastLoginAt: new Date(),
        },
        update: {
          studentName,
          inviteCode,
          lastLoginAt: new Date(),
        },
      });
    }

    await dispatchSessionAction({
      type: "JOIN_CLASS",
      payload: {
        courseId: course.id,
        student: {
          id: studentId,
          name: studentName,
          joinedAt,
          stageProgress: rosterStudent?.stageProgress ?? {},
          lastSeenAt: new Date().toISOString(),
        },
      },
    });

    const { token, cookieName, maxAge } = await signStudentToken({
      courseId: course.id,
      studentId,
      studentName,
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
          studentName,
        },
      },
      {
        status: 200,
        headers: {
          "Set-Cookie": cookieValue,
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  } catch (error) {
    console.error("[auth/join] unable to join classroom:", error);
    return Response.json(
      { error: "JOIN_UNAVAILABLE", message: "课堂服务暂时不可用，请稍后重试" },
      { status: 503 },
    );
  }
}
