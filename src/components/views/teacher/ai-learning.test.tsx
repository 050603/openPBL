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
    expect(screen.getByText("未解决风险")).toBeTruthy();
    expect(screen.getByText("学生学习情况")).toBeTruthy();
    expect(screen.getByLabelText("学生状态总览")).toBeTruthy();
    expect(screen.getByText(/无需前测 · 已学 0份/)).toBeTruthy();
    expect(screen.queryByText("先决知识证据")).toBeNull();
    expect(screen.queryByText("响应状态")).toBeNull();
    expect(screen.queryByText("重复学习学生")).toBeNull();
    expect(screen.queryByText("用学习证据决定何时现场介入")).toBeNull();
    expect(screen.queryByText("本阶段不控制伴学 Agent；风险用于教师巡视、个别辅导和全班补充教学。")).toBeNull();
    expect(screen.queryByText("AI 课堂状态")).toBeNull();
    expect(screen.queryByText("有学习记录的学生")).toBeNull();
  });

  it("renders forty students in the compact status overview", () => {
    const students = Array.from({ length: 40 }, (_, index) => ({
      id: `student-${index + 1}`,
      name: `学生${String(index + 1).padStart(2, "0")}`,
      joinedAt: "2026-07-11T09:00:00.000Z",
      stageProgress: {},
    }));

    render(<AiLearningTeacherView course={{ ...course, students, learningEvents: [], learningSignals: [] }} />);

    expect(screen.getAllByTitle("查看额外资源学习详情")).toHaveLength(40);
    expect(screen.getByText("学生40")).toBeTruthy();
  });

  it("describes adaptive response states for teacher monitoring", () => {
    expect(adaptiveResponseStatus(undefined, true).label).toBe("等待前测");
    expect(adaptiveResponseStatus(undefined, true, false).label).toBe("监测触发点");
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
            enrichmentMasteryMin: 80,
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
            prerequisiteKnowledgePointIds: [],
            noveltyStatement: "使用主课未出现的新项目案例进行迁移。",
            mainCourseOverlapSceneIds: [],
            sceneType: "slide",
            targetDurationSec: 180,
            trigger: {
              placement: "after-module",
              afterSceneId: "outline-ai-1",
              evidenceRule: "module-mastery",
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
    fireEvent.click(screen.getByTitle("查看额外资源学习详情"));

    expect(screen.getByText("张三 · 额外资源学习详情")).toBeTruthy();
    expect(screen.getByText("可用时间")).toBeTruthy();
    expect(screen.queryByText("Adaptive trigger audit")).toBeNull();
    expect(screen.queryByText("已评估触发点")).toBeNull();
    expect(screen.getByText("触发条件")).toBeTruthy();
    expect(screen.getByText("仍需满足")).toBeTruthy();
    expect(screen.getByText("预计触发")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("模块掌握证据") && content.includes("当前 80 分"))).toBeTruthy();
    expect(screen.queryByText("教师审核")).toBeNull();
    expect(screen.queryByText("备课资源")).toBeNull();
    expect(screen.queryByText("个性化编排")).toBeNull();
    expect(screen.queryByText("学生路径容量")).toBeNull();
    expect(screen.getByText("条件未满足")).toBeTruthy();
  });

  it("translates internal prerequisite and assessment ids into teacher-facing names", () => {
    const adaptiveCourse: Course = {
      ...course,
      content: {
        ...course.content,
        knowledgePoints: [{ id: "kp-1", name: "建立数据模型", description: "理解数据模型" }],
        adaptiveLearningPlan: {
          enabled: true,
          status: "teacher-confirmed",
          updatedAt: "2026-08-23T00:00:00.000Z",
          timeBudgetMin: 6,
          thresholds: { enrichmentMasteryMin: 80 },
          prerequisiteKnowledgePoints: [{
            id: "prereq-1",
            name: "识别数据类型",
            description: "区分常见数据类型",
            expectedPriorKnowledgeEvidence: "已学习基础数据概念",
            necessityRationale: "会影响数据模型的建立",
            diagnosticBoundary: "能够正确识别数据类型",
          }],
          pretest: {
            title: "前测",
            introduction: "",
            estimatedMinutes: 2,
            questions: [{
              id: "question-1",
              prompt: "以下哪项是数值数据？",
              options: ["身高", "姓名"],
              correctOptionIndex: 0,
              knowledgePointIds: ["prereq-1"],
            }],
          },
          branches: [{
            id: "branch-prerequisite-1",
            kind: "prerequisite",
            title: "数据类型回顾",
            objective: "补齐先决知识",
            keyPoints: [],
            anchorKnowledgePointIds: ["kp-1"],
            prerequisiteKnowledgePointIds: ["prereq-1"],
            noveltyStatement: "补充进入主课前必须掌握的内容。",
            mainCourseOverlapSceneIds: [],
            sceneType: "slide",
            targetDurationSec: 120,
            trigger: {
              placement: "before-main-course",
              evidenceRule: "pretest-gap",
              minimumRemainingSec: 90,
            },
            status: "teacher-confirmed",
          }],
        },
      },
      aiLearningProgress: {
        "student-1": {
          classroomId: "classroom-1",
          studentId: "student-1",
          currentSceneIndex: 0,
          totalScenes: 4,
          completedScenes: [],
          masteryLevel: "in-progress",
          lastActiveAt: "2026-08-23T00:00:00.000Z",
          adaptiveLearning: {
            enabled: true,
            pretestScore: 50,
            pretestCompletedAt: "2026-08-23T00:00:00.000Z",
            pretestWeakKnowledgePointIds: ["prereq-1"],
            evidence: [],
            branchRuns: [],
            microLessons: [],
            triggerEvaluations: [{
              id: "evaluation-1",
              branchOutlineId: "branch-prerequisite-1",
              branchKind: "prerequisite",
              completedSceneId: "re_iSXGxKNK_b-R_iSPtL",
              matchedBy: "pretest-gap",
              evaluatedAt: "2026-08-23T00:01:00.000Z",
              result: "conditions-not-met",
              reason: "先决知识缺口未满足",
              remainingBudgetSec: 240,
              conditions: [{
                key: "evidence",
                label: "先决知识缺口",
                expected: "prereq-1",
                actual: "检测到缺口：prereq-1",
                passed: true,
              }, {
                key: "anchor",
                label: "到达主课达标测",
                expected: "re_iSXGxKNK_b-R_iSPtL",
                actual: "尚未到达",
                passed: false,
              }],
            }],
          },
        },
      },
    };

    render(<AiLearningTeacherView course={adaptiveCourse} />);
    fireEvent.click(screen.getByTitle("查看额外资源学习详情"));

    expect(screen.getAllByText((content) => content.includes("识别数据类型")).length).toBeGreaterThan(0);
    expect(screen.queryByText((content) => content.includes("prereq-1"))).toBeNull();
    expect(screen.queryByText((content) => content.includes("re_iSXGxKNK_b-R_iSPtL"))).toBeNull();
  });
});
