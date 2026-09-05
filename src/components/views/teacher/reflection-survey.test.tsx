import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStagesForSystemMode } from "@/lib/system-mode";
import type { Course } from "@/lib/session/types";
import { NewReflectionTeacherView } from "./reflection-survey";

vi.mock("@/lib/session/store", () => ({
  useSession: () => ({
    user: { role: "teacher", name: "教师" },
    studentId: undefined,
    studentName: undefined,
    markResourceDownloaded: vi.fn(),
  }),
}));

function makeCourse(overrides: Partial<Course> = {}): Course {
  const now = "2026-08-01T00:00:00.000Z";
  return {
    id: "course-1",
    name: "校园减塑",
    subject: "科学",
    grade: "六年级",
    hours: 5,
    summary: "完成个人项目",
    drivingQuestion: "如何改善校园环境？",
    status: "teaching",
    stages: getStagesForSystemMode("new"),
    currentStageIndex: 4,
    students: [
      { id: "student-1", name: "小林", joinedAt: now, stageProgress: {} },
      { id: "student-2", name: "小周", joinedAt: now, stageProgress: {} },
    ],
    reflections: [{
      id: "reflection-1",
      courseId: "course-1",
      studentId: "student-1",
      studentName: "小林",
      content: "兼容文本",
      survey: {
        schemaVersion: 1,
        learningReflection: "通过数据修改了方案。",
        systemReflection: "AI 提问很有帮助。",
        aiHelpfulness: 4,
        systemUsability: 5,
        reuseIntention: 4,
      },
      createdAt: now,
      updatedAt: "2026-08-01T00:10:00.000Z",
    }],
    resources: [],
    groups: [],
    content: {
      pblOutline: "",
      knowledgePoints: [],
      lessonOutline: [],
      evaluationPlan: { dimensions: [], overallRubric: "" },
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("NewReflectionTeacherView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps detailed distributions and unsubmitted students in the main work area", () => {
    render(<NewReflectionTeacherView course={makeCourse()} />);

    expect(screen.queryByText("提交率 50%")).toBeNull();
    expect(screen.getAllByText("4.0").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("img", { name: "AI 引导帮助：1分0人、2分0人、3分0人、4分1人、5分0人" })).toBeTruthy();
    expect(screen.getAllByText("同意 100%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("小周")).toBeTruthy();
    expect(screen.getByText("待提交")).toBeTruthy();
    expect((screen.getByRole("button", { name: "导出 CSV" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("reveals the two open answers for a selected student", () => {
    render(<NewReflectionTeacherView course={makeCourse()} />);

    fireEvent.click(screen.getByRole("button", { name: "小林的反思详情" }));
    expect(screen.getAllByText("通过数据修改了方案。").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("AI 提问很有帮助。").length).toBeGreaterThanOrEqual(1);
  });

  it("disables export when no structured responses exist", () => {
    const course = makeCourse({ reflections: [] });
    render(<NewReflectionTeacherView course={course} />);
    expect((screen.getByRole("button", { name: "导出 CSV" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("暂无有效回答")).toBeTruthy();
  });
});
