import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { TeacherStageDashboard } from "./teacher-stage-dashboard";

function makeCourse(): Course {
  return {
    id: "course-1",
    name: "测试课",
    subject: "综合实践",
    grade: "七年级",
    hours: 2,
    summary: "",
    drivingQuestion: "",
    status: "teaching",
    stages: [
      { key: "launch", label: "项目启动", view: "simple-resource", description: "" },
      { key: "ai-learning", label: "知识讲授", view: "ai-learning", description: "" },
      { key: "make", label: "项目实践", view: "ai-collaboration", description: "" },
      { key: "showcase", label: "成果汇报与评价", view: "showcase-reporting", description: "" },
      { key: "reflection", label: "学习反思", view: "reflection-survey", description: "" },
    ],
    currentStageIndex: 0,
    content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: {} },
    students: [{ id: "s1", name: "小明" }],
    resources: [{ id: "r1", title: "项目说明", type: "PDF", size: "1 MB", stageKey: "launch", downloadedBy: [] }],
  } as unknown as Course;
}

describe("TeacherStageDashboard", () => {
  it("keeps a compact stage indicator and launch-level follow-up", () => {
    const onFocus = vi.fn();
    const onSelectStage = vi.fn();
    render(<TeacherStageDashboard course={makeCourse()} degraded={false} onCollapse={vi.fn()} onFocus={onFocus} onSelectStage={onSelectStage} stageKey="launch" />);
    expect(screen.getByText("课堂实时监控")).toBeTruthy();
    expect(screen.getByText("项目启动")).toBeTruthy();
    expect(screen.getByText("启动")).toBeTruthy();
    expect(screen.queryByText("轮询")).toBeNull();
    const knowledgeStage = screen.getByRole("button", { name: "第 2 阶段：知识讲授" });
    expect(knowledgeStage.textContent).toBe("2讲授");
    fireEvent.click(knowledgeStage);
    expect(onSelectStage).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "查看小明的关注证据" }));
    expect(onFocus).toHaveBeenCalledWith(expect.objectContaining({ stageKey: "launch", studentId: "s1", status: "not-opened" }));
  });

  it("changes the decision model by stage and reports degraded sync honestly", () => {
    render(<TeacherStageDashboard course={makeCourse()} degraded onCollapse={vi.fn()} onFocus={vi.fn()} onSelectStage={vi.fn()} stageKey="reflection" />);
    expect(screen.getByText("同步延迟")).toBeTruthy();
    expect(screen.getByText("反思提交进度")).toBeTruthy();
    expect(screen.getByText("需要跟进")).toBeTruthy();
    expect(screen.getByText("AI 实时教学建议")).toBeTruthy();
  });

  it("shows knowledge states as clearly labelled count cards", () => {
    render(<TeacherStageDashboard course={makeCourse()} degraded={false} onCollapse={vi.fn()} onFocus={vi.fn()} onSelectStage={vi.fn()} stageKey="ai-learning" />);
    const section = screen.getByText("全班学习状态").closest("section");
    expect(section?.textContent).toContain("未开始");
    expect(section?.textContent).toContain("1人");
    expect(section?.textContent).toContain("100%");
  });

  it.each([
    ["launch", "优先巡场"],
    ["ai-learning", "优先巡场"],
    ["make", "优先巡场"],
    ["showcase", "现场关注"],
    ["reflection", "个别跟进"],
  ])("provides stage-aware teaching actions for %s", (stageKey, attentionTitle) => {
    render(<TeacherStageDashboard course={makeCourse()} degraded={false} onCollapse={vi.fn()} onFocus={vi.fn()} onSelectStage={vi.fn()} stageKey={stageKey} />);
    expect(screen.getByText("AI 实时教学建议")).toBeTruthy();
    expect(screen.getByText(attentionTitle)).toBeTruthy();
  });
});
