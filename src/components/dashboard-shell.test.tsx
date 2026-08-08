import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({
  courses: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/session/store", () => ({
  useSession: () => ({
    activityLog: [],
    courses: sessionMocks.courses,
    lastSavedAt: null,
    retrySave: vi.fn(),
    saveState: "saved",
    setUser: vi.fn(),
    studentName: "学生",
    user: { name: "学生" },
  }),
}));

import { DashboardShell } from "./dashboard-shell";

describe("DashboardShell immersive mode", () => {
  beforeEach(() => {
    sessionMocks.courses = [];
  });
  it("removes permanent product chrome while preserving the learning surface", () => {
    const { container } = render(<DashboardShell immersive role="student"><div>沉浸课堂</div></DashboardShell>);
    expect(screen.getByText("沉浸课堂")).toBeTruthy();
    expect(screen.queryByRole("banner")).toBeNull();
    expect(container.firstElementChild?.className).toContain("h-dvh");
    expect(container.firstElementChild?.className).toContain("overflow-hidden");
    expect(container.querySelector("main")?.className).toContain("h-full");
    expect(container.querySelector("main")?.className).toContain("overflow-hidden");
    expect(container.querySelector("main")?.firstElementChild?.className).toContain("h-full");
  });

  it("keeps normal product chrome outside immersive mode", () => {
    render(<DashboardShell role="student"><div>任务页面</div></DashboardShell>);
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByText("任务页面")).toBeTruthy();
  });

  it("anchors the notification menu to its button and clears the unread badge when opened", () => {
    sessionMocks.courses = [{
      id: "course-1",
      activityLog: [
        { id: "activity-2", actor: "教师", action: "发布公告", createdAt: "2026-08-08T10:00:00.000Z" },
        { id: "activity-1", actor: "学生", action: "提交成果", createdAt: "2026-08-08T09:00:00.000Z" },
      ],
    }];
    render(
      <DashboardShell currentCourse={{ id: "course-1", name: "测试课程", status: "teaching" }} role="teacher">
        <div>课堂</div>
      </DashboardShell>,
    );

    const trigger = screen.getByRole("button", { name: "通知中心" });
    expect(within(trigger).getByText("2")).toBeTruthy();
    fireEvent.click(trigger);

    expect(within(trigger).queryByText("2")).toBeNull();
    expect(screen.getByText(/教师 · 发布公告/)).toBeTruthy();
    expect(screen.getByText("通知中心").closest(".pbl-glass")?.className).toContain("absolute");
  });
});
