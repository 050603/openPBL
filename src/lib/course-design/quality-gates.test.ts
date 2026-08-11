import { describe, expect, it } from "vitest";
import { DEFAULT_EVALUATION_FLOWS } from "@/lib/session/types";
import {
  ensureEvaluationResponsibility,
  evaluateEvaluationPlan,
  evaluateLessonOutlines,
} from "./quality-gates";

describe("quick course design quality gates", () => {
  it("restores AI and teacher evaluation responsibilities", () => {
    const plan = ensureEvaluationResponsibility({
      dimensions: [
        { id: "one", name: "证据运用", weight: 50, description: "使用证据", responsibleRole: "teacher" },
        { id: "two", name: "成果表达", weight: 50, description: "清楚表达", responsibleRole: "teacher" },
      ],
      overallRubric: "按证据评价",
    });

    expect(plan.flows).toEqual(DEFAULT_EVALUATION_FLOWS);
    expect(plan.dimensions.map((item) => item.responsibleRole)).toContain("ai");
    expect(plan.dimensions.filter((item) => item.responsibleRole === "ai").reduce((sum, item) => sum + item.weight, 0)).toBe(40);
    expect(plan.dimensions.filter((item) => item.responsibleRole === "teacher").reduce((sum, item) => sum + item.weight, 0)).toBe(60);
    expect(plan.dimensions.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    expect(evaluateEvaluationPlan(plan).passed).toBe(true);
  });

  it("normalizes per-role rubric percentages into final-grade contributions", () => {
    const plan = ensureEvaluationResponsibility({
      dimensions: [
        { id: "ai-one", name: "过程证据", weight: 50, description: "过程", responsibleRole: "ai" },
        { id: "ai-two", name: "专业准确", weight: 50, description: "专业", responsibleRole: "ai" },
        { id: "teacher-one", name: "现场答辩", weight: 70, description: "答辩", responsibleRole: "teacher" },
        { id: "teacher-two", name: "成果表达", weight: 30, description: "表达", responsibleRole: "teacher" },
      ],
      overallRubric: "根据课程证据结构自动确定 AI 与教师占比。",
      flows: DEFAULT_EVALUATION_FLOWS.map((flow) => flow.sourceRole === "ai"
        ? { ...flow, weight: 35 }
        : flow.sourceRole === "teacher"
          ? { ...flow, weight: 65 }
          : flow),
    });

    expect(plan.dimensions.map((item) => [item.id, item.weight])).toEqual([
      ["ai-one", 18],
      ["ai-two", 17],
      ["teacher-one", 46],
      ["teacher-two", 19],
    ]);
    expect(plan.flows?.filter((flow) => flow.scored !== false).map((flow) => flow.weight)).toEqual([35, 65]);
  });

  it("rejects long student slides and missing teacher-stage resources", () => {
    const result = evaluateLessonOutlines([
      { id: "long", type: "slide", title: "长讲授", description: "", keyPoints: [], order: 0, audience: "student", stageKey: "ai-learning", targetDurationSec: 22 * 60 },
    ], true);

    expect(result.passed).toBe(false);
    expect(result.issues.join("；")).toContain("8 分钟");
    expect(result.issues.join("；")).toContain("教师资源阶段");
  });

  it("rejects student knowledge that is assigned outside its parent activity", () => {
    const result = evaluateLessonOutlines([
      {
        id: "student-a",
        type: "slide",
        title: "模块 A",
        description: "讲解模块 A。",
        keyPoints: ["A"],
        order: 0,
        audience: "student",
        stageKey: "ai-learning",
        parentActivityId: "activity-a",
        knowledgePointIds: ["b-1"],
      },
      {
        id: "student-b",
        type: "slide",
        title: "模块 B",
        description: "讲解模块 B。",
        keyPoints: ["B"],
        order: 1,
        audience: "student",
        stageKey: "ai-learning",
        parentActivityId: "activity-b",
        knowledgePointIds: ["b-1"],
      },
      {
        id: "checkpoint",
        type: "quiz",
        title: "理解检查",
        description: "检查理解。",
        keyPoints: ["A", "B"],
        order: 2,
        audience: "student",
        stageKey: "ai-learning",
        parentActivityId: "activity-b",
        knowledgePointIds: ["b-1"],
      },
      ...["launch", "proposal", "make", "showcase"].map((stageKey, index) => ({
        id: `teacher-${stageKey}`,
        type: "slide" as const,
        title: `教师资源 ${stageKey}`,
        description: "教师资源。",
        keyPoints: ["提示"],
        order: index + 3,
        audience: "teacher" as const,
        stageKey,
      })),
    ], false, [
      {
        activityId: "activity-a",
        stageKey: "ai-learning",
        title: "模块 A",
        durationMin: 10,
        knowledgePointIds: ["a-1"],
      },
      {
        activityId: "activity-b",
        stageKey: "ai-learning",
        title: "模块 B",
        durationMin: 10,
        knowledgePointIds: ["b-1"],
      },
    ]);

    expect(result.passed).toBe(false);
    expect(result.issues.join("；")).toContain("父活动");
    expect(result.issues.join("；")).toContain("a-1");
  });
});
