import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Course } from "@/lib/session/types";
import StudentClassroomPage from "./page";

const runtimeStats = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "course-1" }),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/lib/session/store", () => ({
  useCourse: () => course,
  useHydrated: () => true,
  useSession: () => ({
    user: { name: "学生" },
    studentName: "测试学生",
    studentId: "student-1",
    joinedCourseId: "course-1",
  }),
}));

vi.mock("@/components/dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/student-leave-button", () => ({ StudentLeaveButton: () => <button type="button">离开</button> }));
vi.mock("@/components/classroom/classroom-chrome", () => ({ StageProgress: () => <div>阶段进度</div> }));
vi.mock("@/components/openmaic-bridge/teacher-stage-resources", () => ({
  StudentProjectedTeacherResource: () => <div>教师实时投屏</div>,
}));
vi.mock("@/components/views/student/stage-dispatcher", () => ({
  StudentStageView: () => <input aria-label="项目草稿" defaultValue="" />,
}));
vi.mock("@/components/views/student/companion-studio-workspace", () => ({
  CompanionStudioWorkspace: ({ onSwitchToTask, canSwitchMode = true }: { onSwitchToTask: () => void; canSwitchMode?: boolean }) => (
    <div>沉浸伴学课堂{canSwitchMode ? <button onClick={onSwitchToTask} type="button">切换任务</button> : null}</div>
  ),
}));
vi.mock("@/components/views/student/companion-runtime", async () => {
  const React = await import("react");
  return {
    CompanionRuntimeProvider: ({ children }: { children: ReactNode }) => {
      React.useEffect(() => {
        runtimeStats.mounts += 1;
        return () => { runtimeStats.unmounts += 1; };
      }, []);
      return <div data-testid="shared-runtime">{children}</div>;
    },
  };
});
vi.mock("@/components/ui", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pill: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  PrimaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

const course = {
  id: "course-1",
  name: "沉浸课堂测试",
  status: "teaching",
  currentStageIndex: 0,
  stages: [{ key: "proposal", label: "方案构思与校准", description: "形成方案", view: "proposal-review" }],
  students: [{ id: "student-1", name: "测试学生", online: true, lastSeenAt: new Date().toISOString(), stageProgress: { proposal: 20 } }],
  uiState: {
    teacherResourceProjection: {
      classroomId: "classroom-1",
      sceneId: "scene-1",
      stageKey: "proposal",
      title: "教师示范",
      sceneType: "slide",
      startedAt: new Date().toISOString(),
      mode: "optional",
    },
  },
} as unknown as Course;

describe("student classroom presentation continuity", () => {
  beforeEach(() => {
    runtimeStats.mounts = 0;
    runtimeStats.unmounts = 0;
    window.sessionStorage.clear();
    course.stageWorkspacePolicies = undefined;
  });

  it("keeps the shared runtime and both workspace surfaces mounted through mode and projection changes", () => {
    render(<StudentClassroomPage />);

    expect(screen.getByText("沉浸伴学课堂")).toBeTruthy();
    expect(runtimeStats.mounts).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "切换任务" }));
    const draft = screen.getByRole("textbox", { name: "项目草稿" }) as HTMLInputElement;
    fireEvent.change(draft, { target: { value: "尚未保存的学生草稿" } });

    fireEvent.click(screen.getByRole("button", { name: /返回伴学教室/ }));
    fireEvent.click(screen.getByRole("button", { name: /查看投屏/ }));

    expect(screen.getByText("教师实时投屏")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "项目草稿", hidden: true }) as HTMLInputElement).value).toBe("尚未保存的学生草稿");
    expect(runtimeStats.mounts).toBe(1);
    expect(runtimeStats.unmounts).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: /收起投屏/ }));
    fireEvent.click(screen.getByRole("button", { name: "切换任务" }));
    expect((screen.getByRole("textbox", { name: "项目草稿" }) as HTMLInputElement).value).toBe("尚未保存的学生草稿");
  });

  it("enforces a teacher-selected task-only policy without unmounting the companion surface", () => {
    course.stageWorkspacePolicies = {
      proposal: { access: "task-only", defaultMode: "task" },
    };
    render(<StudentClassroomPage />);

    expect(screen.getByRole("textbox", { name: "项目草稿" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "切换任务" })).toBeNull();
    expect(screen.getByText("沉浸伴学课堂")).toBeTruthy();
    expect(runtimeStats.mounts).toBe(1);
    expect(runtimeStats.unmounts).toBe(0);
  });
});
