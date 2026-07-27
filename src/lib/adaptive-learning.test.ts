import { describe, expect, it } from "vitest";
import {
  adaptiveResourceAddsNovelContent,
  calculateAdaptiveRemainingBudgetSec,
  confirmAdaptiveLearningPlan,
  createDefaultAdaptiveLearningPlan,
  deriveAdaptiveCheckpointSceneIds,
  derivePretestKnowledgeEvidence,
  ensureAdaptiveResourceCoverage,
  evaluateAdaptiveBranchDecision,
  normalizeAdaptiveLearningPlan,
  resolveAdaptiveSceneIdentity,
  scoreAdaptiveAssessment,
} from "@/lib/adaptive-learning";
import type { AdaptiveBranchOutline, AdaptiveLearningPlan, StudentAdaptiveLearningState } from "@/lib/session/types";

function resource(overrides: Partial<AdaptiveBranchOutline> = {}): AdaptiveBranchOutline {
  return {
    id: "resource-1",
    kind: "application",
    title: "强化学习的新应用",
    objective: "把策略学习迁移到新的机器人任务。",
    keyPoints: ["新情境", "边界判断"],
    anchorKnowledgePointIds: ["reinforcement-learning"],
    prerequisiteKnowledgePointIds: [],
    noveltyStatement: "使用主课未出现的仓储机器人案例，比较奖励稀疏时的策略差异。",
    mainCourseOverlapSceneIds: ["main-1"],
    sceneType: "slide",
    targetDurationSec: 120,
    generationGuidance: "不得重复主课定义与原例题。",
    preparedResource: { status: "ready", classroomId: "resource-classroom", scenesCount: 1 },
    trigger: {
      placement: "after-module",
      assessmentSceneIds: ["quiz-1"],
      answerRule: "score-at-least",
      evidenceRule: "module-mastery",
      scoreThreshold: 80,
      minimumRemainingSec: 120,
    },
    status: "teacher-confirmed",
    ...overrides,
  };
}

function plan(branches = [resource()]): AdaptiveLearningPlan {
  return {
    enabled: true,
    status: "teacher-confirmed",
    updatedAt: "2026-07-26T00:00:00.000Z",
    timeBudgetMin: 8,
    thresholds: { enrichmentMasteryMin: 80 },
    pretest: {
      title: "先决知识检查",
      introduction: "检查前序知识",
      estimatedMinutes: 3,
      questions: [{
        id: "q-1",
        prompt: "监督学习需要什么？",
        options: ["标签", "奖励"],
        correctOptionIndex: 0,
        knowledgePointIds: ["supervised-learning"],
      }],
    },
    branches,
  };
}

function state(overrides: Partial<StudentAdaptiveLearningState> = {}): StudentAdaptiveLearningState {
  return {
    pretestCompletedAt: "2026-07-26T00:00:00.000Z",
    pretestScore: 100,
    pretestWeakKnowledgePointIds: [],
    pretestMasteredKnowledgePointIds: ["supervised-learning"],
    evidence: [],
    branchRuns: [],
    microLessons: [],
    ...overrides,
  };
}

describe("adaptive learning evidence model", () => {
  it("confirms the plan and every resource when entering course generation", () => {
    const draft = plan([resource({ status: "draft" })]);
    draft.status = "draft";

    const confirmed = confirmAdaptiveLearningPlan(draft, "2026-07-26T12:00:00.000Z");

    expect(confirmed.status).toBe("teacher-confirmed");
    expect(confirmed.updatedAt).toBe("2026-07-26T12:00:00.000Z");
    expect(confirmed.branches.every((branch) => branch.status === "teacher-confirmed")).toBe(true);
  });

  it("scores and maps pretest answers to knowledge-level evidence", () => {
    const questions = plan().pretest.questions;
    expect(scoreAdaptiveAssessment(questions, { "q-1": 1 })).toBe(0);
    expect(derivePretestKnowledgeEvidence(questions, { "q-1": 1 })).toEqual({
      weakKnowledgePointIds: ["supervised-learning"],
      masteredKnowledgePointIds: [],
    });
  });

  it("caps generated and normalized pretests at five questions", () => {
    const points = Array.from({ length: 8 }, (_, index) => ({
      id: `kp-${index}`,
      name: `知识 ${index}`,
      description: "描述",
    }));
    const fallback = createDefaultAdaptiveLearningPlan({ knowledgePoints: points });
    expect(fallback.pretest.questions).toHaveLength(5);
    const normalized = normalizeAdaptiveLearningPlan({
      pretest: { questions: Array.from({ length: 8 }, (_, index) => ({
        id: `q-${index}`,
        prompt: `题目 ${index}`,
        options: ["A", "B"],
        correctOptionIndex: 0,
        knowledgePointIds: [`kp-${index}`],
      })) },
    }, fallback);
    expect(normalized.pretest.questions).toHaveLength(5);
  });

  it("guarantees one prerequisite resource per pretest knowledge point and one enrichment resource per module", () => {
    const uncoveredPlan: AdaptiveLearningPlan = {
      ...plan([]),
      status: "draft",
      pretest: {
        ...plan([]).pretest,
        questions: [{
          id: "q-combined",
          prompt: "比较监督学习与无监督学习",
          options: ["A", "B"],
          correctOptionIndex: 0,
          knowledgePointIds: ["supervised-learning", "unsupervised-learning"],
        }],
      },
    };
    const covered = ensureAdaptiveResourceCoverage(uncoveredPlan, {
      knowledgePoints: [
        { id: "supervised-learning", name: "监督学习", description: "有标签学习" },
        { id: "unsupervised-learning", name: "无监督学习", description: "无标签发现结构" },
        { id: "reinforcement-learning", name: "强化学习", description: "奖励驱动学习" },
      ],
      mainScenes: [
        {
          id: "module-quiz-1",
          type: "quiz",
          title: "学习范式测验",
          stageKey: "ai-learning",
          audience: "student",
          knowledgePointIds: ["supervised-learning", "unsupervised-learning"],
        },
        {
          id: "module-quiz-2",
          type: "quiz",
          title: "强化学习测验",
          stageKey: "ai-learning",
          audience: "student",
          knowledgePointIds: ["reinforcement-learning"],
        },
      ],
    });

    const prerequisiteCoverage = new Set(covered.branches.flatMap((branch) =>
      branch.trigger?.placement === "before-main-course"
        ? branch.prerequisiteKnowledgePointIds
        : [],
    ));
    const moduleCoverage = new Set(covered.branches.flatMap((branch) =>
      branch.trigger?.placement === "after-module"
        ? branch.trigger.assessmentSceneIds ?? []
        : [],
    ));
    expect(prerequisiteCoverage).toEqual(new Set(["supervised-learning", "unsupervised-learning"]));
    expect(moduleCoverage).toEqual(new Set(["module-quiz-1", "module-quiz-2"]));
    expect(covered.branches).toHaveLength(4);
  });

  it("keeps model-authored resources and only repairs missing coverage", () => {
    const existingPrerequisite = resource({
      id: "pre-combined",
      kind: "prerequisite",
      prerequisiteKnowledgePointIds: ["supervised-learning", "unsupervised-learning"],
      trigger: {
        placement: "before-main-course",
        evidenceRule: "pretest-gap",
        minimumRemainingSec: 120,
      },
    });
    const existingExtension = resource({
      id: "extension-combined",
      trigger: {
        placement: "after-module",
        assessmentSceneIds: ["quiz-1", "quiz-2"],
        answerRule: "score-at-least",
        evidenceRule: "module-mastery",
        minimumRemainingSec: 120,
      },
    });
    const current = plan([existingPrerequisite, existingExtension]);
    current.pretest.questions[0].knowledgePointIds = ["supervised-learning", "unsupervised-learning"];
    const covered = ensureAdaptiveResourceCoverage(current, {
      knowledgePoints: [
        { id: "supervised-learning", name: "监督学习", description: "" },
        { id: "unsupervised-learning", name: "无监督学习", description: "" },
      ],
      mainScenes: [
        { id: "quiz-1", type: "quiz", title: "模块一", stageKey: "ai-learning", knowledgePointIds: ["supervised-learning"] },
        { id: "quiz-2", type: "quiz", title: "模块二", stageKey: "ai-learning", knowledgePointIds: ["unsupervised-learning"] },
      ],
    });
    expect(covered.branches.map((branch) => branch.id)).toEqual(["pre-combined", "extension-combined"]);
  });

  it("does not truncate a complete resource pool at twelve items", () => {
    const fallback = createDefaultAdaptiveLearningPlan({
      knowledgePoints: [{ id: "kp", name: "知识", description: "描述" }],
    });
    const rawBranches = Array.from({ length: 15 }, (_, index) => ({
      ...resource({ id: `resource-${index}` }),
    }));
    expect(normalizeAdaptiveLearningPlan({ branches: rawBranches }, fallback).branches).toHaveLength(15);
  });

  it("selects a prepared prerequisite resource only for a matching pretest gap", () => {
    const prerequisite = resource({
      id: "pre-1",
      kind: "prerequisite",
      prerequisiteKnowledgePointIds: ["supervised-learning"],
      anchorKnowledgePointIds: ["supervised-learning"],
      noveltyStatement: "回顾主课没有讲授、但理解强化学习对比所必需的标签反馈差异。",
      trigger: {
        placement: "before-main-course",
        evidenceRule: "pretest-gap",
        minimumRemainingSec: 120,
      },
    });
    const result = evaluateAdaptiveBranchDecision({
      plan: plan([prerequisite]),
      state: state({ pretestWeakKnowledgePointIds: ["supervised-learning"] }),
      anchorKnowledgePointIds: [],
      phase: "pre-course",
      remainingBudgetSec: 480,
    });
    expect(result.decision.action).toBe("insert");
    expect(result.evaluations[0].conditions.find((condition) => condition.key === "evidence")?.actual)
      .toContain("supervised-learning");
  });

  it("does not relecture after an incorrect module quiz", () => {
    const result = evaluateAdaptiveBranchDecision({
      plan: plan(),
      state: state(),
      nodeQuizScore: 50,
      anchorKnowledgePointIds: ["reinforcement-learning"],
      completedSceneId: "quiz-1",
      phase: "after-module",
      remainingBudgetSec: 480,
    });
    expect(result.decision.action).toBe("continue");
    expect(result.evaluations[0].conditions.find((condition) => condition.key === "evidence")?.passed).toBe(false);
  });

  it("inserts enrichment after mastery when time and prepared content are available", () => {
    const result = evaluateAdaptiveBranchDecision({
      plan: plan(),
      state: state(),
      nodeQuizScore: 90,
      anchorKnowledgePointIds: ["reinforcement-learning"],
      completedSceneId: "quiz-1",
      phase: "after-module",
      remainingBudgetSec: 480,
    });
    expect(result.decision.action).toBe("insert");
    expect(result.evaluations[0].score).toBe(90);
  });

  it("rejects a resource without a meaningful novelty statement", () => {
    const branch = resource({ noveltyStatement: "把策略学习迁移到新的机器人任务。" });
    expect(adaptiveResourceAddsNovelContent(branch)).toBe(false);
    const result = evaluateAdaptiveBranchDecision({
      plan: plan([branch]),
      state: state(),
      nodeQuizScore: 100,
      anchorKnowledgePointIds: ["reinforcement-learning"],
      completedSceneId: "quiz-1",
      phase: "after-module",
      remainingBudgetSec: 480,
    });
    expect(result.decision.action).toBe("continue");
  });

  it("accounts for completed resources in the total time budget", () => {
    const currentPlan = plan();
    expect(calculateAdaptiveRemainingBudgetSec(currentPlan, state({
      branchRuns: [{
        id: "run-1",
        branchOutlineId: "resource-1",
        kind: "application",
        status: "completed",
        reason: "mastery",
        createdAt: "2026-07-26T00:00:00.000Z",
      }],
    }))).toBe(360);
  });

  it("uses stable outline ids and derives module quiz checkpoints", () => {
    expect(resolveAdaptiveSceneIdentity({ id: "runtime", outlineId: "outline" })).toEqual({
      stableSceneId: "outline",
      runtimeSceneId: "runtime",
    });
    expect(deriveAdaptiveCheckpointSceneIds([
      { id: "slide", type: "slide", stageKey: "ai-learning", knowledgePointIds: ["kp"] },
      { id: "quiz", type: "quiz", stageKey: "ai-learning", knowledgePointIds: ["kp"] },
    ])).toEqual(["quiz"]);
  });
});
