import { describe, expect, it } from "vitest";
import {
  calculateAdaptiveRemainingBudgetSec,
  classifyStudentTier,
  createDefaultAdaptiveLearningPlan,
  decideAdaptiveBranch,
  eligibleAdaptiveBranches,
  evaluateAdaptiveBranchDecision,
  extractLearningRequestTopic,
  resolveAdaptiveSceneIdentity,
  scoreAdaptiveAssessment,
} from "@/lib/adaptive-learning";
import type { AdaptiveLearningPlan } from "@/lib/session/types";

function confirmPreparedBranches(plan: AdaptiveLearningPlan) {
  plan.status = "teacher-confirmed";
  plan.branches = plan.branches.map((branch) => ({
    ...branch,
    status: "teacher-confirmed",
    preparedResource: {
      status: "ready",
      classroomId: `classroom-${branch.id}`,
      scenesCount: 1,
    },
  }));
}

describe("adaptive learning", () => {
  it("scores the pretest and classifies three learner tiers", () => {
    const plan = createDefaultAdaptiveLearningPlan({
      knowledgePoints: [
        { id: "kp-1", name: "变量", description: "变量表示可变化的数据" },
        { id: "kp-2", name: "条件", description: "条件决定程序分支" },
      ],
      now: "2026-07-23T00:00:00.000Z",
    });
    expect(scoreAdaptiveAssessment(plan.pretest.questions, {
      "pretest-kp-1": 0,
      "pretest-kp-2": 2,
    })).toBe(50);
    expect(classifyStudentTier(59, plan.thresholds)).toBe("foundation");
    expect(classifyStudentTier(60, plan.thresholds)).toBe("standard");
    expect(classifyStudentTier(85, plan.thresholds)).toBe("advanced");
  });

  it("inserts a foundation branch only when evidence and time budget allow it", () => {
    const plan = createDefaultAdaptiveLearningPlan({
      knowledgePoints: [{ id: "kp-1", name: "变量", description: "变量表示可变化的数据" }],
      now: "2026-07-23T00:00:00.000Z",
    });
    confirmPreparedBranches(plan);
    const decision = decideAdaptiveBranch({
      plan,
      state: {
        tier: "foundation",
        pretestCompletedAt: "2026-07-23T00:01:00.000Z",
        evidence: [],
        branchRuns: [],
        microLessons: [],
      },
      nodeQuizScore: 55,
      anchorKnowledgePointIds: ["kp-1"],
      remainingBudgetSec: 240,
    });
    expect(decision.action).toBe("insert");
    if (decision.action === "insert") expect(decision.branch.kind).toBe("foundation");
  });

  it("binds a branch to an exact page trigger and respects teacher disable", () => {
    const plan = createDefaultAdaptiveLearningPlan({
      knowledgePoints: [{ id: "kp-1", name: "变量", description: "变量表示可变化的数据" }],
      mainScenes: [
        {
          id: "scene-quiz",
          title: "变量节点小测",
          type: "quiz",
          order: 1,
          stageKey: "ai-learning",
          audience: "student",
          knowledgePointIds: ["kp-1"],
        },
        {
          id: "scene-next",
          title: "变量应用",
          type: "slide",
          order: 2,
          stageKey: "ai-learning",
          audience: "student",
        },
      ],
      now: "2026-07-23T00:00:00.000Z",
    });
    const foundation = plan.branches.find((branch) => branch.kind === "foundation");
    expect(foundation?.trigger?.afterSceneId).toBe("scene-quiz");
    expect(foundation?.trigger?.beforeSceneId).toBe("scene-next");

    confirmPreparedBranches(plan);
    expect(decideAdaptiveBranch({
      plan,
      state: {
        enabled: false,
        tier: "foundation",
        pretestCompletedAt: "2026-07-23T00:01:00.000Z",
        evidence: [],
        branchRuns: [],
        microLessons: [],
      },
      completedSceneId: "scene-quiz",
      nodeQuizScore: 40,
      anchorKnowledgePointIds: ["kp-1"],
      remainingBudgetSec: 240,
    })).toEqual({
      action: "continue",
      reason: "教师已关闭该学生的自适应路径",
    });
  });

  it("matches generated runtime scene ids through knowledge-point anchors", () => {
    const plan = createDefaultAdaptiveLearningPlan({
      knowledgePoints: [{ id: "kp-1", name: "变量", description: "变量表示可变化的数据" }],
      mainScenes: [{
        id: "outline-ai-1",
        title: "变量概念",
        type: "slide",
        order: 1,
        stageKey: "ai-learning",
        audience: "student",
        knowledgePointIds: ["kp-1"],
      }],
      now: "2026-07-23T00:00:00.000Z",
    });
    confirmPreparedBranches(plan);
    plan.branches = plan.branches.map((branch) => ({
      ...branch,
      trigger: branch.trigger ? { ...branch.trigger, scoreThreshold: 70 } : branch.trigger,
    }));

    const result = evaluateAdaptiveBranchDecision({
      plan,
      state: {
        tier: "advanced",
        pretestScore: 100,
        pretestCompletedAt: "2026-07-23T00:01:00.000Z",
        evidence: [],
        branchRuns: [],
        microLessons: [],
      },
      completedSceneId: "scene-generated-id",
      completedSceneTitle: "变量概念",
      anchorKnowledgePointIds: ["kp-1"],
      remainingBudgetSec: 240,
      now: "2026-07-23T00:02:00.000Z",
    });

    expect(result.decision.action).toBe("insert");
    if (result.decision.action === "insert") {
      expect(result.decision.branch.kind).toBe("extension");
    }
    const extensionAudit = result.evaluations.find((item) => item.branchKind === "extension");
    expect(extensionAudit).toMatchObject({
      matchedBy: "knowledge-point",
      result: "triggered",
      score: 100,
      scoreSource: "pretest-fallback",
    });
    expect(extensionAudit?.conditions.every((condition) => condition.passed)).toBe(true);
  });

  it("records the exact failed condition when an advanced learner misses the score threshold", () => {
    const plan = createDefaultAdaptiveLearningPlan({
      knowledgePoints: [{ id: "kp-1", name: "变量", description: "变量表示可变化的数据" }],
      now: "2026-07-23T00:00:00.000Z",
    });
    confirmPreparedBranches(plan);

    const result = evaluateAdaptiveBranchDecision({
      plan,
      state: {
        tier: "advanced",
        pretestScore: 86,
        pretestCompletedAt: "2026-07-23T00:01:00.000Z",
        evidence: [],
        branchRuns: [],
        microLessons: [],
      },
      completedSceneId: "runtime-scene",
      anchorKnowledgePointIds: ["kp-1"],
      remainingBudgetSec: 240,
    });
    const extensionAudit = result.evaluations.find((item) => item.branchKind === "extension");

    expect(result.decision.action).toBe("continue");
    expect(extensionAudit?.result).toBe("conditions-not-met");
    expect(extensionAudit?.conditions.find((condition) => condition.key === "score")).toMatchObject({
      passed: false,
      actual: expect.stringContaining("86"),
    });
  });

  it("builds an advanced learner audit with actual score and remaining budget", () => {
    const plan = createDefaultAdaptiveLearningPlan({
      knowledgePoints: [{ id: "kp-1", name: "变量", description: "可变化的数据" }],
      mainScenes: [{
        id: "scene-1",
        title: "变量",
        type: "quiz",
        order: 0,
        stageKey: "ai-learning",
        audience: "student",
        knowledgePointIds: ["kp-1"],
      }],
      now: "2026-07-24T00:00:00.000Z",
    });
    confirmPreparedBranches(plan);
    plan.timeBudgetMin = 6;
    plan.branches = plan.branches.map((branch) => ({
      ...branch,
      trigger: branch.trigger
        ? { ...branch.trigger, scoreThreshold: branch.kind === "extension" ? 70 : 60 }
        : branch.trigger,
    }));
    const state = {
      tier: "advanced" as const,
      pretestScore: 100,
      pretestCompletedAt: "2026-07-24T00:01:00.000Z",
      evidence: [],
      branchRuns: [],
      microLessons: [],
    };
    const eligible = eligibleAdaptiveBranches(plan, state.tier);

    expect(eligible.map((branch) => branch.kind)).toEqual(["extension"]);
    expect(calculateAdaptiveRemainingBudgetSec(plan, state)).toBe(360);

    const audit = evaluateAdaptiveBranchDecision({
      plan,
      state,
      anchorKnowledgePointIds: [],
      remainingBudgetSec: 360,
      candidateBranchIds: eligible.map((branch) => branch.id),
      reachedSceneIds: [],
      now: "2026-07-24T00:02:00.000Z",
    }).evaluations[0];

    expect(audit.score).toBe(100);
    expect(audit.conditions.find((condition) => condition.key === "score")).toMatchObject({
      actual: expect.stringContaining("100"),
      passed: true,
    });
    expect(audit.conditions.find((condition) => condition.key === "time")).toMatchObject({
      actual: "当前 6 分 0 秒",
      passed: true,
    });
    expect(audit.conditions.find((condition) => condition.key === "anchor")?.passed).toBe(false);
  });

  it("subtracts completed branch duration from the adaptive budget", () => {
    const plan = createDefaultAdaptiveLearningPlan({
      knowledgePoints: [{ id: "kp-1", name: "变量", description: "可变化的数据" }],
    });
    plan.timeBudgetMin = 8;
    expect(calculateAdaptiveRemainingBudgetSec(plan, {
      branchRuns: [{
        id: "run-1",
        branchOutlineId: "branch-extension-kp-1",
        kind: "extension",
        status: "completed",
        reason: "triggered",
        createdAt: "2026-07-24T00:00:00.000Z",
      }],
    })).toBe(300);
  });

  it("uses outline identity instead of regenerated runtime scene ids", () => {
    expect(resolveAdaptiveSceneIdentity({
      id: "scene-runtime-9f2",
      outlineId: "outline-ai-1",
    })).toEqual({
      stableSceneId: "outline-ai-1",
      runtimeSceneId: "scene-runtime-9f2",
    });
  });

  it("never inserts an adaptive branch without a prepared classroom resource", () => {
    const plan = createDefaultAdaptiveLearningPlan({
      knowledgePoints: [{ id: "kp-1", name: "变量", description: "可变化的数据" }],
      mainScenes: [{
        id: "outline-ai-1",
        title: "变量",
        type: "slide",
        order: 0,
        stageKey: "ai-learning",
        audience: "student",
        knowledgePointIds: ["kp-1"],
      }],
    });
    plan.status = "teacher-confirmed";
    plan.branches = plan.branches.map((branch) => ({
      ...branch,
      status: "teacher-confirmed",
    }));

    const result = evaluateAdaptiveBranchDecision({
      plan,
      state: {
        tier: "advanced",
        pretestScore: 100,
        pretestCompletedAt: "2026-07-24T00:01:00.000Z",
        evidence: [],
        branchRuns: [],
        microLessons: [],
      },
      completedSceneId: "outline-ai-1",
      runtimeSceneId: "scene-runtime-9f2",
      completedSceneTitle: "变量",
      anchorKnowledgePointIds: ["kp-1"],
      remainingBudgetSec: 300,
    });

    expect(result.decision.action).toBe("continue");
    const resource = result.evaluations
      .find((evaluation) => evaluation.branchKind === "extension")
      ?.conditions.find((condition) => condition.key === "resource");
    expect(resource).toMatchObject({
      passed: false,
      actual: "尚未生成成品资源",
    });
  });

  it("recognizes explicit student learning requests", () => {
    expect(extractLearningRequestTopic("我想学 递归算法")).toBe("递归算法");
    expect(extractLearningRequestTopic("帮我改一下标题")).toBeNull();
  });
});
