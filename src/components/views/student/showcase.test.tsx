import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ShowcaseView } from "./showcase";
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
    setPreviewUpload: vi.fn(),
    updateStudentProgress: vi.fn(),
    addActivity: vi.fn(),
    upsertTeamContribution: vi.fn(),
  }),
}));

// Mock visuals to keep the test lightweight.
vi.mock("@/components/visuals", () => ({
  EvidenceStrip: () => <div data-testid="evidence-strip" />,
  SlidePreview: () => <div data-testid="slide-preview" />,
}));

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
      fireEvent.click(screen.getByText("开始"));
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
      fireEvent.click(screen.getByText("开始"));
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
      fireEvent.click(screen.getByText("开始"));
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
  it("shows 尚未上传 when no upload exists for a slot", () => {
    render(<ShowcaseView course={makeCourse()} />);
    expect(screen.getAllByText("尚未上传").length).toBeGreaterThan(0);
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
