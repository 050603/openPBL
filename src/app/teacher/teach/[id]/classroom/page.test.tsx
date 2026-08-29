import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClassroomToolPopover, shouldShowClassroomDataSidebar, TimerPanel } from "./classroom-page-parts";
import type { ClassroomTimingSnapshot } from "@/lib/classroom/timing";

const snapshot: ClassroomTimingSnapshot = {
  status: "running",
  coursePlannedSec: 3_600,
  courseElapsedSec: 600,
  courseRemainingSec: 3_000,
  scheduleVarianceSec: -60,
  projectedEndAt: "2026-07-28T02:00:00.000Z",
  activeStage: {
    stageKey: "ai-learning",
    label: "AI 授知",
    status: "active",
    plannedSec: 900,
    elapsedSec: 600,
    remainingSec: 300,
    overrunSec: 0,
    progressPercent: 67,
  },
  stages: [
    {
      stageKey: "launch",
      label: "项目启动",
      status: "completed",
      plannedSec: 300,
      elapsedSec: 240,
      remainingSec: 0,
      overrunSec: 0,
      progressPercent: 100,
    },
    {
      stageKey: "ai-learning",
      label: "AI 授知",
      status: "active",
      plannedSec: 900,
      elapsedSec: 600,
      remainingSec: 300,
      overrunSec: 0,
      progressPercent: 67,
    },
  ],
};

describe("TimerPanel", () => {
  it("shows the active-stage countdown and exposes budget adjustments", () => {
    const onAdjust = vi.fn();
    const onTogglePause = vi.fn();
    const onReset = vi.fn();
    render(
      <TimerPanel
        snapshot={snapshot}
        onAdjust={onAdjust}
        onReset={onReset}
        onTogglePause={onTogglePause}
      />,
    );

    expect(screen.getByText("05:00")).toBeTruthy();
    expect(screen.getByText(/AI 授知 · 阶段剩余/)).toBeTruthy();
    expect(screen.getByText("课程已用 / 计划")).toBeTruthy();
    expect(screen.getByText(/提前 1 分/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "-2 分" }));
    fireEvent.click(screen.getByRole("button", { name: "+2 分" }));
    fireEvent.click(screen.getByRole("button", { name: /暂停/ }));
    fireEvent.click(screen.getByRole("button", { name: /重计/ }));
    expect(onAdjust).toHaveBeenNthCalledWith(1, -120);
    expect(onAdjust).toHaveBeenNthCalledWith(2, 120);
    expect(onTogglePause).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();
  });
});

describe("classroom data sidebar", () => {
  it("stays hidden during showcase and focus mode", () => {
    expect(shouldShowClassroomDataSidebar("showcase", false)).toBe(false);
    expect(shouldShowClassroomDataSidebar("make", true)).toBe(false);
    expect(shouldShowClassroomDataSidebar("make", false)).toBe(true);
  });
});

describe("classroom header tools", () => {
  it("anchors desktop tool content to the triggering button wrapper", () => {
    const { container } = render(<ClassroomToolPopover onClose={vi.fn()}><div>工具内容</div></ClassroomToolPopover>);
    const popover = container.firstElementChild;
    expect(popover?.className).toContain("absolute");
    expect(popover?.className).toContain("top-[calc(100%+12px)]");
    expect(screen.getByText("工具内容")).toBeTruthy();
  });
});
