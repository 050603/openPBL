import type {
  AdaptiveAssessmentQuestion,
  AdaptiveBranchOutline,
  AdaptiveLearningPlan,
  AdaptiveTriggerEvaluation,
  OpenMaicSceneOutlineSnapshot,
  KnowledgePoint,
  StudentAdaptiveLearningState,
  StudentLearningTier,
} from "@/lib/session/types";

export const DEFAULT_ADAPTIVE_THRESHOLDS: AdaptiveLearningPlan["thresholds"] = {
  foundationMax: 59,
  advancedMin: 85,
  branchQuizLow: 70,
  branchQuizHigh: 90,
};

export function scoreAdaptiveAssessment(
  questions: AdaptiveAssessmentQuestion[],
  answers: Record<string, number>,
): number {
  if (!questions.length) return 0;
  const correct = questions.filter(
    (question) => answers[question.id] === question.correctOptionIndex,
  ).length;
  return Math.round((correct / questions.length) * 100);
}

export function classifyStudentTier(
  score: number,
  thresholds: Pick<AdaptiveLearningPlan["thresholds"], "foundationMax" | "advancedMin">,
): StudentLearningTier {
  if (score <= thresholds.foundationMax) return "foundation";
  if (score >= thresholds.advancedMin) return "advanced";
  return "standard";
}

export function createDefaultAdaptiveLearningPlan(input: {
  knowledgePoints: KnowledgePoint[];
  mainScenes?: OpenMaicSceneOutlineSnapshot[];
  now?: string;
}): AdaptiveLearningPlan {
  const now = input.now ?? new Date().toISOString();
  const points = input.knowledgePoints.slice(0, 5);
  const questions: AdaptiveAssessmentQuestion[] = points.map((point) => ({
    id: `pretest-${point.id}`,
    prompt: `关于“${point.name}”，下面哪项最符合本节课所需的前序理解？`,
    options: [
      point.keyInfo || point.description || `${point.name}的核心含义`,
      `只需要记住“${point.name}”这个名称`,
      `它与本节课的任务没有关系`,
      `不需要任何条件即可直接应用`,
    ],
    correctOptionIndex: 0,
    rationale: point.keyInfo || point.description,
    knowledgePointIds: [point.id],
  }));

  const anchors = points.length ? points : input.knowledgePoints.slice(0, 1);
  const studentScenes = (input.mainScenes ?? [])
    .filter((scene) => scene.stageKey === "ai-learning" || scene.audience === "student")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const branches: AdaptiveBranchOutline[] = anchors.flatMap((point) => {
    const quizSceneIndex = studentScenes.findIndex((scene) =>
      scene.type === "quiz" && (scene.knowledgePointIds ?? []).includes(point.id),
    );
    const sceneIndex = quizSceneIndex >= 0
      ? quizSceneIndex
      : studentScenes.findIndex((scene) => (scene.knowledgePointIds ?? []).includes(point.id));
    const anchorScene = sceneIndex >= 0 ? studentScenes[sceneIndex] : undefined;
    const nextScene = sceneIndex >= 0 ? studentScenes[sceneIndex + 1] : undefined;
    const shared = {
      anchorKnowledgePointIds: [point.id],
      status: "draft" as const,
      sceneType: "slide" as const,
    };
    return [
      {
        ...shared,
        id: `branch-foundation-${point.id}`,
        kind: "foundation" as const,
        title: `${point.name} · 补基础`,
        objective: `用更具体的例子补齐理解${point.name}所需的基础。`,
        keyPoints: [
          point.description || point.name,
          `辨认${point.name}的关键条件`,
          `完成一个低门槛即时练习`,
        ],
        targetTiers: ["foundation", "standard"] as StudentLearningTier[],
        targetDurationSec: 180,
        generationGuidance: `使用贴近学生经验的具体例子，先补齐${point.name}的前序概念，再安排一个低门槛即时练习；避免引入新的高阶术语。`,
        trigger: {
          afterSceneId: anchorScene?.id,
          beforeSceneId: nextScene?.id,
          evidenceRule: "tier-or-low-score" as const,
          scoreThreshold: DEFAULT_ADAPTIVE_THRESHOLDS.branchQuizLow,
          minimumRemainingSec: 180,
        },
      },
      {
        ...shared,
        id: `branch-extension-${point.id}`,
        kind: "extension" as const,
        title: `${point.name} · 拓展挑战`,
        objective: `把${point.name}迁移到更复杂的项目情境中。`,
        keyPoints: [
          `${point.name}的边界与例外`,
          `跨情境迁移`,
          `完成一个高阶判断或设计挑战`,
        ],
        targetTiers: ["advanced"] as StudentLearningTier[],
        targetDurationSec: 180,
        generationGuidance: `围绕${point.name}设计一个新的项目迁移情境，要求学生比较边界、作出判断并说明依据；不要重复主课例题。`,
        trigger: {
          afterSceneId: anchorScene?.id,
          beforeSceneId: nextScene?.id,
          evidenceRule: "tier-and-high-score" as const,
          scoreThreshold: DEFAULT_ADAPTIVE_THRESHOLDS.branchQuizHigh,
          minimumRemainingSec: 180,
        },
      },
    ];
  });

  return {
    enabled: true,
    status: "draft",
    generatedAt: now,
    updatedAt: now,
    timeBudgetMin: 8,
    thresholds: { ...DEFAULT_ADAPTIVE_THRESHOLDS },
    pretest: {
      title: "课前基础热身",
      introduction: "用几道轻量题确认本节课所需的前序知识，结果只用于调整学习路径。",
      estimatedMinutes: 3,
      questions,
    },
    branches,
  };
}

export function normalizeAdaptiveLearningPlan(
  input: unknown,
  fallback: AdaptiveLearningPlan,
  now = new Date().toISOString(),
): AdaptiveLearningPlan {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const rawPretest =
    raw.pretest && typeof raw.pretest === "object"
      ? raw.pretest as Record<string, unknown>
      : {};
  const questions = Array.isArray(rawPretest.questions)
    ? rawPretest.questions.flatMap((item, index): AdaptiveAssessmentQuestion[] => {
        if (!item || typeof item !== "object") return [];
        const question = item as Record<string, unknown>;
        const options = Array.isArray(question.options)
          ? question.options.filter((option): option is string => typeof option === "string").slice(0, 4)
          : [];
        if (typeof question.prompt !== "string" || options.length < 2) return [];
        return [{
          id: typeof question.id === "string" ? question.id : `pretest-generated-${index + 1}`,
          prompt: question.prompt.trim(),
          options,
          correctOptionIndex:
            typeof question.correctOptionIndex === "number"
              ? Math.max(0, Math.min(options.length - 1, Math.round(question.correctOptionIndex)))
              : 0,
          rationale: typeof question.rationale === "string" ? question.rationale.trim() : undefined,
          knowledgePointIds: Array.isArray(question.knowledgePointIds)
            ? question.knowledgePointIds.filter((id): id is string => typeof id === "string")
            : [],
        }];
      }).slice(0, 6)
    : [];
  const branches = Array.isArray(raw.branches)
    ? raw.branches.flatMap((item, index): AdaptiveBranchOutline[] => {
        if (!item || typeof item !== "object") return [];
        const branch = item as Record<string, unknown>;
        const kind = branch.kind === "extension" ? "extension" : "foundation";
        const rawTrigger =
          branch.trigger && typeof branch.trigger === "object"
            ? branch.trigger as Record<string, unknown>
            : {};
        const evidenceRule =
          rawTrigger.evidenceRule === "tier"
          || rawTrigger.evidenceRule === "tier-and-high-score"
            ? rawTrigger.evidenceRule
            : kind === "extension"
              ? "tier-and-high-score"
              : "tier-or-low-score";
        if (typeof branch.title !== "string" || typeof branch.objective !== "string") return [];
        return [{
          id: typeof branch.id === "string" ? branch.id : `branch-generated-${index + 1}`,
          kind,
          title: branch.title.trim(),
          objective: branch.objective.trim(),
          keyPoints: Array.isArray(branch.keyPoints)
            ? branch.keyPoints.filter((point): point is string => typeof point === "string").slice(0, 5)
            : [],
          anchorKnowledgePointIds: Array.isArray(branch.anchorKnowledgePointIds)
            ? branch.anchorKnowledgePointIds.filter((id): id is string => typeof id === "string")
            : [],
          targetTiers:
            kind === "extension"
              ? ["advanced"]
              : ["foundation", "standard"],
          sceneType: branch.sceneType === "interactive" ? "interactive" : "slide",
          targetDurationSec:
            typeof branch.targetDurationSec === "number"
              ? Math.max(90, Math.min(360, Math.round(branch.targetDurationSec)))
              : 180,
          generationGuidance:
            typeof branch.generationGuidance === "string"
              ? branch.generationGuidance.trim()
              : fallback.branches.find((item) => item.id === branch.id)?.generationGuidance
                ?? (
                  kind === "foundation"
                    ? "使用具体、低门槛的例子补齐前序概念，并安排一次即时练习；避免增加新的认知负担。"
                    : "使用不同于主课的新项目情境进行迁移挑战，要求学生作出判断并解释依据。"
                ),
          preparedResource:
            branch.preparedResource && typeof branch.preparedResource === "object"
              ? (() => {
                  const resource = branch.preparedResource as Record<string, unknown>;
                  const status =
                    resource.status === "ready" || resource.status === "failed"
                      ? resource.status
                      : "generating";
                  return {
                    status,
                    classroomId:
                      typeof resource.classroomId === "string"
                        ? resource.classroomId
                        : undefined,
                    scenesCount:
                      typeof resource.scenesCount === "number"
                        ? Math.max(0, Math.round(resource.scenesCount))
                        : undefined,
                    generatedAt:
                      typeof resource.generatedAt === "string"
                        ? resource.generatedAt
                        : undefined,
                    error:
                      typeof resource.error === "string"
                        ? resource.error.slice(0, 500)
                        : undefined,
                  };
                })()
              : undefined,
          trigger: {
            afterSceneId:
              typeof rawTrigger.afterSceneId === "string"
                ? rawTrigger.afterSceneId
                : fallback.branches.find((item) => item.id === branch.id)?.trigger?.afterSceneId,
            beforeSceneId:
              typeof rawTrigger.beforeSceneId === "string"
                ? rawTrigger.beforeSceneId
                : fallback.branches.find((item) => item.id === branch.id)?.trigger?.beforeSceneId,
            evidenceRule,
            scoreThreshold:
              typeof rawTrigger.scoreThreshold === "number"
                ? Math.max(0, Math.min(100, Math.round(rawTrigger.scoreThreshold)))
                : kind === "extension"
                  ? fallback.thresholds.branchQuizHigh
                  : fallback.thresholds.branchQuizLow,
            minimumRemainingSec:
              typeof rawTrigger.minimumRemainingSec === "number"
                ? Math.max(90, Math.min(600, Math.round(rawTrigger.minimumRemainingSec)))
                : 180,
          },
          status: "draft",
        }];
      }).slice(0, 10)
    : [];
  return {
    ...fallback,
    status: "draft",
    generatedAt: now,
    updatedAt: now,
    timeBudgetMin:
      typeof raw.timeBudgetMin === "number"
        ? Math.max(3, Math.min(20, Math.round(raw.timeBudgetMin)))
        : fallback.timeBudgetMin,
    pretest: {
      title:
        typeof rawPretest.title === "string" && rawPretest.title.trim()
          ? rawPretest.title.trim()
          : fallback.pretest.title,
      introduction:
        typeof rawPretest.introduction === "string" && rawPretest.introduction.trim()
          ? rawPretest.introduction.trim()
          : fallback.pretest.introduction,
      estimatedMinutes:
        typeof rawPretest.estimatedMinutes === "number"
          ? Math.max(2, Math.min(6, Math.round(rawPretest.estimatedMinutes)))
          : fallback.pretest.estimatedMinutes,
      questions: questions.length ? questions : fallback.pretest.questions,
    },
    branches: branches.length ? branches : fallback.branches,
  };
}

export type AdaptiveBranchDecision =
  | { action: "insert"; branch: AdaptiveBranchOutline; reason: string }
  | { action: "continue"; reason: string };

export type AdaptiveBranchEvaluationResult = {
  decision: AdaptiveBranchDecision;
  evaluations: AdaptiveTriggerEvaluation[];
};

/**
 * Resolve the durable teaching-node identity carried by a generated scene.
 * Runtime scene ids can change after regeneration; outlineId is what teacher
 * trigger configuration is bound to.
 */
export function resolveAdaptiveSceneIdentity(scene: {
  id: string;
  outlineId?: string;
}): {
  stableSceneId: string;
  runtimeSceneId: string;
} {
  return {
    stableSceneId: scene.outlineId?.trim() || scene.id,
    runtimeSceneId: scene.id,
  };
}

export function evaluateAdaptiveBranchDecision(input: {
  plan: AdaptiveLearningPlan;
  state: StudentAdaptiveLearningState;
  nodeQuizScore?: number;
  anchorKnowledgePointIds: string[];
  completedSceneId?: string;
  /** Concrete player scene id, retained for diagnostics but never matching. */
  runtimeSceneId?: string;
  completedSceneTitle?: string;
  remainingBudgetSec: number;
  /** Teacher audit can request snapshots for branches not reached yet. */
  candidateBranchIds?: string[];
  /** Full set of main-course scenes already completed by the learner. */
  reachedSceneIds?: string[];
  now?: string;
}): AdaptiveBranchEvaluationResult {
  const { plan, state } = input;
  if (!plan.enabled || plan.status !== "teacher-confirmed") {
    return {
      decision: { action: "continue", reason: "自适应学习路径尚未由教师确认" },
      evaluations: [],
    };
  }
  if (state.enabled === false) {
    return {
      decision: { action: "continue", reason: "教师已关闭该学生的自适应路径" },
      evaluations: [],
    };
  }
  if (!state.tier || !state.pretestCompletedAt) {
    return {
      decision: { action: "continue", reason: "尚未形成学生分层证据" },
      evaluations: [],
    };
  }

  const alreadyRun = new Set(state.branchRuns.map((run) => run.branchOutlineId));
  const candidateBranchIds = new Set(input.candidateBranchIds ?? []);
  const reachedSceneIds = new Set(input.reachedSceneIds ?? []);
  const relevantBranches = plan.branches.flatMap((branch) => {
    const exactSceneMatch =
      Boolean(branch.trigger?.afterSceneId) &&
      branch.trigger?.afterSceneId === input.completedSceneId;
    const knowledgePointMatch =
      branch.anchorKnowledgePointIds.length > 0 &&
      branch.anchorKnowledgePointIds.some((id) =>
        input.anchorKnowledgePointIds.includes(id),
      );
    const configuredAnchorReached =
      Boolean(branch.trigger?.afterSceneId)
      && reachedSceneIds.has(branch.trigger!.afterSceneId!);
    if (!exactSceneMatch && !knowledgePointMatch && !candidateBranchIds.has(branch.id)) return [];
    return [{
      branch,
      matchedBy: exactSceneMatch || candidateBranchIds.has(branch.id)
        ? "scene-id" as const
        : "knowledge-point" as const,
      anchorPassed:
        exactSceneMatch
        || knowledgePointMatch
        || configuredAnchorReached,
      reachedAnchorSceneId:
        exactSceneMatch || knowledgePointMatch
          ? input.completedSceneId
          : configuredAnchorReached
            ? branch.trigger?.afterSceneId
            : undefined,
    }];
  });

  const evaluatedAt = input.now ?? new Date().toISOString();

  const evaluations = relevantBranches.map(({
    branch,
    matchedBy,
    anchorPassed,
    reachedAnchorSceneId,
  }) => {
    const nodeEvidence = [...state.evidence]
      .filter((evidence) =>
        evidence.source === "node-quiz" &&
        (
          branch.anchorKnowledgePointIds.length === 0 ||
          evidence.knowledgePointIds.length === 0 ||
          evidence.knowledgePointIds.some((id) =>
            branch.anchorKnowledgePointIds.includes(id),
          )
        ),
      )
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
    const currentNodeScoreApplies =
      typeof input.nodeQuizScore === "number"
      && (
        branch.anchorKnowledgePointIds.length === 0
        || input.anchorKnowledgePointIds.some((id) =>
          branch.anchorKnowledgePointIds.includes(id)
        )
      );
    const score =
      currentNodeScoreApplies
        ? input.nodeQuizScore
        : nodeEvidence?.score ?? state.pretestScore;
    const scoreSource =
      currentNodeScoreApplies
        ? "current-node-quiz" as const
        : nodeEvidence
          ? "recorded-node-quiz" as const
          : typeof state.pretestScore === "number"
            ? "pretest-fallback" as const
            : undefined;
    const threshold =
      branch.trigger?.scoreThreshold ??
      (branch.kind === "extension"
        ? plan.thresholds.branchQuizHigh
        : plan.thresholds.branchQuizLow);
    const rule =
      branch.trigger?.evidenceRule ??
      (branch.kind === "extension" ? "tier-and-high-score" : "tier-or-low-score");
    const tierPassed = branch.targetTiers.includes(state.tier!);
    const scorePassed =
      rule === "tier"
        ? true
        : rule === "tier-or-low-score"
          ? state.tier === "foundation" || (typeof score === "number" && score < threshold)
          : typeof score === "number" && score >= threshold;
    const minimumRemainingSec = branch.trigger?.minimumRemainingSec ?? 90;
    const timePassed =
      branch.targetDurationSec <= input.remainingBudgetSec &&
      minimumRemainingSec <= input.remainingBudgetSec;
    const conditions = [
      {
        key: "plan" as const,
        label: "分支已确认",
        expected: "教师已确认",
        actual: branch.status === "teacher-confirmed" ? "已确认" : "仍为草稿",
        passed: branch.status === "teacher-confirmed",
      },
      {
        key: "resource" as const,
        label: "分支成品资源",
        expected: "备课期已生成，可直接播放",
        actual:
          branch.preparedResource?.status === "ready" && branch.preparedResource.classroomId
            ? `已就绪（${branch.preparedResource.scenesCount ?? 1} 页）`
            : branch.preparedResource?.status === "failed"
              ? `生成失败：${branch.preparedResource.error || "请在备课阶段重新生成"}`
              : "尚未生成成品资源",
        passed:
          branch.preparedResource?.status === "ready"
          && Boolean(branch.preparedResource.classroomId),
      },
      {
        key: "student-path" as const,
        label: "个体路径开启",
        expected: "开启",
        actual: state.enabled === false ? "已关闭" : "已开启",
        passed: state.enabled !== false,
      },
      {
        key: "anchor" as const,
        label: "到达触发点",
        expected: branch.trigger?.afterSceneId ?? branch.anchorKnowledgePointIds.join("、"),
        actual: anchorPassed
          ? [
              `已完成${input.completedSceneTitle ? `「${input.completedSceneTitle}」` : "配置页面"}`,
              reachedAnchorSceneId ? `教学节点 ${reachedAnchorSceneId}` : "",
              input.runtimeSceneId
              && reachedAnchorSceneId === input.completedSceneId
              && input.runtimeSceneId !== input.completedSceneId
                ? `播放页 ${input.runtimeSceneId}`
                : "",
            ].filter(Boolean).join(" · ")
          : "尚未到达该主课页面",
        passed: anchorPassed,
      },
      {
        key: "unused" as const,
        label: "分支尚未运行",
        expected: "尚未运行",
        actual: alreadyRun.has(branch.id) ? "已有运行记录" : "尚未运行",
        passed: !alreadyRun.has(branch.id),
      },
      {
        key: "tier" as const,
        label: "学生层次",
        expected: branch.targetTiers.join(" / "),
        actual: state.tier!,
        passed: tierPassed,
      },
      {
        key: "score" as const,
        label: rule === "tier" ? "分数条件" : "测评分数",
        expected:
          rule === "tier"
            ? "该规则不要求分数"
            : rule === "tier-or-low-score"
              ? `基础生或分数 < ${threshold}`
              : `分数 ≥ ${threshold}`,
        actual:
          typeof score === "number"
            ? `${score} 分（${scoreSource === "pretest-fallback" ? "课前测回退" : scoreSource === "recorded-node-quiz" ? "最近节点小测" : "当前节点小测"}）`
            : "暂无可用分数",
        passed: scorePassed,
      },
      {
        key: "time" as const,
        label: "自适应预算剩余",
        expected: `至少 ${Math.ceil(Math.max(branch.targetDurationSec, minimumRemainingSec) / 60)} 分钟（分支需 ${Math.ceil(branch.targetDurationSec / 60)} 分钟，触发下限 ${Math.ceil(minimumRemainingSec / 60)} 分钟）`,
        actual: `当前 ${Math.floor(input.remainingBudgetSec / 60)} 分 ${input.remainingBudgetSec % 60} 秒`,
        passed: timePassed,
      },
    ];
    const passed = conditions.every((condition) => condition.passed);
    return {
      id: `trigger-evaluation-${branch.id}-${input.completedSceneId ?? "unknown"}`,
      branchOutlineId: branch.id,
      branchKind: branch.kind,
      completedSceneId: input.completedSceneId ?? "unknown",
      runtimeSceneId: input.runtimeSceneId,
      completedSceneTitle: input.completedSceneTitle,
      matchedBy,
      evaluatedAt,
      result: passed ? "triggered" as const : "conditions-not-met" as const,
      reason: passed
        ? `已满足${branch.kind === "foundation" ? "补基础" : "拓展"}分支条件`
        : conditions.filter((condition) => !condition.passed).map((condition) => condition.label).join("、") + "未满足",
      score,
      scoreSource,
      remainingBudgetSec: input.remainingBudgetSec,
      conditions,
    };
  });

  const triggeredEvaluation = evaluations.find((evaluation) => evaluation.result === "triggered");
  const branch = triggeredEvaluation
    ? plan.branches.find((candidate) => candidate.id === triggeredEvaluation.branchOutlineId)
    : undefined;
  if (!branch) {
    const reason = relevantBranches.length === 0
      ? "当前页面不是已配置的触发点"
      : evaluations.map((evaluation) => evaluation.reason).join("；");
    return { decision: { action: "continue", reason }, evaluations };
  }
  const decision: AdaptiveBranchDecision = {
    action: "insert",
    branch,
    reason:
      branch.kind === "foundation"
        ? `前测分层为${state.tier}，测评分数${triggeredEvaluation?.score ?? "暂无"}分，需要补齐基础`
        : `前测分层为advanced，测评分数${triggeredEvaluation?.score ?? "暂无"}分，且时间预算充足`,
  };
  return { decision, evaluations };
}

export function decideAdaptiveBranch(input: {
  plan: AdaptiveLearningPlan;
  state: StudentAdaptiveLearningState;
  nodeQuizScore?: number;
  anchorKnowledgePointIds: string[];
  completedSceneId?: string;
  completedSceneTitle?: string;
  remainingBudgetSec: number;
}): AdaptiveBranchDecision {
  return evaluateAdaptiveBranchDecision(input).decision;
}

export function calculateAdaptiveRemainingBudgetSec(
  plan: AdaptiveLearningPlan,
  state: Pick<StudentAdaptiveLearningState, "branchRuns">,
): number {
  const usedBudgetSec = state.branchRuns
    .filter((run) => ["generating", "ready", "completed"].includes(run.status))
    .reduce((sum, run) => {
      const branch = plan.branches.find((item) => item.id === run.branchOutlineId);
      return sum + (branch?.targetDurationSec ?? 0);
    }, 0);
  return Math.max(0, plan.timeBudgetMin * 60 - usedBudgetSec);
}

export function eligibleAdaptiveBranches(
  plan: AdaptiveLearningPlan,
  tier?: StudentLearningTier,
): AdaptiveBranchOutline[] {
  if (!tier) return [];
  return plan.branches.filter((branch) => branch.targetTiers.includes(tier));
}

export function extractLearningRequestTopic(message: string): string | null {
  const normalized = message.trim();
  const match = normalized.match(
    /(?:我想学|我想了解|系统讲(?:一讲|解)|详细讲(?:一讲|解)|给我讲讲)\s*[：:，,]?\s*(.+)/,
  );
  return match?.[1]?.replace(/[。！？!?]+$/, "").trim() || null;
}
