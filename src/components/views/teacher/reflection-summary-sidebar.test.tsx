import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSupportRecord, Course, ReflectionSurveyResponseV1 } from "@/lib/session/types";
import { ReflectionSummarySidebar } from "./reflection-summary-sidebar";

const mocks = vi.hoisted(() => ({
  buildSummary: vi.fn(),
}));

vi.mock("@/lib/teaching-ai/client-api", () => ({
  buildReflectionClassSummary: mocks.buildSummary,
}));

const survey: ReflectionSurveyResponseV1 = {
  schemaVersion: 1,
  learningReflection: "我学会了比较证据，但整理资料时遇到了困难。",
  systemReflection: "AI 帮助我归纳资料，希望下次任务要求更清楚。",
  aiHelpfulness: 4,
  systemUsability: 4,
  reuseIntention: 5,
};

function makeCourse(withReflection: boolean): Course {
  return {
    id: "course-one-student",
    name: "单人测试课",
    subject: "综合实践",
    grade: "七年级",
    hours: 1,
    summary: "",
    drivingQuestion: "",
    status: "teaching",
    stages: [{ key: "reflection", label: "学习反思", view: "reflection-survey", description: "" }],
    currentStageIndex: 0,
    content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: {} },
    students: [{ id: "student-1", name: "小明" }],
    reflections: withReflection ? [{
      id: "reflection-1",
      courseId: "course-one-student",
      studentId: "student-1",
      studentName: "小明",
      content: "学习反思",
      survey,
      createdAt: "2026-09-05T12:00:00.000Z",
      updatedAt: "2026-09-05T12:00:00.000Z",
    }] : [],
  } as unknown as Course;
}

describe("ReflectionSummarySidebar", () => {
  beforeEach(() => {
    mocks.buildSummary.mockReset();
    mocks.buildSummary.mockResolvedValue({
      id: "summary-1",
      courseId: "course-one-student",
      targetType: "course",
      targetId: "course-one-student",
      stageKey: "reflection",
      kind: "reflection-class-summary",
      structuredPayload: {},
      updatedAt: "2026-09-05T12:01:00.000Z",
    } as unknown as AiSupportRecord);
  });

  it("automatically generates the 100% summary when the only student submits", async () => {
    const { rerender } = render(<ReflectionSummarySidebar course={makeCourse(false)} />);
    expect(mocks.buildSummary).not.toHaveBeenCalled();

    rerender(<ReflectionSummarySidebar course={makeCourse(true)} />);

    await waitFor(() => expect(mocks.buildSummary).toHaveBeenCalledWith("course-one-student", "threshold"));
  });
});
