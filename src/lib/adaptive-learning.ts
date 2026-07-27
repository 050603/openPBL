import type {
  AdaptiveAssessmentQuestion,
  AdaptiveBranchOutline,
  AdaptiveLearningPlan,
  AdaptiveTriggerCondition,
  AdaptiveTriggerEvaluation,
  KnowledgePoint,
  OpenMaicSceneOutlineSnapshot,
  StudentAdaptiveLearningState,
} from "@/lib/session/types";

export const MAX_ADAPTIVE_PRETEST_QUESTIONS = 5;
export const DEFAULT_ADAPTIVE_THRESHOLDS: AdaptiveLearningPlan["thresholds"] = {
  enrichmentMasteryMin: 80,
};

export function deriveAdaptiveCheckpointSceneIds(
  scenes: readonly Pick<
    OpenMaicSceneOutlineSnapshot,
    "id" | "type" | "order" | "stageKey" | "audience" | "knowledgePointIds"
  >[],
): string[] {
  return scenes
    .filter((scene) => scene.stageKey === "ai-learning" || scene.audience === "student")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((scene) => scene.type === "quiz" && (scene.knowledgePointIds?.length ?? 0) > 0)
    .map((scene) => scene.id);
}

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

export function derivePretestKnowledgeEvidence(
  questions: AdaptiveAssessmentQuestion[],
  answers: Record<string, number>,
): { weakKnowledgePointIds: string[]; masteredKnowledgePointIds: string[] } {
  const weak = new Set<string>();
  const mastered = new Set<string>();
  for (const question of questions) {
    const target = answers[question.id] === question.correctOptionIndex ? mastered : weak;
    question.knowledgePointIds.forEach((id) => target.add(id));
  }
  weak.forEach((id) => mastered.delete(id));
  return {
    weakKnowledgePointIds: [...weak],
    masteredKnowledgePointIds: [...mastered],
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizedText(value?: string): string {
  return (value ?? "").toLocaleLowerCase("zh-CN").replace(/[\s，。！？、；：,.!?;:（）()《》“”"'·-]/g, "");
}

export function adaptiveResourceAddsNovelContent(branch: AdaptiveBranchOutline): boolean {
  const novelty = normalizedText(branch.noveltyStatement);
  if (novelty.length < 6) return false;
  const objective = normalizedText(branch.objective);
  return novelty !== objective && !branch.keyPoints.every((point) => novelty.includes(normalizedText(point)));
}

function adaptiveResourceIdPart(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || Math.abs([...value].reduce((sum, char) => sum + char.charCodeAt(0), 0)).toString(36);
}

/**
 * The LLM owns resource quality, but the application owns coverage.
 * This repair step guarantees that every pretest prerequisite and every
 * module checkpoint has material available for runtime sequencing.
 */
export function ensureAdaptiveResourceCoverage(
  plan: AdaptiveLearningPlan,
  input: {
    knowledgePoints: KnowledgePoint[];
    mainScenes?: OpenMaicSceneOutlineSnapshot[];
  },
): AdaptiveLearningPlan {
  const branches = [...plan.branches];
  const pointById = new Map(input.knowledgePoints.map((point) => [point.id, point]));
  const studentScenes = (input.mainScenes ?? [])
    .filter((scene) => scene.stageKey === "ai-learning" || scene.audience === "student")
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  const pretestKnowledgePointIds = unique(
    plan.pretest.questions.flatMap((question) => question.knowledgePointIds),
  );

  for (const knowledgePointId of pretestKnowledgePointIds) {
    const covered = branches.some((branch) =>
      branch.trigger?.placement === "before-main-course"
      && (branch.prerequisiteKnowledgePointIds ?? []).includes(knowledgePointId),
    );
    if (covered) continue;
    const point = pointById.get(knowledgePointId);
    const name = point?.name || knowledgePointId;
    const overlapSceneIds = studentScenes
      .filter((scene) =>
        scene.type !== "quiz"
        && (scene.knowledgePointIds ?? []).includes(knowledgePointId),
      )
      .map((scene) => scene.id);
    branches.push({
      id: `resource-prerequisite-${adaptiveResourceIdPart(knowledgePointId)}`,
      kind: "prerequisite",
      title: `${name} · 先决知识诊断回顾`,
      objective: `针对前测中暴露的${name}薄弱点，补齐进入本节新知识所需的关键连接。`,
      keyPoints: [
        `${name}的关键前序判断`,
        "前测常见误解辨析",
        "与本节新知识的连接",
      ],
      anchorKnowledgePointIds: [knowledgePointId],
      prerequisiteKnowledgePointIds: [knowledgePointId],
      noveltyStatement: `根据前测错误定位${name}的具体误解，用诊断性新例子建立到本节新知识的连接，不复述主课完整讲解。`,
      mainCourseOverlapSceneIds: overlapSceneIds,
      sceneType: "slide",
      targetDurationSec: 150,
      generationGuidance: `围绕前测中${name}的错误选项设计一个新的诊断案例，先纠正常见误解，再用一张连接图说明它为何会影响本节新知识。避开主课页面 ${overlapSceneIds.join("、") || "中的完整定义与原例题"}，不要提前讲授本节核心结论。`,
      trigger: {
        placement: "before-main-course",
        evidenceRule: "pretest-gap",
        minimumRemainingSec: 150,
      },
      status: "draft",
    });
  }

  const moduleQuizzes = studentScenes.filter((scene) =>
    scene.type === "quiz" && (scene.knowledgePointIds?.length ?? 0) > 0,
  );
  moduleQuizzes.forEach((quiz, index) => {
    const covered = branches.some((branch) =>
      branch.trigger?.placement === "after-module"
      && (branch.trigger.assessmentSceneIds ?? []).includes(quiz.id),
    );
    if (covered) return;
    const knowledgePointIds = unique(quiz.knowledgePointIds ?? []);
    const names = knowledgePointIds.map((id) => pointById.get(id)?.name || id);
    const moduleName = names.join("、") || quiz.title.replace(/[·\s]*(节点|模块)?测验.*$/u, "");
    const overlapSceneIds = studentScenes
      .filter((scene) =>
        scene.type !== "quiz"
        && (scene.knowledgePointIds ?? []).some((id) => knowledgePointIds.includes(id)),
      )
      .map((scene) => scene.id);
    const kinds = ["worked-example", "application", "extension"] as const;
    const kind = kinds[index % kinds.length];
    branches.push({
      id: `resource-module-${adaptiveResourceIdPart(quiz.id)}`,
      kind,
      title: `${moduleName} · 模块拓展`,
      objective: `在学生掌握${moduleName}后，通过主课未出现的新情境继续应用、迁移或深化思考。`,
      keyPoints: [
        `${moduleName}的新情境应用`,
        "方法边界或条件变化",
        "基于证据解释判断",
      ],
      anchorKnowledgePointIds: knowledgePointIds,
      prerequisiteKnowledgePointIds: [],
      noveltyStatement: `围绕${moduleName}提供主课未出现的新案例、条件变化或迁移任务，学生需要作出新的判断并解释依据。`,
      mainCourseOverlapSceneIds: overlapSceneIds,
      sceneType: kind === "application" ? "interactive" : "slide",
      targetDurationSec: 180,
      generationGuidance: `选择与主课不同的真实或项目情境，不复述定义和原例题。先呈现新问题，让学生判断或操作，再解释${moduleName}在新条件下如何应用，并指出一个边界或反例。避开主课页面：${overlapSceneIds.join("、") || "无明确重叠页"}。`,
      trigger: {
        placement: "after-module",
        assessmentSceneIds: [quiz.id],
        linkedQuestionIds: [],
        answerRule: "score-at-least",
        evidenceRule: "module-mastery",
        scoreThreshold: plan.thresholds.enrichmentMasteryMin ?? 80,
        minimumRemainingSec: 180,
      },
      status: "draft",
    });
  });

  return {
    ...plan,
    branches,
  };
}

export function confirmAdaptiveLearningPlan(
  plan: AdaptiveLearningPlan,
  now = new Date().toISOString(),
): AdaptiveLearningPlan {
  return {
    ...plan,
    status: "teacher-confirmed",
    branches: plan.branches.map((branch) => ({
      ...branch,
      status: "teacher-confirmed",
    })),
    updatedAt: now,
  };
}

export function createDefaultAdaptiveLearningPlan(input: {
  knowledgePoints: KnowledgePoint[];
  mainScenes?: OpenMaicSceneOutlineSnapshot[];
  now?: string;
}): AdaptiveLearningPlan {
  const now = input.now ?? new Date().toISOString();
  const points = input.knowledgePoints.slice(0, MAX_ADAPTIVE_PRETEST_QUESTIONS);
  const questions: AdaptiveAssessmentQuestion[] = points.map((point, index) => ({
    id: `pretest-${point.id}`,
    prompt: `要理解本节课的新内容，关于“${point.name}”最关键的前序判断是什么？`,
    options: [
      point.keyInfo || point.description || `${point.name}的核心含义`,
      `只需要记住“${point.name}”这个名称`,
      "它与本节课的新知识没有关系",
      "不需要任何条件就可以直接应用",
    ],
    correctOptionIndex: index % 4,
    rationale: point.keyInfo || point.description,
    knowledgePointIds: [point.id],
  })).map((question) => {
    if (question.correctOptionIndex === 0) return question;
    const options = [...question.options];
    [options[0], options[question.correctOptionIndex]] = [
      options[question.correctOptionIndex],
      options[0],
    ];
    return { ...question, options };
  });

  const plan: AdaptiveLearningPlan = {
    enabled: true,
    status: "draft",
    generatedAt: now,
    updatedAt: now,
    timeBudgetMin: 8,
    thresholds: { ...DEFAULT_ADAPTIVE_THRESHOLDS },
    pretest: {
      title: "课前先决知识检查",
      introduction: "最多 5 道题，只检查理解本节新知识必需的前序基础；答题结果用于安排开课前的必要回顾。",
      estimatedMinutes: 3,
      questions,
    },
    branches: [],
  };
  return ensureAdaptiveResourceCoverage(plan, input);
}

function normalizeKind(value: unknown): AdaptiveBranchOutline["kind"] {
  if (value === "prerequisite" || value === "worked-example" || value === "application" || value === "extension") {
    return value;
  }
  return value === "foundation" ? "prerequisite" : "application";
}

export function normalizeAdaptiveLearningPlan(
  input: unknown,
  fallback: AdaptiveLearningPlan,
  now = new Date().toISOString(),
): AdaptiveLearningPlan {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const rawPretest = raw.pretest && typeof raw.pretest === "object"
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
          correctOptionIndex: typeof question.correctOptionIndex === "number"
            ? Math.max(0, Math.min(options.length - 1, Math.round(question.correctOptionIndex)))
            : 0,
          rationale: typeof question.rationale === "string" ? question.rationale.trim() : undefined,
          knowledgePointIds: Array.isArray(question.knowledgePointIds)
            ? unique(question.knowledgePointIds.filter((id): id is string => typeof id === "string"))
            : [],
        }];
      }).slice(0, MAX_ADAPTIVE_PRETEST_QUESTIONS)
    : [];
  const branches = Array.isArray(raw.branches)
    ? raw.branches.flatMap((item, index): AdaptiveBranchOutline[] => {
        if (!item || typeof item !== "object") return [];
        const branch = item as Record<string, unknown>;
        if (typeof branch.title !== "string" || typeof branch.objective !== "string") return [];
        const kind = normalizeKind(branch.kind);
        const prerequisite = kind === "prerequisite";
        const rawTrigger = branch.trigger && typeof branch.trigger === "object"
          ? branch.trigger as Record<string, unknown>
          : {};
        const fallbackBranch = fallback.branches.find((candidate) => candidate.id === branch.id);
        const fallbackTrigger = fallbackBranch?.trigger;
        const anchorKnowledgePointIds = Array.isArray(branch.anchorKnowledgePointIds)
          ? unique(branch.anchorKnowledgePointIds.filter((id): id is string => typeof id === "string"))
          : [];
        const prerequisiteKnowledgePointIds = Array.isArray(branch.prerequisiteKnowledgePointIds)
          ? unique(branch.prerequisiteKnowledgePointIds.filter((id): id is string => typeof id === "string"))
          : prerequisite ? anchorKnowledgePointIds : [];
        const noveltyStatement = typeof branch.noveltyStatement === "string" && branch.noveltyStatement.trim()
          ? branch.noveltyStatement.trim()
          : prerequisite
            ? "只回顾主课开始前必须具备、且主课未完整讲授的先决知识。"
            : "使用主课未出现的新案例或新问题进行迁移，不复述定义与原例题。";
        return [{
          id: typeof branch.id === "string" ? branch.id : `resource-generated-${index + 1}`,
          kind,
          title: branch.title.trim(),
          objective: branch.objective.trim(),
          keyPoints: Array.isArray(branch.keyPoints)
            ? unique(branch.keyPoints.filter((point): point is string => typeof point === "string")).slice(0, 5)
            : [],
          anchorKnowledgePointIds,
          prerequisiteKnowledgePointIds,
          noveltyStatement,
          mainCourseOverlapSceneIds: Array.isArray(branch.mainCourseOverlapSceneIds)
            ? unique(branch.mainCourseOverlapSceneIds.filter((id): id is string => typeof id === "string"))
            : [],
          sceneType: branch.sceneType === "interactive" ? "interactive" : "slide",
          targetDurationSec: typeof branch.targetDurationSec === "number"
            ? Math.max(90, Math.min(360, Math.round(branch.targetDurationSec)))
            : 150,
          generationGuidance: typeof branch.generationGuidance === "string"
            ? branch.generationGuidance.trim()
            : fallbackBranch?.generationGuidance ?? "不得重复主课定义、例题或结论，资源必须提供新的学习价值。",
          preparedResource: branch.preparedResource && typeof branch.preparedResource === "object"
            ? (() => {
                const resource = branch.preparedResource as Record<string, unknown>;
                return {
                  status: resource.status === "ready" || resource.status === "failed"
                    ? resource.status
                    : "generating" as const,
                  classroomId: typeof resource.classroomId === "string" ? resource.classroomId : undefined,
                  scenesCount: typeof resource.scenesCount === "number" ? Math.max(0, Math.round(resource.scenesCount)) : undefined,
                  generatedAt: typeof resource.generatedAt === "string" ? resource.generatedAt : undefined,
                  error: typeof resource.error === "string" ? resource.error.slice(0, 500) : undefined,
                };
              })()
            : undefined,
          trigger: {
            placement: prerequisite ? "before-main-course" : "after-module",
            afterSceneId: typeof rawTrigger.afterSceneId === "string" ? rawTrigger.afterSceneId : undefined,
            beforeSceneId: typeof rawTrigger.beforeSceneId === "string" ? rawTrigger.beforeSceneId : fallbackTrigger?.beforeSceneId,
            assessmentSceneIds: Array.isArray(rawTrigger.assessmentSceneIds)
              ? unique(rawTrigger.assessmentSceneIds.filter((id): id is string => typeof id === "string"))
              : fallbackTrigger?.assessmentSceneIds ?? [],
            linkedQuestionIds: Array.isArray(rawTrigger.linkedQuestionIds)
              ? unique(rawTrigger.linkedQuestionIds.filter((id): id is string => typeof id === "string"))
              : [],
            answerRule: "score-at-least",
            evidenceRule: prerequisite ? "pretest-gap" : "module-mastery",
            scoreThreshold: typeof rawTrigger.scoreThreshold === "number"
              ? Math.max(0, Math.min(100, Math.round(rawTrigger.scoreThreshold)))
              : fallback.thresholds.enrichmentMasteryMin,
            minimumRemainingSec: typeof rawTrigger.minimumRemainingSec === "number"
              ? Math.max(90, Math.min(600, Math.round(rawTrigger.minimumRemainingSec)))
              : 150,
          },
          status: "draft",
        }];
      }).slice(0, 30)
    : [];
  return {
    ...fallback,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
    status: "draft",
    generatedAt: now,
    updatedAt: now,
    timeBudgetMin: typeof raw.timeBudgetMin === "number"
      ? Math.max(3, Math.min(20, Math.round(raw.timeBudgetMin)))
      : fallback.timeBudgetMin,
    thresholds: {
      enrichmentMasteryMin:
        raw.thresholds && typeof raw.thresholds === "object"
        && typeof (raw.thresholds as Record<string, unknown>).enrichmentMasteryMin === "number"
          ? Math.max(60, Math.min(100, Math.round((raw.thresholds as Record<string, number>).enrichmentMasteryMin)))
          : fallback.thresholds.enrichmentMasteryMin,
    },
    pretest: {
      title: typeof rawPretest.title === "string" && rawPretest.title.trim()
        ? rawPretest.title.trim()
        : fallback.pretest.title,
      introduction: typeof rawPretest.introduction === "string" && rawPretest.introduction.trim()
        ? rawPretest.introduction.trim()
        : fallback.pretest.introduction,
      estimatedMinutes: typeof rawPretest.estimatedMinutes === "number"
        ? Math.max(2, Math.min(5, Math.round(rawPretest.estimatedMinutes)))
        : fallback.pretest.estimatedMinutes,
      questions: questions.length ? questions : fallback.pretest.questions.slice(0, MAX_ADAPTIVE_PRETEST_QUESTIONS),
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

export function resolveAdaptiveSceneIdentity(scene: { id: string; outlineId?: string }): {
  stableSceneId: string;
  runtimeSceneId: string;
} {
  return { stableSceneId: scene.outlineId?.trim() || scene.id, runtimeSceneId: scene.id };
}

function resourceReadyCondition(branch: AdaptiveBranchOutline): AdaptiveTriggerCondition {
  const ready = branch.preparedResource?.status === "ready" && Boolean(branch.preparedResource.classroomId);
  return {
    key: "resource",
    label: "备课资源",
    expected: "已生成并可直接播放",
    actual: ready
      ? `已就绪（${branch.preparedResource?.scenesCount ?? 1} 页）`
      : branch.preparedResource?.status === "failed"
        ? `生成失败：${branch.preparedResource.error || "请重新生成"}`
        : "尚未生成",
    passed: ready,
  };
}

export function evaluateAdaptiveBranchDecision(input: {
  plan: AdaptiveLearningPlan;
  state: StudentAdaptiveLearningState;
  nodeQuizScore?: number;
  anchorKnowledgePointIds: string[];
  completedSceneId?: string;
  runtimeSceneId?: string;
  completedSceneTitle?: string;
  questionResults?: Array<{ questionId: string; correct: boolean | null }>;
  isAutomaticCheckpoint?: boolean;
  remainingBudgetSec: number;
  candidateBranchIds?: string[];
  reachedSceneIds?: string[];
  phase?: "pre-course" | "after-module";
  now?: string;
}): AdaptiveBranchEvaluationResult {
  const { plan, state } = input;
  if (!plan.enabled || plan.status !== "teacher-confirmed") {
    return { decision: { action: "continue", reason: "自适应资源尚未由教师确认" }, evaluations: [] };
  }
  if (state.enabled === false) {
    return { decision: { action: "continue", reason: "教师已关闭该学生的个性化资源编排" }, evaluations: [] };
  }
  if (!state.pretestCompletedAt) {
    return { decision: { action: "continue", reason: "尚未完成课前先决知识检查" }, evaluations: [] };
  }

  const phase = input.phase ?? "after-module";
  const alreadyRun = new Set(state.branchRuns.map((run) => run.branchOutlineId));
  const candidateIds = new Set(input.candidateBranchIds ?? []);
  const weakIds = new Set(state.pretestWeakKnowledgePointIds ?? []);
  const reachedSceneIds = new Set(input.reachedSceneIds ?? []);
  const relevantBranches = plan.branches.filter((branch) => {
    if (branch.trigger?.placement !== (phase === "pre-course" ? "before-main-course" : "after-module")) return false;
    if (candidateIds.has(branch.id)) return true;
    if (phase === "pre-course") {
      return branch.prerequisiteKnowledgePointIds.some((id) => weakIds.has(id));
    }
    const assessmentIds = branch.trigger?.assessmentSceneIds ?? [];
    const sceneMatch = Boolean(input.completedSceneId) && (
      assessmentIds.includes(input.completedSceneId!)
      || branch.trigger?.afterSceneId === input.completedSceneId
    );
    const knowledgeMatch = assessmentIds.length === 0
      && input.isAutomaticCheckpoint === true
      && branch.anchorKnowledgePointIds.some((id) => input.anchorKnowledgePointIds.includes(id));
    return sceneMatch || knowledgeMatch;
  });
  const evaluatedAt = input.now ?? new Date().toISOString();

  const evaluations = relevantBranches.map((branch): AdaptiveTriggerEvaluation => {
    const prerequisite = branch.trigger?.placement === "before-main-course";
    const assessmentSceneIds = branch.trigger?.assessmentSceneIds ?? [];
    const configuredAnchorIds = branch.trigger?.afterSceneId
      ? [branch.trigger.afterSceneId]
      : assessmentSceneIds;
    const anchorPassed = prerequisite || configuredAnchorIds.some((id) =>
      id === input.completedSceneId || reachedSceneIds.has(id),
    ) || (
      configuredAnchorIds.length === 0
      && input.isAutomaticCheckpoint === true
      && Boolean(input.completedSceneId)
    );
    const matchingWeakIds = branch.prerequisiteKnowledgePointIds.filter((id) => weakIds.has(id));
    const latestNodeEvidence = [...state.evidence]
      .filter((evidence) => evidence.source === "node-quiz"
        && evidence.knowledgePointIds.some((id) => branch.anchorKnowledgePointIds.includes(id)))
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
    const score = prerequisite
      ? state.pretestScore
      : input.nodeQuizScore ?? latestNodeEvidence?.score;
    const scoreSource = prerequisite
      ? "pretest" as const
      : typeof input.nodeQuizScore === "number"
        ? "current-node-quiz" as const
        : latestNodeEvidence ? "recorded-node-quiz" as const : undefined;
    const threshold = branch.trigger?.scoreThreshold ?? plan.thresholds.enrichmentMasteryMin;
    const evidencePassed = prerequisite ? matchingWeakIds.length > 0 : typeof score === "number" && score >= threshold;
    const timeRequired = Math.max(branch.targetDurationSec, branch.trigger?.minimumRemainingSec ?? 90);
    const conditions: AdaptiveTriggerCondition[] = [
      {
        key: "plan",
        label: "教师审核",
        expected: "资源大纲已确认",
        actual: branch.status === "teacher-confirmed" ? "已确认" : "仍为草稿",
        passed: branch.status === "teacher-confirmed",
      },
      resourceReadyCondition(branch),
      {
        key: "student-path",
        label: "个性化编排",
        expected: "已开启",
        actual: state.enabled === false ? "已关闭" : "已开启",
        passed: state.enabled !== false,
      },
      {
        key: "anchor",
        label: prerequisite ? "插入位置" : "到达模块测验",
        expected: prerequisite ? "正式主课开始前" : (branch.trigger?.assessmentSceneIds ?? []).join(" / ") || "匹配知识模块",
        actual: prerequisite
          ? "前测已提交，主课尚未开始"
          : anchorPassed
            ? `已完成「${input.completedSceneTitle || input.completedSceneId || configuredAnchorIds.join("、")}」`
            : "尚未到达",
        passed: anchorPassed,
      },
      {
        key: "unused",
        label: "尚未学习",
        expected: "本资源未播放",
        actual: alreadyRun.has(branch.id) ? "已有播放记录" : "尚未播放",
        passed: !alreadyRun.has(branch.id),
      },
      {
        key: "evidence",
        label: prerequisite ? "先决知识缺口" : "模块掌握证据",
        expected: prerequisite
          ? branch.prerequisiteKnowledgePointIds.join("、") || "至少一个关联先决知识答错"
          : `模块测验 ≥ ${threshold} 分`,
        actual: prerequisite
          ? matchingWeakIds.length ? `检测到缺口：${matchingWeakIds.join("、")}` : "未检测到关联缺口"
          : typeof score === "number" ? `${score} 分` : "暂无模块测验分数",
        passed: evidencePassed,
      },
      {
        key: "novelty",
        label: "与主课去重",
        expected: "明确新增学习价值",
        actual: branch.noveltyStatement || "未填写新增价值",
        passed: adaptiveResourceAddsNovelContent(branch),
      },
      {
        key: "time",
        label: "AI 授知剩余时间",
        expected: `至少 ${Math.ceil(timeRequired / 60)} 分钟`,
        actual: `当前 ${Math.floor(input.remainingBudgetSec / 60)} 分 ${input.remainingBudgetSec % 60} 秒`,
        passed: input.remainingBudgetSec >= timeRequired,
      },
    ];
    const passed = conditions.every((condition) => condition.passed);
    return {
      id: `trigger-evaluation-${branch.id}-${input.completedSceneId ?? "pre-course"}`,
      branchOutlineId: branch.id,
      branchKind: branch.kind,
      completedSceneId: input.completedSceneId ?? "pre-course",
      runtimeSceneId: input.runtimeSceneId,
      completedSceneTitle: input.completedSceneTitle,
      matchedBy: prerequisite ? "pretest-gap" : (branch.trigger?.assessmentSceneIds?.length ? "scene-id" : "knowledge-point"),
      evaluatedAt,
      result: passed ? "triggered" : "conditions-not-met",
      reason: passed
        ? prerequisite ? "检测到会影响新课学习的先决知识缺口" : "模块掌握良好且时间充足，可学习额外资源"
        : conditions.filter((condition) => !condition.passed).map((condition) => `${condition.label}未满足`).join("、"),
      score,
      scoreSource,
      remainingBudgetSec: input.remainingBudgetSec,
      conditions,
    };
  });

  const triggered = evaluations
    .filter((evaluation) => evaluation.result === "triggered")
    .sort((left, right) => {
      const leftBranch = plan.branches.find((branch) => branch.id === left.branchOutlineId);
      const rightBranch = plan.branches.find((branch) => branch.id === right.branchOutlineId);
      return (leftBranch?.targetDurationSec ?? 0) - (rightBranch?.targetDurationSec ?? 0);
    })[0];
  const branch = triggered && plan.branches.find((candidate) => candidate.id === triggered.branchOutlineId);
  return branch
    ? { decision: { action: "insert", branch, reason: triggered.reason }, evaluations }
    : {
        decision: {
          action: "continue",
          reason: relevantBranches.length ? evaluations.map((evaluation) => evaluation.reason).join("；") : "当前没有匹配的额外资源",
        },
        evaluations,
      };
}

export function decideAdaptiveBranch(
  input: Parameters<typeof evaluateAdaptiveBranchDecision>[0],
): AdaptiveBranchDecision {
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
  state?: Pick<StudentAdaptiveLearningState, "pretestWeakKnowledgePointIds">,
): AdaptiveBranchOutline[] {
  if (!state) return plan.branches;
  const weak = new Set(state.pretestWeakKnowledgePointIds ?? []);
  return plan.branches.filter((branch) =>
    branch.kind !== "prerequisite"
    || branch.prerequisiteKnowledgePointIds.some((id) => weak.has(id)),
  );
}

export function extractLearningRequestTopic(message: string): string | null {
  const normalized = message.trim();
  const match = normalized.match(
    /(?:我想学|我想了解|系统讲(?:一讲|解)|详细讲(?:一讲|解)|给我讲讲)\s*[：:，,]?\s*(.+)/,
  );
  return match?.[1]?.replace(/[。！？!?]+$/, "").trim() || null;
}
