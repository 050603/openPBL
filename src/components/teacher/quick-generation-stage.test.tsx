import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CourseDesignGenerationArtifact } from "@/lib/session/types";
import { QuickGenerationStage } from "./quick-generation-stage";

const outlineArtifact: CourseDesignGenerationArtifact = {
  id: "course-outline",
  kind: "pages",
  eyebrow: "主课脚本 · 页面与资源",
  title: "课程大纲",
  summary: "按课程阶段排列，可在卡片内滚动预览。",
  accent: "blue",
  items: [
    { label: "launch", value: "认识项目任务", meta: "教师资源 · 5 分钟" },
    { label: "ai-learning", value: "理解核心概念", meta: "学生页面 · 6 分钟" },
    { label: "ai-learning", value: "判断典型案例", meta: "互动页面 · 5 分钟" },
    { label: "proposal", value: "形成初步方案", meta: "学生页面 · 8 分钟" },
    { label: "make", value: "制作项目成果", meta: "学生页面 · 20 分钟" },
  ],
};

afterEach(() => vi.useRealTimers());

describe("QuickGenerationStage", () => {
  it("renders one scrollable course outline card with timing and flowing progress", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:01:05.000Z"));
    const onReview = vi.fn();
    render(
      <QuickGenerationStage
        artifacts={[outlineArtifact]}
        backgroundEnabled
        brief="设计一节项目课"
        cancelling={false}
        completed={false}
        confirmCancel={false}
        message="正在等待教师审阅课程大纲"
        onCancel={vi.fn()}
        onOpenCourse={vi.fn()}
        onReview={onReview}
        paused={false}
        progress={80}
        remainingLabel="预计还需约 3 分钟"
        reviewAvailable
        startedAt="2026-08-10T10:00:00.000Z"
      />,
    );

    expect(screen.getByRole("heading", { name: "课程大纲" })).toBeTruthy();
    expect(screen.getByText("项目启动")).toBeTruthy();
    expect(screen.getByText("AI 授知")).toBeTruthy();
    expect(screen.getByText("已用时 1 分 05 秒")).toBeTruthy();
    expect(screen.getByText("预计还需约 3 分钟")).toBeTruthy();
    expect(screen.getByTestId("quick-generation-progress-flow")).toBeTruthy();
    expect(screen.getByTestId("quick-generation-card-scroll").className).toContain("overflow-y-auto");

    fireEvent.click(screen.getByRole("button", { name: /查看详细大纲/ }));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("shows concrete evaluation dimensions with the same 40/60 evaluator split", () => {
    render(
      <QuickGenerationStage
        artifacts={[{
          id: "evaluation-dimensions",
          kind: "rubric",
          eyebrow: "成功标准 · 正在审校",
          title: "作品评价标准",
          summary: "正在核对可观察的评价依据。",
          accent: "green",
          items: [
            { label: "24%", value: "概念理解", meta: "能准确解释 AI 误判的原因。", evaluator: "ai" },
            { label: "30%", value: "证据质量", meta: "案例来源可靠且经过事实核验。", evaluator: "teacher" },
            { label: "30%", value: "成果表达", meta: "结构完整、表达清楚。", evaluator: "teacher" },
            { label: "16%", value: "反思改进", meta: "说明修改依据与使用边界。", evaluator: "ai" },
          ],
        }]}
        backgroundEnabled
        brief="设计 AI 项目课"
        cancelling={false}
        completed={false}
        confirmCancel={false}
        message="正在审校评价标准"
        onCancel={vi.fn()}
        onOpenCourse={vi.fn()}
        onReview={vi.fn()}
        paused={false}
        progress={42}
        remainingLabel="预计还需约 18 分钟"
        reviewAvailable={false}
        startedAt={null}
      />,
    );

    expect(screen.getByText("概念理解")).toBeTruthy();
    expect(screen.getByText("证据质量")).toBeTruthy();
    expect(screen.getByText("成果表达")).toBeTruthy();
    expect(screen.getByText("反思改进")).toBeTruthy();
    expect(screen.getByTestId("rubric-evaluation-ring")).toBeTruthy();
    expect(screen.getAllByText(/教师评/)).toHaveLength(3);
    expect(screen.getAllByText(/AI 评/)).toHaveLength(3);
    expect(screen.getByText(/教师评\s*60%/)).toBeTruthy();
    expect(screen.getByText(/AI 评\s*40%/)).toBeTruthy();
  });

  it("switches to the live adaptive-resource card and never falls back after artifacts shrink", () => {
    const { rerender } = render(
      <QuickGenerationStage
        activeArtifactId="course-outline"
        artifacts={[outlineArtifact]}
        backgroundEnabled
        brief="设计一节项目课"
        cancelling={false}
        completed={false}
        confirmCancel={false}
        message="正在制作课堂页面"
        onCancel={vi.fn()}
        onOpenCourse={vi.fn()}
        onReview={vi.fn()}
        paused={false}
        progress={94}
        remainingLabel="预计还需约 2 分钟"
        reviewAvailable={false}
        startedAt={null}
      />,
    );

    const adaptiveArtifact: CourseDesignGenerationArtifact = {
      id: "classroom-adaptive-resources",
      kind: "branches",
      eyebrow: "课堂内容生成 · 分层学习资源",
      title: "诊断补缺与达标拓展",
      summary: "正在生成分层学习资源：模块拓展（已完成 8 / 12）",
      accent: "violet",
      items: [{ label: "当前资源", value: "如何选择合适的学习方法 · 模块拓展" }],
    };
    rerender(
      <QuickGenerationStage
        activeArtifactId="classroom-adaptive-resources"
        artifacts={[adaptiveArtifact]}
        backgroundEnabled
        brief="设计一节项目课"
        cancelling={false}
        completed={false}
        confirmCancel={false}
        message="正在生成分层学习资源"
        onCancel={vi.fn()}
        onOpenCourse={vi.fn()}
        onReview={vi.fn()}
        paused={false}
        progress={97}
        remainingLabel="预计还需约 1 分钟"
        reviewAvailable={false}
        startedAt={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "诊断补缺与达标拓展" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "拆解教师输入" })).toBeNull();
  });

  it("shows an explicit recoverable failure instead of pretending generation is still running", () => {
    const onRetry = vi.fn();
    render(
      <QuickGenerationStage
        artifacts={[outlineArtifact]}
        backgroundEnabled
        brief="设计一节项目课"
        cancelling={false}
        completed={false}
        confirmCancel={false}
        failed
        failureMessage="已完成 15 / 16 个课堂页面，最后一页生成超时。"
        message="课程生成未完成"
        onCancel={vi.fn()}
        onOpenCourse={vi.fn()}
        onRetry={onRetry}
        onReview={vi.fn()}
        paused={false}
        progress={86}
        remainingLabel="已完成页面均已保存，可从断点继续"
        reviewAvailable={false}
        startedAt="2026-08-10T10:00:00.000Z"
      />,
    );

    expect(screen.getAllByText("课程生成未完成").length).toBeGreaterThan(0);
    expect(screen.getByText(/已完成 15 \/ 16/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /从已完成页面继续/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
