import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import StudentEntryPage from "./page";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
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
    getLeftClassHistory: () => [],
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

describe("student classroom entry", () => {
  beforeEach(() => {
    activeCourse.status = "teaching";
    navigation.replace.mockClear();
    vi.restoreAllMocks();
  });

  it("shows the original invite-code form together with an available classroom card", () => {
    render(<StudentEntryPage />);

    expect(screen.getByText("可返回的课堂")).toBeTruthy();
    expect(screen.getByRole("heading", { name: activeCourse.name })).toBeTruthy();
    expect(screen.getByRole("button", { name: "返回课堂" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "加入课堂" })).toBeTruthy();
    expect(screen.getByLabelText("邀请码")).toBeTruthy();
    expect(screen.getByLabelText("姓名")).toBeTruthy();
    expect(screen.queryByText("暂不加入，返回首页")).toBeNull();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("returns to the classroom only after the student clicks the classroom card action", () => {
    render(<StudentEntryPage />);

    fireEvent.click(screen.getByRole("button", { name: "返回课堂" }));

    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledWith("/student/classroom/course-1");
  });

  it("keeps the invite-code entry available when the restored classroom has ended", () => {
    activeCourse.status = "finished";
    render(<StudentEntryPage />);

    expect(screen.queryByText("可返回的课堂")).toBeNull();
    expect(screen.getByRole("heading", { name: "加入课堂" })).toBeTruthy();
    expect(screen.getByLabelText("邀请码")).toBeTruthy();
  });
});
