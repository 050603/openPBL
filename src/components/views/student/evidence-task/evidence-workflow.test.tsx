import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";
import { LaunchEvidenceTask } from "./launch-task";
import { MakeEvidenceTask } from "./make-task";
import { ProposalEvidenceTask } from "./proposal-task";
import { EvidenceTaskFocusProvider, EvidenceTimeline } from "./shared";
import { AiDecisionInbox } from "./ai-decision-inbox";
import { StageMissionHud } from "../stage-mission-hud";
import { StudioProjectWorkbench } from "../studio-project-workbench";
import type { CompanionRuntimeContextValue } from "../companion-runtime";

const session = vi.hoisted(() => ({
  studentId: "student-1",
  studentName: "小林",
  user: { name: "小林" },
  upsertLearningEvidence: vi.fn(),
  upsertArtifactSnapshot: vi.fn(),
  upsertAiContribution: vi.fn(),
  recordStudentAiDecision: vi.fn(),
  resolveCompanionConfirmation: vi.fn(),
  addCompanionProcessRecord: vi.fn(),
  requestTeacherHelp: vi.fn(),
}));

vi.mock("@/lib/session/store", () => ({
  useSession: () => session,
}));

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "证据课堂",
    subject: "科学",
    grade: "初二",
    hours: 8,
    summary: "校园节水",
    drivingQuestion: "如何减少校园用水浪费？",
    status: "teaching",
    stages: DEFAULT_STAGES,
    currentStageIndex: 0,
    content: {
      pblOutline: "",
      knowledgePoints: [],
      lessonOutline: [],
      evaluationPlan: { dimensions: [], overallRubric: "" },
    },
    students: [{
      id: "student-1",
      name: "小林",
      joinedAt: "2026-07-31T00:00:00.000Z",
      stageProgress: {},
    }],
    groups: [{
      id: "grp-student-1",
      name: "小林的个人项目",
      topic: "待确定选题方向",
      keywords: [],
      selectedForms: [],
      members: [{ studentId: "student-1", name: "小林" }],
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    }],
    learningEvidence: [],
    artifactSnapshots: [],
    aiContributions: [],
    studentAiDecisions: [],
    aiAssessmentSuggestions: [],
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

describe("evidence-driven student workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows readable stage and evidence names instead of internal enums", () => {
    render(
      <EvidenceTimeline
        items={[{ id: "evidence-1", title: "方案 v1", kind: "plan-version", stageKey: "proposal" }]}
        onToggle={vi.fn()}
        selectedIds={[]}
      />,
    );

    expect(screen.getByText("方案构思与校准 · 项目方案版本")).toBeTruthy();
    expect(screen.queryByText(/plan-version|proposal/)).toBeNull();
  });

  it("auto-saves ordinary edits and only submits structurally complete evidence", () => {
    vi.useFakeTimers();
    render(<LaunchEvidenceTask course={makeCourse()} studentId="student-1" />);

    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    expect(screen.getByRole("alert").textContent).toContain("请先补全");
    expect(session.upsertLearningEvidence).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("你关注什么问题？"), {
      target: { value: "饮水机旁经常浪费水" },
    });
    fireEvent.change(screen.getByLabelText("这个问题主要影响谁？"), {
      target: { value: "全校学生" },
    });
    fireEvent.change(screen.getByLabelText("为什么值得解决？"), {
      target: { value: "浪费资源并造成地面积水" },
    });
    fireEvent.change(screen.getByLabelText("怎样才算有所改善？"), {
      target: { value: "一周内积水次数下降" },
    });
    fireEvent.change(screen.getByLabelText("你想亲自追究的项目问题"), {
      target: { value: "怎样用提示设计减少浪费？" },
    });

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(session.upsertLearningEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "project-intent", status: "draft" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    expect(session.upsertLearningEvidence).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "project-intent", status: "submitted" }),
    );
  });

  it("shows launch readiness from resources and topic choice without teacher calibration", () => {
    const course = makeCourse({
      learningEvidence: [{
        id: "intent-1",
        schemaVersion: 1,
        courseId: "course-1",
        studentId: "student-1",
        stageKey: "launch",
        kind: "project-intent",
        title: "项目立意",
        summary: "校园节水",
        payload: {
          concern: "浪费水",
          affectedPeople: "学生",
          importance: "节约资源",
          successIndicator: "浪费次数下降",
          personalQuestion: "怎样减少浪费？",
        },
        status: "submitted",
        source: "student",
        countsTowardReadiness: true,
        evidenceRefs: [],
        artifactSnapshotIds: [],
        createdAt: "2026-07-31T00:00:00.000Z",
        updatedAt: "2026-07-31T00:00:00.000Z",
      }],
    });
    render(
      <StageMissionHud
        course={course}
        stageKey="launch"
        studentId="student-1"
      />,
    );
    expect(screen.getByText("未开始")).toBeTruthy();
    expect(screen.getByText("了解课程并选择研究方向")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "请求教师帮助" }));
    expect(session.requestTeacherHelp).toHaveBeenCalledWith("course-1", "launch");
  });

  it("renders the single focused proposal card inside the project whiteboard", () => {
    render(
      <EvidenceTaskFocusProvider actionId="core-plan">
        <ProposalEvidenceTask course={makeCourse()} studentId="student-1" />
      </EvidenceTaskFocusProvider>,
    );

    expect(screen.queryByRole("heading", { name: "形成你的项目方案" })).toBeNull();
    expect(screen.getByRole("textbox", { name: /方案目标与构想/ })).toBeTruthy();
  });

  it("shows one proposal task without policy slogans or stacked forms", () => {
    render(<StudioProjectWorkbench course={makeCourse()} stageKey="proposal" />);

    expect(screen.getByRole("heading", { name: "阶段三 · 方案构思与校准" })).toBeTruthy();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByText("本阶段任务")).toBeNull();
    expect(screen.queryByText("只按有效证据判断状态")).toBeNull();
    expect(screen.queryByText("元数据文件需学生摘录或标注")).toBeNull();
    expect(screen.queryByText("AI建议必须由学生决定")).toBeNull();
    expect(screen.getByRole("heading", { name: "项目方案" })).toBeTruthy();
    expect(screen.queryByText("方案工作区")).toBeNull();
    expect(screen.queryByText("当前任务")).toBeNull();

  });

  it("keeps unsaved shared-editor text mounted while checking the archive", () => {
    render(<StudioProjectWorkbench course={makeCourse()} stageKey="proposal" />);
    const concept = screen.getByRole<HTMLTextAreaElement>("textbox", { name: /方案目标与构想/ });
    fireEvent.change(concept, { target: { value: "保留这段尚未自动保存的方案" } });
    fireEvent.click(screen.getByRole("button", { name: /过程档案/ }));
    fireEvent.click(screen.getByRole("button", { name: "项目方案" }));
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: /方案目标与构想/ }).value)
      .toBe("保留这段尚未自动保存的方案");
  });

  it("shows a simple AI work-result panel for the proposal and routes the task to one role", async () => {
    const onAskCompanion = vi.fn().mockResolvedValue(true);
    const runtime = {
      available: [{ id: "critic" }],
      messages: [],
      isActive: false,
      generatingCompanionId: null,
      currentSpeaker: null,
      streamingText: "",
      error: null,
    } as unknown as CompanionRuntimeContextValue;

    render(
      <StudioProjectWorkbench
        course={makeCourse()}
        onAskCompanion={onAskCompanion}
        runtime={runtime}
        stageKey="proposal"
      />,
    );

    expect(screen.getByRole("complementary", { name: "AI工作结果" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "协作编辑" })).toBeNull();
    expect(screen.queryByLabelText("选择要编辑的内容块")).toBeNull();
    expect(screen.queryByText("根据项目方案提供文本协助")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "希望AI帮你做什么" }), {
      target: { value: "帮我检查这个概念有没有真正转化成约束" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送工作任务" }));

    await waitFor(() => expect(onAskCompanion).toHaveBeenCalledWith(
      expect.stringMatching(/只输出纯文本工作结果，不生成工作台补丁/),
      ["critic"],
    ));
  });

  it("adds a proposal result only to the position chosen by the student", () => {
    const runtime = {
      available: [{ id: "critic" }],
      messages: [{
        role: "assistant",
        companionId: "critic",
        content: "完成第一版\n邀请同学试用\n根据观察修改",
        ts: "2026-08-23T12:00:00.000Z",
      }],
      isActive: false,
      generatingCompanionId: null,
      currentSpeaker: null,
      streamingText: "",
      error: null,
    } as unknown as CompanionRuntimeContextValue;

    render(
      <StudioProjectWorkbench
        course={makeCourse()}
        onAskCompanion={vi.fn().mockResolvedValue(true)}
        runtime={runtime}
        stageKey="proposal"
      />,
    );

    const concept = screen.getByRole<HTMLTextAreaElement>("textbox", { name: /方案目标与构想/ });
    const actions = screen.getByRole<HTMLTextAreaElement>("textbox", { name: /主要实施步骤/ });
    expect(concept.value).toBe("");
    expect(actions.value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "步骤" }));
    fireEvent.click(screen.getByRole("button", { name: /加入方案/ }));

    expect(concept.value).toBe("");
    expect(actions.value).toContain("邀请同学试用");
    expect(session.addCompanionProcessRecord).toHaveBeenCalledWith(expect.objectContaining({
      title: "将 AI 工作结果加入项目方案",
    }));
  });

  it("keeps the making stage to one student work draft", () => {
    render(
      <EvidenceTaskFocusProvider actionId="test-result">
        <MakeEvidenceTask
          course={makeCourse()}
          focusActionId="test-result"
          studentId="student-1"
        />
      </EvidenceTaskFocusProvider>,
    );

    expect(screen.getByRole("textbox", { name: "作品工作稿" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /保存本次进展/ })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /测试对象与方法/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /我观察到的事实/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "本次修改说明" })).toBeNull();
  });

  it("presents project submission as a clear student-facing version task", () => {
    render(
      <EvidenceTaskFocusProvider actionId="project-work">
        <MakeEvidenceTask
          course={makeCourse()}
          focusActionId="project-work"
          studentId="student-1"
        />
      </EvidenceTaskFocusProvider>,
    );

    expect(screen.getByRole("heading", { name: "作品工作稿" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "记录进展，继续完成你的作品" })).toBeNull();
    expect(screen.getByRole("heading", { name: "提交作品" })).toBeTruthy();
    expect(screen.getByText("作品版本")).toBeTruthy();
    expect(screen.getByRole("button", { name: /选择作品文件/ })).toBeTruthy();
    expect(screen.getByText("文件只用于成果归档，新版本不会覆盖之前的作品。")).toBeTruthy();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByText("保存一个可回看的作品版本")).toBeNull();
    expect(screen.queryByText(/当前只处理这一项/)).toBeNull();
    expect(screen.queryByText("我的作品进展")).toBeNull();
    expect(screen.queryByText("过程记录")).toBeNull();
    expect(screen.queryByText("作品提交")).toBeNull();
  });

  it("uses a simple text-result AI panel for the making stage", async () => {
    const onAskCompanion = vi.fn().mockResolvedValue(true);
    const runtime = {
      available: [{ id: "critic" }],
      messages: [],
      isActive: false,
      generatingCompanionId: null,
      currentSpeaker: null,
      streamingText: "",
      error: null,
    } as unknown as CompanionRuntimeContextValue;

    render(
      <StudioProjectWorkbench
        course={makeCourse()}
        onAskCompanion={onAskCompanion}
        runtime={runtime}
        stageKey="make"
      />,
    );

    expect(screen.getByRole("complementary", { name: "AI工作结果" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "协作编辑" })).toBeNull();
    expect(screen.queryByLabelText("选择要编辑的内容块")).toBeNull();
    expect(screen.queryByText("记录进展并提交作品")).toBeNull();
    expect(screen.queryByText("根据作品工作稿提供文本协助")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "希望AI帮你做什么" }), {
      target: { value: "把这段进展整理成三页PPT大纲" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送工作任务" }));

    await waitFor(() => expect(onAskCompanion).toHaveBeenCalledWith(
      expect.stringMatching(/只输出纯文本工作结果，不生成工作台补丁/),
      ["critic"],
    ));
  });

  it("keeps the resource library available while students make their work", () => {
    const runtime = {
      available: [{ id: "knowledge" }, { id: "critic" }],
      messages: [],
      isActive: false,
      generatingCompanionId: null,
      currentSpeaker: null,
      streamingText: "",
      error: null,
    } as unknown as CompanionRuntimeContextValue;

    render(
      <StudioProjectWorkbench
        course={makeCourse()}
        onAskCompanion={vi.fn().mockResolvedValue(true)}
        runtime={runtime}
        stageKey="make"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "资料角" }));
    expect(screen.getAllByRole("heading", { name: "资料角" })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "检索资料" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "这个制作问题需要哪些知识？" })).toBeTruthy();
  });

  it("adds an AI text result to the single making work draft only after student action", () => {
    const runtime = {
      available: [{ id: "critic" }],
      messages: [{
        role: "assistant",
        companionId: "critic",
        content: "建议把当前进展整理为目标、变化和下一步三部分。",
        ts: "2026-08-23T12:00:00.000Z",
      }],
      isActive: false,
      generatingCompanionId: null,
      currentSpeaker: null,
      streamingText: "",
      error: null,
    } as unknown as CompanionRuntimeContextValue;

    render(
      <StudioProjectWorkbench
        course={makeCourse()}
        onAskCompanion={vi.fn().mockResolvedValue(true)}
        runtime={runtime}
        stageKey="make"
      />,
    );

    const workDraft = screen.getByRole("textbox", { name: "作品工作稿" }) as HTMLTextAreaElement;
    expect(workDraft.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /加入工作稿/ }));
    expect(workDraft.value).toContain("建议把当前进展整理为目标、变化和下一步三部分。");
    expect(session.addCompanionProcessRecord).toHaveBeenCalledWith(expect.objectContaining({
      title: "将 AI 工作结果加入作品工作稿",
    }));
  });

  it("uses the narrow sidebar layout with AI results closed until requested", () => {
    const runtime = {
      available: [{ id: "critic" }],
      messages: [],
      isActive: false,
      generatingCompanionId: null,
      currentSpeaker: null,
      streamingText: "",
      error: null,
    } as unknown as CompanionRuntimeContextValue;
    const view = render(
      <StudioProjectWorkbench
        course={makeCourse()}
        layoutMode="sidebar"
        onAskCompanion={vi.fn().mockResolvedValue(true)}
        runtime={runtime}
        stageKey="proposal"
      />,
    );

    expect(view.container.querySelector('.studio-workbench[data-layout="sidebar"]')).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "AI伴学协作" })).toBeNull();
    expect(screen.getByRole("button", { name: "打开AI工作结果" }).getAttribute("aria-expanded"))
      .toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "打开AI工作结果" }));
    expect(screen.getByRole("complementary", { name: "AI工作结果" })).toBeTruthy();
  });

  it("shows applied AI edits in the process archive and restores only the edited field", () => {
    const evidenceId = "evidence-course-1-student-1-plan-version";
    const course = makeCourse({
      learningEvidence: [{
        id: evidenceId,
        schemaVersion: 1,
        courseId: "course-1",
        studentId: "student-1",
        stageKey: "proposal",
        kind: "plan-version",
        title: "项目方案 v1",
        summary: "样本数量不足",
        payload: {
          versionLabel: "v1",
          changeSummary: "制作节水提示器",
          nextActions: ["制作原型"],
          validationMethod: "用户测试",
          risks: ["样本数量不足"],
          aiBoundary: "AI 只整理资料",
        },
        status: "draft",
        source: "system",
        countsTowardReadiness: true,
        evidenceRefs: [],
        artifactSnapshotIds: [],
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:01.000Z",
      }],
      companionConfirmations: [{
        id: "workspace-edit-task-1-proposal.risks",
        courseId: "course-1",
        studentId: "student-1",
        stageKey: "proposal",
        action: "edit-workspace",
        title: "问问编辑了风险与应对",
        summary: "补充样本风险。请核对真实情况。",
        taskId: "task-1",
        status: "confirmed",
        createdAt: "2026-08-13T00:00:01.000Z",
        resolvedAt: "2026-08-13T00:00:01.000Z",
        payload: {
          kind: "direct-workspace-edit",
          operationId: "workspace-edit-task-1-proposal.risks",
          evidenceId,
          evidenceKind: "plan-version",
          target: "proposal.risks",
          payloadKey: "risks",
          label: "风险与应对",
          mode: "append",
          beforeValue: [],
          afterValue: ["样本数量不足"],
          afterUpdatedAt: "2026-08-13T00:00:01.000Z",
          companionId: "critic",
          taskId: "task-1",
          reviewInstruction: "请核对真实情况",
        },
      }],
    });

    render(<StudioProjectWorkbench course={course} stageKey="proposal" />);
    expect(screen.getByText("问问参与过")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /过程档案/ }));
    expect(screen.getAllByRole("heading", { name: "过程档案" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "撤销这次编辑" }));

    expect(session.upsertLearningEvidence).toHaveBeenCalledWith(expect.objectContaining({
      id: evidenceId,
      payload: expect.objectContaining({ risks: [] }),
    }));
    expect(session.resolveCompanionConfirmation).toHaveBeenCalledWith(
      "course-1",
      "workspace-edit-task-1-proposal.risks",
      "rejected",
    );
    expect(session.addCompanionProcessRecord).toHaveBeenCalledWith(expect.objectContaining({
      title: "撤销了 AI 对“风险与应对”的编辑",
    }));
  });

  it("requires an actual later evidence version before adopting an AI suggestion", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const course = makeCourse({
      learningEvidence: [{
        id: "plan-v2",
        schemaVersion: 1,
        courseId: "course-1",
        studentId: "student-1",
        stageKey: "proposal",
        kind: "plan-version",
        title: "方案 v2",
        summary: "已经缩小测试范围",
        payload: {
          versionLabel: "v2",
          nextActions: ["制作样例"],
          validationMethod: "两个班级测试",
          risks: ["保护隐私"],
          aiBoundary: "AI只检查遗漏",
        },
        status: "draft",
        source: "student",
        countsTowardReadiness: true,
        evidenceRefs: [],
        artifactSnapshotIds: [],
        createdAt: "2026-07-31T10:00:00.000Z",
        updatedAt: "2026-07-31T10:10:00.000Z",
      }],
      aiContributions: [{
        id: "contribution-1",
        courseId: "course-1",
        studentId: "student-1",
        stageKey: "proposal",
        companionId: "planner",
        impact: "high",
        request: "检查我的方案",
        suggestion: "建议缩小测试范围",
        sourceEvidenceIds: ["plan-v1"],
        proposedChange: "调整测试范围",
        status: "pending-decision",
        createdAt: "2026-07-31T10:05:00.000Z",
      }],
    });
    render(
      <AiDecisionInbox
        course={course}
        stageKey="proposal"
        studentId="student-1"
      />,
    );
    expect(screen.getByText("策策 · 待决定")).toBeTruthy();
    expect(screen.queryByText(/planner/)).toBeNull();
    fireEvent.change(screen.getByLabelText("我的理由（任何决定都必填）"), {
      target: { value: "真实课堂时间只够测试两个班级" },
    });
    fireEvent.change(
      screen.getByLabelText("已实际发生的版本变化（采纳或修改后采纳时必填）"),
      { target: { value: "把四个班级改成两个班级" } },
    );
    fireEvent.change(screen.getByLabelText("关联修改后的证据版本"), {
      target: { value: "plan-v2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "采纳" }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(session.recordStudentAiDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        contributionId: "contribution-1",
        decision: "adopted",
        resultingEvidenceIds: ["plan-v2"],
      }),
    );
    expect(session.upsertLearningEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "ai-decision",
        countsTowardReadiness: false,
      }),
    );
  });
});
