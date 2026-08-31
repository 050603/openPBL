import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Course } from "@/lib/session/types";
import StudentClassroomPage from "./page";

const runtimeStats = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));
const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "course-1" }),
  useRouter: () => ({ replace: navigation.replace }),
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

vi.mock("@/hooks/use-course-presence", () => ({
  useCoursePresence: () => ({
    members: [{ id: "student-1", role: "student", name: "测试学生" }],
    onlineStudentIds: new Set(["student-1"]),
    onlineCount: 1,
    degraded: false,
    refresh: vi.fn(),
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
  CompanionStudioWorkspace: ({
    teacherProjection,
    onOpenTeacherProjection,
  }: {
    teacherProjection?: { title: string };
    onOpenTeacherProjection?: () => void;
  }) => (
    <section aria-label="companion-workspace">
      AI 伴学场景
      {teacherProjection && onOpenTeacherProjection ? (
        <button
          aria-label={`打开教师演示：${teacherProjection.title}`}
          onClick={onOpenTeacherProjection}
          type="button"
        >
          教师演示
        </button>
      ) : null}
    </section>
  ),
}));
vi.mock("@/components/views/student/evidence-task/stage-workspace", () => ({
  EvidenceStageWorkspace: () => (
    <section aria-label="evidence-task-workspace">阶段任务工作台</section>
  ),
}));
vi.mock("@/components/views/student/stage-mission-hud", () => ({
  StageMissionHud: () => <aside>当前阶段任务条</aside>,
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
    vi.unstubAllEnvs();
    navigation.replace.mockReset();
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

  it("opens the dedicated artifact workspace during new-system project practice", () => {
    vi.stubEnv("NEXT_PUBLIC_OPENPBL_SYSTEM_MODE", "new");
    course.stages = [{
      key: "make",
      label: "项目实践",
      description: "文档或代码协作",
      view: "ai-collaboration",
    }] as Course["stages"];
    course.uiState = {};

    render(<StudentClassroomPage />);

    expect(navigation.replace).toHaveBeenCalledWith("/student/ai-collaboration/course-1");
    expect(screen.getByText("正在进入项目实践协作工作台…")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "companion-workspace" })).toBeNull();
  });

  it("defaults a supported stage to the AI companion scene", () => {
    render(<StudentClassroomPage />);

    expect(
      screen.getByRole("region", { name: "companion-workspace" }),
    ).toBeTruthy();
    expect(screen.queryByRole("region", { name: "evidence-task-workspace" })).toBeNull();
    expect(runtimeStats.mounts).toBe(1);
  });

  it("keeps the companion runtime mounted while an optional projection opens", () => {
    render(<StudentClassroomPage />);

    fireEvent.click(screen.getByRole("button", { name: "打开教师演示：教师示范" }));

    expect(screen.getByText("教师实时投屏")).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "companion-workspace" }),
    ).toBeTruthy();
    expect(runtimeStats.mounts).toBe(1);
    expect(runtimeStats.unmounts).toBe(0);
  });

  it("keeps proposal in the companion scene even when a legacy policy says task-only", () => {
    course.stageWorkspacePolicies = {
      proposal: { access: "task-only", defaultMode: "task" },
    };

    render(<StudentClassroomPage />);

    expect(screen.getByRole("region", { name: "companion-workspace" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "traditional-workspace" })).toBeNull();
    expect(runtimeStats.mounts).toBe(1);
  });

  it("keeps only AI learning on its dedicated task page", () => {
    const stageKey = "ai-learning";
    const stageLabel = "知识学习";
    const view = "ai-learning";
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

  it("keeps project launch on its dedicated project introduction page", () => {
    course.stages = [{
      key: "launch",
      label: "项目启动",
      description: "项目启动",
      view: "project-launch",
    }] as Course["stages"];
    course.stageWorkspacePolicies = {
      launch: { access: "companions-only", defaultMode: "companions" },
    };
    course.uiState = {};

    render(<StudentClassroomPage />);

    expect(screen.getByRole("region", { name: "traditional-workspace" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "companion-workspace" })).toBeNull();
    expect(runtimeStats.mounts).toBe(0);
  });

  it.each([
    ["showcase", "成果汇报", "showcase"],
    ["reflection", "学习反思", "reflection"],
  ])("keeps %s on its dedicated workstation", (stageKey, stageLabel, view) => {
    course.stages = [{ key: stageKey, label: stageLabel, description: stageLabel, view }] as Course["stages"];
    course.stageWorkspacePolicies = {
      [stageKey]: { access: "companions-only", defaultMode: "companions" },
    };
    course.uiState = {};

    render(<StudentClassroomPage />);

    expect(screen.getByRole("region", { name: "traditional-workspace" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "companion-workspace" })).toBeNull();
    expect(runtimeStats.mounts).toBe(0);
  });

  it("keeps the companion scene primary when the teacher allows student choice", () => {
    render(<StudentClassroomPage />);

    expect(
      screen.getByRole("region", { name: "companion-workspace" }),
    ).toBeTruthy();
    expect(screen.queryByRole("region", { name: "traditional-workspace" })).toBeNull();
    expect(screen.queryByRole("region", { name: "evidence-task-workspace" })).toBeNull();
    expect(runtimeStats.unmounts).toBe(0);
  });
});
