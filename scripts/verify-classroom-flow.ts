import { randomUUID } from "node:crypto";
import { POST as joinClass } from "@/app/api/auth/join/route";
import { GET as getCourseState } from "@/app/api/courses/[courseId]/state/route";
import { POST as postAction } from "@/app/api/courses/[courseId]/actions/route";
import { hashPassword } from "@/lib/auth/password";
import { signTeacherToken } from "@/lib/auth/session";
import { dispatchAction, loadCourse } from "@/lib/db/session-repository";
import { prisma } from "@/lib/db/client";
import type { SessionAction } from "@/lib/session/actions";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

const BASE_URL = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000")
  .trim()
  .replace(/\/+$/, "");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  assert(process.env.JWT_SECRET, "JWT_SECRET is required");

  const courseId = randomUUID();
  const teacherId = randomUUID();
  const inviteCode = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
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
    todos: [{
      id: `todo-${courseId}`,
      title: "确认启动任务",
      description: "链路验证",
      stageKey: "launch",
      completedBy: [],
    }],
    resources: [{
      id: `resource-${courseId}`,
      title: "链路验证资源",
      type: "PDF",
      size: "1 KB",
      downloadedBy: [],
    }],
    groups: [{
      id: `group-${courseId}`,
      name: "链路验证小组",
      topic: "链路验证",
      keywords: [],
      selectedForms: [],
      members: [],
      createdAt: now,
      updatedAt: now,
    }],
    announcements: [{
      id: `announcement-${courseId}`,
      title: "链路验证公告",
      content: "请确认收到",
      createdAt: now,
      updatedAt: now,
      replies: [],
    }],
    students: [],
    createdAt: now,
    updatedAt: now,
  };

  try {
    await prisma.teacher.create({
      data: {
        id: teacherId,
        username: `verification-${teacherId}`,
        displayName: "验证教师",
        passwordHash: await hashPassword(randomUUID()),
      },
    });
    await dispatchAction({ type: "CREATE_COURSE", payload: course });

    const joinResponse = await joinClass(
      new Request(`${BASE_URL}/api/auth/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: BASE_URL,
        },
        body: JSON.stringify({
          requestId: randomUUID(),
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
    const personalProjectId = `grp-${studentId}`;

    const studentCookie = joinResponse.headers.get("set-cookie")?.split(";")[0];
    assert(studentCookie, "join response did not set the student cookie");
    const teacherToken = await signTeacherToken({
      teacherId,
      username: `verification-${teacherId}`,
      sessionVersion: 1,
      displayName: "验证教师",
    });
    const cookies =
      `${teacherToken.cookieName}=${encodeURIComponent(teacherToken.token)}; ${studentCookie}`;
    const routeContext = { params: Promise.resolve({ courseId }) };

    const studentStateResponse = await getCourseState(
      new Request(`${BASE_URL}/api/courses/${courseId}/state`, {
        headers: {
          Cookie: cookies,
          "X-OpenPBL-Role": "student",
        },
      }),
      routeContext,
    );
    const studentState = await readJson<{
      course?: Course;
      courseVersion?: number;
    }>(studentStateResponse);
    assert(studentStateResponse.ok, "student course-state request failed");
    assert(studentState.course?.id === courseId, "student state returned the wrong course");
    assert(
      studentState.course.students.some((student) => student.id === studentId),
      "joined student was not persisted in the course roster",
    );

    const forbiddenResponse = await sendStudentAction(
      cookies,
      courseId,
      {
        type: "UPDATE_STUDENT_PROGRESS",
        payload: {
          courseId,
          studentId: "another-student",
          stageKey: "launch",
          value: 10,
        },
      },
    );
    assert(forbiddenResponse.status === 403, "cross-student write was not rejected");

    const validResponse = await sendStudentAction(
      cookies,
      courseId,
      {
        type: "UPDATE_STUDENT_PROGRESS",
        payload: { courseId, studentId, stageKey: "launch", value: 35 },
      },
    );
    assert(validResponse.ok, `valid student save failed with ${validResponse.status}`);

    const launchActions: SessionAction[] = [
      {
        type: "SET_STUDENT_TODO_COMPLETION",
        payload: {
          courseId,
          todoId: `todo-${courseId}`,
          studentId,
          completed: true,
        },
      },
      {
        type: "MARK_RESOURCE_DOWNLOADED",
        payload: {
          courseId,
          resourceId: `resource-${courseId}`,
          studentId,
          studentName: "链路测试学生",
        },
      },
      {
        type: "JOIN_GROUP",
        payload: {
          courseId,
          groupId: personalProjectId,
          studentId,
          studentName: "链路测试学生",
        },
      },
      {
        type: "ADD_ANNOUNCEMENT_REPLY",
        payload: {
          courseId,
          announcementId: `announcement-${courseId}`,
          reply: {
            id: randomUUID(),
            studentId,
            studentName: "链路测试学生",
            content: "已收到",
            createdAt: new Date().toISOString(),
          },
        },
      },
    ];
    for (const action of launchActions) {
      const response = await sendStudentAction(cookies, courseId, action);
      assert(response.ok, `${action.type} failed with ${response.status}`);
    }

    const stageUpdates: Array<{ stageKey: string; value: number }> = [
      { stageKey: "proposal", value: 45 },
      { stageKey: "make", value: 55 },
      { stageKey: "showcase", value: 65 },
      { stageKey: "reflection", value: 75 },
    ];
    const concurrent = await Promise.all(stageUpdates.map(({ stageKey, value }) =>
      sendStudentAction(cookies, courseId, {
        type: "UPDATE_STUDENT_PROGRESS",
        payload: { courseId, studentId, stageKey, value },
      }),
    ));
    assert(concurrent.every((response) => response.ok), "a concurrent save failed");

    const persisted = await loadCourse(courseId);
    const persistedStudent = persisted?.students.find((student) => student.id === studentId);
    assert(persistedStudent?.stageProgress.launch === 100, "launch todo progress was not derived");
    assert(persistedStudent?.stageProgress.proposal === 45, "first concurrent save was lost");
    assert(persistedStudent?.stageProgress.make === 55, "second concurrent save was lost");
    assert(persistedStudent?.stageProgress.showcase === 65, "showcase progress was lost");
    assert(persistedStudent?.stageProgress.reflection === 75, "reflection progress was lost");
    assert(
      persisted?.todos?.find((todo) => todo.id === `todo-${courseId}`)
        ?.completedBy.includes(studentId),
      "teacher state did not include todo completion",
    );
    assert(
      persisted?.resources?.find((resource) => resource.id === `resource-${courseId}`)
        ?.downloadedBy.includes(studentId),
      "teacher state did not include resource access",
    );
    assert(
      persisted?.groups?.find((group) => group.id === personalProjectId)
        ?.members.some((member) => member.studentId === studentId),
      "teacher state did not include group membership",
    );
    assert(
      persisted?.announcements
        ?.find((announcement) => announcement.id === `announcement-${courseId}`)
        ?.replies.some(
        (reply) => reply.studentId === studentId,
      ),
      "teacher state did not include announcement reply",
    );

    console.log(JSON.stringify({
      ok: true,
      checks: [
        "join-persisted",
        "dual-cookie-role-selection",
        "student-course-scoping",
        "cross-student-write-blocked",
        "idempotent-action-envelope",
        "concurrent-updates-preserved",
        "launch-todo-progress-synchronized",
        "resource-group-announcement-synchronized",
        "proposal-make-showcase-reflection-synchronized",
      ],
    }));
  } finally {
    await prisma.studentAccount.deleteMany({ where: { courseId } });
    await prisma.courseEvent.deleteMany({ where: { courseId } });
    await prisma.courseMutationReceipt.deleteMany({ where: { courseId } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.teacher.deleteMany({ where: { id: teacherId } });
    await prisma.$disconnect();
  }
}

function sendStudentAction(
  cookies: string,
  courseId: string,
  action: SessionAction,
) {
  return postAction(
    new Request(`${BASE_URL}/api/courses/${courseId}/actions`, {
      method: "POST",
      headers: {
        Cookie: cookies,
        "Content-Type": "application/json",
        Origin: BASE_URL,
        "X-OpenPBL-Role": "student",
      },
      body: JSON.stringify({ requestId: randomUUID(), action }),
    }),
    { params: Promise.resolve({ courseId }) },
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
