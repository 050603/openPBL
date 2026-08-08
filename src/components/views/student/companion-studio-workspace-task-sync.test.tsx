import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

const mocks = vi.hoisted(() => ({
  runtime: { current: null as unknown },
  pixiProps: { current: null as unknown },
  upsertCompanionTask: vi.fn(),
  setAutoInterventionsPaused: vi.fn(),
}));

vi.mock("@/components/openmaic-bridge/student-stage-host", () => ({
  StudentStageHost: () => <div>微课播放器</div>,
}));
vi.mock("./companion-studio-pixi-stage", () => ({
  default: (props: unknown) => {
    mocks.pixiProps.current = props;
    return <div>伴学场景</div>;
  },
}));
vi.mock("./studio-project-workbench", () => ({
  StudioProjectWorkbench: () => (
    <div>
      项目工作台
      <input aria-label="同步草稿" defaultValue="" />
    </div>
  ),
}));
vi.mock("./companion-runtime", () => ({
  useCompanionRuntime: () => mocks.runtime.current,
}));
vi.mock("@/lib/session/store", () => ({
  useSession: () => ({
    studentId: "student-1",
    studentName: "张三",
    user: { name: "张三" },
    upsertCompanionTask: mocks.upsertCompanionTask,
    upsertCompanionConfirmation: vi.fn(),
    addCompanionProcessRecord: vi.fn(),
  }),
}));

import { CompanionStudioWorkspace } from "./companion-studio-workspace";

const course: Course = {
  id: "course-1",
  name: "桥梁项目",
  subject: "科学",
  grade: "六年级",
  hours: 6,
  summary: "",
  drivingQuestion: "如何设计一座稳定的桥？",
  status: "teaching",
  stages: DEFAULT_STAGES,
  currentStageIndex: 2,
  content: {
    pblOutline: "",
    knowledgePoints: [],
    lessonOutline: [],
    evaluationPlan: { dimensions: [], overallRubric: "" },
  },
  students: [{
    id: "student-1",
    name: "张三",
    joinedAt: "2026-07-28T00:00:00.000Z",
    stageProgress: {},
  }],
  companionTasks: [{
    id: "task-1",
    courseId: "course-1",
    studentId: "student-1",
    stageKey: "proposal",
    kind: "knowledge",
    title: "请知知处理",
    request: "为什么拱形结构更稳定？",
    status: "assigned",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  }],
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};

function runtime(progress?: number) {
  return {
    stageKey: "proposal",
    contextLabel: "方案构思",
    stageEnabled: true,
    available: [{ id: "knowledge" }],
    messages: [],
    input: "",
    setInput: vi.fn(),
    phase: "idle",
    currentSpeaker: null,
    generatingCompanionId: null,
    streamingText: "",
    error: null,
    unreadCount: 0,
    selectedCompanionId: null,
    setSelectedCompanionId: vi.fn(),
    isActive: false,
    send: vi.fn(() => new Promise<boolean>(() => undefined)),
    stop: vi.fn(),
    markRead: vi.fn(),
    tts: {
      enabled: false,
      speaking: false,
      busy: false,
      currentTTS: null,
      preparingCompanionId: null,
      toggle: vi.fn(),
    },
    lastCompletedRound: null,
    microLessonTask: progress === undefined
      ? null
      : {
          taskId: "task-1",
          lesson: {
            id: "lesson-1",
            stageKey: "proposal",
            topic: "拱形结构",
            decision: "systematic-lesson",
            rationale: "需要解释受力原理",
            status: "generating",
            createdAt: "2026-07-28T00:00:00.000Z",
          },
          progress,
          message: "正在制作",
        },
    completeMicroLesson: vi.fn(),
    dismissMicroLessonTask: vi.fn(),
    setAutoInterventionsPaused: mocks.setAutoInterventionsPaused,
  };
}

describe("CompanionStudioWorkspace micro-lesson task sync", () => {
  beforeEach(() => {
    mocks.upsertCompanionTask.mockReset();
    mocks.setAutoInterventionsPaused.mockReset();
    mocks.upsertCompanionTask.mockImplementation((input) => ({
      ...input,
      id: "task-1",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    }));
    mocks.runtime.current = runtime();
    mocks.pixiProps.current = null;
  });

  it("does not keep Zhizhi physically working because of a stale persisted task", () => {
    const staleTaskCourse: Course = {
      ...course,
      companionTasks: course.companionTasks?.map((task) => ({
        ...task,
        companionId: "knowledge",
        status: "responding",
      })),
    };
    render(
      <CompanionStudioWorkspace contextLabel="方案构思" course={staleTaskCourse} stageKey="proposal" />,
    );

    const props = mocks.pixiProps.current as {
      agentStates: { zhizhi: { state: string } };
    };
    expect(props.agentStates.zhizhi.state).toBe("idle");
  });

  it("does not dispatch the same generating transition again when progress rerenders with a stale task snapshot", async () => {
    const view = render(
      <CompanionStudioWorkspace contextLabel="方案构思" course={course} stageKey="proposal" />,
    );

    fireEvent.change(screen.getByLabelText("给伴学伙伴的任务"), {
      target: { value: "为什么拱形结构更稳定？" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(mocks.upsertCompanionTask).toHaveBeenCalledTimes(1));

    mocks.runtime.current = runtime(5);
    view.rerender(
      <CompanionStudioWorkspace contextLabel="方案构思" course={course} stageKey="proposal" />,
    );
    await waitFor(() => expect(mocks.upsertCompanionTask).toHaveBeenCalledTimes(2));

    mocks.runtime.current = runtime(55);
    view.rerender(
      <CompanionStudioWorkspace contextLabel="方案构思" course={course} stageKey="proposal" />,
    );

    await waitFor(() => expect(mocks.upsertCompanionTask).toHaveBeenCalledTimes(2));
  });

  it("keeps the main composer draft and shows the runtime error when sending fails", async () => {
    const rejectedRuntime = {
      ...runtime(),
      send: vi.fn().mockResolvedValue(false),
      error: "伴学服务暂时出错，请稍后重试；你的输入仍会保留。",
    };
    mocks.runtime.current = rejectedRuntime;

    const view = render(
      <CompanionStudioWorkspace contextLabel="方案构思" course={course} stageKey="proposal" />,
    );
    const input = view.container.querySelector<HTMLInputElement>(".studio-composer input");
    const form = view.container.querySelector<HTMLFormElement>(".studio-composer");
    expect(input).not.toBeNull();
    expect(form).not.toBeNull();

    fireEvent.change(input!, { target: { value: "请检查我的方案" } });
    fireEvent.submit(form!);

    await waitFor(() => expect(rejectedRuntime.send).toHaveBeenCalledTimes(1));
    expect(input!.value).toBe("请检查我的方案");
    expect(screen.getByRole("alert").textContent).toContain("你的输入仍会保留");
  });

  it("switches one mounted whiteboard between docked and fullscreen modes", () => {
    render(
      <CompanionStudioWorkspace contextLabel="方案构思" course={course} stageKey="proposal" />,
    );

    expect(screen.getByText("伴学场景")).toBeTruthy();
    expect(screen.queryByText("项目工作台")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "前往当前阶段任务" }));

    expect(screen.getByRole("complementary", { name: "项目白板" })).toBeTruthy();
    expect(screen.getByText("项目工作台")).toBeTruthy();
    expect(screen.getByText("伴学场景")).toBeTruthy();
    expect(mocks.pixiProps.current).toMatchObject({ paused: false });
    fireEvent.change(screen.getByRole("textbox", { name: "同步草稿" }), {
      target: { value: "保留这份未保存草稿" },
    });

    fireEvent.click(screen.getByRole("button", { name: "全屏显示项目白板" }));
    expect(screen.getByRole("dialog", { name: "项目白板" })).toBeTruthy();
    expect(mocks.pixiProps.current).toMatchObject({ paused: true });
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "同步草稿" }).value)
      .toBe("保留这份未保存草稿");
    expect(mocks.setAutoInterventionsPaused).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "缩小到侧边栏" }));
    expect(screen.getByRole("complementary", { name: "项目白板" })).toBeTruthy();
    expect(mocks.pixiProps.current).toMatchObject({ paused: false });
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "同步草稿" }).value)
      .toBe("保留这份未保存草稿");
    expect(mocks.setAutoInterventionsPaused).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "关闭项目白板" }));
    expect(screen.queryByText("项目工作台")).toBeNull();
    expect(screen.getByText("伴学场景")).toBeTruthy();
    expect(mocks.pixiProps.current).toMatchObject({ paused: false });
  });

  it("pauses only scene-covering workbenches, not the fullscreen companion scene", () => {
    render(
      <CompanionStudioWorkspace contextLabel="方案构思" course={course} stageKey="proposal" />,
    );

    expect(mocks.pixiProps.current).toMatchObject({ paused: false });
    expect(mocks.setAutoInterventionsPaused).toHaveBeenLastCalledWith(false);

    const pixiProps = mocks.pixiProps.current as {
      onSelectStudyZone: (zoneId: "library") => void;
    };
    act(() => pixiProps.onSelectStudyZone("library"));

    expect(screen.getByRole("dialog", { name: "资料角" })).toBeTruthy();
    expect(mocks.pixiProps.current).toMatchObject({ paused: true });
    expect(mocks.setAutoInterventionsPaused).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(mocks.pixiProps.current).toMatchObject({ paused: false });
    expect(mocks.setAutoInterventionsPaused).toHaveBeenLastCalledWith(false);
  });
});
