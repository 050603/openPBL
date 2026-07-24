import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

vi.mock("@/lib/session/store", () => ({ useSession: () => ({ addOfflineIntervention: vi.fn() }) }));
vi.mock("./ai-learning-preview", () => ({ AiLearningTeacherPreview: () => <button>预览学生 AI 课程</button> }));

import { adaptiveResponseStatus, AiLearningTeacherView, computeAiLearningProgress } from "./ai-learning";

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
  it("uses completed scenes for visible in-stage progress", () => {
    expect(computeAiLearningProgress({
      classroomId: "classroom-1",
      studentId: "student-1",
      currentSceneIndex: 0,
      totalScenes: 4,
      completedScenes: ["scene-1"],
      completionModelVersion: 2,
      masteryLevel: "in-progress",
      lastActiveAt: "2026-07-11T10:00:00.000Z",
    })).toBe(25);
  });

  it("shows evidence-based metrics and removes duplicate status cards", () => {
    render(<AiLearningTeacherView course={course} />);
    expect(screen.getByText("容忍时长偏差")).toBeTruthy();
    expect(screen.getByText("重复学习学生")).toBeTruthy();
    expect(screen.getByText("未解决风险")).toBeTruthy();
    expect(screen.getByText("学生分层与自适应响应")).toBeTruthy();
    expect(screen.getByText("学习类别")).toBeTruthy();
    expect(screen.queryByText("AI 课堂状态")).toBeNull();
    expect(screen.queryByText("有学习记录的学生")).toBeNull();
  });

  it("describes adaptive response states for teacher monitoring", () => {
    expect(adaptiveResponseStatus(undefined, true).label).toBe("等待前测");
    expect(adaptiveResponseStatus({
      classroomId: "classroom-1",
      studentId: "student-1",
      currentSceneIndex: 0,
      totalScenes: 1,
      completedScenes: [],
      masteryLevel: "in-progress",
      lastActiveAt: "2026-07-11T10:00:00.000Z",
      adaptiveLearning: {
        enabled: false,
        evidence: [],
        branchRuns: [],
        microLessons: [],
      },
    }, true).label).toBe("个体已关闭");
  });

  it("opens a per-condition trigger audit from the response status", () => {
    const adaptiveCourse: Course = {
      ...course,
      content: {
        ...course.content,
        adaptiveLearningPlan: {
          enabled: true,
          status: "teacher-confirmed",
          updatedAt: "2026-07-24T00:00:00.000Z",
          timeBudgetMin: 6,
          thresholds: {
            foundationMax: 59,
            advancedMin: 85,
            branchQuizLow: 70,
            branchQuizHigh: 90,
          },
          pretest: {
            title: "前测",
            introduction: "",
            estimatedMinutes: 2,
            questions: [],
          },
          branches: [{
            id: "branch-extension-1",
            kind: "extension",
            title: "拓展挑战",
            objective: "迁移应用",
            keyPoints: [],
            anchorKnowledgePointIds: ["kp-1"],
            targetTiers: ["advanced"],
            sceneType: "slide",
            targetDurationSec: 180,
            trigger: {
              afterSceneId: "outline-ai-1",
              evidenceRule: "tier-and-high-score",
              scoreThreshold: 90,
              minimumRemainingSec: 180,
            },
            status: "teacher-confirmed",
          }],
        },
      },
      aiLearningProgress: {
        "student-1": {
          classroomId: "classroom-1",
          studentId: "student-1",
          currentSceneIndex: 1,
          totalScenes: 4,
          completedScenes: ["scene-runtime-1"],
          completionModelVersion: 2,
          masteryLevel: "in-progress",
          lastActiveAt: "2026-07-24T00:00:00.000Z",
          adaptiveLearning: {
            enabled: true,
            tier: "advanced",
            tierSource: "pretest",
            pretestScore: 100,
            pretestCompletedAt: "2026-07-24T00:00:00.000Z",
            evidence: [],
            branchRuns: [],
            microLessons: [],
            triggerEvaluations: [{
              id: "evaluation-1",
              branchOutlineId: "branch-extension-1",
              branchKind: "extension",
              completedSceneId: "scene-runtime-1",
              completedSceneTitle: "核心概念",
              matchedBy: "knowledge-point",
              evaluatedAt: "2026-07-24T00:01:00.000Z",
              result: "conditions-not-met",
              reason: "测评分数未满足",
              score: 80,
              scoreSource: "recorded-node-quiz",
              remainingBudgetSec: 240,
              conditions: [{
                key: "score",
                label: "测评分数",
                expected: "分数 ≥ 90",
                actual: "80 分（最近节点小测）",
                passed: false,
              }],
            }],
          },
        },
      },
    };

    render(<AiLearningTeacherView course={adaptiveCourse} />);
    fireEvent.click(screen.getByTitle("查看每个触发点的条件判定"));

    expect(screen.getByText("张三 · 自适应触发审计")).toBeTruthy();
    expect(screen.getByText("测评分数")).toBeTruthy();
    expect(screen.getByText("实际：80 分（最近节点小测）")).toBeTruthy();
    expect(screen.getByText("条件未满足")).toBeTruthy();
  });
});
