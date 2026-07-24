import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";
import { DEFAULT_PBL_COURSE_CONFIG } from "@/lib/pbl-course-config";

const sessionMocks = vi.hoisted(() => ({
  updateCourse: vi.fn(),
  upsertAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
}));

vi.mock("@/lib/session/store", () => ({
  useSession: () => sessionMocks,
}));

import { ProjectLaunchTeacherView } from "./project-launch";

const course: Course = {
  id: "course-1",
  name: "校园节水项目",
  subject: "科学",
  grade: "六年级",
  hours: 3,
  summary: "提出可验证的校园节水方案",
  drivingQuestion: "我们如何减少校园用水浪费？",
  status: "teaching",
  stages: DEFAULT_STAGES,
  currentStageIndex: 1,
  content: {
    pblOutline: "",
    knowledgePoints: [],
    lessonOutline: [],
    evaluationPlan: { dimensions: [], overallRubric: "" },
  },
  pblConfig: {
    ...DEFAULT_PBL_COURSE_CONFIG,
    inquiryQuestions: [
      "我们如何减少校园用水浪费？",
      "我们如何让雨水被校园重新利用？",
    ],
  },
  students: [
    { id: "student-1", name: "张三", joinedAt: "", stageProgress: {} },
    { id: "student-2", name: "李四", joinedAt: "", stageProgress: {} },
  ],
  groups: [
    {
      id: "group-1",
      name: "张三的个人项目",
      topic: "我们如何减少校园用水浪费？",
      keywords: [],
      selectedForms: [],
      members: [{ studentId: "student-1", name: "张三" }],
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "group-2",
      name: "李四的个人项目",
      topic: "待确定选题方向",
      keywords: [],
      selectedForms: [],
      members: [{ studentId: "student-2", name: "李四" }],
      createdAt: "",
      updatedAt: "",
    },
  ],
  createdAt: "",
  updatedAt: "",
};

describe("teacher project launch inquiry questions", () => {
  it("shows selection distribution and publishes an additional question", () => {
    render(<ProjectLaunchTeacherView course={course} />);

    expect(screen.getByText("已选择 1/2")).toBeTruthy();
    expect(screen.getByText("我们如何让雨水被校园重新利用？")).toBeTruthy();

    fireEvent.change(
      screen.getByPlaceholderText("例如：我们如何利用实地数据，为学校设计一套可验证的节水改进方案？"),
      { target: { value: "我们如何降低教学楼的日常用水？" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /发布到学生选题池/ }));

    expect(sessionMocks.updateCourse).toHaveBeenCalledWith(
      "course-1",
      expect.objectContaining({
        pblConfig: expect.objectContaining({
          inquiryQuestions: [
            "我们如何减少校园用水浪费？",
            "我们如何让雨水被校园重新利用？",
            "我们如何降低教学楼的日常用水？",
          ],
        }),
      }),
    );
  });
});
