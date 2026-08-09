import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AdaptiveLearningPlanEditor } from "@/components/teacher/adaptive-learning-plan-editor";
import { createDefaultAdaptiveLearningPlan } from "@/lib/adaptive-learning";

describe("AdaptiveLearningPlanEditor", () => {
  it("shows the complete nested course path and edits resources inside the map", () => {
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

    expect(screen.getByText("个性化学习路径")).not.toBeNull();
    expect(screen.queryByText("一张图查看主课、互动与个性化拓展")).toBeNull();
    expect(screen.getByText("必经课程")).not.toBeNull();
    expect(screen.getByText("按条件插入")).not.toBeNull();
    expect(screen.getByText("诊断题 1")).not.toBeNull();
    expect(screen.getByText("主题模块 01")).not.toBeNull();
    expect(screen.getByText("步骤 01 · 模块测验")).not.toBeNull();
    expect(screen.queryByText("个性化内容已嵌入")).toBeNull();
    expect(screen.getByText("2/2 已使用")).not.toBeNull();
    expect(screen.getByRole("button", { name: "自动分配" })).not.toBeNull();
    expect(screen.queryByText("资源插入主线")).toBeNull();
    expect(screen.queryByText("课前测题目")).toBeNull();
    expect(screen.queryByText("课前先决知识资源")).toBeNull();
    expect(screen.queryByText("模块后拓展资源")).toBeNull();
    expect(screen.getByText("先决覆盖 1/1")).not.toBeNull();
    expect(screen.getByText("模块覆盖 1/1")).not.toBeNull();
    expect(screen.getAllByText("变量节点小测").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "确认资源方案" })).toBeNull();
    expect(screen.queryByText(/自动保存/)).toBeNull();

    expect(screen.getByLabelText("个性化资源工作台")).not.toBeNull();
    const resourceBlock = screen.getByRole("button", { name: /变量 · 模块拓展/ });
    let draggedId = "";
    const dataTransfer = {
      dropEffect: "none",
      effectAllowed: "all",
      getData: () => draggedId,
      setData: (_type: string, value: string) => { draggedId = value; },
    };
    fireEvent.dragStart(resourceBlock, { dataTransfer });
    const pretestSlot = screen.getByLabelText("资源插入槽：课前诊断之后、主题模块 01 之前");
    fireEvent.dragEnter(pretestSlot, { dataTransfer });
    expect(pretestSlot.className).toContain("border-cyan-600");
    fireEvent.drop(pretestSlot, { dataTransfer });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      branches: expect.arrayContaining([
        expect.objectContaining({
          id: "resource-module-scene-1",
          kind: "prerequisite",
          trigger: expect.objectContaining({ placement: "before-main-course" }),
        }),
      ]),
    }));

    fireEvent.click(resourceBlock);
    expect(document.getElementById("adaptive-resource-resource-module-scene-1")?.hasAttribute("open")).toBe(true);
    expect(screen.getByText("当前资源完整设置")).not.toBeNull();
    expect(screen.getByText("相对主课新增价值（必填）")).not.toBeNull();
    expect(screen.getByText("关联模块测验")).not.toBeNull();

    fireEvent.change(screen.getByDisplayValue("变量 · 模块拓展"), {
      target: { value: "变量 · 新应用" },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "draft" }));

    fireEvent.click(screen.getByRole("button", { name: "自动分配" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      branches: expect.arrayContaining([
        expect.objectContaining({ id: "resource-module-scene-1", enabled: true }),
      ]),
    }));

    fireEvent.dragStart(resourceBlock, { dataTransfer });
    fireEvent.drop(screen.getByLabelText("个性化资源工作台"), { dataTransfer });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      branches: expect.arrayContaining([
        expect.objectContaining({ id: "resource-module-scene-1", enabled: false }),
      ]),
    }));
  });

  it("removes assigned resources from the workbench and restores generated defaults", () => {
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
    const initialPlan = createDefaultAdaptiveLearningPlan({ knowledgePoints: [point], mainScenes });
    function Harness() {
      const [plan, setPlan] = useState(initialPlan);
      return <AdaptiveLearningPlanEditor courseId="course-1" knowledgePoints={[point]} mainScenes={mainScenes} onChange={setPlan} plan={plan} />;
    }
    render(<Harness />);

    const inserted = screen.getByRole("button", { name: /变量 · 模块拓展，已用于本课/ });
    let draggedId = "";
    const dataTransfer = {
      dropEffect: "none",
      effectAllowed: "all",
      getData: () => draggedId,
      setData: (_type: string, value: string) => { draggedId = value; },
    };
    fireEvent.dragStart(inserted, { dataTransfer });
    fireEvent.drop(screen.getByLabelText("个性化资源工作台"), { dataTransfer });

    expect(screen.queryByRole("button", { name: /变量 · 模块拓展，已用于本课/ })).toBeNull();
    expect(screen.getByRole("button", { name: /变量 · 模块拓展，暂未使用/ })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "自动分配" }));
    expect(screen.getByRole("button", { name: /变量 · 模块拓展，已用于本课/ })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /变量 · 模块拓展，暂未使用/ })).toBeNull();
  });
});
