import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { buildShowcaseArtifactSnapshot, selectMeaningfulShowcaseProcessRecords, ShowcaseView } from "./showcase";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

// Mock useSession to avoid needing the full SessionProvider context.
vi.mock("@/lib/session/store", () => ({
  useSession: () => ({
    user: { role: "student", name: "测试学生" },
    studentId: "s1",
    studentName: "测试学生",
    upsertUpload: vi.fn(() => ({ id: "u1" })),
    upsertSubmission: vi.fn(),
    upsertArtifactSnapshot: vi.fn(),
    addCompanionProcessRecord: vi.fn(),
    setPreviewUpload: vi.fn(),
    updateStudentProgress: vi.fn(),
    addActivity: vi.fn(),
    upsertTeamContribution: vi.fn(),
  }),
}));

describe("showcase material and process contracts", () => {
  it("binds a successful final upload to a showcase artifact snapshot", () => {
    expect(buildShowcaseArtifactSnapshot({
      courseId: "course-1",
      studentId: "s1",
      uploadId: "upload-1",
      title: "最终报告.pdf",
      fileName: "stored-report.pdf",
      fileType: "application/pdf",
      url: "/api/uploads/stored-report.pdf",
      createdAt: "2024-01-02T03:04:05.000Z",
    })).toMatchObject({
      id: "snapshot-upload-1",
      courseId: "course-1",
      studentId: "s1",
      stageKey: "showcase",
      fileName: "stored-report.pdf",
      sourceUrl: "/api/uploads/stored-report.pdf",
    });
  });

  it("keeps real work records and removes per-round agent learning replies", () => {
    const records = selectMeaningfulShowcaseProcessRecords([
      { id: "reply", courseId: "course-1", studentId: "s1", stageKey: "proposal", title: "策策回应了一个学习请求", summary: "逐轮对话", source: "agent", companionId: "cece", createdAt: "2024-01-03T00:00:00.000Z" },
      { id: "operation", courseId: "course-1", studentId: "s1", stageKey: "make", title: "策策提出了方案草稿建议", summary: "等待学生确认", source: "agent", companionId: "cece", taskId: "task-1", createdAt: "2024-01-02T00:00:00.000Z" },
      { id: "upload", courseId: "course-1", studentId: "s1", stageKey: "showcase", title: "上传最终成果", summary: "报告已提交", source: "student", createdAt: "2024-01-04T00:00:00.000Z" },
    ], "s1");

    expect(records.map((record) => record.id)).toEqual(["upload", "operation"]);
  });
});

// Mock dashboard-shell Avatar to keep things simple.
vi.mock("@/components/dashboard-shell", () => ({
  Avatar: ({ name }: { name: string }) => <span>{name}</span>,
}));

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "测试课程",
    subject: "科学",
    grade: "六年级",
    hours: 8,
    summary: "",
    drivingQuestion: "",
    status: "teaching",
    stages: DEFAULT_STAGES,
    currentStageIndex: 5, // showcase stage
    content: {
      pblOutline: "",
      knowledgePoints: [],
      lessonOutline: [],
      evaluationPlan: { dimensions: [], overallRubric: "" },
    },
    students: [
      { id: "s1", name: "测试学生", joinedAt: "2024-01-01T00:00:00.000Z", stageProgress: {} },
    ],
    groups: [
      {
        id: "g1",
        name: "第1组",
        topic: "校园用电",
        keywords: [],
        selectedForms: [],
        members: [{ studentId: "s1", name: "测试学生", role: "组长" }],
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ShowcaseView — 演示计时器", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Helper: find the timer display element by its testid-like content pattern. */
  function getTimerText(): string {
    return screen.getByTestId("presentation-timer").textContent ?? "";
  }

  it("starts at 00:00", () => {
    render(<ShowcaseView course={makeCourse()} />);
    expect(getTimerText()).toContain("00:00");
  });

  it("starts counting when 开始 button is clicked", () => {
    render(<ShowcaseView course={makeCourse()} />);

    act(() => {
      fireEvent.click(screen.getByText("开始彩排"));
    });

    // Advance 3 seconds → timer should show 00:03
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(getTimerText()).toContain("00:03");
  });

  it("pauses when 暂停 button is clicked", () => {
    render(<ShowcaseView course={makeCourse()} />);

    // Start
    act(() => {
      fireEvent.click(screen.getByText("开始彩排"));
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(getTimerText()).toContain("00:02");

    // Pause
    act(() => {
      fireEvent.click(screen.getByText("暂停"));
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Should still show 00:02, not 00:07
    expect(getTimerText()).toContain("00:02");
  });

  it("resets to 00:00 when 重置 button is clicked", () => {
    render(<ShowcaseView course={makeCourse()} />);

    // Start and advance
    act(() => {
      fireEvent.click(screen.getByText("开始彩排"));
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(getTimerText()).toContain("00:05");

    // Reset
    act(() => {
      fireEvent.click(screen.getByText("重置"));
    });
    expect(getTimerText()).toContain("00:00");

    // Timer should not be running after reset
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(getTimerText()).toContain("00:00");
  });
});

describe("ShowcaseView — 成果上传列表显示", () => {
  it("shows a truthful empty state without fixed file slots", () => {
    render(<ShowcaseView course={makeCourse()} />);
    expect(screen.getByText("尚未上传真实成果材料")).toBeTruthy();
    expect(screen.queryByText("研究报告（PDF）")).toBeNull();
    expect(screen.queryByText("汇报演示（PPTX）")).toBeNull();
  });

  it("shows uploaded file name and size when an upload exists", () => {
    const course = makeCourse({
      uploads: [
        {
          id: "u1",
          courseId: "course-1",
          groupId: "g1",
          studentId: "s1",
          studentName: "测试学生",
          stageKey: "showcase",
          category: "artifact",
          title: "研究报告（PDF）",
          fileName: "my-report.pdf",
          fileType: "PDF",
          size: "2.5 MB",
          url: "/api/uploads?file=test.pdf",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });

    render(<ShowcaseView course={course} />);

    expect(screen.getByText("my-report.pdf")).toBeTruthy();
    expect(screen.getByText("2.5 MB")).toBeTruthy();
  });
});
