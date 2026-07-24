import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdaptiveLearningPlanEditor } from "@/components/teacher/adaptive-learning-plan-editor";
import { createDefaultAdaptiveLearningPlan } from "@/lib/adaptive-learning";

describe("AdaptiveLearningPlanEditor", () => {
  it("shows the pretest and branch outlines and lets the teacher confirm them", () => {
    const point = { id: "kp-1", name: "变量", description: "变量表示可变化的数据" };
    const mainScenes = [{
      id: "scene-1",
      title: "变量节点小测",
      type: "quiz" as const,
      order: 1,
      stageKey: "ai-learning",
      audience: "student" as const,
      knowledgePointIds: ["kp-1"],
    }];
    const plan = createDefaultAdaptiveLearningPlan({
      knowledgePoints: [point],
      mainScenes,
      now: "2026-07-23T00:00:00.000Z",
    });
    const onChange = vi.fn();
    render(
      <AdaptiveLearningPlanEditor
        courseId="course-1"
        knowledgePoints={[point]}
        mainScenes={mainScenes}
        onChange={onChange}
        plan={plan}
      />,
    );

    expect(screen.getByText("自适应学习路径")).not.toBeNull();
    expect(screen.getByText("课前轻量前测")).not.toBeNull();
    expect(screen.getByDisplayValue("变量 · 补基础")).not.toBeNull();
    expect(screen.getByDisplayValue("变量 · 拓展挑战")).not.toBeNull();
    expect(screen.getByText("整节课程完整走向")).not.toBeNull();
    expect(screen.getAllByText("变量节点小测").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "确认自适应路径" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      status: "teacher-confirmed",
      branches: expect.arrayContaining([
        expect.objectContaining({ status: "teacher-confirmed" }),
      ]),
    }));
  });
});
