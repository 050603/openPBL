import { callLLM, parseLLMJson } from "@/lib/llm/client";
import { JSON_TEACHER_PROMPT_CONTRACT } from "@/lib/prompt-quality/policy";
import {
  deriveAdaptiveEnrichmentTarget,
  deriveMasteryAssessmentSceneIds,
  evaluateAdaptiveLearningPlanQuality,
} from "@/lib/adaptive-learning";
import {
  assessKnowledgeGraphQuality,
  knowledgeStructureSignature,
} from "@/lib/knowledge-graph-quality";
import type {
  AdaptiveAssessmentQuestion,
  AdaptiveBranchKind,
  AdaptiveBranchOutline,
  AdaptiveLearningPlan,
  Course,
  KnowledgeGraph,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgePoint,
  OpenMaicSceneOutlineSnapshot,
} from "@/lib/session/types";

type ModelCall = typeof callLLM;

export type CourseEntryGenerationInput = {
  course: Pick<Course, "name" | "subject" | "grade" | "summary" | "learningObjectives" | "learnerProfile">;
  knowledgePoints: KnowledgePoint[];
  knowledgeGraph?: KnowledgeGraph;
  mainScenes: OpenMaicSceneOutlineSnapshot[];
};

export type CourseEntryQuestionBlueprint = {
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  rationale: string;
};

export type CourseEntryReviewResourceBlueprint = {
  title: string;
  misconception: string;
  explanation: string;
  workedExample: string;
  bridgeCheck: string;
};

export type CourseEntryPrerequisiteBlueprint = {
  foundationKind: "disciplinary-concept" | "disciplinary-process" | "representation-or-data" | "cross-disciplinary-skill" | "unspecified";
  curriculumFoundationCode: "ai-concept" | "data-dataset" | "machine-learning-concept" | "supervised-learning-process" | "feature-representation" | "disciplinary-other" | "cross-disciplinary" | "unspecified";
  name: string;
  description: string;
  keyInfo: string;
  expectedPriorKnowledgeEvidence: string;
  necessityRationale: string;
  diagnosticBoundary: string;
  unlocksLessonKnowledgePointIds: string[];
  question: CourseEntryQuestionBlueprint;
  reviewResource: CourseEntryReviewResourceBlueprint;
};

export type CourseEntryExtensionBlueprint = {
  kind: Exclude<AdaptiveBranchKind, "prerequisite">;
  title: string;
  objective: string;
  keyPoints: string[];
  anchorKnowledgePointIds: string[];
  noveltyStatement: string;
  generationGuidance: string;
};

export type CourseEntryBlueprint = {
  stageAssumption: string;
  courseDepthRationale: string;
  knowledgeLadder: Array<{
    order: number;
    name: string;
    role: "earlier-foundation" | "lesson-entry" | "lesson-target";
    rationale: string;
  }>;
  prerequisiteAnalysisSummary: string;
  prerequisites: CourseEntryPrerequisiteBlueprint[];
  extensions: CourseEntryExtensionBlueprint[];
};

export type CourseEntryGenerationResult = {
  plan: AdaptiveLearningPlan;
  knowledgeGraph: KnowledgeGraph;
  warnings: string[];
  revisionCount: number;
  reviewSummary: string;
  reviewFindings: string[];
};

type ReviewerEnvelope = {
  verdict: "passed" | "revised";
  reviewSummary: string;
  findings: string[];
  finalBlueprint: CourseEntryBlueprint;
};

const MIN_PREREQUISITES = 1;
const MAX_PREREQUISITES = 5;
const MAX_MODEL_CALLS = 3;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeQuestion(value: unknown): CourseEntryQuestionBlueprint {
  const raw = record(value);
  return {
    prompt: text(raw.prompt),
    options: strings(raw.options).slice(0, 4),
    correctOptionIndex: typeof raw.correctOptionIndex === "number"
      ? Math.round(raw.correctOptionIndex)
      : -1,
    rationale: text(raw.rationale),
  };
}

function normalizeReviewResource(value: unknown): CourseEntryReviewResourceBlueprint {
  const raw = record(value);
  return {
    title: text(raw.title),
    misconception: text(raw.misconception),
    explanation: text(raw.explanation),
    workedExample: text(raw.workedExample),
    bridgeCheck: text(raw.bridgeCheck),
  };
}

function normalizePrerequisite(value: unknown): CourseEntryPrerequisiteBlueprint {
  const raw = record(value);
  const foundationKind: CourseEntryPrerequisiteBlueprint["foundationKind"] = raw.foundationKind === "disciplinary-concept"
    || raw.foundationKind === "disciplinary-process"
    || raw.foundationKind === "representation-or-data"
    || raw.foundationKind === "cross-disciplinary-skill"
    ? raw.foundationKind
    : "unspecified";
  const curriculumFoundationCode: CourseEntryPrerequisiteBlueprint["curriculumFoundationCode"] = raw.curriculumFoundationCode === "ai-concept"
    || raw.curriculumFoundationCode === "data-dataset"
    || raw.curriculumFoundationCode === "machine-learning-concept"
    || raw.curriculumFoundationCode === "supervised-learning-process"
    || raw.curriculumFoundationCode === "feature-representation"
    || raw.curriculumFoundationCode === "disciplinary-other"
    || raw.curriculumFoundationCode === "cross-disciplinary"
    ? raw.curriculumFoundationCode
    : "unspecified";
  return {
    foundationKind,
    curriculumFoundationCode,
    name: text(raw.name),
    description: text(raw.description),
    keyInfo: text(raw.keyInfo),
    expectedPriorKnowledgeEvidence: text(raw.expectedPriorKnowledgeEvidence),
    necessityRationale: text(raw.necessityRationale),
    diagnosticBoundary: text(raw.diagnosticBoundary),
    unlocksLessonKnowledgePointIds: strings(raw.unlocksLessonKnowledgePointIds),
    question: normalizeQuestion(raw.question),
    reviewResource: normalizeReviewResource(raw.reviewResource),
  };
}

function normalizeExtension(value: unknown): CourseEntryExtensionBlueprint {
  const raw = record(value);
  const kind: CourseEntryExtensionBlueprint["kind"] = raw.kind === "worked-example" || raw.kind === "extension"
    ? raw.kind
    : "application";
  return {
    kind,
    title: text(raw.title),
    objective: text(raw.objective),
    keyPoints: strings(raw.keyPoints).slice(0, 5),
    anchorKnowledgePointIds: strings(raw.anchorKnowledgePointIds),
    noveltyStatement: text(raw.noveltyStatement),
    generationGuidance: text(raw.generationGuidance),
  };
}

export function normalizeCourseEntryBlueprint(value: unknown): CourseEntryBlueprint {
  const raw = record(value);
  const rawLadder = Array.isArray(raw.knowledgeLadder) ? raw.knowledgeLadder : [];
  const knowledgeLadder = rawLadder.map((item, index) => {
    const value = record(item);
    const role: CourseEntryBlueprint["knowledgeLadder"][number]["role"] = value.role === "earlier-foundation" || value.role === "lesson-target"
      ? value.role
      : "lesson-entry";
    return {
      order: typeof value.order === "number" ? Math.round(value.order) : index + 1,
      name: text(value.name),
      role,
      rationale: text(value.rationale),
    };
  }).slice(0, 12);
  if (knowledgeLadder.length >= 3) {
    knowledgeLadder.sort((left, right) => left.order - right.order);
    knowledgeLadder[0] = { ...knowledgeLadder[0], role: "earlier-foundation" };
    knowledgeLadder[1] = { ...knowledgeLadder[1], role: "lesson-entry" };
    const lastIndex = knowledgeLadder.length - 1;
    knowledgeLadder[lastIndex] = { ...knowledgeLadder[lastIndex], role: "lesson-target" };
  }
  return {
    stageAssumption: text(raw.stageAssumption),
    courseDepthRationale: text(raw.courseDepthRationale),
    knowledgeLadder,
    prerequisiteAnalysisSummary: text(raw.prerequisiteAnalysisSummary),
    prerequisites: (Array.isArray(raw.prerequisites) ? raw.prerequisites : [])
      .map(normalizePrerequisite)
      .slice(0, MAX_PREREQUISITES),
    extensions: (Array.isArray(raw.extensions) ? raw.extensions : [])
      .map(normalizeExtension)
      .slice(0, 6),
  };
}

function includesK12Stage(value: string): boolean {
  return /小学|初中|高中|高一|高二|高三|K12|大学|本科|专科/i.test(value);
}

const ADVANCED_AI_FOUNDATION_CODES = [
  "ai-concept",
  "data-dataset",
  "machine-learning-concept",
  "supervised-learning-process",
  "feature-representation",
] as const;

function requiredCurriculumFoundationCodes(input: CourseEntryGenerationInput): string[] {
  const courseCorpus = [
    input.course.name,
    input.course.subject,
    ...input.knowledgePoints.map((point) => point.name),
  ].join(" ");
  return /计算机视觉|自然语言处理|图像分类|物体检测|人脸识别|文本分类|情感分析|机器翻译|语音识别/i.test(courseCorpus)
    ? [...ADVANCED_AI_FOUNDATION_CODES]
    : [];
}

function containsLessonSpecificTerm(value: string, input: CourseEntryGenerationInput): boolean {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "");
  return input.knowledgePoints.some((point) => {
    const term = point.name.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "");
    return term.length >= 4 && normalized.includes(term);
  });
}

export function validateCourseEntryBlueprint(
  blueprint: CourseEntryBlueprint,
  input: CourseEntryGenerationInput,
): string[] {
  const issues: string[] = [];
  const lessonIds = new Set(input.knowledgePoints.map((point) => point.id));
  const lessonNames = new Set(input.knowledgePoints.map((point) => point.name.trim().toLowerCase()));
  if (!blueprint.stageAssumption || !includesK12Stage(blueprint.stageAssumption)) {
    issues.push("缺少明确的小学、初中、高中、K12 待确认或大学学段判断");
  }
  if (!blueprint.courseDepthRationale) issues.push("缺少课程在学科知识阶梯中的深度判断");
  if (blueprint.knowledgeLadder.length < 3) issues.push("知识阶梯至少需要三个递进台阶");
  const ladderRoles = new Set(blueprint.knowledgeLadder.map((step) => step.role));
  for (const role of ["earlier-foundation", "lesson-entry", "lesson-target"] as const) {
    if (!ladderRoles.has(role)) issues.push(`知识阶梯缺少 ${role} 台阶`);
  }
  if (!blueprint.prerequisiteAnalysisSummary) issues.push("缺少课程入口分析结论");
  const requiredMinimum = input.knowledgePoints.length >= 3 ? 2 : MIN_PREREQUISITES;
  if (blueprint.prerequisites.length < requiredMinimum) {
    issues.push(input.knowledgePoints.length >= 3
      ? "包含多个本课目标的课程至少需要两项互补的真实先修能力"
      : "每门课至少需要一项真实先修能力");
  }
  if (blueprint.prerequisites.length > MAX_PREREQUISITES) issues.push("先修能力不得超过五项");

  const disciplinaryPrerequisites = blueprint.prerequisites.filter((point) =>
    point.foundationKind !== "cross-disciplinary-skill" && point.foundationKind !== "unspecified",
  );
  if (disciplinaryPrerequisites.length < Math.min(2, requiredMinimum)) {
    issues.push("课程入口必须由学科概念、学科过程或数据表征基础主导，不能只用数学、语文或工具操作凑成前测");
  }
  if (blueprint.prerequisites.filter((point) => point.foundationKind === "cross-disciplinary-skill").length > 1) {
    issues.push("跨学科技能最多保留一项，且只能作为学科先修之外的补充");
  }
  const prerequisiteNamesInBlueprint = new Set(
    blueprint.prerequisites.map((point) => point.name.trim().toLocaleLowerCase("zh-CN")),
  );
  for (const node of (input.knowledgeGraph?.nodes ?? []).filter((item) => item.instructionalRole === "prerequisite")) {
    if (!prerequisiteNamesInBlueprint.has(node.label.trim().toLocaleLowerCase("zh-CN"))) {
      issues.push(`不得删除知识图谱已通过硬规则的先修能力：${node.label}`);
    }
  }

  const prerequisiteNames = new Set<string>();
  const questionPrompts = new Set<string>();
  blueprint.prerequisites.forEach((point, index) => {
    const label = point.name || `第 ${index + 1} 项先修`;
    if (point.foundationKind === "unspecified") issues.push(`${label} 缺少先修类型判断`);
    if (point.curriculumFoundationCode === "unspecified") issues.push(`${label} 缺少课程体系基础编码`);
    const normalizedName = point.name.toLowerCase();
    if (!point.name || !point.description || !point.keyInfo) issues.push(`${label} 缺少名称、准确含义或答案依据`);
    if (prerequisiteNames.has(normalizedName)) issues.push(`先修能力重复：${label}`);
    prerequisiteNames.add(normalizedName);
    if (lessonNames.has(normalizedName)) issues.push(`先修能力与本课新授知识重名：${label}`);
    if (!point.expectedPriorKnowledgeEvidence) issues.push(`${label} 缺少课前应会依据`);
    if (!point.necessityRationale) issues.push(`${label} 缺少不可或缺性说明`);
    if (!point.diagnosticBoundary) issues.push(`${label} 缺少可观察的掌握边界`);
    if (!point.unlocksLessonKnowledgePointIds.length) issues.push(`${label} 没有指向受其阻断的本课目标`);
    const invalidTargets = point.unlocksLessonKnowledgePointIds.filter((id) => !lessonIds.has(id));
    if (invalidTargets.length) issues.push(`${label} 引用了不存在的本课知识点：${invalidTargets.join("、")}`);

    const question = point.question;
    if (question.prompt.length < 10) issues.push(`${label} 的前测题缺少具体问题情境`);
    if (questionPrompts.has(question.prompt)) issues.push(`前测题重复：${question.prompt}`);
    questionPrompts.add(question.prompt);
    if (question.options.length !== 4) issues.push(`${label} 的前测题必须有四个互斥选项`);
    if (new Set(question.options).size !== question.options.length) issues.push(`${label} 的前测题选项重复`);
    if (question.correctOptionIndex < 0 || question.correctOptionIndex >= question.options.length) {
      issues.push(`${label} 的前测题正确答案索引无效`);
    }
    if (!question.rationale) issues.push(`${label} 的前测题缺少答案与误解解析`);
    if (containsLessonSpecificTerm(`${question.prompt} ${question.options.join(" ")}`, input)) {
      issues.push(`${label} 的前测题泄露了本课新授知识名称或情境，应改用本课之外的迁移情境`);
    }

    const resource = point.reviewResource;
    if (!resource.title || !resource.misconception || !resource.explanation || !resource.workedExample || !resource.bridgeCheck) {
      issues.push(`${label} 的知识回顾必须包含误解定位、短讲解、新例子和衔接检查`);
    }
  });

  const requiredFoundationCodes = requiredCurriculumFoundationCodes(input);
  if (requiredFoundationCodes.length) {
    const actualFoundationCodes = new Set(blueprint.prerequisites.map((point) => point.curriculumFoundationCode));
    const missingFoundationCodes = requiredFoundationCodes.filter((code) => !actualFoundationCodes.has(code as CourseEntryPrerequisiteBlueprint["curriculumFoundationCode"]));
    if (missingFoundationCodes.length) {
      issues.push(`K12 人工智能应用主题缺少必要课程台阶：${missingFoundationCodes.join("、")}`);
    }
  }

  if (input.knowledgePoints.length >= 4) {
    if (!disciplinaryPrerequisites.some((point) => point.unlocksLessonKnowledgePointIds.length >= 2)) {
      issues.push("至少一项学科先修应连接两个以上本课目标，避免只围绕局部计算或单页操作设计入口");
    }
  }

  const enrichmentTarget = deriveAdaptiveEnrichmentTarget(input);
  if (blueprint.extensions.length < enrichmentTarget.recommendedMin) {
    issues.push(`课后拓展候选不足：需要 ${enrichmentTarget.recommendedMin}-${enrichmentTarget.recommendedMax} 项`);
  }
  const extensionTitles = new Set<string>();
  blueprint.extensions.forEach((extension, index) => {
    const label = extension.title || `第 ${index + 1} 项拓展`;
    if (!extension.title || !extension.objective || !extension.keyPoints.length || !extension.noveltyStatement || !extension.generationGuidance) {
      issues.push(`${label} 缺少目标、关键点、新增价值或生成指导`);
    }
    if (extensionTitles.has(extension.title)) issues.push(`课后拓展主题重复：${extension.title}`);
    extensionTitles.add(extension.title);
    if (!extension.anchorKnowledgePointIds.length || extension.anchorKnowledgePointIds.some((id) => !lessonIds.has(id))) {
      issues.push(`${label} 没有锚定有效的本课知识点`);
    }
  });
  return issues;
}

function summarizedScenes(scenes: readonly OpenMaicSceneOutlineSnapshot[]) {
  return scenes
    .filter((scene) => scene.audience === "student" || scene.stageKey === "ai-learning")
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .map((scene) => ({
      id: scene.id,
      title: scene.title,
      type: scene.type,
      order: scene.order,
      stageKey: scene.stageKey,
      description: scene.description,
      keyPoints: scene.keyPoints ?? [],
      knowledgePointIds: scene.knowledgePointIds ?? [],
    }));
}

function outputSchema(input: CourseEntryGenerationInput) {
  const target = deriveAdaptiveEnrichmentTarget(input);
  return {
    stageAssumption: "明确写出小学/初中/高中/大学；年级缺失时写 K12 学段待确认",
    courseDepthRationale: "说明本课主题在该学段知识体系中的位置和深度",
    knowledgeLadder: [{ order: 1, name: "更早的学科基础", role: "earlier-foundation|lesson-entry|lesson-target", rationale: "递进关系" }],
    prerequisiteAnalysisSummary: "解释为什么这些能力构成课程入口，而不是本课预习题",
    prerequisites: [{
      foundationKind: "disciplinary-concept|disciplinary-process|representation-or-data|cross-disciplinary-skill",
      curriculumFoundationCode: "ai-concept|data-dataset|machine-learning-concept|supervised-learning-process|feature-representation|disciplinary-other|cross-disciplinary",
      name: "课前理应掌握且缺失会阻断新课的能力",
      description: "准确含义",
      keyInfo: "客观答案依据",
      expectedPriorKnowledgeEvidence: "结合学段和知识阶梯说明为什么课前应会",
      necessityRationale: "点名它会阻断的本课目标和原因",
      diagnosticBoundary: "可用一道客观题观察的掌握边界",
      unlocksLessonKnowledgePointIds: ["本课知识点 id"],
      question: {
        prompt: "有真实判断情境、只测这一项先修能力的问题",
        options: ["互斥选项 A", "互斥选项 B", "互斥选项 C", "互斥选项 D"],
        correctOptionIndex: 0,
        rationale: "说明正确依据、各干扰项反映的典型误解，以及错误为何会阻断新课",
      },
      reviewResource: {
        title: "该先修能力的知识回顾",
        misconception: "从前测错误选项定位具体误解",
        explanation: "只讲清该先修能力的短讲解",
        workedExample: "主课未使用过的同层级新例子",
        bridgeCheck: "一道不提前教授本课内容的衔接检查",
      },
    }],
    extensions: Array.from({ length: target.recommendedMin }, () => ({
      kind: "worked-example|application|extension",
      title: "主课达标后才进入的高价值拓展",
      objective: "拓展目标",
      keyPoints: ["新增内容"],
      anchorKnowledgePointIds: ["本课知识点 id"],
      noveltyStatement: "相对主课新增了什么",
      generationGuidance: "如何避免重复主课并完成迁移或深化",
    })),
  };
}

function platformContext(input: CourseEntryGenerationInput) {
  return {
    primaryAudience: "小学、初中、高中学生，兼顾大学学习者",
    targetStage: input.course.grade?.trim() || "K12 学段待确认",
    enlightenmentMeaning: "学生处在知识启蒙和系统学习阶段；不代表课程主题没有前序知识",
    analysisOrder: ["确定学段", "定位本课在学科知识阶梯中的深度", "反向追踪进入本课所需能力", "排除本课新授、常识题和低龄凑数题"],
    requiredCurriculumFoundationCodes: requiredCurriculumFoundationCodes(input),
    acceptedPrerequisiteNodes: (input.knowledgeGraph?.nodes ?? [])
      .filter((node) => node.instructionalRole === "prerequisite")
      .map((node) => ({
        id: node.id,
        name: node.label,
        priorKnowledgeEvidence: node.priorKnowledgeEvidence,
        diagnosticBoundary: node.diagnosticBoundary,
      })),
  };
}

export function buildCourseEntryGenerationMessages(input: CourseEntryGenerationInput) {
  return [
    {
      role: "system" as const,
      content: `你是 K12 课程体系设计师，负责建立一门课的学习入口，而不是为课程随意添加测验。

必须依次完成：学段定位 → 课程深度定位 → 知识阶梯回溯 → 先修必要性判断 → 前测与补学设计。

硬性规则：
1. 每门课必须有 1-5 项真实先修能力，推荐 2-4 项。领域入门、通识、知识启蒙、无需编程、年级缺失都不是零先修理由。
2. 先修能力必须是学生在本课之前理应学过，且缺失会直接阻断一个明确的本课目标；它不能是本课新授内容的同义改写、简化例子或预习题。
3. 一项先修能力内聚地包含一道前测题和一份知识回顾脚本。禁止跨对象自行维护 ID；程序会统一生成引用。
4. 前测题必须是有信息量的单项选择题，包含四个互斥且有诊断价值的选项；不得只考术语名称、生活常识或低龄语文常识。
5. 知识回顾脚本必须依次包含“定位具体误解 → 短讲解 → 同层级新例子 → 衔接检查”，不得提前讲授本课目标。
6. 课后拓展只在主课最终达标测之后出现。它必须提供主课没有的新例题、迁移任务或概念深化，数量遵循输出结构，不得重复讲解主课。
7. 对 K12 学生而言，计算机视觉、自然语言处理等属于较深入主题；必须检查人工智能、数据与数据集、机器学习流程、监督学习、特征等可能台阶，但只能选择当前课程目标真正依赖的项目，不能机械套用清单。
8. 先修组合必须由学科概念、学科过程或数据表征基础主导。数学、语文、阅读或工具操作等跨学科技能最多一项，只能补充，不能构成整个课程入口。包含三个以上本课目标时至少给出两项互补的真实先修，并优先选择能支撑多个本课目标的高杠杆基础。
9. 如果 platformContext.requiredCurriculumFoundationCodes 非空，必须逐项各设计一项先修，不得用 RGB、小数运算、词性或句子单位替换。其中：ai-concept 要诊断“数据驱动智能与固定程序”的区别；data-dataset 要诊断样本、特征信息和标签；machine-learning-concept 要诊断从数据学习规律而非人工写死全部规则；supervised-learning-process 要诊断训练、验证、测试的职责与数据泄漏；feature-representation 要诊断从原始数据提取可用于判断的信息。题目必须考理解和判断，不能只问名称。
10. platformContext.acceptedPrerequisiteNodes 来自上一步已经通过硬规则的知识图谱。必须保留这些先修的名称和语义，只为它们补齐题目、回顾资源和入口映射；不得重新判断后删除。

只返回严格 JSON。${JSON_TEACHER_PROMPT_CONTRACT}`,
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        platformContext: platformContext(input),
        course: input.course,
        lessonKnowledgePoints: input.knowledgePoints,
        currentKnowledgeGraph: input.knowledgeGraph,
        mainCourseScenes: summarizedScenes(input.mainScenes),
        output: outputSchema(input),
      }),
    },
  ];
}

export function buildCourseEntryReviewMessages(
  input: CourseEntryGenerationInput,
  candidate: unknown,
  deterministicIssues: readonly string[],
) {
  return [
    {
      role: "system" as const,
      content: `你是课程入口流程代理，负责像教师编辑页面一样直接修订当前结果。你只掌握输入中明确提供的课程背景，不能假设真实班级、学校进度或学生偏好；只修复确定性校验指出的问题，以及当前数据中可直接观察到的常见明显错误。

重点修复：确定性规则要求的入口结构缺失；把本课新授内容提前放进前测；明显的常识题、术语记忆题和低龄凑数题；题目与补学资源不一一对应；补学提前教授本课；课后拓展直接重复主课。

还必须检查“选得是否重要”，而不只是“能否勉强成立”：跨学科计算、语文或工具操作不得主导课程入口；优先保留能支撑多个本课目标的学科概念、过程模型和数据表征。对于 K12 计算机视觉或自然语言处理，如果候选只包含小数、百分比、词性、句子单位等局部技能，而没有检查人工智能、数据与数据集、机器学习流程、监督学习、特征等当前目标真正依赖的上游台阶，必须重做 finalBlueprint。
若 platformContext.requiredCurriculumFoundationCodes 非空，finalBlueprint 必须逐项覆盖全部编码，每个编码恰好由一项先修承担；这是课程体系衔接要求，不是可选建议。
platformContext.acceptedPrerequisiteNodes 是已通过硬规则的上游事实，必须保留名称和语义并完成配套题目与回顾资源，不得在本阶段重新审判或删除。

无法从输入中验证的教学取舍不得擅自判错，也不得阻断流程。无论首稿是否合格，你都必须返回一份完整 finalBlueprint，不能只返回意见或局部补丁。finalBlueprint 必须可直接发布；verdict 为 passed 表示原稿实质合格，为 revised 表示你已在 finalBlueprint 中完成修复。

只返回严格 JSON：{
  "verdict": "passed|revised",
  "reviewSummary": "审校结论",
  "findings": ["发现及已采取的修复"],
  "finalBlueprint": 完整课程入口学习包
}。${JSON_TEACHER_PROMPT_CONTRACT}`,
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        platformContext: platformContext(input),
        course: input.course,
        lessonKnowledgePoints: input.knowledgePoints,
        mainCourseScenes: summarizedScenes(input.mainScenes),
        requiredOutput: outputSchema(input),
        deterministicIssues,
        candidate,
      }),
    },
  ];
}

function parseJsonSafely(raw: string): { value: unknown; issues: string[] } {
  try {
    return { value: parseLLMJson<unknown>(raw), issues: [] };
  } catch {
    return { value: raw, issues: ["模型首稿不是可解析的 JSON"] };
  }
}

function parseReviewerEnvelope(raw: string): { envelope?: ReviewerEnvelope; issues: string[]; value: unknown } {
  const parsed = parseJsonSafely(raw);
  if (parsed.issues.length) return { issues: parsed.issues, value: parsed.value };
  const value = record(parsed.value);
  const blueprint = normalizeCourseEntryBlueprint(value.finalBlueprint);
  const issues: string[] = [];
  if (value.verdict !== "passed" && value.verdict !== "revised") issues.push("独立审校缺少 passed/revised 结论");
  if (!text(value.reviewSummary)) issues.push("独立审校缺少总结");
  if (!value.finalBlueprint || typeof value.finalBlueprint !== "object") issues.push("独立审校没有返回完整 finalBlueprint");
  if (issues.length) return { issues, value: parsed.value };
  return {
    issues: [],
    value: parsed.value,
    envelope: {
      verdict: value.verdict as ReviewerEnvelope["verdict"],
      reviewSummary: text(value.reviewSummary),
      findings: strings(value.findings),
      finalBlueprint: blueprint,
    },
  };
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function prerequisiteId(
  point: CourseEntryPrerequisiteBlueprint,
  index: number,
  graph?: KnowledgeGraph,
): string {
  const normalizedName = point.name.trim().toLocaleLowerCase("zh-CN");
  const existing = graph?.nodes.find((node) =>
    node.instructionalRole === "prerequisite"
    && node.label.trim().toLocaleLowerCase("zh-CN") === normalizedName,
  );
  if (existing) return existing.id;
  return `prereq-${index + 1}-${hashText(point.name).slice(0, 7)}`;
}

function cloneTrigger(trigger: NonNullable<AdaptiveBranchOutline["trigger"]>) {
  return {
    ...trigger,
    assessmentSceneIds: [...(trigger.assessmentSceneIds ?? [])],
    linkedQuestionIds: [...(trigger.linkedQuestionIds ?? [])],
  };
}

function compileKnowledgeGraph(
  input: CourseEntryGenerationInput,
  blueprint: CourseEntryBlueprint,
  reviewSummary: string,
): KnowledgeGraph {
  const lessonIds = new Set(input.knowledgePoints.map((point) => point.id));
  const existingNodes = new Map((input.knowledgeGraph?.nodes ?? []).map((node) => [node.id, node]));
  const lessonNodes: KnowledgeGraphNode[] = input.knowledgePoints.map((point) => ({
    ...existingNodes.get(point.id),
    id: point.id,
    label: point.name,
    description: point.description,
    keyInfo: point.keyInfo,
    level: point.level,
    instructionalRole: "lesson",
    objectiveIndexes: point.objectiveIndexes,
    masteryBoundary: point.masteryBoundary,
    priorKnowledgeEvidence: undefined,
    diagnosticBoundary: undefined,
  }));
  const lessonEdges: KnowledgeGraphEdge[] = (input.knowledgeGraph?.edges ?? [])
    .filter((edge) => lessonIds.has(edge.source) && lessonIds.has(edge.target) && edge.source !== edge.target)
    .map((edge) => ({
      ...edge,
      type: edge.type === "required-prerequisite" ? "supports" : edge.type ?? "supports",
      strength: edge.type === "required-prerequisite" ? "helpful" : edge.strength ?? "helpful",
      rationale: edge.rationale?.trim() || edge.label,
    }));
  const prerequisiteNodes: KnowledgeGraphNode[] = blueprint.prerequisites.map((point, index) => ({
    id: prerequisiteId(point, index, input.knowledgeGraph),
    label: point.name,
    description: point.description,
    keyInfo: point.keyInfo,
    level: "foundation",
    instructionalRole: "prerequisite",
    priorKnowledgeEvidence: point.expectedPriorKnowledgeEvidence,
    diagnosticBoundary: point.diagnosticBoundary,
    relatedLessonIds: point.unlocksLessonKnowledgePointIds,
  }));
  const prerequisiteEdges: KnowledgeGraphEdge[] = blueprint.prerequisites.flatMap((point, index) => {
    const source = prerequisiteId(point, index, input.knowledgeGraph);
    return point.unlocksLessonKnowledgePointIds.map((target) => ({
      id: `edge-${source}-${target}`,
      source,
      target,
      label: `${point.name}是进入该目标的必要基础`,
      type: "required-prerequisite" as const,
      strength: "required" as const,
      rationale: point.necessityRationale,
    }));
  });
  const graph: KnowledgeGraph = {
    nodes: [...lessonNodes, ...prerequisiteNodes],
    edges: [...lessonEdges, ...prerequisiteEdges],
  };
  graph.semanticReview = {
    status: "passed",
    summary: reviewSummary,
    sourceSignature: knowledgeStructureSignature(graph, input.knowledgePoints),
    lessonDecisions: input.knowledgePoints.map((point) => ({ knowledgePointId: point.id, verdict: "accept", issues: [] })),
    prerequisiteDecisions: prerequisiteNodes.map((node) => ({ nodeId: node.id, verdict: "accept", issues: [] })),
    relationshipDecisions: graph.edges.map((edge) => ({ edgeId: edge.id, verdict: "accept", issues: [] })),
  };
  return graph;
}

function compilePlan(
  input: CourseEntryGenerationInput,
  blueprint: CourseEntryBlueprint,
  reviewSummary: string,
  now: string,
): AdaptiveLearningPlan {
  const studentScenes = summarizedScenes(input.mainScenes);
  const firstMainSceneId = studentScenes[0]?.id;
  const terminalAssessmentId = deriveMasteryAssessmentSceneIds(input.mainScenes).at(-1);
  const prerequisitePoints = blueprint.prerequisites.map((point, index) => ({
    id: prerequisiteId(point, index, input.knowledgeGraph),
    name: point.name,
    description: point.description,
    keyInfo: point.keyInfo,
    level: "foundation" as const,
    relatedIds: point.unlocksLessonKnowledgePointIds,
    expectedPriorKnowledgeEvidence: point.expectedPriorKnowledgeEvidence,
    necessityRationale: point.necessityRationale,
    diagnosticBoundary: point.diagnosticBoundary,
  }));
  const questions: AdaptiveAssessmentQuestion[] = blueprint.prerequisites.map((point, index) => {
    const id = prerequisiteId(point, index, input.knowledgeGraph);
    return {
      id: `pretest-${id}`,
      type: "single-choice",
      prompt: point.question.prompt,
      options: point.question.options,
      correctOptionIndex: point.question.correctOptionIndex,
      rationale: point.question.rationale,
      knowledgePointIds: [id],
    };
  });
  const prerequisiteBranches: AdaptiveBranchOutline[] = blueprint.prerequisites.map((point, index) => {
    const id = prerequisiteId(point, index, input.knowledgeGraph);
    const trigger: NonNullable<AdaptiveBranchOutline["trigger"]> = {
      placement: "before-main-course",
      beforeSceneId: firstMainSceneId,
      linkedQuestionIds: [`pretest-${id}`],
      evidenceRule: "pretest-gap",
      minimumRemainingSec: 180,
    };
    return {
      id: `resource-${id}`,
      enabled: true,
      defaultTrigger: cloneTrigger(trigger),
      kind: "prerequisite",
      title: point.reviewResource.title,
      objective: `修复“${point.name}”的具体缺口，使学生达到进入本课的可观察边界。`,
      keyPoints: [
        `误解定位：${point.reviewResource.misconception}`,
        `短讲解：${point.reviewResource.explanation}`,
        `新例子：${point.reviewResource.workedExample}`,
        `衔接检查：${point.reviewResource.bridgeCheck}`,
      ],
      anchorKnowledgePointIds: point.unlocksLessonKnowledgePointIds,
      prerequisiteKnowledgePointIds: [id],
      noveltyStatement: `只补齐本课开始前应掌握的“${point.name}”，不提前讲授本课目标。`,
      mainCourseOverlapSceneIds: studentScenes
        .filter((scene) => scene.type !== "quiz" && scene.knowledgePointIds.some((targetId) => point.unlocksLessonKnowledgePointIds.includes(targetId)))
        .map((scene) => scene.id),
      sceneType: "slide",
      targetDurationSec: 210,
      generationGuidance: `严格按四段生成至少一页 AI 授知资源：① ${point.reviewResource.misconception}；② ${point.reviewResource.explanation}；③ ${point.reviewResource.workedExample}；④ ${point.reviewResource.bridgeCheck}。不得定义、解释或练习本课新授目标。该资源是主课程中的插入片段，直接开始讲解，不得问候、欢迎、重新介绍课程或正式告别；结尾只用一句自然衔接返回后续内容。`,
      trigger,
      status: "draft",
    };
  });
  const extensionBranches: AdaptiveBranchOutline[] = blueprint.extensions.map((extension, index) => {
    const branchId = `extension-${index + 1}-${hashText(extension.title).slice(0, 7)}`;
    const trigger: NonNullable<AdaptiveBranchOutline["trigger"]> = {
      placement: "after-module",
      assessmentSceneIds: terminalAssessmentId ? [terminalAssessmentId] : [],
      evidenceRule: "module-mastery",
      scoreThreshold: 80,
      minimumRemainingSec: 180,
    };
    return {
      id: branchId,
      enabled: true,
      defaultTrigger: cloneTrigger(trigger),
      kind: extension.kind,
      title: extension.title,
      objective: extension.objective,
      keyPoints: extension.keyPoints,
      anchorKnowledgePointIds: extension.anchorKnowledgePointIds,
      prerequisiteKnowledgePointIds: [],
      noveltyStatement: extension.noveltyStatement,
      mainCourseOverlapSceneIds: studentScenes
        .filter((scene) => scene.knowledgePointIds.some((id) => extension.anchorKnowledgePointIds.includes(id)))
        .map((scene) => scene.id),
      sceneType: extension.kind === "application" ? "interactive" : "slide",
      targetDurationSec: 210,
      generationGuidance: `${extension.generationGuidance}。该资源是主课程中的插入片段，直接进入拓展内容，不得问候、欢迎、重新开场或正式告别；结尾只做迁移小结或自然衔接。`,
      trigger,
      status: "draft",
    };
  });
  const enrichmentTarget = deriveAdaptiveEnrichmentTarget(input);
  const prerequisiteIdsByTarget = new Map<string, string[]>();
  blueprint.prerequisites.forEach((point, index) => {
    const id = prerequisiteId(point, index, input.knowledgeGraph);
    point.unlocksLessonKnowledgePointIds.forEach((targetId) => {
      prerequisiteIdsByTarget.set(targetId, [...(prerequisiteIdsByTarget.get(targetId) ?? []), id]);
    });
  });
  return {
    enabled: true,
    status: "draft",
    generatedAt: now,
    updatedAt: now,
    timeBudgetMin: Math.min(20, Math.max(6, prerequisitePoints.length * 3)),
    thresholds: { enrichmentMasteryMin: 80 },
    prerequisiteKnowledgePoints: prerequisitePoints,
    prerequisiteAnalysis: {
      summary: `${blueprint.stageAssumption}。${blueprint.courseDepthRationale} ${blueprint.prerequisiteAnalysisSummary}`,
      decisions: input.knowledgePoints.map((point) => {
        const prerequisiteKnowledgePointIds = prerequisiteIdsByTarget.get(point.id) ?? [];
        return {
          targetKnowledgePointId: point.id,
          decision: prerequisiteKnowledgePointIds.length ? "diagnose-prerequisite" as const : "teach-in-main-course" as const,
          prerequisiteKnowledgePointIds,
          rationale: prerequisiteKnowledgePointIds.length
            ? "独立审校确认存在必须在课前诊断并可按缺口补救的上游能力。"
            : "该目标由主课负责完整讲授，未额外绑定不必要的课前题。",
        };
      }),
    },
    prerequisiteSemanticReview: {
      status: "passed",
      summary: reviewSummary,
      decisions: prerequisitePoints.map((point) => ({
        prerequisiteKnowledgePointId: point.id,
        verdict: "accept",
        issues: [],
      })),
    },
    pretest: {
      title: "课程入口 · 前序能力诊断",
      introduction: "这些题只检查学习本课之前理应掌握的基础。答错不会扣除课程成绩，系统会先安排对应的 AI 知识回顾，再进入本课。",
      estimatedMinutes: Math.max(1, Math.min(5, Math.ceil(questions.length * 0.75))),
      questions,
    },
    enrichmentStrategy: {
      recommendedMin: enrichmentTarget.recommendedMin,
      recommendedMax: enrichmentTarget.recommendedMax,
      runtimeMaxPerStudent: enrichmentTarget.runtimeMaxPerStudent,
      summary: enrichmentTarget.reason,
      decisions: extensionBranches.map((branch) => ({
        id: `decision-${branch.id}`,
        decision: "selected",
        title: branch.title,
        valueType: branch.kind === "worked-example" ? "concept-depth" : branch.kind === "extension" ? "classic-extension" : "task-transfer",
        rationale: branch.noveltyStatement,
        anchorKnowledgePointIds: branch.anchorKnowledgePointIds,
        afterAssessmentSceneId: terminalAssessmentId,
        branchId: branch.id,
      })),
    },
    branches: [...prerequisiteBranches, ...extensionBranches],
  };
}

export function compileCourseEntryPackage(
  input: CourseEntryGenerationInput,
  blueprint: CourseEntryBlueprint,
  reviewSummary: string,
  now = new Date().toISOString(),
): Omit<CourseEntryGenerationResult, "revisionCount" | "warnings" | "reviewFindings"> & { warnings: string[]; issues: string[] } {
  const knowledgeGraph = compileKnowledgeGraph(input, blueprint, reviewSummary);
  const plan = compilePlan({ ...input, knowledgeGraph }, blueprint, reviewSummary, now);
  const graphQuality = assessKnowledgeGraphQuality(knowledgeGraph, input.knowledgePoints, [], {
    objectiveCount: input.course.learningObjectives?.length ?? 0,
    requireSemanticReview: true,
    minimumPrerequisites: MIN_PREREQUISITES,
  });
  const planQuality = evaluateAdaptiveLearningPlanQuality(plan, {
    ...input,
    knowledgeGraph,
  });
  return {
    plan,
    knowledgeGraph,
    reviewSummary,
    issues: [...graphQuality.issues, ...planQuality.issues],
    warnings: planQuality.warnings,
  };
}

export async function generateCourseEntryPackage(
  input: CourseEntryGenerationInput,
  options: { abortSignal?: AbortSignal; modelCall?: ModelCall; maxModelCalls?: number; now?: string } = {},
): Promise<CourseEntryGenerationResult> {
  if (!input.knowledgePoints.length) throw new Error("课程入口生成失败：本课知识点为空");
  const modelCall = options.modelCall ?? callLLM;
  const maxModelCalls = Math.max(2, Math.min(MAX_MODEL_CALLS, options.maxModelCalls ?? MAX_MODEL_CALLS));
  const candidateRaw = await modelCall(buildCourseEntryGenerationMessages(input), {
    jsonMode: true,
    abortSignal: options.abortSignal,
    requestClass: "long-generation",
    maxTransientRetries: 1,
  });
  const candidateParsed = parseJsonSafely(candidateRaw);
  const candidateBlueprint = normalizeCourseEntryBlueprint(candidateParsed.value);
  let issues = [...candidateParsed.issues, ...validateCourseEntryBlueprint(candidateBlueprint, input)];
  let candidate: unknown = candidateParsed.value;

  for (let callIndex = 2; callIndex <= maxModelCalls; callIndex += 1) {
    const reviewRaw = await modelCall(buildCourseEntryReviewMessages(input, candidate, issues), {
      jsonMode: true,
      abortSignal: options.abortSignal,
      requestClass: "standard",
      maxTransientRetries: 1,
    });
    const parsedReview = parseReviewerEnvelope(reviewRaw);
    if (!parsedReview.envelope) {
      issues = parsedReview.issues;
      candidate = parsedReview.value;
      continue;
    }
    const blueprintIssues = validateCourseEntryBlueprint(parsedReview.envelope.finalBlueprint, input);
    if (blueprintIssues.length) {
      issues = blueprintIssues;
      candidate = parsedReview.value;
      continue;
    }
    const compiled = compileCourseEntryPackage(
      input,
      parsedReview.envelope.finalBlueprint,
      parsedReview.envelope.reviewSummary,
      options.now,
    );
    if (compiled.issues.length) {
      issues = compiled.issues;
      candidate = parsedReview.value;
      continue;
    }
    return {
      plan: compiled.plan,
      knowledgeGraph: compiled.knowledgeGraph,
      warnings: compiled.warnings,
      revisionCount: callIndex - 1,
      reviewSummary: compiled.reviewSummary,
      reviewFindings: parsedReview.envelope.findings,
    };
  }
  throw new Error(`课程入口学习包无法通过发布校验：${issues.join("；") || "模型未返回完整修订稿"}`);
}
