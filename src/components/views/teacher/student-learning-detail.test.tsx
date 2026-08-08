import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

const sessionMocks = vi.hoisted(() => ({
  addOfflineIntervention: vi.fn(),
  resolveInterventionSignals: vi.fn(),
}));

vi.mock("@/lib/session/store", () => ({ useSession: () => sessionMocks }));

import { StudentLearningDetail } from "./student-learning-detail";

const course: Course = {
  id: "course-1",
  name: "测试课",
  subject: "科学",
  grade: "六年级",
  hours: 2,
  summary: "",
  drivingQuestion: "",
  status: "teaching",
  stages: DEFAULT_STAGES,
  currentStageIndex: 1,
  content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
  students: [{ id: "student-1", name: "张三", joinedAt: "2026-07-11T09:00:00.000Z", stageProgress: {} }],
  learningEvents: [{
    id: "event-1",
    idempotencyKey: "event-1",
    courseId: "course-1",
    studentId: "student-1",
    stageKey: "ai-learning",
    sceneId: "scene-1",
    type: "scene-replay",
    occurredAt: "2026-07-11T10:00:00.000Z",
    content: { sceneIndex: 5, sceneTitle: "图像像素与流程探索", sceneType: "slide" },
  }, {
    id: "event-heartbeat",
    idempotencyKey: "event-heartbeat",
    courseId: "course-1",
    studentId: "student-1",
    stageKey: "ai-learning",
    sceneId: "scene-1",
    type: "heartbeat",
    occurredAt: "2026-07-11T10:00:10.000Z",
  }],
  learningSignals: [{
    id: "signal-1",
    courseId: "course-1",
    studentId: "student-1",
    stageKey: "ai-learning",
    sceneId: "scene-1",
    kind: "student-help-request",
    severity: "high",
    status: "open",
    title: "学生请求帮助",
    summary: "需要教师查看当前学习情况",
    normalizedIssueKey: "help",
    evidenceEventIds: ["event-1"],
    aiInterventionAttempts: 0,
    firstDetectedAt: "2026-07-11T10:00:00.000Z",
    lastDetectedAt: "2026-07-11T10:01:00.000Z",
    content: { sceneIndex: 5, sceneTitle: "图像像素与流程探索", sceneType: "slide" },
  }],
  createdAt: "",
  updatedAt: "",
};

describe("StudentLearningDetail", () => {
  beforeEach(() => {
    sessionMocks.addOfflineIntervention.mockReset();
    sessionMocks.resolveInterventionSignals.mockReset();
  });

  it("merges risks with teacher guidance and removes irrelevant tabs", () => {
    render(<StudentLearningDetail course={course} onOpenChange={vi.fn()} open studentId="student-1" />);

    expect(screen.getByText("风险与教师指导")).toBeTruthy();
    expect(screen.queryByText("AI 对话")).toBeNull();
    expect(screen.queryByText("阶段产物")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    expect(sessionMocks.resolveInterventionSignals).toHaveBeenCalledWith("course-1", ["signal-1"]);
  });

  it("records teacher guidance and resolves the related risk in one action", () => {
    render(<StudentLearningDetail course={course} onOpenChange={vi.fn()} open studentId="student-1" />);
    fireEvent.click(screen.getByRole("button", { name: "已个别辅导" }));

    expect(sessionMocks.addOfflineIntervention).toHaveBeenCalledWith(expect.objectContaining({
      courseId: "course-1",
      kind: "individual-guidance",
      signalIds: ["signal-1"],
      targetStudentIds: ["student-1"],
    }));
    expect(sessionMocks.resolveInterventionSignals).toHaveBeenCalledWith("course-1", ["signal-1"]);
  });

  it("uses Chinese learning event labels and concise locations", () => {
    render(<StudentLearningDetail course={course} onOpenChange={vi.fn()} open studentId="student-1" />);
    fireEvent.click(screen.getByRole("button", { name: "学习轨迹" }));

    expect(screen.getByText("学习动作")).toBeTruthy();
    expect(screen.getByText("重新播放讲解")).toBeTruthy();
    expect(screen.getByText("第 5 页 《图像像素与流程探索》")).toBeTruthy();
    expect(screen.queryByText("持续学习")).toBeNull();
    expect(screen.queryByText("scene-replay")).toBeNull();
  });
});
