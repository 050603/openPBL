import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STAGES, type Course } from "@/lib/session/types";
import { ReflectionTeacherView } from "./reflection";

const session = vi.hoisted(() => ({
  addFeedback: vi.fn(),
  addActivity: vi.fn(),
  updateCourse: vi.fn(),
}));

vi.mock("@/lib/session/store", () => ({
  useSession: () => session,
}));

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "真实记录测试",
    subject: "科学",
    grade: "六年级",
    hours: 6,
    summary: "完成个人项目",
    drivingQuestion: "如何改善校园环境？",
    status: "teaching",
    stages: DEFAULT_STAGES,
    currentStageIndex: 5,
    students: [
      {
        id: "student-1",
        name: "小林",
        joinedAt: "2026-07-28T00:00:00.000Z",
        stageProgress: Object.fromEntries(
          DEFAULT_STAGES.map((stage) => [stage.key, 100]),
        ),
      },
    ],
    groups: [
      {
        id: "project-1",
        name: "小林的个人项目",
        topic: "校园环境",
        keywords: [],
        selectedForms: [],
        members: [{ studentId: "student-1", name: "小林" }],
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:00:00.000Z",
      },
    ],
    content: {
      pblOutline: "",
      knowledgePoints: [],
      lessonOutline: [],
      evaluationPlan: {
        dimensions: [
          {
            id: "evidence",
            name: "证据质量",
            weight: 100,
            description: "依据真实材料判断",
          },
        ],
        overallRubric: "",
      },
    },
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    ...overrides,
  };
}

describe("ReflectionTeacherView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not turn progress into a score or expose fake evaluation actions", () => {
    render(<ReflectionTeacherView course={makeCourse()} />);

    expect(
      screen.getByText("暂无展示阶段评分"),
    ).toBeTruthy();
    expect(screen.queryByText("设为优秀")).toBeNull();
    expect(screen.queryByText(/导出班级报告/)).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "基于现有证据生成",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("sends only the teacher-authored personalized comment", () => {
    render(<ReflectionTeacherView course={makeCourse()} />);

    const input = screen.getByPlaceholderText(
      "根据 小林 的成果和反思填写针对性评语…",
    );
    fireEvent.change(input, {
      target: { value: "你的证据链清楚，下一步请补充样本限制。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送此评语" }));

    expect(session.addFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "student-1",
        stageKey: "reflection",
        content: "你的证据链清楚，下一步请补充样本限制。",
      }),
    );
  });
});
