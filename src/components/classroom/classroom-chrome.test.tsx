import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";
import { StageGateDialog, StageProgress } from "./classroom-chrome";

const course: Course = {
  id: "course-1",
  name: "测试课程",
  subject: "科学",
  grade: "六年级",
  hours: 3,
  summary: "测试",
  drivingQuestion: "如何解决问题？",
  status: "teaching",
  stages: DEFAULT_STAGES,
  currentStageIndex: 2,
  content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
  students: [],
  createdAt: "",
  updatedAt: "",
};

describe("StageProgress", () => {
  it("uses the enlarged current step as the single stage identity", () => {
    render(<StageProgress course={course} />);

    const current = screen.getByRole("button", { current: "step" });
    expect(current.className).toContain("min-h-14");
    expect(current.textContent).toContain("当前阶段");
    expect(current.textContent).toContain(course.stages[2].label);
    expect(screen.getByRole("button", { name: /项目启动/ }).className).toContain("min-h-10");
  });
});

describe("StageGateDialog", () => {
  it("allows a teacher to confirm a blocked stage transition without entering a reason", () => {
    const onConfirm = vi.fn();
    render(
      <StageGateDialog
        course={{ ...course, currentStageIndex: 0, students: [], summary: "", drivingQuestion: "" }}
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open
        targetIndex={1}
      />,
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    const confirm = screen.getByRole("button", { name: "确认并切换" });
    expect(confirm).not.toHaveProperty("disabled", true);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
