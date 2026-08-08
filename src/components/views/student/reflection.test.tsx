import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STAGES, type Course } from "@/lib/session/types";
import { ReflectionView } from "./reflection";

const mocks = vi.hoisted(() => ({
  buildReflectionEvidencePrompts: vi.fn(),
  upsertAiSupport: vi.fn(),
}));

vi.mock("@/lib/teaching-ai/client-api", () => ({
  buildReflectionEvidencePrompts: mocks.buildReflectionEvidencePrompts,
}));

vi.mock("@/lib/session/store", () => ({
  useSession: () => ({
    user: { role: "student", name: "小林" },
    studentId: "student-1",
    studentName: "小林",
    upsertAiSupport: mocks.upsertAiSupport,
    upsertReflection: vi.fn(),
    updateStudentProgress: vi.fn(),
    addActivity: vi.fn(),
    upsertCompanionConfirmation: vi.fn(() => ({
      id: "confirmation-1",
    })),
    resolveCompanionConfirmation: vi.fn(),
  }),
}));

const generatedDraft = {
  stageKey: "reflection",
  targetType: "student" as const,
  targetId: "student-1",
  studentId: "student-1",
  kind: "reflection-evidence" as const,
  trigger: "进入学习反思",
  inputSummary: "项目过程与评价",
  diagnosis: "需要结合过程证据完成反思。",
  suggestions: ["选择一次关键调整，说明调整前后的变化。", "引用教师反馈，说明你准备怎样改进。"],
  evidence: ["过程记录", "教师反馈"],
  status: "draft" as const,
  source: "llm" as const,
};

beforeEach(() => {
  mocks.buildReflectionEvidencePrompts.mockReset();
  mocks.upsertAiSupport.mockReset();
  mocks.buildReflectionEvidencePrompts.mockResolvedValue(generatedDraft);
  mocks.upsertAiSupport.mockReturnValue({
    ...generatedDraft,
    id: "support-1",
    courseId: "course-1",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  });
});

function makeCourse(): Course {
  const now = "2026-07-28T00:00:00.000Z";
  return {
    id: "course-1",
    name: "评价链路测试",
    subject: "科学",
    grade: "六年级",
    hours: 6,
    summary: "",
    drivingQuestion: "",
    status: "teaching",
    stages: DEFAULT_STAGES,
    currentStageIndex: 5,
    students: [
      {
        id: "student-1",
        name: "小林",
        joinedAt: now,
        stageProgress: {},
      },
    ],
    groups: [
      {
        id: "project-1",
        name: "小林的个人项目",
        topic: "校园环境",
        keywords: [],
        selectedForms: [],
        members: [{ studentId: "student-1", name: "小林" }],
        createdAt: now,
        updatedAt: now,
      },
    ],
    rubricScores: [
      {
        id: "score-1",
        courseId: "course-1",
        groupId: "project-1",
        stageKey: "showcase",
        dimensionScores: { expression: 88 },
        teacherTotal: 88,
        aiDimensionScores: { "证据与迭代": 75 },
        aiTotal: 75,
        aiProcessSummary: "学生对两次方案修改作出了说明。",
        aiProcessEvidence: ["记录-1", "作品-2"],
        finalTotal: 83,
        scoringMode: "hybrid",
        comment: "",
        total: 83,
        status: "submitted",
        createdAt: now,
        updatedAt: now,
      },
    ],
    content: {
      pblOutline: "",
      knowledgePoints: [],
      lessonOutline: [],
      evaluationPlan: { dimensions: [], overallRubric: "" },
    },
    createdAt: now,
    updatedAt: now,
  };
}

describe("ReflectionView evaluation evidence", () => {
  it("separates teacher, AI-process, and combined scores and restores AI evidence", () => {
    render(<ReflectionView course={makeCourse()} />);

    expect(screen.getByText("88")).toBeTruthy();
    expect(screen.getByText("75")).toBeTruthy();
    expect(screen.getByText("83")).toBeTruthy();
    expect(screen.getByText("学生对两次方案修改作出了说明。")).toBeTruthy();
    expect(screen.getByText("依据：记录-1；作品-2")).toBeTruthy();
  });

  it("automatically generates suggestions once when no saved support exists", async () => {
    render(<ReflectionView course={makeCourse()} />);

    await waitFor(() => expect(mocks.buildReflectionEvidencePrompts).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("选择一次关键调整，说明调整前后的变化。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "换一批" })).toBeTruthy();
  });

  it("reuses saved suggestions without generating them again", async () => {
    const course = makeCourse();
    course.aiSupports = [{
      ...generatedDraft,
      id: "saved-support",
      courseId: course.id,
      suggestions: ["这是之前已经生成的建议。"],
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    }];

    render(<ReflectionView course={course} />);

    expect(screen.getByText("这是之前已经生成的建议。")).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.buildReflectionEvidencePrompts).not.toHaveBeenCalled();
  });

  it("generates a new batch when the student requests it", async () => {
    render(<ReflectionView course={makeCourse()} />);
    await screen.findByText("选择一次关键调整，说明调整前后的变化。");

    fireEvent.click(screen.getByRole("button", { name: "换一批" }));

    await waitFor(() => expect(mocks.buildReflectionEvidencePrompts).toHaveBeenCalledTimes(2));
  });
});
