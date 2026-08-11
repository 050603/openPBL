import type {
  AdaptiveAssessmentQuestion,
  AdaptiveAssessmentAnswer,
  AdaptiveBranchOutline,
  AdaptiveLearningPlan,
  AdaptiveTriggerCondition,
  AdaptiveTriggerEvaluation,
  KnowledgeGraph,
  KnowledgePoint,
  OpenMaicSceneOutlineSnapshot,
  StudentAdaptiveLearningState,
} from "@/lib/session/types";

export const MAX_ADAPTIVE_PRETEST_QUESTIONS = 5;
export const MAX_ADAPTIVE_PRETEST_MINUTES = 5;
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
  answers: Record<string, AdaptiveAssessmentAnswer>,
): number {
  if (!questions.length) return 0;
  const correct = questions.filter((question) => isAdaptiveAnswerCorrect(question, answers[question.id])).length;
  return Math.round((correct / questions.length) * 100);
}

export function derivePretestKnowledgeEvidence(
  questions: AdaptiveAssessmentQuestion[],
  answers: Record<string, AdaptiveAssessmentAnswer>,
): { weakKnowledgePointIds: string[]; masteredKnowledgePointIds: string[] } {
  const weak = new Set<string>();
  const mastered = new Set<string>();
  for (const question of questions) {
    const target = isAdaptiveAnswerCorrect(question, answers[question.id]) ? mastered : weak;
    question.knowledgePointIds.forEach((id) => target.add(id));
  }
  weak.forEach((id) => mastered.delete(id));
  return {
    weakKnowledgePointIds: [...weak],
    masteredKnowledgePointIds: [...mastered],
  };
}

export function isAdaptiveAnswerCorrect(
  question: AdaptiveAssessmentQuestion,
  answer: AdaptiveAssessmentAnswer | undefined,
): boolean {
  if (question.type !== "matching") return answer === question.correctOptionIndex;
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false;
  const pairs = question.matchingPairs ?? [];
  return pairs.length >= 2 && pairs.every((pair) => answer[pair.left] === pair.right);
}

export function estimateAdaptivePretestMinutes(questions: AdaptiveAssessmentQuestion[]): number {
  const estimatedSeconds = questions.reduce((total, question) => {
    if (question.type === "matching") return total + 70;
    if (question.type === "true-false") return total + 25;
    return total + 45;
  }, 20);
  return Math.max(1, Math.min(MAX_ADAPTIVE_PRETEST_MINUTES, Math.ceil(estimatedSeconds / 60)));
}

export function hasCompleteAdaptivePrerequisiteLoop(
  plan: AdaptiveLearningPlan,
  substantiveKnowledgeCount: number,
): boolean {
  if (substantiveKnowledgeCount === 0) return true;
  const prerequisiteIds = new Set((plan.prerequisiteKnowledgePoints ?? []).map((point) => point.id));
  const diagnosedIds = new Set(plan.pretest.questions.flatMap((question) => question.knowledgePointIds));
  const coveredIds = new Set(plan.branches.flatMap((branch) =>
    branch.kind === "prerequisite" ? branch.prerequisiteKnowledgePointIds : [],
  ));
  return prerequisiteIds.size > 0
    && plan.pretest.questions.length > 0
    && plan.pretest.estimatedMinutes <= MAX_ADAPTIVE_PRETEST_MINUTES
    && [...prerequisiteIds].every((id) => diagnosedIds.has(id) && coveredIds.has(id));
}

export function deriveAdaptiveEnrichmentTarget(input: {
  knowledgePoints: KnowledgePoint[];
  mainScenes?: OpenMaicSceneOutlineSnapshot[];
}): { recommendedMin: number; recommendedMax: number; runtimeMaxPerStudent: number; reason: string } {
  const checkpoints = deriveAdaptiveCheckpointSceneIds(input.mainScenes ?? []).length;
  const taughtKnowledgeCount = new Set(
    (input.mainScenes ?? []).flatMap((scene) => scene.knowledgePointIds ?? []),
  ).size || input.knowledgePoints.length;
  if (checkpoints >= 3 && taughtKnowledgeCount >= 6) {
    return { recommendedMin: 4, recommendedMax: 6, runtimeMaxPerStudent: 2, reason: "课程库包含多个知识模块，应预生成覆盖迁移应用、概念深化和经典拓展的丰富候选池；单个学生只按证据使用其中少量资源。" };
  }
  if (checkpoints >= 1 && taughtKnowledgeCount >= 3) {
    return { recommendedMin: 2, recommendedMax: 4, runtimeMaxPerStudent: 1, reason: "课程库应为主要知识组合准备若干不同用途的候选资源，真实课堂只插入最匹配的一份。" };
  }
  return { recommendedMin: 0, recommendedMax: 2, runtimeMaxPerStudent: 1, reason: "课程规模较小，可保留少量高价值候选资源，学生路径仍最多使用一份。" };
}

export function evaluateAdaptiveLearningPlanQuality(
  plan: AdaptiveLearningPlan,
  input: {
    knowledgePoints: KnowledgePoint[];
    mainScenes?: OpenMaicSceneOutlineSnapshot[];
  },
): { passed: boolean; issues: string[]; warnings: string[]; recommendedMin: number; recommendedMax: number; runtimeMaxPerStudent: number } {
  const target = deriveAdaptiveEnrichmentTarget(input);
  const issues: string[] = [];
  const warnings: string[] = [];
  if (!hasCompleteAdaptivePrerequisiteLoop(plan, input.knowledgePoints.length)) {
    issues.push("前序知识、前测与补缺资源没有形成闭环");
  }
  const checkpoints = new Set(deriveAdaptiveCheckpointSceneIds(input.mainScenes ?? []));
  const enrichment = plan.branches.filter((branch) => branch.enabled !== false && branch.kind !== "prerequisite");
  if (enrichment.length < target.recommendedMin) {
    issues.push(`课程级拓展机会不足：建议 ${target.recommendedMin}-${target.recommendedMax} 处，当前 ${enrichment.length} 处`);
  }
  if (enrichment.length > target.recommendedMax) {
    warnings.push(`课程库候选较多：建议优先保留 ${target.recommendedMax} 处以内的最高价值资源，当前 ${enrichment.length} 处`);
  }
  const titles = new Set<string>();
  const branchIds = new Set(enrichment.map((branch) => branch.id));
  const declaredValueTypes = new Set(
    (plan.enrichmentStrategy?.decisions ?? [])
      .filter((decision) => decision.decision === "selected" && (!decision.branchId || branchIds.has(decision.branchId)))
      .map((decision) => decision.valueType),
  );
  const inferredValueTypes = new Set<"task-transfer" | "concept-depth" | "classic-extension">();
  const coveredKnowledgeIds = new Set<string>();
  const validKnowledgeIds = new Set(input.knowledgePoints.map((point) => point.id));
  for (const branch of enrichment) {
    const title = normalizedText(branch.title);
    if (titles.has(title)) issues.push(`拓展主题重复：${branch.title}`);
    titles.add(title);
    inferredValueTypes.add(
      branch.kind === "application"
        ? "task-transfer"
        : branch.kind === "worked-example"
          ? "concept-depth"
          : "classic-extension",
    );
    branch.anchorKnowledgePointIds.forEach((id) => coveredKnowledgeIds.add(id));
    if (!branch.anchorKnowledgePointIds.length || branch.anchorKnowledgePointIds.some((id) => !validKnowledgeIds.has(id))) {
      issues.push(`拓展没有锚定有效的本课知识点：${branch.title}`);
    }
    if (!adaptiveResourceAddsNovelContent(branch)) issues.push(`拓展缺少明确新增价值：${branch.title}`);
    if (!(branch.trigger?.assessmentSceneIds ?? []).some((id) => checkpoints.has(id))) {
      issues.push(`拓展没有放在有效的模块测验之后：${branch.title}`);
    }
  }
  for (const decision of plan.enrichmentStrategy?.decisions ?? []) {
    if (decision.decision === "selected" && decision.branchId && !branchIds.has(decision.branchId)) {
      issues.push(`已选拓展机会缺少对应资源：${decision.title}`);
    }
  }
  const valueTypes = declaredValueTypes.size ? declaredValueTypes : inferredValueTypes;
  if (target.recommendedMin >= 4 && valueTypes.size < 2) {
    warnings.push("课程库当前集中于一种教学价值；如课程内容允许，可再补充迁移应用、例题深化或经典拓展中的另一类");
  }
  if (target.recommendedMin >= 4) {
    const requiredCoverage = Math.ceil(input.knowledgePoints.length * 0.6);
    if (coveredKnowledgeIds.size < requiredCoverage) {
      warnings.push(`课程库当前覆盖 ${coveredKnowledgeIds.size} 个本课知识点；建议复核其余知识点是否存在真实拓展需求（参考覆盖 ${requiredCoverage} 个）`);
    }
  }
  return { passed: issues.length === 0, issues, warnings, recommendedMin: target.recommendedMin, recommendedMax: target.recommendedMax, runtimeMaxPerStudent: target.runtimeMaxPerStudent };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export type AdaptivePrerequisiteCandidate = {
  point: KnowledgePoint;
  supportsKnowledgePoints: KnowledgePoint[];
  relationshipEvidence: string[];
};

const PREREQUISITE_RELATION_PATTERN = /前置|先修|先决|基础|前提|支撑|依赖| prerequisite/i;

/**
 * A prerequisite diagnostic must be based on an upstream concept, not simply
 * on the first few concepts taught in the current lesson. Knowledge-graph
 * edges follow the teaching direction: source (earlier) -> target (later).
 */
export function deriveAdaptivePrerequisiteCandidates(input: {
  knowledgePoints: KnowledgePoint[];
  knowledgeGraph?: KnowledgeGraph;
  mainScenes?: OpenMaicSceneOutlineSnapshot[];
}): AdaptivePrerequisiteCandidate[] {
  const pointById = new Map(input.knowledgePoints.map((point) => [point.id, point]));
  const instructionalScenes = (input.mainScenes ?? [])
    .filter((scene) => scene.type !== "quiz" && (scene.stageKey === "ai-learning" || scene.audience === "student"));
  const taughtIds = new Set(
    instructionalScenes.flatMap((scene) => scene.knowledgePointIds ?? []),
  );
  if (!taughtIds.size) {
    input.knowledgePoints
      .filter((point) => point.level !== "foundation")
      .forEach((point) => taughtIds.add(point.id));
  }

  const candidateMap = new Map<string, { supports: Set<string>; evidence: Set<string> }>();
  for (const edge of input.knowledgeGraph?.edges ?? []) {
    const source = pointById.get(edge.source);
    const target = pointById.get(edge.target);
    if (!source || !target || !taughtIds.has(target.id)) continue;
    if (taughtIds.has(source.id)) continue;
    const explicitPrerequisite = PREREQUISITE_RELATION_PATTERN.test(edge.label);
    if (source.level !== "foundation" && !explicitPrerequisite) continue;
    const entry = candidateMap.get(source.id) ?? { supports: new Set<string>(), evidence: new Set<string>() };
    entry.supports.add(target.id);
    if (edge.label.trim()) entry.evidence.add(edge.label.trim());
    candidateMap.set(source.id, entry);
  }

  // Older courses may not have labelled edges. Foundation concepts remain the
  // safest fallback, but core/application/extension concepts are never guessed
  // to be prerequisites merely because they appear early in an array.
  if (!candidateMap.size) {
    input.knowledgePoints
      .filter((point) => point.level === "foundation" && !taughtIds.has(point.id))
      .forEach((point) => candidateMap.set(point.id, { supports: new Set<string>(), evidence: new Set<string>() }));
  }
  if (!candidateMap.size && !input.knowledgeGraph?.edges.length && !instructionalScenes.length) {
    input.knowledgePoints
      .filter((point) => point.level === undefined)
      .slice(0, MAX_ADAPTIVE_PRETEST_QUESTIONS)
      .forEach((point) => candidateMap.set(point.id, { supports: new Set<string>(), evidence: new Set<string>() }));
  }

  const order = new Map(input.knowledgePoints.map((point, index) => [point.id, index]));
  return [...candidateMap.entries()]
    .flatMap(([id, relation]): AdaptivePrerequisiteCandidate[] => {
      const point = pointById.get(id);
      if (!point) return [];
      return [{
        point,
        supportsKnowledgePoints: [...relation.supports].flatMap((targetId) => {
          const target = pointById.get(targetId);
          return target ? [target] : [];
        }),
        relationshipEvidence: [...relation.evidence],
      }];
    })
    .sort((left, right) =>
      right.supportsKnowledgePoints.length - left.supportsKnowledgePoints.length
      || (order.get(left.point.id) ?? 0) - (order.get(right.point.id) ?? 0),
    )
    .slice(0, MAX_ADAPTIVE_PRETEST_QUESTIONS);
}

export const ADAPTIVE_LEARNING_GENERATION_POLICY = `你是课程个性化学习路径设计师。必须先区分“本课新授知识”和“进入本课前必须掌握的课外先决知识”。
1. 先逐页阅读 mainScenes，从每个新授概念、任务和表征逆向追问“学生必须先会什么才能理解或执行”，形成依赖链。只要课程包含实质性新授内容，就必须识别 1-4 个可诊断的前序知识，写入 prerequisiteKnowledgePoints；不得因为知识图谱未显式列出、学生年级较高或主课会顺带提及而返回空数组。只有纯导航、欢迎页等完全没有学习目标的内容才允许为空。前序知识可以是课程目录之外的概念、规则、表征或操作，但绝不能把本课正在正式讲授的知识换一种说法。
2. prerequisiteKnowledgePoints 使用独立且稳定的 id（建议 prereq-英文短名）；每道前测题的 knowledgePointIds 只能引用这个独立目录。不得引用 knowledgeCatalog 中的本课新授知识 ID。
3. 每道题必须直接检查一个具体概念、规则、表征或操作，不得使用“要理解本节课的新内容”“关于某知识最关键的前序判断是什么”等元问题，不得只考名称记忆。学生此时尚未解锁本课新授内容，因此题干、选项、判断陈述和匹配项都不得出现 taughtKnowledgeCatalog 或 mainScenes 中的新授概念名称，也不得把前序知识包装在“在强化学习中……”这类新授情境里；只能在 rationale 中向教师说明它将支撑哪个新授知识。题型只能是 single-choice、true-false、matching，不得生成简答题；matching 必须提供 2-4 组 matchingPairs。题目总预计用时不得超过 5 分钟，优先用 2-4 道高信息量题覆盖最关键依赖。
4. rationale 必须说明正确依据，以及该先决知识缺失会具体阻碍哪个本课知识点。
5. 每个前测知识点都要有 prerequisite 资源。资源只修复该具体缺口：先定位误解，再用短讲解或例子补齐，最后用一道迁移检查确认能够衔接新课；不得提前重讲本课核心结论。
6. 必须区分“课程候选资源库”和“单个学生实际路径”。备课阶段先对整门课列出候选机会并逐项选择或拒绝，再按照 enrichmentStrategy.recommendedMin-recommendedMax 建设足够丰富的资源库；资源应优先分散覆盖主要学习需求。迁移应用、例题深化、经典拓展是用于帮助设计的价值维度，不是必须凑齐的配额；当多个高价值资源恰好属于同一维度时应保留真实价值，不得为了类型齐全生成低价值内容。运行时最多向同一学生插入 runtimeMaxPerStudent 份，不得因为学生只会用少量资源就缩减课程库。
7. 每份拓展必须明确属于以下价值之一：帮助完成本节任务、把本节概念提升到更深层次、补充大纲外但重要且经典的新知识。必须写出具体的新案例、新工具、新概念、反例或边界条件，禁止使用“新情境应用”“进一步拓展”等空泛占位内容；相同或近似主题只能保留一次，并放在学生已经掌握其全部依赖知识后的最晚相关测验之后。
8. 逐页检查 mainScenes，mainCourseOverlapSceneIds 标出可能重叠页面，noveltyStatement 明确说明相对主课到底新增了什么。页面 ID 与 anchorKnowledgePointIds 必须来自输入；先决知识 ID 必须来自本次输出的 prerequisiteKnowledgePoints。
9. 每个前序知识必须通过 relatedIds 指向会受其缺失影响的本课知识点，并在 description 或 keyInfo 中给出可判分的掌握边界。
10. 自然语言使用准确的简体中文，只返回符合 schema 的 JSON。`;

export function buildAdaptiveLearningGenerationContext(input: {
  knowledgePoints: KnowledgePoint[];
  knowledgeGraph?: KnowledgeGraph;
  mainScenes?: OpenMaicSceneOutlineSnapshot[];
}) {
  const prerequisites = deriveAdaptivePrerequisiteCandidates(input);
  return {
    graphPrerequisiteHints: prerequisites.map((candidate) => ({
      id: candidate.point.id,
      name: candidate.point.name,
      description: candidate.point.description,
      keyInfo: candidate.point.keyInfo,
      supports: candidate.supportsKnowledgePoints.map((point) => ({ id: point.id, name: point.name })),
      relationshipEvidence: candidate.relationshipEvidence,
    })),
    taughtKnowledgeCatalog: input.knowledgePoints.map((point) => ({
      id: point.id,
      name: point.name,
      description: point.description,
      keyInfo: point.keyInfo,
      level: point.level,
    })),
    knowledgeGraphEdges: input.knowledgeGraph?.edges ?? [],
  };
}

/** Shared by quick and detailed generation so final resource quality cannot drift by mode. */
export function buildAdaptiveResourceRequirement(
  courseName: string,
  branch: AdaptiveBranchOutline,
): string {
  const prerequisite = branch.kind === "prerequisite";
  const trigger = branch.trigger;
  const purposeRules = prerequisite
    ? [
        "这是课前先决知识补缺，不是本课新授内容的缩略版。",
        "开头必须依据前测错误定位一个具体误解；中间只补齐会阻塞新课的概念、规则、表征或操作；结尾用一道衔接题确认学生已经能进入主课。",
        "学生尚未解锁主课新授术语。不得在标题、讲解、例子、活动或检查题中定义、解释、应用或考查这些新授概念；它们最多在结尾一句衔接提示中出现。不得把‘记住名称’当作掌握。",
      ]
    : [
        `这是达标后的可选拓展：只有模块得分达到 ${trigger?.scoreThreshold ?? 80} 分、学生提前完成且剩余时间不少于 ${trigger?.minimumRemainingSec ?? branch.targetDurationSec} 秒时才会出现。`,
        "内容必须服务于以下至少一项：更快完成本节任务、深化本节概念、补充大纲外但重要且经典的新知识。",
        "必须提供主课没有出现的具体案例、工具、概念、反例或边界条件；禁止复述定义、原例题与原结论。",
      ];
  return [
    `生成一份可由教师预览、可在同一播放器中连续插入主课程的${prerequisite ? "先决知识补缺" : "达标拓展"}资源。`,
    prerequisite ? `后续主课边界：${courseName}（仅用于避免提前讲授，不作为本资源内容）` : `主课程：${courseName}`,
    `分支目标：${branch.objective}`,
    `知识要点：${branch.keyPoints.join("；")}`,
    `相对主课新增价值：${branch.noveltyStatement}`,
    `潜在重叠主课页：${branch.mainCourseOverlapSceneIds.join("、") || "无"}。不得复述这些页面已经讲过的定义、回顾、例题和结论。`,
    ...purposeRules,
    `教师指导：${branch.generationGuidance || "围绕分支目标设计具体、短小且可验证的学习活动。"}`,
    `总时长控制在 ${branch.targetDurationSec} 秒左右，结尾自然返回主课程。`,
    "必须生成完整 PPT/互动内容、讲稿和 TTS，并使用与主课程相同的播放管线。",
  ].join("\n");
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
 * This repair step guarantees every diagnosed prerequisite has remediation.
 * Enrichment remains optional and must never be fabricated for coverage.
 */
export function ensureAdaptiveResourceCoverage(
  plan: AdaptiveLearningPlan,
  input: {
    knowledgePoints: KnowledgePoint[];
    knowledgeGraph?: KnowledgeGraph;
    mainScenes?: OpenMaicSceneOutlineSnapshot[];
  },
): AdaptiveLearningPlan {
  const branches = [...plan.branches];
  const pointById = new Map(
    [...input.knowledgePoints, ...(plan.prerequisiteKnowledgePoints ?? [])]
      .map((point) => [point.id, point]),
  );
  const prerequisiteById = new Map(
    deriveAdaptivePrerequisiteCandidates(input).map((candidate) => [candidate.point.id, candidate]),
  );
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
    const supportedIds = unique([
      ...(point?.relatedIds ?? []),
      ...(prerequisiteById.get(knowledgePointId)?.supportsKnowledgePoints.map((target) => target.id) ?? []),
    ]);
    const supportedNames = supportedIds.map((id) => pointById.get(id)?.name).filter(Boolean) as string[];
    const connectionTarget = supportedNames.join("、") || "本节后续核心任务";
    const overlapSceneIds = studentScenes
      .filter((scene) =>
        scene.type !== "quiz"
        && (scene.knowledgePointIds ?? []).some((id) => supportedIds.includes(id)),
      )
      .map((scene) => scene.id);
    branches.push({
      id: `resource-prerequisite-${adaptiveResourceIdPart(knowledgePointId)}`,
      kind: "prerequisite",
      title: `${name} · 课前补缺`,
      objective: `纠正前测暴露的“${name}”具体误解，使学生能够继续理解“${connectionTarget}”。`,
      keyPoints: [
        point?.keyInfo || point?.description || `${name}的准确含义与使用条件`,
        `前测错误选项对应的“${name}”误解`,
        `用一个不同情境确认学生能够独立运用“${name}”`,
      ],
      anchorKnowledgePointIds: supportedIds,
      prerequisiteKnowledgePointIds: [knowledgePointId],
      noveltyStatement: `新增针对前测错误选项的“${name}”纠错案例和一道衔接检查，专门补齐进入“${connectionTarget}”前的缺口。`,
      mainCourseOverlapSceneIds: overlapSceneIds,
      sceneType: "slide",
      targetDurationSec: 150,
      generationGuidance: `先复现学生在前测中对“${name}”的错误判断，再用一个具体反例纠正；随后只补讲“${point?.keyInfo || point?.description || name}”，最后用一道同层级小题确认掌握。学生尚未学习“${connectionTarget}”，它只能在结尾作为一句衔接提示出现，禁止定义、解释、举例、设问或要求应用。避开主课页面 ${overlapSceneIds.join("、") || "中的完整定义与原例题"}。`,
      trigger: {
        placement: "before-main-course",
        evidenceRule: "pretest-gap",
        minimumRemainingSec: 150,
      },
      status: "draft",
    });
  }

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
  knowledgeGraph?: KnowledgeGraph;
  mainScenes?: OpenMaicSceneOutlineSnapshot[];
  now?: string;
}): AdaptiveLearningPlan {
  const now = input.now ?? new Date().toISOString();
  const enrichmentTarget = deriveAdaptiveEnrichmentTarget(input);
  const candidates = deriveAdaptivePrerequisiteCandidates(input);
  const prerequisiteKnowledgePoints = candidates.map((candidate) => ({
    ...candidate.point,
    relatedIds: unique(candidate.supportsKnowledgePoints.map((point) => point.id)),
  }));
  const questions: AdaptiveAssessmentQuestion[] = candidates.map((candidate, index) => {
    const point = candidate.point;
    const correctStatement = point.keyInfo || point.description || `${point.name}的核心含义`;
    const supportedNames = candidate.supportsKnowledgePoints.map((target) => target.name);
    const supportSummary = supportedNames.length ? supportedNames.join("、") : "后续核心任务";
    return {
      id: `pretest-${point.id}`,
      type: "single-choice" as const,
      prompt: `关于“${point.name}”，下列哪项表述最准确？`,
      options: [
        correctStatement,
        `${point.name}只需要记住名称，不必理解含义或使用条件。`,
        `${point.name}在任何情境下都可以直接套用，不需要核对前提。`,
        `${point.name}只影响表述方式，不会影响后续的分析或判断。`,
      ],
      correctOptionIndex: index % 4,
      rationale: `${correctStatement}。如果这一基础没有掌握，学生在学习“${supportSummary}”时会缺少必要的判断依据。`,
      knowledgePointIds: [point.id],
    };
  }).map((question) => {
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
    prerequisiteKnowledgePoints,
    pretest: {
      title: questions.length ? "课前先决知识检查" : "前序知识待智能分析",
      introduction: questions.length
        ? "最多 5 道题，只检查理解本节新知识必需的课外先决基础；答题结果用于安排开课前的必要回顾。"
        : "当前知识图谱没有提供足够的课外依赖证据，需要结合主课内容继续分析；系统不会据此认定学生无需前测。",
      estimatedMinutes: estimateAdaptivePretestMinutes(questions),
      questions,
    },
    enrichmentStrategy: {
      recommendedMin: enrichmentTarget.recommendedMin,
      recommendedMax: enrichmentTarget.recommendedMax,
      runtimeMaxPerStudent: enrichmentTarget.runtimeMaxPerStudent,
      summary: enrichmentTarget.reason,
      decisions: [],
    },
    branches: [],
  };
  return ensureAdaptiveResourceCoverage(plan, input);
}

const GENERIC_PRETEST_PROMPT_PATTERN = /要理解本节课的新内容|最关键的前序判断|最关键的先决判断|关于.+最关键.*是什么/;

/** Rejects lesson content masquerading as prior knowledge and repairs plan consistency. */
export function improveAdaptiveLearningPlanQuality(
  plan: AdaptiveLearningPlan,
  fallback: AdaptiveLearningPlan,
  input: {
    knowledgePoints: KnowledgePoint[];
    knowledgeGraph?: KnowledgeGraph;
    mainScenes?: OpenMaicSceneOutlineSnapshot[];
  },
): AdaptiveLearningPlan {
  const taughtIds = new Set(
    (input.mainScenes ?? [])
      .filter((scene) => scene.type !== "quiz" && (scene.stageKey === "ai-learning" || scene.audience === "student"))
      .flatMap((scene) => scene.knowledgePointIds ?? []),
  );
  const taughtNames = unique([
    ...input.knowledgePoints.filter((point) => taughtIds.has(point.id)).map((point) => point.name),
    ...(input.mainScenes ?? [])
      .filter((scene) => scene.type !== "quiz" && (scene.stageKey === "ai-learning" || scene.audience === "student"))
      .map((scene) => scene.title),
  ]).map(normalizedText);
  const containsTaughtTerm = (value: string) => {
    const normalized = normalizedText(value);
    return taughtNames.some((taughtName) => taughtName.length >= 3 && normalized.includes(taughtName));
  };
  const questionLeaksTaughtContent = (question: AdaptiveAssessmentQuestion) => [
    question.prompt,
    ...question.options,
    ...(question.matchingPairs ?? []).flatMap((pair) => [pair.left, pair.right]),
  ].some(containsTaughtTerm);
  const overlapsTaughtContent = (point: KnowledgePoint) => {
    if (taughtIds.has(point.id)) return true;
    const name = normalizedText(point.name);
    return containsTaughtTerm(point.description)
      || containsTaughtTerm(point.keyInfo ?? "")
      || taughtNames.some((taughtName) =>
        name === taughtName
        || (name.length >= 4 && taughtName.includes(name))
        || (taughtName.length >= 4 && name.includes(taughtName)),
      );
  };
  const courseIds = new Set(input.knowledgePoints.map((point) => point.id));
  const prerequisiteKnowledgePoints = [
    ...(plan.prerequisiteKnowledgePoints ?? []),
    ...(fallback.prerequisiteKnowledgePoints ?? []),
  ].filter((point, index, points) =>
    point.id
    && point.name
    && !overlapsTaughtContent(point)
    && points.findIndex((candidate) => candidate.id === point.id) === index,
  ).map((point) => ({
    ...point,
    relatedIds: unique((point.relatedIds ?? []).filter((id) => courseIds.has(id))),
  })).filter((point) => (point.relatedIds?.length ?? 0) > 0)
    .slice(0, MAX_ADAPTIVE_PRETEST_QUESTIONS);
  const prerequisiteIds = new Set(prerequisiteKnowledgePoints.map((point) => point.id));
  const fallbackByPointId = new Map(
    fallback.pretest.questions.flatMap((question) =>
      question.knowledgePointIds.map((id) => [id, question] as const),
    ),
  );
  const seenPrompts = new Set<string>();
  const coveredIds = new Set<string>();
  const questions = plan.pretest.questions.flatMap((question): AdaptiveAssessmentQuestion[] => {
    const validIds = unique(question.knowledgePointIds.filter((id) => prerequisiteIds.has(id)));
    if (!validIds.length) return [];
    const promptKey = normalizedText(question.prompt);
    const replacement = fallbackByPointId.get(validIds[0]);
    const isWeak = GENERIC_PRETEST_PROMPT_PATTERN.test(question.prompt)
      || promptKey.length < 8
      || seenPrompts.has(promptKey)
      || questionLeaksTaughtContent(question);
    if (isWeak && !replacement) return [];
    const selected = isWeak ? replacement! : { ...question, knowledgePointIds: validIds };
    seenPrompts.add(normalizedText(selected.prompt));
    selected.knowledgePointIds.forEach((id) => coveredIds.add(id));
    return [selected];
  });
  for (const fallbackQuestion of fallback.pretest.questions) {
    if (questions.length >= MAX_ADAPTIVE_PRETEST_QUESTIONS) break;
    if (fallbackQuestion.knowledgePointIds.some((id) => coveredIds.has(id))) continue;
    questions.push(fallbackQuestion);
    fallbackQuestion.knowledgePointIds.forEach((id) => coveredIds.add(id));
  }

  const repairedBranches = plan.branches.flatMap((branch): AdaptiveBranchOutline[] => {
    if (branch.kind !== "prerequisite") return [branch];
    const validIds = unique(branch.prerequisiteKnowledgePointIds.filter((id) => coveredIds.has(id)));
    if (!validIds.length) return [];
    const supportedCourseIds = unique(validIds.flatMap((id) =>
      prerequisiteKnowledgePoints.find((point) => point.id === id)?.relatedIds ?? [],
    ));
    const prerequisiteDetails = validIds.flatMap((id) => {
      const point = prerequisiteKnowledgePoints.find((candidate) => candidate.id === id);
      return point ? [point.keyInfo || point.description || point.name] : [];
    });
    const prerequisiteNames = validIds.map((id) =>
      prerequisiteKnowledgePoints.find((candidate) => candidate.id === id)?.name || id,
    );
    const priorOnlyKeyPoints = branch.keyPoints.filter((point) => !containsTaughtTerm(point));
    return [{
      ...branch,
      title: containsTaughtTerm(branch.title) ? `${prerequisiteNames.join("、")} · 课前补缺` : branch.title,
      objective: containsTaughtTerm(branch.objective)
        ? `纠正“${prerequisiteNames.join("、")}”的具体误解，并用同层级任务确认掌握。`
        : branch.objective,
      keyPoints: unique([...priorOnlyKeyPoints, ...prerequisiteDetails]).slice(0, 5),
      prerequisiteKnowledgePointIds: validIds,
      anchorKnowledgePointIds: unique([...branch.anchorKnowledgePointIds, ...supportedCourseIds])
        .filter((id) => courseIds.has(id)),
      generationGuidance: `${branch.generationGuidance || "只补齐前序知识的概念、规则、表征或操作。"} 学生尚未学习本课新授术语；新授概念只能在结尾用一句话说明衔接方向，不得定义、解释、举例、设问或要求学生应用。`,
    }];
  });

  const sceneOrder = new Map(
    (input.mainScenes ?? []).map((scene, index) => [scene.id, scene.order ?? index]),
  );
  const branchCheckpointOrder = (branch: AdaptiveBranchOutline) => Math.max(
    -1,
    ...(branch.trigger?.assessmentSceneIds ?? []).map((id) => sceneOrder.get(id) ?? -1),
  );
  const branches: AdaptiveBranchOutline[] = [];
  const enrichmentIndexByFingerprint = new Map<string, number>();
  for (const branch of repairedBranches) {
    if (branch.kind === "prerequisite") {
      branches.push(branch);
      continue;
    }
    if (!adaptiveResourceAddsNovelContent(branch)) continue;
    const fingerprint = normalizedText(branch.title) || normalizedText(branch.objective);
    const duplicateIndex = enrichmentIndexByFingerprint.get(fingerprint);
    if (duplicateIndex === undefined) {
      enrichmentIndexByFingerprint.set(fingerprint, branches.length);
      branches.push(branch);
      continue;
    }
    const previous = branches[duplicateIndex];
    const later = branchCheckpointOrder(branch) >= branchCheckpointOrder(previous) ? branch : previous;
    branches[duplicateIndex] = {
      ...later,
      anchorKnowledgePointIds: unique([...previous.anchorKnowledgePointIds, ...branch.anchorKnowledgePointIds]),
      mainCourseOverlapSceneIds: unique([...previous.mainCourseOverlapSceneIds, ...branch.mainCourseOverlapSceneIds]),
    };
  }

  const enrichmentTarget = deriveAdaptiveEnrichmentTarget(input);
  const rejectedDecisions = (plan.enrichmentStrategy?.decisions ?? []).filter((decision) =>
    decision.decision === "rejected",
  );
  const enrichmentStrategy: NonNullable<AdaptiveLearningPlan["enrichmentStrategy"]> = {
    recommendedMin: enrichmentTarget.recommendedMin,
    recommendedMax: enrichmentTarget.recommendedMax,
    runtimeMaxPerStudent: enrichmentTarget.runtimeMaxPerStudent,
    summary: plan.enrichmentStrategy?.summary?.trim() || enrichmentTarget.reason,
    decisions: [
      ...branches.filter((branch) => branch.kind !== "prerequisite").map((branch) => ({
        id: `decision-${branch.id}`,
        decision: "selected" as const,
        title: branch.title,
        valueType: branch.kind === "extension"
          ? "classic-extension" as const
          : branch.kind === "worked-example"
            ? "concept-depth" as const
            : "task-transfer" as const,
        rationale: branch.noveltyStatement,
        anchorKnowledgePointIds: branch.anchorKnowledgePointIds,
        afterAssessmentSceneId: branch.trigger?.assessmentSceneIds?.[0],
        branchId: branch.id,
      })),
      ...rejectedDecisions,
    ].slice(0, 8),
  };

  const hasQuestions = questions.length > 0;
  const inconsistentNoPretestTitle = /无需|无须|不需要|免前测|无前测/.test(plan.pretest.title);

  return {
    ...plan,
    prerequisiteKnowledgePoints,
    pretest: {
      ...plan.pretest,
      title: hasQuestions
        ? inconsistentNoPretestTitle ? "课前先决知识检查" : plan.pretest.title
        : "前序知识分析未完成",
      introduction: hasQuestions
        ? plan.pretest.introduction
        : "尚未形成可验证的前序知识依赖链，请重新生成或由教师补充；系统不会把缺少证据解释为学生无需前测。",
      estimatedMinutes: estimateAdaptivePretestMinutes(questions),
      questions,
    },
    enrichmentStrategy,
    branches,
  };
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
  const prerequisiteKnowledgePoints = Array.isArray(raw.prerequisiteKnowledgePoints)
    ? raw.prerequisiteKnowledgePoints.flatMap((item): KnowledgePoint[] => {
        if (!item || typeof item !== "object") return [];
        const point = item as Record<string, unknown>;
        if (typeof point.id !== "string" || typeof point.name !== "string" || typeof point.description !== "string") return [];
        return [{
          id: point.id.trim(),
          name: point.name.trim(),
          description: point.description.trim(),
          keyInfo: typeof point.keyInfo === "string" ? point.keyInfo.trim() : undefined,
          relatedIds: Array.isArray(point.relatedIds)
            ? unique(point.relatedIds.filter((id): id is string => typeof id === "string"))
            : [],
          level: "foundation",
        }];
      }).slice(0, MAX_ADAPTIVE_PRETEST_QUESTIONS)
    : fallback.prerequisiteKnowledgePoints ?? [];
  const questions = Array.isArray(rawPretest.questions)
    ? rawPretest.questions.flatMap((item, index): AdaptiveAssessmentQuestion[] => {
        if (!item || typeof item !== "object") return [];
        const question = item as Record<string, unknown>;
        const type = question.type === "matching"
          ? "matching" as const
          : question.type === "true-false"
            ? "true-false" as const
            : "single-choice" as const;
        const matchingPairs = Array.isArray(question.matchingPairs)
          ? question.matchingPairs.flatMap((pair): Array<{ left: string; right: string }> => {
              if (!pair || typeof pair !== "object") return [];
              const value = pair as Record<string, unknown>;
              return typeof value.left === "string" && typeof value.right === "string"
                && value.left.trim() && value.right.trim()
                ? [{ left: value.left.trim(), right: value.right.trim() }]
                : [];
            }).slice(0, 4)
          : [];
        const options = Array.isArray(question.options)
          ? question.options.filter((option): option is string => typeof option === "string").slice(0, 4)
          : [];
        if (typeof question.prompt !== "string") return [];
        if (type === "matching" && matchingPairs.length < 2) return [];
        if (type !== "matching" && options.length < 2) return [];
        return [{
          id: typeof question.id === "string" ? question.id : `pretest-generated-${index + 1}`,
          type,
          prompt: question.prompt.trim(),
          options: type === "matching" ? unique(matchingPairs.map((pair) => pair.right)) : options,
          correctOptionIndex: typeof question.correctOptionIndex === "number"
            ? Math.max(0, Math.min(options.length - 1, Math.round(question.correctOptionIndex)))
            : 0,
          matchingPairs: type === "matching" ? matchingPairs : undefined,
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
        const trigger = {
          placement: prerequisite ? "before-main-course" as const : "after-module" as const,
          afterSceneId: typeof rawTrigger.afterSceneId === "string" ? rawTrigger.afterSceneId : undefined,
          beforeSceneId: typeof rawTrigger.beforeSceneId === "string" ? rawTrigger.beforeSceneId : fallbackTrigger?.beforeSceneId,
          assessmentSceneIds: Array.isArray(rawTrigger.assessmentSceneIds)
            ? unique(rawTrigger.assessmentSceneIds.filter((id): id is string => typeof id === "string"))
            : fallbackTrigger?.assessmentSceneIds ?? [],
          linkedQuestionIds: Array.isArray(rawTrigger.linkedQuestionIds)
            ? unique(rawTrigger.linkedQuestionIds.filter((id): id is string => typeof id === "string"))
            : [],
          answerRule: "score-at-least" as const,
          evidenceRule: prerequisite ? "pretest-gap" as const : "module-mastery" as const,
          scoreThreshold: typeof rawTrigger.scoreThreshold === "number"
            ? Math.max(0, Math.min(100, Math.round(rawTrigger.scoreThreshold)))
            : fallback.thresholds.enrichmentMasteryMin,
          minimumRemainingSec: typeof rawTrigger.minimumRemainingSec === "number"
            ? Math.max(90, Math.min(600, Math.round(rawTrigger.minimumRemainingSec)))
            : 150,
        };
        const defaultTrigger = branch.defaultTrigger && typeof branch.defaultTrigger === "object"
          ? { ...trigger, ...(branch.defaultTrigger as AdaptiveBranchOutline["defaultTrigger"]) }
          : fallbackBranch?.defaultTrigger ?? trigger;
        return [{
          id: typeof branch.id === "string" ? branch.id : `resource-generated-${index + 1}`,
          enabled: branch.enabled !== false,
          defaultTrigger,
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
                  status: resource.status === "ready" || resource.status === "stale" || resource.status === "failed"
                    ? resource.status
                    : "generating" as const,
                  classroomId: typeof resource.classroomId === "string" ? resource.classroomId : undefined,
                  scenesCount: typeof resource.scenesCount === "number" ? Math.max(0, Math.round(resource.scenesCount)) : undefined,
                  generatedAt: typeof resource.generatedAt === "string" ? resource.generatedAt : undefined,
                  sourceSignature: typeof resource.sourceSignature === "string" ? resource.sourceSignature : undefined,
                  error: typeof resource.error === "string" ? resource.error.slice(0, 500) : undefined,
                };
              })()
            : undefined,
          trigger,
          status: "draft",
        }];
      }).slice(0, 30)
    : [];
  const rawEnrichmentStrategy = raw.enrichmentStrategy && typeof raw.enrichmentStrategy === "object"
    ? raw.enrichmentStrategy as Record<string, unknown>
    : {};
  const enrichmentDecisions: NonNullable<AdaptiveLearningPlan["enrichmentStrategy"]>["decisions"] =
    Array.isArray(rawEnrichmentStrategy.decisions)
      ? rawEnrichmentStrategy.decisions.flatMap((item, index) => {
          if (!item || typeof item !== "object") return [];
          const decision = item as Record<string, unknown>;
          if (typeof decision.title !== "string" || typeof decision.rationale !== "string") return [];
          const valueType: "task-transfer" | "concept-depth" | "classic-extension" =
            decision.valueType === "concept-depth" || decision.valueType === "classic-extension"
              ? decision.valueType
              : "task-transfer";
          return [{
            id: typeof decision.id === "string" ? decision.id : `enrichment-decision-${index + 1}`,
            decision: decision.decision === "selected" ? "selected" as const : "rejected" as const,
            title: decision.title.trim(),
            valueType,
            rationale: decision.rationale.trim(),
            anchorKnowledgePointIds: Array.isArray(decision.anchorKnowledgePointIds)
              ? unique(decision.anchorKnowledgePointIds.filter((id): id is string => typeof id === "string"))
              : [],
            afterAssessmentSceneId: typeof decision.afterAssessmentSceneId === "string"
              ? decision.afterAssessmentSceneId
              : undefined,
            branchId: typeof decision.branchId === "string" ? decision.branchId : undefined,
          }];
        }).slice(0, 8)
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
    prerequisiteKnowledgePoints,
    pretest: {
      title: typeof rawPretest.title === "string" && rawPretest.title.trim()
        ? rawPretest.title.trim()
        : fallback.pretest.title,
      introduction: typeof rawPretest.introduction === "string" && rawPretest.introduction.trim()
        ? rawPretest.introduction.trim()
        : fallback.pretest.introduction,
      estimatedMinutes: estimateAdaptivePretestMinutes(
        questions.length ? questions : fallback.pretest.questions.slice(0, MAX_ADAPTIVE_PRETEST_QUESTIONS),
      ),
      questions: questions.length ? questions : fallback.pretest.questions.slice(0, MAX_ADAPTIVE_PRETEST_QUESTIONS),
    },
    enrichmentStrategy: {
      recommendedMin: typeof rawEnrichmentStrategy.recommendedMin === "number"
        ? Math.max(0, Math.min(8, Math.round(rawEnrichmentStrategy.recommendedMin)))
        : fallback.enrichmentStrategy?.recommendedMin ?? 0,
      recommendedMax: typeof rawEnrichmentStrategy.recommendedMax === "number"
        ? Math.max(1, Math.min(8, Math.round(rawEnrichmentStrategy.recommendedMax)))
        : fallback.enrichmentStrategy?.recommendedMax ?? 4,
      runtimeMaxPerStudent: typeof rawEnrichmentStrategy.runtimeMaxPerStudent === "number"
        ? Math.max(1, Math.min(3, Math.round(rawEnrichmentStrategy.runtimeMaxPerStudent)))
        : fallback.enrichmentStrategy?.runtimeMaxPerStudent ?? 1,
      summary: typeof rawEnrichmentStrategy.summary === "string"
        ? rawEnrichmentStrategy.summary.trim()
        : fallback.enrichmentStrategy?.summary ?? "等待课程级拓展机会评估。",
      decisions: enrichmentDecisions.length
        ? enrichmentDecisions
        : fallback.enrichmentStrategy?.decisions ?? [],
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
  const runtimeEnrichmentUsed = state.branchRuns.filter((run) =>
    run.kind !== "prerequisite" && ["generating", "ready", "completed"].includes(run.status),
  ).length;
  const runtimeEnrichmentLimit = plan.enrichmentStrategy?.runtimeMaxPerStudent ?? 1;
  const relevantBranches = plan.branches.filter((branch) => {
    if (branch.enabled === false) return false;
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
        key: "path-limit",
        label: "学生路径容量",
        expected: prerequisite ? "基础补缺按实际缺口提供" : `本节课最多插入 ${runtimeEnrichmentLimit} 份拓展`,
        actual: prerequisite ? "不占用拓展名额" : `已使用 ${runtimeEnrichmentUsed} 份拓展`,
        passed: prerequisite || runtimeEnrichmentUsed < runtimeEnrichmentLimit,
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
      const leftMatch = leftBranch?.anchorKnowledgePointIds.filter((id) => input.anchorKnowledgePointIds.includes(id)).length ?? 0;
      const rightMatch = rightBranch?.anchorKnowledgePointIds.filter((id) => input.anchorKnowledgePointIds.includes(id)).length ?? 0;
      return rightMatch - leftMatch
        || (leftBranch?.targetDurationSec ?? 0) - (rightBranch?.targetDurationSec ?? 0);
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
  runtimeStageRemainingSec?: number,
): number {
  const usedBudgetSec = state.branchRuns
    .filter((run) => ["generating", "ready", "completed"].includes(run.status))
    .reduce((sum, run) => {
      const branch = plan.branches.find((item) => item.id === run.branchOutlineId);
      return sum + (branch?.targetDurationSec ?? 0);
    }, 0);
  const planRemainingSec = Math.max(0, plan.timeBudgetMin * 60 - usedBudgetSec);
  if (
    runtimeStageRemainingSec === undefined
    || !Number.isFinite(runtimeStageRemainingSec)
  ) {
    return planRemainingSec;
  }
  return Math.min(
    planRemainingSec,
    Math.max(0, Math.round(runtimeStageRemainingSec)),
  );
}

export function eligibleAdaptiveBranches(
  plan: AdaptiveLearningPlan,
  state?: Pick<StudentAdaptiveLearningState, "pretestWeakKnowledgePointIds">,
): AdaptiveBranchOutline[] {
  const activeBranches = plan.branches.filter((branch) => branch.enabled !== false);
  if (!state) return activeBranches;
  const weak = new Set(state.pretestWeakKnowledgePointIds ?? []);
  return activeBranches.filter((branch) =>
    branch.kind !== "prerequisite"
    || branch.prerequisiteKnowledgePointIds.some((id) => weak.has(id)),
  );
}

export type CompanionMicroLessonStageKey =
  | "proposal"
  | "make"
  | "showcase"
  | "reflection";

const COMPANION_MICRO_LESSON_STAGE_CONTEXT: Readonly<Record<CompanionMicroLessonStageKey, string>> = {
  proposal: "方案构思",
  make: "项目制作",
  showcase: "成果汇报",
  reflection: "学习反思",
};

export function isCompanionMicroLessonStage(
  stageKey: string,
): stageKey is CompanionMicroLessonStageKey {
  return Object.hasOwn(COMPANION_MICRO_LESSON_STAGE_CONTEXT, stageKey);
}

export function companionMicroLessonStageContext(stageKey: string): string {
  return isCompanionMicroLessonStage(stageKey)
    ? COMPANION_MICRO_LESSON_STAGE_CONTEXT[stageKey]
    : "项目学习";
}

export function extractLearningRequestTopic(message: string): string | null {
  const normalized = message.trim();
  const knowledgeCornerMatch = normalized.match(
    /(?:资料线索|知识线索|查证线索)\s*[：:]\s*(.+)/,
  );
  if (knowledgeCornerMatch?.[1]) {
    return knowledgeCornerMatch[1].replace(/[。！？!?]+$/, "").trim() || null;
  }

  const explicitLearningMatch = normalized.match(
    /(?:我想学|我想了解|系统讲(?:一讲|解)|详细讲(?:一讲|解)|给我讲讲)\s*[：:，,]?\s*(.+)/,
  );
  if (explicitLearningMatch?.[1]) {
    return explicitLearningMatch[1].replace(/[。！？!?]+$/, "").trim() || null;
  }

  if (
    /^(?:请|能否|可以|能不能)?\s*(?:帮我)?\s*(?:解释|讲解|说明|梳理)/.test(normalized)
    || /^(?:什么是|为什么|为何|怎样理解|如何理解)/.test(normalized)
  ) {
    return normalized.replace(/[。！？!?]+$/, "").trim() || null;
  }

  return null;
}
