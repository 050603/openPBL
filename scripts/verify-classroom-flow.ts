import { randomUUID } from "node:crypto";
import { POST as joinClass } from "@/app/api/auth/join/route";
import { GET as getSession } from "@/app/api/session/route";
import { POST as postAction } from "@/app/api/session/actions/route";
import { signTeacherToken } from "@/lib/auth/session";
import {
  dispatchAction,
  loadCourse,
} from "@/lib/db/session-repository";
import { prisma } from "@/lib/db/client";
import type { SessionState } from "@/lib/session/actions";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  assert(process.env.JWT_SECRET, "JWT_SECRET is required");

  const suffix = randomUUID();
  const courseId = `verification-${suffix}`;
  const inviteCode = suffix.replaceAll("-", "").slice(0, 6).toUpperCase();
  const now = new Date().toISOString();
  const course: Course = {
    id: courseId,
    name: "课堂链路验证",
    subject: "测试",
    grade: "测试",
    hours: 1,
    summary: "自动创建并清理的验证课堂",
    drivingQuestion: "课堂数据能否可靠读写？",
    status: "teaching",
    stages: DEFAULT_STAGES,
    currentStageIndex: 0,
    inviteCode,
    content: {
      pblOutline: "",
      knowledgePoints: [],
      lessonOutline: [],
      evaluationPlan: { dimensions: [], overallRubric: "" },
    },
    students: [],
    createdAt: now,
    updatedAt: now,
  };

  try {
    await dispatchAction({ type: "CREATE_COURSE", payload: course });

    const joinResponse = await joinClass(
      new Request("http://localhost/api/auth/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: inviteCode.toLowerCase(),
          studentName: "链路测试学生",
        }),
      }),
    );
    const joinBody = await readJson<{
      user?: { studentId?: string; courseId?: string };
      error?: string;
      message?: string;
    }>(joinResponse);
    assert(
      joinResponse.ok,
      `join failed: ${joinBody.error ?? joinBody.message ?? joinResponse.status}`,
    );
    const studentId = joinBody.user?.studentId;
    assert(studentId, "join response did not contain studentId");
    assert(joinBody.user?.courseId === courseId, "join returned the wrong course");

    const studentCookie = joinResponse.headers.get("set-cookie")?.split(";")[0];
    assert(studentCookie, "join response did not set the student cookie");
    const teacherToken = await signTeacherToken({
      teacherId: "verification-teacher",
      username: "verification",
      displayName: "验证教师",
    });
    const cookies =
      `${teacherToken.cookieName}=${encodeURIComponent(teacherToken.token)}; ${studentCookie}`;

    const studentSessionResponse = await getSession(
      new Request("http://localhost/api/session", {
        headers: {
          Cookie: cookies,
          "X-OpenPBL-Role": "student",
        },
      }),
    );
    const studentState = await readJson<SessionState>(studentSessionResponse);
    assert(studentSessionResponse.ok, "student session request failed");
    assert(studentState.user.role === "student", "student cookie was shadowed by teacher cookie");
    assert(studentState.studentId === studentId, "student identity was not restored from JWT");
    assert(
      studentState.courses.length === 1 && studentState.courses[0].id === courseId,
      "student session was not scoped to the joined course",
    );
    assert(
      studentState.courses[0].students.some((student) => student.id === studentId),
      "joined student was not persisted in the course roster",
    );

    const forbiddenResponse = await postAction(
      new Request("http://localhost/api/session/actions", {
        method: "POST",
        headers: {
          Cookie: cookies,
          "Content-Type": "application/json",
          "X-OpenPBL-Role": "student",
        },
        body: JSON.stringify({
          type: "UPDATE_STUDENT_PROGRESS",
          payload: {
            courseId,
            studentId: "another-student",
            stageKey: "launch",
            value: 10,
          },
        }),
      }),
    );
    assert(forbiddenResponse.status === 403, "cross-student write was not rejected");

    const validResponse = await postAction(
      new Request("http://localhost/api/session/actions", {
        method: "POST",
        headers: {
          Cookie: cookies,
          "Content-Type": "application/json",
          "X-OpenPBL-Role": "student",
        },
        body: JSON.stringify({
          type: "UPDATE_STUDENT_PROGRESS",
          payload: {
            courseId,
            studentId,
            stageKey: "launch",
            value: 35,
          },
        }),
      }),
    );
    assert(validResponse.ok, `valid student save failed with ${validResponse.status}`);

    await Promise.all([
      dispatchAction({
        type: "UPDATE_STUDENT_PROGRESS",
        payload: { courseId, studentId, stageKey: "proposal", value: 45 },
      }),
      dispatchAction({
        type: "UPDATE_STUDENT_PROGRESS",
        payload: { courseId, studentId, stageKey: "make", value: 55 },
      }),
    ]);
    const persisted = await loadCourse(courseId);
    const persistedStudent = persisted?.students.find((student) => student.id === studentId);
    assert(persistedStudent?.stageProgress.launch === 35, "normal save was not persisted");
    assert(persistedStudent?.stageProgress.proposal === 45, "first concurrent save was lost");
    assert(persistedStudent?.stageProgress.make === 55, "second concurrent save was lost");

    console.log(
      JSON.stringify({
        ok: true,
        checks: [
          "join-persisted",
          "dual-cookie-role-selection",
          "student-session-scoping",
          "cross-student-write-blocked",
          "student-save-persisted",
          "concurrent-updates-preserved",
        ],
      }),
    );
  } finally {
    await prisma.studentAccount.deleteMany({ where: { courseId } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
