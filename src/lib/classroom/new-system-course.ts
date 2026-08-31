import type {
  PblModuleTimingPlan,
  PblTimingRecommendationConfidence,
} from "@/lib/pbl-time-model";
import type { Course, KnowledgePoint, TeachingOutlineSection } from "@/lib/session/types";

export const NEW_SYSTEM_STAGE_KEYS = [
  "launch",
  "ai-learning",
  "make",
  "showcase",
  "reflection",
] as const;

export type NewSystemReadinessCheck = {
  id: string;
  label: string;
  ok: boolean;
  message: string;
};

export type NewSystemAiDurationRecommendation = {
  durationMin: number;
  rationale: string;
  confidence: PblTimingRecommendationConfidence;
  knowledgePointBudgets: Array<{
    knowledgePointId: string;
    durationMin: number;
    rationale: string;
  }>;
  evidence: string[];
  assumptions: string[];
  scopeWarning?: string;
};

function distributeIntegerMinutes(totalMinutes: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const total = Math.max(weights.length, Math.round(totalMinutes));
  const safeWeights = weights.map((weight) => Math.max(0.1, Number(weight) || 0));
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const exact = safeWeights.map((weight) => total * weight / weightTotal);
  const result = exact.map((value) => Math.max(1, Math.floor(value)));
  let remainder = total - result.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  while (remainder > 0) {
    result[order[(total - remainder) % order.length]!.index] += 1;
    remainder -= 1;
  }
  while (remainder < 0) {
    const target = result.reduce((best, value, index) => value > result[best]! ? index : best, 0);
    if (result[target]! <= 1) break;
    result[target] -= 1;
    remainder += 1;
  }
  return result;
}

export function buildNewSystemAiTimingPlan(
  recommendation: NewSystemAiDurationRecommendation,
  knowledgePoints: readonly KnowledgePoint[],
  generatedAt: string = new Date().toISOString(),
): PblModuleTimingPlan {
  const totalMinutes = Math.max(knowledgePoints.length || 1, Math.round(recommendation.durationMin));
  const budgetById = new Map(recommendation.knowledgePointBudgets.map((budget) => [
    budget.knowledgePointId,
    budget,
  ]));
  const weights = knowledgePoints.map((point) => budgetById.get(point.id)?.durationMin ?? 1);
  const distributed = distributeIntegerMinutes(totalMinutes, weights);
  const recommendedStageTotals = {
    launch: 0,
    knowledge: totalMinutes,
    proposal: 0,
    practice: 0,
    showcase: 0,
    reflection: 0,
    other: 0,
  };
  return {
    schemaVersion: 1,
    totalMinutes,
    status: "confirmed",
    allocations: knowledgePoints.map((point, index) => ({
      id: `new-system-ai-learning-${point.id}`,
      title: point.name,
      stageKey: "ai-learning",
      activityKind: "knowledge",
      durationMin: distributed[index] ?? 1,
      recommendedDurationMin: distributed[index] ?? 1,
      knowledgePointIds: [point.id],
    })),
    recommendedStageTotals,
    recommendationSource: "llm",
    confidence: recommendation.confidence,
    rationaleByStage: {
      "ai-learning": recommendation.rationale,
    },
    assumptions: recommendation.assumptions,
    evidence: [
      ...recommendation.evidence,
      ...(recommendation.scopeWarning ? [`范围提醒：${recommendation.scopeWarning}`] : []),
      ...knowledgePoints.map((point, index) => {
        const budget = budgetById.get(point.id);
        return `${point.name}：${distributed[index] ?? 1} 分钟${budget?.rationale ? `（${budget.rationale}）` : ""}`;
      }),
    ],
    generatedAt,
    confirmedAt: generatedAt,
  };
}

/** Deterministic compatibility helper used only when no model judgment exists. */
export function buildNewSystemTimingPlan(
  aiDurationMinutes: number,
  generatedAt: string = new Date().toISOString(),
): PblModuleTimingPlan {
  const plan = buildNewSystemAiTimingPlan({
    durationMin: aiDurationMinutes,
    rationale: "按当前知识结构为 AI 授知预留完整讲解、练习与检测时间。",
    confidence: "medium",
    knowledgePointBudgets: [{
      knowledgePointId: "all-knowledge",
      durationMin: aiDurationMinutes,
      rationale: "尚未提供逐知识点时间判断。",
    }],
    evidence: ["AI 授知总时长"],
    assumptions: ["该计划只描述第二阶段 AI 授知，不分配其他 PBL 阶段时间。"],
  }, [{
    id: "all-knowledge",
    name: "AI 授知",
    description: "当前课程的 AI 授知内容",
    level: "core",
  }], generatedAt);
  return {
    ...plan,
    recommendationSource: "deterministic-fallback",
  };
}

export function isNewSystemAiTimingPlan(
  timing: PblModuleTimingPlan | null | undefined,
): timing is PblModuleTimingPlan {
  if (!timing || timing.status !== "confirmed") return false;
  const aiAllocations = timing.allocations.filter(
    (allocation) => allocation.stageKey === "ai-learning",
  );
  const aiMinutes = aiAllocations.reduce(
    (sum, allocation) => sum + Math.max(0, Math.round(allocation.durationMin)),
    0,
  );
  return aiAllocations.length > 0
    && timing.allocations.length === aiAllocations.length
    && Math.round(timing.totalMinutes) === aiMinutes
    && aiMinutes > 0;
}

export function buildNewSystemAiTeachingOutline(
  timingPlan: PblModuleTimingPlan,
  knowledgePoints: readonly KnowledgePoint[],
): TeachingOutlineSection[] {
  const durationMin = timingPlan.allocations
    .filter((allocation) => allocation.stageKey === "ai-learning")
    .reduce((sum, allocation) => sum + allocation.durationMin, 0) || 1;
  return [{
    id: "new-system-ai-learning",
    stageKey: "ai-learning",
    title: "AI 授知",
    durationMin,
    teachingGoal: "帮助学生理解完成项目所需的核心知识，并通过互动练习确认掌握情况。",
    teacherRole: "巡视学习进展，对共性困难进行现场补充讲解。",
    platformRole: "呈现 AI 授知内容、互动练习与学习进度。",
    aiRole: "讲解核心知识，提供针对性练习并反馈学生作答。",
    studentActivity: "按顺序完成知识学习、互动练习和阶段检测。",
    activityKind: "knowledge",
    knowledgePointIds: knowledgePoints.map((point) => point.id),
    openMaicUse: "student-ai-learning",
    resourceTypes: ["ppt", "interactive-demo"],
    notes: "新版备课阶段唯一需要生成的课堂内容。",
  }];
}

function sameStageKeys(keys: readonly string[]): boolean {
  return keys.length === NEW_SYSTEM_STAGE_KEYS.length
    && keys.every((key, index) => key === NEW_SYSTEM_STAGE_KEYS[index]);
}

export function getNewSystemCourseReadiness(
  course: Course,
): NewSystemReadinessCheck[] {
  const timing = course.content.moduleTimingPlan;
  const outlines = course.content._openmaicSceneOutlines ?? [];
  const aiOnlyOutlines = outlines.length > 0 && outlines.every(
    (outline) =>
      outline.stageKey === "ai-learning"
      && outline.audience !== "teacher",
  );

  return [
    {
      id: "basics",
      label: "课程基本信息",
      ok: Boolean(course.name.trim() && course.subject.trim() && course.grade.trim() && course.hours > 0),
      message: "课程名称、学科、年级和课时需要完整。",
    },
    {
      id: "stages",
      label: "五阶段课堂流程",
      ok: sameStageKeys(course.stages.map((stage) => stage.key)),
      message: "新版课堂必须依次包含项目启动、AI 授知、项目实践、成果汇报与评价、学习反思。",
    },
    {
      id: "timing",
      label: "AI 授知动态时长",
      ok: isNewSystemAiTimingPlan(timing),
      message: "AI 授知阶段需要采用基于知识图谱动态判断的独立时长。",
    },
    {
      id: "ai-outline",
      label: "AI 授知内容",
      ok: aiOnlyOutlines,
      message: "需要生成至少一页仅属于 AI 授知阶段的学生学习内容。",
    },
    {
      id: "ai-classroom",
      label: "AI 学习课堂",
      ok: Boolean(course.aiLearningClassroomId ?? course.content._openmaicClassroomId),
      message: "AI 授知课堂尚未生成完成。",
    },
  ];
}

export function isNewSystemCourseReady(course: Course): boolean {
  return getNewSystemCourseReadiness(course).every((check) => check.ok);
}
