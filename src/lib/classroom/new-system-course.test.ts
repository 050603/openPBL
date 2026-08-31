import { describe, expect, it } from "vitest";
import type { Course } from "@/lib/session/types";
import { getStagesForSystemMode } from "@/lib/system-mode";
import {
  buildNewSystemAiTimingPlan,
  buildNewSystemAiTeachingOutline,
  buildNewSystemTimingPlan,
  getNewSystemCourseReadiness,
  isNewSystemCourseReady,
} from "./new-system-course";

function readyCourse(): Course {
  const timingPlan = buildNewSystemTimingPlan(90, "2026-08-30T00:00:00.000Z");
  return {
    id: "course-new-ready",
    name: "校园节能",
    subject: "科学",
    grade: "初中",
    hours: 1.5,
    summary: "理解节能知识并完成课堂项目。",
    drivingQuestion: "如何改善校园节能？",
    status: "ready",
    stages: getStagesForSystemMode("new"),
    currentStageIndex: 0,
    content: {
      pblOutline: "",
      knowledgePoints: [{ id: "kp-1", name: "能耗", description: "理解能耗", level: "core" }],
      teachingOutline: [],
      lessonOutline: [],
      evaluationPlan: { dimensions: [], overallRubric: "" },
      moduleTimingPlan: timingPlan,
      _openmaicClassroomId: "classroom-ai",
      _openmaicSceneOutlines: [{
        id: "scene-ai",
        title: "能耗基础",
        stageKey: "ai-learning",
        audience: "student",
      }],
    },
    aiLearningClassroomId: "classroom-ai",
    students: [],
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

describe("new-system course contract", () => {
  it("builds an AI-only compatibility plan without fixed five-stage ratios", () => {
    const plan = buildNewSystemTimingPlan(90, "2026-08-30T00:00:00.000Z");
    expect(plan.status).toBe("confirmed");
    expect(plan.allocations.map((item) => item.stageKey)).toEqual(["ai-learning"]);
    expect(plan.allocations.reduce((sum, item) => sum + item.durationMin, 0)).toBe(90);
    expect(plan.recommendationSource).toBe("deterministic-fallback");
    expect(plan.recommendedStageTotals.knowledge).toBe(90);
    expect(plan.recommendedStageTotals.launch).toBe(0);
    expect(plan.recommendedStageTotals.proposal).toBe(0);
  });

  it("turns the AI judgment into exact per-knowledge-point budgets", () => {
    const points = [
      { id: "kp-1", name: "概念", description: "理解概念", level: "foundation" as const },
      { id: "kp-2", name: "应用", description: "完成应用", level: "application" as const },
    ];
    const plan = buildNewSystemAiTimingPlan({
      durationMin: 42,
      rationale: "第二个知识点需要操作与反馈。",
      confidence: "high",
      knowledgePointBudgets: [
        { knowledgePointId: "kp-1", durationMin: 12, rationale: "建立概念" },
        { knowledgePointId: "kp-2", durationMin: 30, rationale: "操作与检测" },
      ],
      evidence: ["一条依赖链"],
      assumptions: [],
    }, points, "2026-08-30T00:00:00.000Z");

    expect(plan.totalMinutes).toBe(42);
    expect(plan.allocations.map((item) => item.durationMin)).toEqual([12, 30]);
    expect(plan.allocations.every((item) => item.stageKey === "ai-learning")).toBe(true);
    expect(plan.recommendedStageTotals.knowledge).toBe(42);
  });

  it("creates only the AI授知 teaching outline during preparation", () => {
    const plan = buildNewSystemTimingPlan(60);
    const outline = buildNewSystemAiTeachingOutline(plan, [
      { id: "kp-1", name: "知识点", description: "说明", level: "core" },
    ]);
    expect(outline).toHaveLength(1);
    expect(outline[0]).toMatchObject({
      stageKey: "ai-learning",
      durationMin: 60,
      openMaicUse: "student-ai-learning",
      knowledgePointIds: ["kp-1"],
    });
  });

  it("blocks publishing when any generated page leaks into another stage", () => {
    const course = readyCourse();
    expect(isNewSystemCourseReady(course)).toBe(true);
    const invalid = {
      ...course,
      content: {
        ...course.content,
        _openmaicSceneOutlines: [
          ...(course.content._openmaicSceneOutlines ?? []),
          { id: "teacher-launch", title: "启动", stageKey: "launch", audience: "teacher" as const },
        ],
      },
    };
    expect(isNewSystemCourseReady(invalid)).toBe(false);
    expect(getNewSystemCourseReadiness(invalid).find((item) => item.id === "ai-outline")?.ok)
      .toBe(false);
  });

  it("accepts an AI授知 duration shorter than the teacher course capacity", () => {
    const course = readyCourse();
    course.content.moduleTimingPlan = buildNewSystemTimingPlan(42);
    expect(course.hours * 60).toBe(90);
    expect(getNewSystemCourseReadiness(course).find((item) => item.id === "timing")?.ok)
      .toBe(true);
  });
});
