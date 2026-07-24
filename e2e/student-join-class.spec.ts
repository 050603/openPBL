import { test, expect } from "@playwright/test";
import { generateInviteCode } from "../src/lib/session/invite-code";
import { DEFAULT_STAGES, type Course } from "../src/lib/session/types";
import { dispatchAction } from "../src/lib/db/session-repository";
import { prisma } from "../src/lib/db/client";

let courseId = "";
let inviteCode = "";

test.beforeAll(async () => {
  courseId = `e2e-course-${Date.now()}`;
  inviteCode = generateInviteCode();
  const now = new Date().toISOString();
  const course: Course = {
    id: courseId,
    name: "学生课堂链路 E2E",
    subject: "科学",
    grade: "测试",
    hours: 1,
    summary: "Playwright 自动验证课堂",
    drivingQuestion: "学生能否可靠加入并保存进度？",
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
  await dispatchAction({ type: "CREATE_COURSE", payload: course });
});

test.afterAll(async () => {
  await dispatchAction({ type: "DELETE_COURSE", payload: { id: courseId } });
  await prisma.studentAccount.deleteMany({ where: { courseId } });
  await prisma.$disconnect();
});

test("student can join, read the classroom, save progress, and reload it", async ({
  page,
}) => {
  await page.goto("/student");
  await page.getByLabel("邀请码").fill(inviteCode);
  await page.getByLabel("姓名").fill("端到端测试学生");
  const [joinResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/join"),
    ),
    page.getByRole("button", { name: "进入课堂" }).click(),
  ]);
  const joinPayload = (await joinResponse.json()) as {
    error?: string;
    message?: string;
  };
  expect(
    joinResponse.ok(),
    `join failed: ${joinPayload.error ?? joinPayload.message ?? joinResponse.status()}`,
  ).toBe(true);

  await expect(page).toHaveURL(new RegExp(`/student/classroom/${courseId}$`));
  await expect(page.getByText("未找到课堂")).toHaveCount(0);
  await expect(page.getByText("无法读取课堂数据")).toHaveCount(0);
  await expect(page.getByText("项目启动").first()).toBeVisible();

  const sessionResponse = await page.request.get("/api/session", {
    headers: { "X-OpenPBL-Role": "student" },
  });
  expect(sessionResponse.ok()).toBe(true);
  const session = (await sessionResponse.json()) as {
    studentId?: string;
    courses: Array<{
      id: string;
      students: Array<{
        id: string;
        stageProgress: Record<string, number>;
      }>;
    }>;
  };
  expect(session.studentId).toBeTruthy();
  expect(session.courses.map((course) => course.id)).toEqual([courseId]);

  const saveResponse = await page.request.post("/api/session/actions", {
    headers: { "X-OpenPBL-Role": "student" },
    data: {
      type: "UPDATE_STUDENT_PROGRESS",
      payload: {
        courseId,
        studentId: session.studentId,
        stageKey: "launch",
        value: 67,
      },
    },
  });
  expect(saveResponse.ok()).toBe(true);

  await page.reload();
  const reloadedResponse = await page.request.get("/api/session", {
    headers: { "X-OpenPBL-Role": "student" },
  });
  const reloaded = (await reloadedResponse.json()) as typeof session;
  const student = reloaded.courses[0].students.find(
    (candidate) => candidate.id === reloaded.studentId,
  );
  expect(student?.stageProgress.launch).toBe(67);
  await expect(page.getByText("无法读取课堂数据")).toHaveCount(0);
});
