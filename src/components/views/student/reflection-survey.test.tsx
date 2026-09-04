import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStagesForSystemMode } from "@/lib/system-mode";
import type { Course, ReflectionSurveyResponseV1 } from "@/lib/session/types";
import { REFLECTION_SURVEY_QUESTIONS } from "@/lib/reflection-survey";
import { NewReflectionStudentView } from "./reflection-survey";

const mocks = vi.hoisted(() => ({
  buildReflectionEvidencePrompts: vi.fn(),
  upsertAiSupport: vi.fn(),
  upsertReflection: vi.fn(),
  updateStudentProgress: vi.fn(),
  markResourceDownloaded: vi.fn(),
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
    upsertReflection: mocks.upsertReflection,
    updateStudentProgress: mocks.updateStudentProgress,
    markResourceDownloaded: mocks.markResourceDownloaded,
  }),
}));

const generatedSupport = {
  stageKey: "reflection",
  targetType: "student" as const,
  targetId: "student-1",
  studentId: "student-1",
  kind: "reflection-evidence" as const,
  trigger: "新版反思提示",
  inputSummary: "课程过程",
  diagnosis: "回顾一个真实变化。",
  suggestions: ["回想一次关键调整。", "回想一次系统使用经历。"],
  evidence: ["过程记录"],
  status: "draft" as const,
  source: "llm" as const,
};

function makeCourse(overrides: Partial<Course> = {}): Course {
  const now = "2026-08-01T00:00:00.000Z";
  return {
    id: "course-1",
    name: "校园减塑",
    subject: "科学",
    grade: "六年级",
    hours: 5,
    summary: "完成个人项目",
    drivingQuestion: "如何改善校园环境？",
    status: "teaching",
    stages: getStagesForSystemMode("new"),
    currentStageIndex: 4,
    students: [{ id: "student-1", name: "小林", joinedAt: now, stageProgress: {} }],
    groups: [{
      id: "project-1",
      name: "小林的个人项目",
      topic: "校园环境",
      keywords: [],
      selectedForms: [],
      members: [{ studentId: "student-1", name: "小林" }],
      createdAt: now,
      updatedAt: now,
    }],
    resources: [],
    content: {
      pblOutline: "",
      knowledgePoints: [],
      lessonOutline: [],
      evaluationPlan: { dimensions: [], overallRubric: "" },
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function fillCompleteSurvey() {
  fireEvent.change(screen.getByLabelText(REFLECTION_SURVEY_QUESTIONS.learningReflection), {
    target: { value: "我用调查数据修改了方案，并发现证据能帮助我做取舍。" },
  });
  fireEvent.change(screen.getByLabelText(REFLECTION_SURVEY_QUESTIONS.systemReflection), {
    target: { value: "AI 的提问很有帮助，资源入口还可以更清楚。" },
  });
  fireEvent.click(screen.getByLabelText(`${REFLECTION_SURVEY_QUESTIONS.aiHelpfulness}：4分，同意`));
  fireEvent.click(screen.getByLabelText(`${REFLECTION_SURVEY_QUESTIONS.systemUsability}：5分，非常同意`));
  fireEvent.click(screen.getByLabelText(`${REFLECTION_SURVEY_QUESTIONS.reuseIntention}：4分，同意`));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildReflectionEvidencePrompts.mockResolvedValue(generatedSupport);
  mocks.upsertAiSupport.mockReturnValue({
    ...generatedSupport,
    id: "support-1",
    courseId: "course-1",
    studentName: "小林",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
});

describe("NewReflectionStudentView", () => {
  it("shows the compact questions, AI prompts, and validates all five answers", async () => {
    render(<NewReflectionStudentView course={makeCourse()} />);

    expect(screen.getByRole("heading", { name: "学习反思" })).toBeTruthy();
    expect(screen.queryByText("回顾这次学习，也回顾系统体验")).toBeNull();
    expect(screen.queryByText("预计 3–5 分钟完成。没有标准答案，请用自己的真实经历回答。")).toBeNull();
    expect(screen.queryByText("姓名、学生编号和回答将对任课教师可见，并用于教学改进与本课程实验分析。")).toBeNull();
    expect(screen.getByText("* 回答将仅用于教学计划改进和本课程实验分析。")).toBeTruthy();
    expect(screen.queryByText("只提供回忆角度，不会替你写答案。")).toBeNull();
    await waitFor(() => expect(mocks.buildReflectionEvidencePrompts).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "student-1", format: "compact" }),
    ));
    expect(screen.getByText("回想一次关键调整。")).toBeTruthy();
    expect((screen.getByRole("button", { name: "提交反思" }) as HTMLButtonElement).disabled).toBe(true);

    fillCompleteSurvey();
    expect((screen.getByRole("button", { name: "提交反思" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("stores a structured response and marks the reflection stage complete", () => {
    render(<NewReflectionStudentView course={makeCourse()} />);
    fillCompleteSurvey();
    fireEvent.click(screen.getByRole("button", { name: "提交反思" }));

    expect(mocks.upsertReflection).toHaveBeenCalledWith(expect.objectContaining({
      studentName: "小林",
      survey: {
        schemaVersion: 1,
        learningReflection: "我用调查数据修改了方案，并发现证据能帮助我做取舍。",
        systemReflection: "AI 的提问很有帮助，资源入口还可以更清楚。",
        aiHelpfulness: 4,
        systemUsability: 5,
        reuseIntention: 4,
      } satisfies ReflectionSurveyResponseV1,
    }));
    expect(mocks.updateStudentProgress).toHaveBeenCalledWith("reflection", 100);
    expect(screen.getByText("已提交，可更新")).toBeTruthy();
  });

  it("keeps the fixed prompts when the AI request fails", async () => {
    mocks.buildReflectionEvidencePrompts.mockRejectedValueOnce(new Error("服务不可用"));
    render(<NewReflectionStudentView course={makeCourse()} />);

    await waitFor(() => expect(screen.getByText("回想一个让你的想法、方案或作品发生变化的具体时刻：你当时做了什么，结果怎样？")).toBeTruthy());
    expect(screen.getByText("回想一次使用系统或 AI 组员的经历：哪一步最有帮助，哪一步最需要调整？")).toBeTruthy();
  });

  it("restores an existing response and disables editing after the course ends", () => {
    const survey: ReflectionSurveyResponseV1 = {
      schemaVersion: 1,
      learningReflection: "已经完成一次方案迭代。",
      systemReflection: "AI 提问很有帮助。",
      aiHelpfulness: 4,
      systemUsability: 3,
      reuseIntention: 5,
    };
    const course = makeCourse({
      status: "finished",
      reflections: [{
        id: "reflection-1",
        courseId: "course-1",
        studentId: "student-1",
        studentName: "小林",
        content: "旧格式兼容文本",
        survey,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:10:00.000Z",
      }],
    });
    render(<NewReflectionStudentView course={course} />);

    expect(screen.getByDisplayValue("已经完成一次方案迭代。")).toBeTruthy();
    expect(screen.getByText("课程已结束，反思内容仅供查看。")).toBeTruthy();
    expect((screen.getByRole("button", { name: "更新并提交" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.buildReflectionEvidencePrompts).not.toHaveBeenCalled();
  });
});
