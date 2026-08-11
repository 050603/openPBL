import { DEFAULT_EVALUATION_FLOWS, type Course, type EvaluationPlan } from "@/lib/session/types";
import type { PblActivityCatalogEntry, SceneOutline } from "@/lib/openmaic/types/generation";

export type StageQualityResult = {
  passed: boolean;
  checks: string[];
  issues: string[];
};

export function ensureEvaluationResponsibility(plan: EvaluationPlan): EvaluationPlan {
  let dimensions: EvaluationPlan["dimensions"] = plan.dimensions.map((dimension, index) => ({
    ...dimension,
    responsibleRole: dimension.responsibleRole ?? (index % 2 === 0 ? "ai" : "teacher"),
  }));

  if (dimensions.length > 1 && !dimensions.some((item) => item.responsibleRole === "ai")) {
    dimensions[0] = { ...dimensions[0], responsibleRole: "ai" };
  }
  if (dimensions.length > 1 && !dimensions.some((item) => item.responsibleRole === "teacher")) {
    dimensions[dimensions.length - 1] = {
      ...dimensions[dimensions.length - 1],
      responsibleRole: "teacher",
    };
  }

  const generatedScoredFlows = (plan.flows ?? []).filter(
    (flow) => flow.enabled && flow.scored !== false && (flow.sourceRole === "ai" || flow.sourceRole === "teacher"),
  );
  const generatedRoles = new Set(generatedScoredFlows.map((flow) => flow.sourceRole));
  const sourceFlows = generatedRoles.has("ai") && generatedRoles.has("teacher")
    ? [
        ...plan.flows!,
        ...DEFAULT_EVALUATION_FLOWS.filter((fallback) =>
          fallback.sourceRole === "self" && !plan.flows!.some((flow) => flow.sourceRole === "self")),
      ]
    : DEFAULT_EVALUATION_FLOWS;
  const flows = normalizeEvaluationFlowWeights(sourceFlows.map((flow) => ({
    ...flow,
    evidenceRequirements: [...flow.evidenceRequirements],
  })));
  dimensions = normalizeDimensionWeights(dimensions, flows);

  return {
    ...plan,
    dimensions,
    flows,
  };
}

function normalizeDimensionWeights(
  dimensions: EvaluationPlan["dimensions"],
  flows: NonNullable<EvaluationPlan["flows"]>,
): EvaluationPlan["dimensions"] {
  const targets = new Map<"ai" | "teacher", number>([["ai", 0], ["teacher", 0]]);
  for (const flow of flows) {
    if (!flow.enabled || flow.scored === false || (flow.sourceRole !== "ai" && flow.sourceRole !== "teacher")) continue;
    targets.set(flow.sourceRole, (targets.get(flow.sourceRole) ?? 0) + Math.max(0, Math.round(flow.weight)));
  }
  const weights = new Map<string, number>();

  for (const role of ["ai", "teacher"] as const) {
    const roleDimensions = dimensions.filter((item) => item.responsibleRole === role);
    if (roleDimensions.length === 0) continue;
    const target = targets.get(role) ?? 0;
    const sourceTotal = roleDimensions.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
    const exact = roleDimensions.map((item) => sourceTotal > 0
      ? (Math.max(0, Number(item.weight) || 0) / sourceTotal) * target
      : target / roleDimensions.length);
    const rounded = exact.map(Math.floor);
    let remainder = target - rounded.reduce((sum, value) => sum + value, 0);
    const remainderOrder = exact
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (const item of remainderOrder) {
      if (remainder <= 0) break;
      rounded[item.index] += 1;
      remainder -= 1;
    }
    roleDimensions.forEach((item, index) => weights.set(item.id, rounded[index]));
  }

  return dimensions.map((item) => ({ ...item, weight: weights.get(item.id) ?? item.weight }));
}

function normalizeEvaluationFlowWeights(
  flows: NonNullable<EvaluationPlan["flows"]>,
): NonNullable<EvaluationPlan["flows"]> {
  const scoredIndexes = flows
    .map((flow, index) => ({ flow, index }))
    .filter(({ flow }) => flow.enabled && flow.scored !== false && (flow.sourceRole === "ai" || flow.sourceRole === "teacher"));
  const total = scoredIndexes.reduce((sum, { flow }) => sum + Math.max(0, Number(flow.weight) || 0), 0);
  if (total <= 0) return flows;
  const exact = scoredIndexes.map(({ flow }) => (Math.max(0, Number(flow.weight) || 0) / total) * 100);
  const rounded = exact.map(Math.floor);
  let remainder = 100 - rounded.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const item of order) {
    if (remainder <= 0) break;
    rounded[item.index] += 1;
    remainder -= 1;
  }
  const weightByIndex = new Map(scoredIndexes.map(({ index }, offset) => [index, rounded[offset]]));
  return flows.map((flow, index) => ({ ...flow, weight: weightByIndex.get(index) ?? flow.weight }));
}

export function evaluatePositioning(course: Course): StageQualityResult {
  const issues = [
    course.name.trim() && course.name !== "未命名课程" ? "" : "课程名称仍为空白",
    course.subject.trim() ? "" : "学科尚未明确",
    course.grade.trim() ? "" : "适用年级尚未明确",
    course.hours >= 1 && course.hours <= 5 ? "" : "课程课时应在 1 至 5 课时之间",
    course.summary.trim().length >= 30 ? "" : "课程说明过短，无法约束后续设计",
    (course.learningObjectives?.length ?? 0) >= 3 ? "" : "至少需要 3 个可评价课程目标",
    course.drivingQuestion.trim().endsWith("？") || course.drivingQuestion.trim().endsWith("?")
      ? ""
      : "项目驱动问题需要是明确的问题",
  ].filter(Boolean);
  return {
    passed: issues.length === 0,
    issues,
    checks: [
      `课程：${course.name}`,
      `对象：${course.grade} · ${course.subject}`,
      `${course.hours} 课时 · ${course.learningObjectives?.length ?? 0} 个课程目标`,
    ],
  };
}

export function evaluateProjectDesign(course: Course): StageQualityResult {
  const outcome = course.pblConfig?.outcome;
  const issues = [
    outcome?.artifact?.trim() ? "" : "缺少可提交的项目作品要求",
    outcome?.presentation?.trim() ? "" : "缺少成果表达要求",
    outcome?.reflection?.trim() ? "" : "缺少项目反思要求",
    course.pblConfig?.evidenceRequirements?.length ? "" : "缺少过程证据要求",
  ].filter(Boolean);
  return {
    passed: issues.length === 0,
    issues,
    checks: [
      `作品：${outcome?.artifact || "未生成"}`,
      `过程证据 ${course.pblConfig?.evidenceRequirements?.length ?? 0} 类`,
      "成果包含作品、表达与反思",
    ],
  };
}

export function evaluateEvaluationPlan(plan: EvaluationPlan): StageQualityResult {
  const roles = new Set(plan.dimensions.map((item) => item.responsibleRole));
  const flows = plan.flows ?? [];
  const totalDimensionWeight = plan.dimensions.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  const roleWeight = (role: "ai" | "teacher") => plan.dimensions
    .filter((item) => item.responsibleRole === role)
    .reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  const flowWeight = (role: "ai" | "teacher") => flows
    .filter((flow) => flow.sourceRole === role && flow.enabled && flow.scored !== false)
    .reduce((sum, flow) => sum + (Number(flow.weight) || 0), 0);
  const issues = [
    plan.dimensions.length >= 2 ? "" : "评价维度不足",
    roles.has("ai") ? "" : "评价维度缺少 AI 评价职责",
    roles.has("teacher") ? "" : "评价维度缺少教师评价职责",
    flows.some((flow) => flow.sourceRole === "ai" && flow.scored !== false) ? "" : "缺少 AI 计分评价流程",
    flows.some((flow) => flow.sourceRole === "teacher" && flow.scored !== false) ? "" : "缺少教师计分评价流程",
    totalDimensionWeight === 100 ? "" : `评价维度合计应为 100%，当前为 ${totalDimensionWeight}%`,
    roleWeight("ai") === flowWeight("ai") ? "" : `AI 评价维度应合计 ${flowWeight("ai")}%`,
    roleWeight("teacher") === flowWeight("teacher") ? "" : `教师评价维度应合计 ${flowWeight("teacher")}%`,
  ].filter(Boolean);
  return {
    passed: issues.length === 0,
    issues,
    checks: [
      `${plan.dimensions.length} 个评价维度`,
      "AI 负责过程与专业性评价",
      "教师负责现场汇报与通用表现评价",
    ],
  };
}

const REQUIRED_TEACHER_STAGES = ["launch", "proposal", "make", "showcase"];

export function evaluateLessonOutlines(
  outlines: ReadonlyArray<SceneOutline>,
  interactiveMode: boolean,
  activityCatalog: ReadonlyArray<PblActivityCatalogEntry> = [],
): StageQualityResult {
  const student = outlines.filter((outline) => outline.audience === "student");
  const interactive = student.filter((outline) => outline.type === "interactive");
  const teacherStages = new Set(
    outlines
      .filter((outline) => outline.audience === "teacher")
      .map((outline) => outline.stageKey)
      .filter(Boolean),
  );
  const longestStudentSlide = student
    .filter((outline) => outline.type === "slide")
    .reduce((max, outline) => Math.max(max, outline.targetDurationSec ?? outline.estimatedDuration ?? 0), 0);
  const minimumInteractive = interactiveMode ? Math.max(1, Math.floor(student.length / 4)) : 0;
  const missingTeacherStages = REQUIRED_TEACHER_STAGES.filter((stage) => !teacherStages.has(stage));
  const catalogById = new Map(activityCatalog.map((activity) => [activity.activityId, activity]));
  const knowledgeIssues: string[] = [];
  if (activityCatalog.length > 0) {
    for (const outline of student.filter((item) => item.stageKey === "ai-learning")) {
      const parent = outline.parentActivityId
        ? catalogById.get(outline.parentActivityId)
        : undefined;
      if (!parent) {
        knowledgeIssues.push(`页面“${outline.title}”缺少有效父活动关联`);
        continue;
      }
      const allowed = new Set(parent.knowledgePointIds);
      const outside = (outline.knowledgePointIds ?? []).filter((id) => !allowed.has(id));
      if (outside.length > 0) {
        knowledgeIssues.push(
          `页面“${outline.title}”包含父活动 ${parent.activityId} 之外的知识点：${outside.join("、")}`,
        );
      }
    }

    for (const activity of activityCatalog.filter((item) => item.knowledgePointIds.length > 0)) {
      const covered = new Set(
        student
          .filter(
            (outline) =>
              outline.stageKey === "ai-learning" &&
              outline.parentActivityId === activity.activityId,
          )
          .flatMap((outline) => outline.knowledgePointIds ?? []),
      );
      const missing = activity.knowledgePointIds.filter((id) => !covered.has(id));
      if (missing.length > 0) {
        knowledgeIssues.push(
          `父活动 ${activity.activityId} 尚未覆盖知识点：${missing.join("、")}`,
        );
      }
    }
  }
  const issues = [
    student.length >= 3 ? "" : "学生主课页面数量不足",
    missingTeacherStages.length ? `缺少教师资源阶段：${missingTeacherStages.join("、")}` : "",
    longestStudentSlide <= 8 * 60 ? "" : "存在超过 8 分钟的单个学生 PPT 页面",
    interactive.length >= minimumInteractive ? "" : "丰富互动模式下互动页面比例不足",
    ...knowledgeIssues,
  ].filter(Boolean);
  return {
    passed: issues.length === 0,
    issues,
    checks: [
      `${student.length} 个学生页面，${outlines.length - student.length} 个教师资源`,
      `${interactive.length} 个互动页面`,
      `单个学生 PPT 最长 ${Math.ceil(longestStudentSlide / 60)} 分钟`,
    ],
  };
}
