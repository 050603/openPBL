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
    connectWebSocket: vi.fn(),
    disconnectWebSocket: vi.fn(),
    realtimeMode: "polling",
  }),
}));

vi.mock("@/components/dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/components/student-leave-button", () => ({
  StudentLeaveButton: () => <button type="button">离开</button>,
}));
vi.mock("@/components/openmaic-bridge/teacher-stage-resources", () => ({
  StudentProjectedTeacherResource: () => <div>教师实时投屏</div>,
}));
vi.mock("@/components/views/student/stage-dispatcher", () => ({
  StudentStageView: () => (
    <section aria-label="traditional-workspace">传统学习页面</section>
  ),
}));
vi.mock("@/components/views/student/companion-studio-workspace", () => ({
  CompanionStudioWorkspace: () => (
    <section aria-label="companion-workspace">AI 伴学场景</section>
  ),
}));
vi.mock("@/components/views/student/companion-runtime", async () => {
  const React = await import("react");
  return {
    CompanionRuntimeProvider: ({ children }: { children: ReactNode }) => {
      React.useEffect(() => {
        runtimeStats.mounts += 1;
        return () => {
          runtimeStats.unmounts += 1;
        };
      }, []);
      return <div data-testid="shared-runtime">{children}</div>;
    },
  };
});
vi.mock("@/components/ui", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pill: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  PrimaryButton: ({
    children,
    variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => {
    void variant;
    return <button {...props}>{children}</button>;
  },
}));

const proposalStage = {
  key: "proposal",
  label: "方案构思与校准",
  description: "形成方案",
  view: "proposal-review",
};
const course = {
  id: "course-1",
  name: "课堂模式测试",
  status: "teaching",
  currentStageIndex: 0,
  stages: [proposalStage],
  students: [
    {
      id: "student-1",
      name: "测试学生",
      online: true,
      lastSeenAt: new Date().toISOString(),
      stageProgress: { proposal: 20 },
    },
  ],
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

describe("student classroom workspace policy", () => {
  beforeEach(() => {
    runtimeStats.mounts = 0;
    runtimeStats.unmounts = 0;
    window.sessionStorage.clear();
    course.stages = [proposalStage] as Course["stages"];
    course.currentStageIndex = 0;
    course.stageWorkspacePolicies = undefined;
    course.uiState = {
      teacherResourceProjection: {
        classroomId: "classroom-1",
        sceneId: "scene-1",
        stageKey: "proposal",
        title: "教师示范",
        sceneType: "slide",
        startedAt: new Date().toISOString(),
        mode: "optional",
      },
    };
  });

  it("defaults a supported stage to the AI companion scene", () => {
    render(<StudentClassroomPage />);

    expect(
      screen.getByRole("region", { name: "companion-workspace" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "切换到传统学习页面" }),
    ).toBeTruthy();
    expect(runtimeStats.mounts).toBe(1);
  });

  it("keeps the companion runtime mounted while an optional projection opens", () => {
    render(<StudentClassroomPage />);

    fireEvent.click(screen.getByRole("button", { name: "查看投屏" }));

    expect(screen.getByText("教师实时投屏")).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "companion-workspace" }),
    ).toBeTruthy();
    expect(runtimeStats.mounts).toBe(1);
    expect(runtimeStats.unmounts).toBe(0);
  });

  it("renders only the traditional page when the teacher enforces task-only", () => {
    course.stageWorkspacePolicies = {
      proposal: { access: "task-only", defaultMode: "task" },
    };

    render(<StudentClassroomPage />);

    expect(
      screen.getByRole("region", { name: "traditional-workspace" }),
    ).toBeTruthy();
    expect(screen.queryByRole("region", { name: "companion-workspace" }))
      .toBeNull();
    expect(runtimeStats.mounts).toBe(0);
  });

  it.each([
    ["launch", "项目启动", "project-launch"],
    ["ai-learning", "知识学习", "ai-learning"],
  ])("keeps %s on the traditional page even if legacy data enables companions", (
    stageKey,
    stageLabel,
    view,
  ) => {
    course.stages = [
      {
        key: stageKey,
        label: stageLabel,
        description: stageLabel,
        view,
      },
    ] as Course["stages"];
    course.stageWorkspacePolicies = {
      [stageKey]: {
        access: "companions-only",
        defaultMode: "companions",
      },
    };
    course.uiState = {};

    render(<StudentClassroomPage />);

    expect(
      screen.getByRole("region", { name: "traditional-workspace" }),
    ).toBeTruthy();
    expect(screen.queryByRole("region", { name: "companion-workspace" }))
      .toBeNull();
    expect(
      screen.queryByRole("button", { name: "进入 AI 伴学场景" }),
    ).toBeNull();
    expect(runtimeStats.mounts).toBe(0);
  });

  it("allows the student to switch only when the teacher selects student-choice", () => {
    render(<StudentClassroomPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "切换到传统学习页面" }),
    );

    expect(
      screen.getByRole("region", { name: "traditional-workspace" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "进入 AI 伴学场景" }),
    ).toBeTruthy();
    expect(runtimeStats.unmounts).toBe(1);
  });
});
