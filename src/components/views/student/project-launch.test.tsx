import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

vi.mock("@/lib/session/store", () => ({
  useSession: () => ({
    completeTodo: vi.fn(),
    markResourceDownloaded: vi.fn(),
    setGroupTopic: vi.fn(),
    studentId: "student-1",
  }),
}));

import { ProjectLaunchView } from "./project-launch";

const course: Course = {
  id: "course-1",
  name: "校园节水项目",
  subject: "科学",
  grade: "六年级",
  hours: 3,
  summary: "调查校园用水并提出改进方案",
  drivingQuestion: "我们如何减少校园用水浪费？",
  expectedOutcome: "一份有数据依据的节水方案",
  status: "teaching",
  stages: DEFAULT_STAGES,
  currentStageIndex: 0,
  content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
  students: [{ id: "student-1", name: "测试学生", joinedAt: "", stageProgress: {} }],
  groups: [{ id: "project-1", name: "测试学生的项目", topic: "我们如何减少校园用水浪费？", keywords: [], selectedForms: [], members: [{ studentId: "student-1", name: "测试学生" }], createdAt: "", updatedAt: "" }],
  createdAt: "",
  updatedAt: "",
};

describe("ProjectLaunchView content hierarchy", () => {
  it("focuses on concrete stage work without redundant prompts", () => {
    render(<ProjectLaunchView course={course} />);

    expect(screen.getByText("本阶段要完成")).toBeTruthy();
    expect(screen.getByText("课程安排")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "项目任务书" })).toBeTruthy();
    expect(screen.getByText("理解问题，查看材料，确定研究方向")).toBeTruthy();
    expect(screen.queryByText("先理解问题，再确认自己的项目方向")).toBeNull();
    expect(screen.queryByText("完成实际操作后，状态会自动更新。")).toBeNull();
    expect(screen.queryByText("看清要解决的问题、成果要求和学习目标。")).toBeNull();
    expect(screen.queryByText("时间安排")).toBeNull();
  });
});
