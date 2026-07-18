import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/store", () => ({
  useSession: () => ({
    activityLog: [],
    courses: [],
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
  it("removes permanent product chrome while preserving the learning surface", () => {
    render(<DashboardShell immersive role="student"><div>沉浸课堂</div></DashboardShell>);
    expect(screen.getByText("沉浸课堂")).toBeTruthy();
    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("keeps normal product chrome outside immersive mode", () => {
    render(<DashboardShell role="student"><div>任务页面</div></DashboardShell>);
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByText("任务页面")).toBeTruthy();
  });
});
