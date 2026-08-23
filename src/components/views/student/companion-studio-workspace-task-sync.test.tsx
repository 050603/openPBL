import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

const mocks = vi.hoisted(() => ({
  runtime: { current: null as unknown },
  pixiProps: { current: null as unknown },
  upsertCompanionTask: vi.fn(),
  upsertLearningEvidence: vi.fn(),
  upsertCompanionConfirmation: vi.fn(),
  addCompanionProcessRecord: vi.fn(),
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
  StudioProjectWorkbench: ({ layoutMode }: { layoutMode?: string }) => (
    <div data-workbench-layout={layoutMode}>
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
    upsertCompanionConfirmation: mocks.upsertCompanionConfirmation,
    addCompanionProcessRecord: mocks.addCompanionProcessRecord,
    upsertLearningEvidence: mocks.upsertLearningEvidence,
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
    mocks.upsertLearningEvidence.mockReset();
    mocks.upsertCompanionConfirmation.mockReset();
    mocks.addCompanionProcessRecord.mockReset();
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

  it("does not turn voice preparation into a companion work animation", () => {
    mocks.runtime.current = {
      ...runtime(),
      tts: {
        ...runtime().tts,
        busy: true,
        preparingCompanionId: "knowledge",
      },
    };
    render(
      <CompanionStudioWorkspace contextLabel="方案构思" course={course} stageKey="proposal" />,
    );

    const props = mocks.pixiProps.current as {
      agentStates: { zhizhi: { state: string } };
    };
    expect(props.agentStates.zhizhi.state).toBe("idle");
  });

  it("still uses the dedicated work animation for real agent generation", () => {
    mocks.runtime.current = {
      ...runtime(),
      generatingCompanionId: "knowledge",
    };
    render(
      <CompanionStudioWorkspace contextLabel="方案构思" course={course} stageKey="proposal" />,
    );

    const props = mocks.pixiProps.current as {
      agentStates: { zhizhi: { state: string } };
    };
    expect(props.agentStates.zhizhi.state).toBe("working");
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

  it("applies a completed AI workspace edit immediately and records an undo journal", async () => {
    const initialRuntime = {
      ...runtime(),
      send: vi.fn(() => new Promise<boolean>(() => undefined)),
    };
    mocks.runtime.current = initialRuntime;
    const view = render(
      <CompanionStudioWorkspace contextLabel="方案构思" course={course} stageKey="proposal" />,
    );

    fireEvent.change(screen.getByLabelText("给伴学伙伴的任务"), {
      target: { value: "请把样本不足补充到方案风险里" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(mocks.upsertCompanionTask).toHaveBeenCalledTimes(1));

    mocks.runtime.current = {
      ...runtime(),
      lastCompletedRound: {
        taskId: "task-1",
        text: "我已经补充了样本风险。",
        companionIds: ["knowledge"],
        workspacePatches: [{
          companionId: "knowledge",
          taskId: "task-1",
          mode: "append",
          target: "proposal.risks",
          title: "补充样本风险",
          content: "样本数量不足",
          reviewInstruction: "核对是否符合真实情况",
        }],
      },
    };
    view.rerender(
      <CompanionStudioWorkspace contextLabel="方案构思" course={course} stageKey="proposal" />,
    );

    await waitFor(() => expect(mocks.upsertLearningEvidence).toHaveBeenCalledTimes(1));
    expect(mocks.upsertLearningEvidence.mock.calls[0]?.[0]).toMatchObject({
      kind: "plan-version",
      status: "draft",
      source: "system",
      payload: { risks: ["样本数量不足"] },
    });
    expect(mocks.upsertCompanionConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      action: "edit-workspace",
      status: "confirmed",
      payload: expect.objectContaining({
        kind: "direct-workspace-edit",
        target: "proposal.risks",
        beforeValue: [],
        afterValue: ["样本数量不足"],
      }),
    }));
    expect(mocks.addCompanionProcessRecord).toHaveBeenCalledWith(expect.objectContaining({
      title: "知知已编辑“风险与应对”",
    }));
  });

  it("shows stage guidance and lets students edit a proposal prompt before sending", () => {
    const proposalRuntime = {
      ...runtime(),
      send: vi.fn().mockResolvedValue(true),
    };
    mocks.runtime.current = proposalRuntime;

    render(
      <CompanionStudioWorkspace contextLabel="方案构思" course={course} stageKey="proposal" />,
    );

    const guide = screen.getByRole("complementary", { name: "当前阶段指引" });
    expect(guide.parentElement?.classList.contains("studio-command-card")).toBe(true);
    expect(guide.parentElement?.querySelector('[aria-label="伴学场景工具"]')).toBeTruthy();
    expect(guide.textContent).toContain("把方向变成一份可实施、可验证的方案");
    expect(guide.textContent).toContain("打开方案工作台");

    fireEvent.click(screen.getByRole("button", { name: "填入快捷提问：帮我比较两个方案方向" }));

    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "给伴学伙伴的任务" }).value)
      .toBe("帮我比较两个方案方向");
    expect(proposalRuntime.send).not.toHaveBeenCalled();
  });

  it("changes the guidance and quick prompts for project practice", () => {
    const makeCourse: Course = {
      ...course,
      currentStageIndex: 3,
      companionTasks: [],
    };
    mocks.runtime.current = { ...runtime(), stageKey: "make", contextLabel: "项目实践" };

    render(
      <CompanionStudioWorkspace contextLabel="项目实践" course={makeCourse} stageKey="make" />,
    );

    const guide = screen.getByRole("complementary", { name: "当前阶段指引" });
    expect(guide.textContent).toContain("完成作品、保留版本，并根据测试持续迭代");
    expect(screen.getByRole("button", { name: "填入快捷提问：帮我设计一个可执行的测试" }))
      .toBeTruthy();
  });

  it("maps the dynamic badge to visible unread partner replies and marks them read", () => {
    const markRead = vi.fn();
    mocks.runtime.current = {
      ...runtime(),
      unreadCount: 2,
      markRead,
      messages: [
        { role: "assistant", companionId: "knowledge", content: "先确认桥梁承受的主要荷载。", ts: "2026-07-28T00:01:00.000Z" },
        { role: "assistant", companionId: "knowledge", content: "还可以比较不同结构的受力路径。", ts: "2026-07-28T00:02:00.000Z" },
      ],
    };

    render(
      <CompanionStudioWorkspace contextLabel="方案构思" course={course} stageKey="proposal" />,
    );

    expect(screen.getByLabelText("2 条未读伙伴回复")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看动态，2 条未读伙伴回复" }));
    expect(screen.getByRole("heading", { name: "项目动态" })).toBeTruthy();
    expect(screen.getByText("已显示并标记 2 条新伙伴回复")).toBeTruthy();
    expect(screen.getAllByText("新回复")).toHaveLength(2);
    expect(screen.getByText("先确认桥梁承受的主要荷载。")).toBeTruthy();
    expect(markRead).toHaveBeenCalledOnce();
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
    expect(screen.getByText("项目工作台").getAttribute("data-workbench-layout")).toBe("sidebar");
    expect(mocks.pixiProps.current).toMatchObject({ paused: false });
    fireEvent.change(screen.getByRole("textbox", { name: "同步草稿" }), {
      target: { value: "保留这份未保存草稿" },
    });

    fireEvent.click(screen.getByRole("button", { name: "全屏显示项目白板" }));
    expect(screen.getByRole("dialog", { name: "项目白板" })).toBeTruthy();
    expect(screen.getByText("项目工作台").getAttribute("data-workbench-layout")).toBe("fullscreen");
    expect(mocks.pixiProps.current).toMatchObject({ paused: true });
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "同步草稿" }).value)
      .toBe("保留这份未保存草稿");
    expect(mocks.setAutoInterventionsPaused).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "缩小到侧边栏" }));
    expect(screen.getByRole("complementary", { name: "项目白板" })).toBeTruthy();
    expect(mocks.pixiProps.current).toMatchObject({ paused: false });

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

    expect(screen.getByRole("dialog", { name: "项目白板" })).toBeTruthy();
    expect(mocks.pixiProps.current).toMatchObject({ paused: true });
    expect(mocks.setAutoInterventionsPaused).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getAllByRole("button", { name: "关闭项目白板" })[1]);
    expect(mocks.pixiProps.current).toMatchObject({ paused: false });
    expect(mocks.setAutoInterventionsPaused).toHaveBeenLastCalledWith(false);
  });
});
