import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import StudentEntryPage from "./page";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
}));
const sessionActions = vi.hoisted(() => ({
  leaveClass: vi.fn<() => Promise<boolean>>(),
}));

const activeCourse = {
  id: "course-1",
  name: "正在进行的项目课堂",
  status: "teaching",
};

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

vi.mock("@/lib/session/store", () => ({
  useHydrated: () => true,
  useSession: () => ({
    joinClass: vi.fn(),
    rejoinClass: vi.fn(),
    user: { role: "student", name: "测试学生" },
    studentName: "测试学生",
    joinedCourseId: activeCourse.id,
    courses: [activeCourse],
    leaveClass: sessionActions.leaveClass,
    getLeftClassHistory: () => [],
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

describe("student rejoin confirmation", () => {
  beforeEach(() => {
    activeCourse.status = "teaching";
    navigation.replace.mockClear();
    sessionActions.leaveClass.mockReset();
    sessionActions.leaveClass.mockResolvedValue(true);
    vi.restoreAllMocks();
  });

  it("does not automatically enter an active classroom after restoring login state", () => {
    render(<StudentEntryPage />);

    expect(screen.getByRole("heading", { name: "检测到上次加入的课堂" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新加入课堂" })).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("enters the classroom only after the student clicks rejoin", () => {
    render(<StudentEntryPage />);

    fireEvent.click(screen.getByRole("button", { name: "重新加入课堂" }));

    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledWith("/student/classroom/course-1");
  });

  it("leaves the old class before clearing only the student login", async () => {
    activeCourse.status = "finished";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    render(<StudentEntryPage />);

    fireEvent.click(screen.getByRole("button", { name: "重新输入邀请码" }));

    await waitFor(() => {
      expect(sessionActions.leaveClass).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
        method: "POST",
        headers: { "X-OpenPBL-Role": "student" },
      });
    });
  });
});
