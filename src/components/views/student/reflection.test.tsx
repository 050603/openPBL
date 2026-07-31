import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_STAGES, type Course } from "@/lib/session/types";
import { ReflectionView } from "./reflection";

vi.mock("@/lib/session/store", () => ({
  useSession: () => ({
    user: { role: "student", name: "小林" },
    studentId: "student-1",
    studentName: "小林",
    upsertAiSupport: vi.fn(),
    upsertReflection: vi.fn(),
    updateStudentProgress: vi.fn(),
    addActivity: vi.fn(),
    upsertCompanionConfirmation: vi.fn(() => ({
      id: "confirmation-1",
    })),
    resolveCompanionConfirmation: vi.fn(),
  }),
}));

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
});
