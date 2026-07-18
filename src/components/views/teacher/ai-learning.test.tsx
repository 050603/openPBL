import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

vi.mock("@/lib/session/store", () => ({ useSession: () => ({ addOfflineIntervention: vi.fn() }) }));
vi.mock("./ai-learning-preview", () => ({ AiLearningTeacherPreview: () => <button>预览学生 AI 课程</button> }));

import { AiLearningTeacherView } from "./ai-learning";

const course: Course = {
  id: "course-1", name: "测试课", subject: "科学", grade: "六年级", hours: 2, summary: "", drivingQuestion: "", status: "teaching",
  stages: DEFAULT_STAGES, currentStageIndex: 1,
  content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
  students: [{ id: "student-1", name: "张三", joinedAt: "2026-07-11T09:00:00.000Z", stageProgress: {} }],
  aiLearningClassroomId: "classroom-1",
  learningEvents: [{ id: "e1", idempotencyKey: "e1", courseId: "course-1", studentId: "student-1", stageKey: "ai-learning", sceneId: "scene-1", type: "heartbeat", occurredAt: "2026-07-11T10:00:00.000Z", durationMs: 190_000, expectedDurationSec: 120, visible: true }],
  learningSignals: [{ id: "s1", courseId: "course-1", studentId: "student-1", stageKey: "ai-learning", sceneId: "scene-1", kind: "dwell-overrun", severity: "high", status: "open", title: "停留过久", summary: "需要巡视", normalizedIssueKey: "dwell", evidenceEventIds: ["e1"], aiInterventionAttempts: 2, firstDetectedAt: "2026-07-11T10:00:00.000Z", lastDetectedAt: "2026-07-11T10:01:00.000Z" }],
  classCommonIssues: [], createdAt: "2026-07-11T09:00:00.000Z", updatedAt: "2026-07-11T10:00:00.000Z",
};

describe("AiLearningTeacherView", () => {
  it("shows evidence-based metrics and removes duplicate status cards", () => {
    render(<AiLearningTeacherView course={course} />);
    expect(screen.getByText("容忍时长偏差")).toBeTruthy();
    expect(screen.getByText("重复学习学生")).toBeTruthy();
    expect(screen.getByText("未解决风险")).toBeTruthy();
    expect(screen.getByText("暂无风险")).toBeTruthy();
    expect(screen.queryByText("AI 课堂状态")).toBeNull();
    expect(screen.queryByText("有学习记录的学生")).toBeNull();
  });
});
