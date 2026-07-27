import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdaptiveLearningPlanEditor } from "@/components/teacher/adaptive-learning-plan-editor";
import { createDefaultAdaptiveLearningPlan } from "@/lib/adaptive-learning";

describe("AdaptiveLearningPlanEditor", () => {
  it("shows a compact review dashboard and leaves confirmation to course generation", () => {
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

    expect(screen.getByText("自适应课程审核台")).not.toBeNull();
    expect(screen.getByText("学生可能经历的完整学习路径")).not.toBeNull();
    expect(screen.getByText("课前测题目")).not.toBeNull();
    expect(screen.getByText("课前先决知识资源")).not.toBeNull();
    expect(screen.getByText("模块后拓展资源")).not.toBeNull();
    expect(screen.getByDisplayValue("变量 · 先决知识诊断回顾")).not.toBeNull();
    expect(screen.getByDisplayValue("变量 · 模块拓展")).not.toBeNull();
    expect(screen.getByText("先决覆盖 1/1")).not.toBeNull();
    expect(screen.getByText("模块覆盖 1/1")).not.toBeNull();
    expect(screen.getAllByText("相对主课新增价值（必填）")).toHaveLength(2);
    expect(screen.getByText("关联模块测验")).not.toBeNull();
    expect(screen.getAllByText("变量节点小测").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "确认资源方案" })).toBeNull();
    expect(screen.getByText("无需在这里单独确认")).not.toBeNull();

    fireEvent.change(screen.getByDisplayValue("变量 · 模块拓展"), {
      target: { value: "变量 · 新应用" },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "draft" }));
  });
});
