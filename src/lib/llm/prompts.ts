// Prompt templates for the 4 LLM actions.
// Each prompt asks the model to return a strict JSON object matching our schema.

import type { GenerateInput } from "./types";
import {
  deriveTeachingConstraints,
} from "@/lib/openmaic/pedagogy/teaching-constraints";
import { JSON_TEACHER_PROMPT_CONTRACT } from "@/lib/prompt-quality/policy";

const GRADE_BAND_LABELS: Record<string, string> = {
  primary: "小学",
  "middle-school": "初中",
  "high-school": "高中",
  vocational: "职业教育",
  "higher-education": "高等教育",
  general: "未明确学段",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  introductory: "入门难度",
  standard: "标准难度",
  advanced: "进阶难度",
};

const KNOWLEDGE_LEVEL_LABELS: Record<string, string> = {
  foundation: "基础层",
  core: "核心层",
  application: "应用层",
  extension: "拓展层",
};

const USER_FACING_LANGUAGE_RULE = "语言硬约束：JSON 的键名和枚举值可以按结构要求使用英文代码；除此之外，所有面向教师或学生阅读的标题、说明、依据、假设、目标、活动和评价文字必须使用自然、准确的简体中文。不得在自然语言中复述 stageKey、difficulty、level、priorKnowledge、learningNeeds 等内部字段名，也不得用 launch、ai-learning、proposal、make、showcase、reflection、foundation、core、application、extension、introductory、standard、advanced 等代码代替中文概念。";

const TEACHING_OUTLINE_ROUTING_RULES = `
Hard routing rules for the new PBL classroom:
- Only \'student-ai-learning\' may enter the student AI classroom, and only for the ai-learning phase.
- \'none\' means ordinary classroom activity. Ordinary activity support is teacher-facing PPT plus script only.
- The removed \'teacher-resource\' value is invalid as a user-facing tag and must be normalized to \'none\'.
- Ordinary activity support never receives TTS.
`;

const SYSTEM_PREAMBLE = `你是一名资深的 PBL（项目式学习）课程设计专家，擅长将学科课程转化为以驱动问题为核心的项目式学习课程。
请始终以严格 JSON 形式返回结果，不要包含任何额外说明文字。
${USER_FACING_LANGUAGE_RULE}
${JSON_TEACHER_PROMPT_CONTRACT}`;

function chineseCourseScopeRule(hours: number): string {
  if (hours <= 1) return "围绕一个连贯机制安排精细知识点、一次引导应用和一个可验证的小型成果。";
  if (hours <= 2) return "建立清晰的先修链，比较至少两个实例或方法，安排引导练习并完成一个有边界、有证据的应用成果。";
  if (hours <= 3) return "覆盖基础、机制解释、方法比较、引导应用和一次修订，深度必须符合学生学段。";
  if (hours <= 4) return "形成从基础到应用的完整进阶，包含证据收集、测试和至少一次有意义的修订。";
  return "形成完整的项目式学习过程，包含持续探究、多轮证据、测试、反馈和迭代，避免重复与表面化填充。";
}

function inferredFoundationLabel(gradeBand: string): string {
  if (gradeBand === "primary") return "仅假设学生具备具体生活经验，不预设正式学科术语基础。";
  if (gradeBand === "middle-school") return "仅假设学生具备本学段基础学科知识，不预设专业或大学层次知识。";
  if (gradeBand === "high-school") return "仅假设学生具备高中通识与学科基础，不预设未明确列出的大学专业知识。";
  if (gradeBand === "vocational") return "可假设学生具备一定实践经验，但不预设未明确列出的专业术语。";
  if (gradeBand === "higher-education") return "可假设学生具备一般学术学习能力，但不预设课程边界之外的专业概念。";
  return "仅假设一般理解能力和教师明确填写的已有基础。";
}

function formatChineseTeachingConstraints(input: GenerateInput): string {
  const constraints = deriveTeachingConstraints({
    grade: input.grade,
    subject: input.subject,
    topic: input.name,
    hours: input.hours,
    learnerProfile: input.learnerProfile,
    learningObjectives: input.learningObjectives,
  });
  const priorKnowledge = input.learnerProfile?.priorKnowledge?.trim()
    || inferredFoundationLabel(constraints.gradeBand);
  return [
    "学生画像与教学边界（必须遵守）：",
    `学段：${constraints.grade}（${GRADE_BAND_LABELS[constraints.gradeBand] ?? "未明确学段"}）`,
    `课程容量：${constraints.courseHours} 课时，共 ${constraints.totalMinutes} 分钟`,
    `内容范围：${chineseCourseScopeRule(constraints.courseHours)}`,
    `已有知识基础：${priorKnowledge}`,
    `学习支持需求：${constraints.learningNeeds.join("；") || "未填写，按学段采用保守、分步的学习支架"}`,
    `熟悉情境：${constraints.familiarContexts.join("；") || "未填写，优先使用学生日常可理解的情境"}`,
    "术语规则：专业术语首次出现时必须用通俗中文解释，并连接到学生已经熟悉的概念或实例。",
    "深度规则：从具体例子逐步过渡到抽象解释，只引入完成课程目标所必需的深度。",
    "评价规则：只评价已确认目标和知识点；题目干扰项应对应真实误区，解析必须说明判断依据。",
  ].join("\n");
}

const SCHEMA_HINT = `
返回 JSON 形如：
{
  "pblOutline": "string",
  "knowledgePoints": [{ "id": "kp-1", "name": "string", "description": "string", "keyInfo": "string", "level": "foundation|core|application|extension", "relatedIds": ["kp-2"] }],
  "knowledgeGraph": {
    "nodes": [{ "id": "kp-1", "label": "string", "description": "string", "keyInfo": "string", "level": "foundation|core|application|extension" }],
    "edges": [{ "id": "edge-1", "source": "kp-1", "target": "kp-2", "label": "先修|支撑|应用|对比|迁移" }]
  },
  "teachingOutline": [{
    "id": "to-1",
    "stageKey": "launch",
    "title": "string",
    "durationMin": 10,
    "teachingGoal": "string",
    "teacherRole": "string",
    "platformRole": "string",
    "aiRole": "string",
    "studentActivity": "string",
    "activityKind": "launch|knowledge|proposal|practice|showcase|reflection|other",
    "knowledgePointIds": ["kp-1"],
    "openMaicUse": "none|student-ai-learning",
    "resourceTypes": ["ppt", "interactive-demo", "code-interactive", "script"],
    "notes": "string"
  }],
  "lessonOutline": [{
    "id": "lo-1",
    "stageKey": "ai-learning",
    "title": "string",
    "objectives": ["string", "string"],
    "activities": ["string"],
    "durationMin": 45,
    "parentActivityId": "to-1",
    "detailKind": "knowledge-explanation",
    "knowledgePointIds": ["kp-1"],
    "resourceTypes": ["ppt", "interactive-demo"],
    "targetDurationSec": 600,
    "ttsPolicy": "target-duration"
  }],
  "evaluationPlan": {
    "dimensions": [{ "id": "ev-1", "name": "string", "weight": 20, "description": "string", "responsibleRole": "ai|teacher" }],
    "overallRubric": "string"
  }
}`;

function personalProjectConfigText(input: GenerateInput): string {
  if (!input.pblConfig) return "（未配置个人项目 PBL 参数）";
  const stageLabels = new Map(input.stages.map((stage) => [stage.key, stage.label]));
  return JSON.stringify({
    项目形式: "学生独立完成个人项目",
    课程难度: DIFFICULTY_LABELS[input.pblConfig.difficultyLevel] ?? "标准难度",
    项目成果: {
      作品: input.pblConfig.outcome.artifact,
      表达: input.pblConfig.outcome.presentation,
      反思: input.pblConfig.outcome.reflection,
    },
    过程证据: input.pblConfig.evidenceRequirements.map((item) => ({
      名称: item.label,
      说明: item.description,
      涉及阶段: item.stageKeys.map((key) => stageLabels.get(key) ?? "相关课程阶段"),
    })),
    探究问题: input.pblConfig.inquiryQuestions,
  }, null, 2);
}

export function buildAuthoritativeCourseBasisPrompt(input: GenerateInput): string {
  const constraints = deriveTeachingConstraints({
    grade: input.grade,
    subject: input.subject,
    topic: input.name,
    hours: input.hours,
    learnerProfile: input.learnerProfile,
    learningObjectives: input.learningObjectives,
  });
  return [
    "教师确认的课程基础约束（最高优先级）：",
    `课程名称：${input.name}`,
    `学科与学段：${input.subject} / ${input.grade}（${GRADE_BAND_LABELS[constraints.gradeBand] ?? "未明确学段"}）`,
    `课程容量：${constraints.courseHours} 课时，共 ${constraints.totalMinutes} 分钟`,
    `知识点数量范围：${constraints.recommendedKnowledgePointRange.min}-${constraints.recommendedKnowledgePointRange.max}`,
    `课程目标：${constraints.learningObjectives.length ? constraints.learningObjectives.join("；") : "未单独填写，需保守限定在课程名称与说明范围内"}`,
    `课程说明：${input.summary || "未填写"}`,
    `学生已有基础：${input.learnerProfile?.priorKnowledge?.trim() || inferredFoundationLabel(constraints.gradeBand)}`,
    `学习特点与支架需要：${constraints.learningNeeds.join("；") || "按学段采用保守支架"}`,
    `熟悉情境：${constraints.familiarContexts.join("；") || "按学段选择日常可理解情境"}`,
    `内容容量规则：${chineseCourseScopeRule(constraints.courseHours)}`,
    formatChineseTeachingConstraints(input),
    "硬约束：后续知识、活动与评价必须服务于已确认课程目标；不得把认知边界之外的概念变成隐藏前置知识或评价目标；内容深度、练习数量和成果复杂度必须与总课时匹配。",
  ].join("\n");
}

export function buildFullCoursePrompt(input: GenerateInput): {
  system: string;
  user: string;
} {
  const constraints = deriveTeachingConstraints({ grade: input.grade, hours: input.hours });
  const stageList = input.stages
    .map((s) => `- ${s.label}：${s.description}`)
    .join("\n");
  const user = `请基于以下课程信息，生成完整的 PBL 课程结构（包含 PBL 大纲、知识点、AI 授知章节大纲、评价方案）：

课程名称：${input.name}
学科：${input.subject}
年级：${input.grade}
课时：${input.hours} 课时
简介：${input.summary || "（无）"}
驱动问题：${input.drivingQuestion || "（无，请根据课程名称与简介推断）"}
个人项目配置：${personalProjectConfigText(input)}

${buildAuthoritativeCourseBasisPrompt(input)}

课程阶段：
${stageList}

要求：
1. 知识点 ${constraints.recommendedKnowledgePointRange.min}-${constraints.recommendedKnowledgePointRange.max} 个，名称精炼，粒度要比章节标题更细；每个知识点写出本节课关键信息 keyInfo
2. 生成 knowledgeGraph：节点必须与 knowledgePoints 对齐，边要清晰表达先修、支撑、应用、对比或迁移关系，至少 ${Math.max(1, constraints.recommendedKnowledgePointRange.min - 1)} 条边
3. teachingOutline 是整节课程的教案级授课大纲，先生成六个宏观课程模块（launch、ai-learning、proposal、make、showcase、reflection），必须写清平台和 AI 负责什么、教师负责什么
4. AI 授知章节大纲必须参考知识图谱，按先修到应用的关系组织学习路径，并在 objectives/keyPoints 中覆盖核心节点
5. 评价维度 4-6 个，权重合计 100%，评价项要能检查学生对知识图谱核心节点的理解与迁移应用
6. 语言：简体中文
${SCHEMA_HINT}`;
  return { system: SYSTEM_PREAMBLE, user };
}

export function buildPblOutlinePrompt(input: GenerateInput, context?: { knowledgeGraph?: unknown; knowledgePoints?: unknown }): {
  system: string;
  user: string;
} {
  const user = `请基于以下课程信息，重新生成 PBL 大纲（200-400 字），要求结构清晰、目标明确、突出学生主体性。

课程名称：${input.name}
学科：${input.subject} 年级：${input.grade} 课时：${input.hours}
简介：${input.summary || "（无）"}
驱动问题：${input.drivingQuestion || "（无）"}
个人项目配置：${personalProjectConfigText(input)}
${buildAuthoritativeCourseBasisPrompt(input)}
已确认知识点与图谱：${JSON.stringify({
    knowledgePoints: context?.knowledgePoints ?? [],
    knowledgeGraph: context?.knowledgeGraph ?? null,
  })}

要求：PBL 大纲必须说明每名学生如何围绕知识图谱中的核心节点独立完成个人项目，并体现基础知识、方法工具、应用迁移之间的递进关系；成果必须拆分为作品、表达、反思，过程证据必须与教师配置一致。

仅返回 JSON：{ "pblOutline": "string" }`;
  return { system: SYSTEM_PREAMBLE, user };
}

export function buildKnowledgeGraphPrompt(input: GenerateInput, context?: {
  pblOutline?: string;
  teacherRequiredKnowledgePoints?: string[];
}): {
  system: string;
  user: string;
} {
  const constraints = deriveTeachingConstraints({ grade: input.grade, hours: input.hours });
  const stageList = input.stages
    .map((s) => `- ${s.key}（${s.label}）：${s.description}`)
    .join("\n");
  const teacherRequiredKnowledgePoints = (context?.teacherRequiredKnowledgePoints ?? [])
    .map((point) => point.trim())
    .filter(Boolean);
  const user = `请基于以下课程信息，生成本课知识点与知识图谱。知识点要比普通条目更精细，能够支撑后续 OpenMAIC AI 授知内容生成。

课程名称：${input.name}
学科：${input.subject} 年级：${input.grade} 课时：${input.hours}
简介：${input.summary || "（无）"}
驱动问题：${input.drivingQuestion || "（无）"}
个人项目配置：${personalProjectConfigText(input)}
${buildAuthoritativeCourseBasisPrompt(input)}
已确认 PBL 大纲：${context?.pblOutline || "（尚未生成，请根据课程信息推断）"}
教师指定、必须保留的知识点：${teacherRequiredKnowledgePoints.length > 0 ? JSON.stringify(teacherRequiredKnowledgePoints) : "（无额外指定）"}

课程阶段：
${stageList}

要求：
1. 输出 ${constraints.recommendedKnowledgePointRange.min}-${constraints.recommendedKnowledgePointRange.max} 个知识点；如果教师指定的知识点较多，可以突破上限但不得遗漏。粒度要具体到概念、方法、模型、工具或判断标准，严格控制在 ${input.grade}、${input.hours} 课时可教可学的范围内。
2. 教师指定知识点是硬约束：每一项都必须以完全相同的 name 出现在 knowledgePoints 中。可以补充 description、keyInfo、层级和相关知识，但不得删除、合并、偷换概念或改名。
3. 每个知识点包含唯一 id、唯一 name、完整 description、可直接用于教学的 keyInfo、level、relatedIds；level 必须为 foundation、core、application 或 extension。
4. knowledgeGraph.nodes 必须与 knowledgePoints 按 id 一一对应，不得多节点、少节点或使用另一个名称。所有节点都必须进入同一个连通图，不能出现孤立节点。
5. knowledgeGraph.edges 至少达到“节点数 - 1”；source/target 必须引用节点 id，不得自环、重复或形成有向循环。教学顺序沿 foundation → core → application → extension 推进。
6. 每条边都必须能读成科学、明确的命题。label 使用“是…的前提”“支撑”“用于”“对比”“迁移到”等具体短语，禁止只写“关联”“相关”“关系”。不要把时间先后误写成知识先修，也不要虚构因果关系。
7. 关系设计至少覆盖：必要的先修、核心概念之间的支撑，以及核心知识在 PBL 成果中的应用；只有确有必要时才加入对比或迁移关系。
8. 输出前自行检查：事实与术语准确；教师指定项全部保留；节点与知识点一一对应；图连通；无自环、重复边和环路；每条关系的方向与措辞均成立。仅输出检查后的 JSON，不要输出检查过程。

仅返回 JSON：{
  "knowledgePoints": [{ "id": "kp-1", "name": "string", "description": "string", "keyInfo": "string", "level": "foundation", "relatedIds": ["kp-2"] }],
  "knowledgeGraph": {
    "nodes": [{ "id": "kp-1", "label": "string", "description": "string", "keyInfo": "string", "level": "foundation" }],
    "edges": [{ "id": "edge-1", "source": "kp-1", "target": "kp-2", "label": "支撑" }]
  }
}`;
  return { system: SYSTEM_PREAMBLE, user };
}

export function buildModuleTimingPlanPrompt(
  input: GenerateInput,
  context?: { knowledgeGraph?: unknown; knowledgePoints?: unknown },
): {
  system: string;
  user: string;
} {
  const totalMinutes = Math.max(0, Math.round(input.hours * 60));
  const pointRecords = Array.isArray(context?.knowledgePoints)
    ? context.knowledgePoints.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const point = item as { id?: unknown; name?: unknown; level?: unknown; description?: unknown };
        if (typeof point.name !== "string" || !point.name.trim()) return [];
        return [{
          id: typeof point.id === "string" ? point.id : "",
          name: point.name.trim(),
          level: typeof point.level === "string"
            ? KNOWLEDGE_LEVEL_LABELS[point.level] ?? "未标注层级"
            : "未标注层级",
          description: typeof point.description === "string" ? point.description.trim() : "",
        }];
      })
    : [];
  const pointNames = new Map(pointRecords.map((point) => [point.id, point.name]));
  const graphRecord = context?.knowledgeGraph && typeof context.knowledgeGraph === "object"
    ? context.knowledgeGraph as { edges?: unknown }
    : undefined;
  const knowledgeRelations = Array.isArray(graphRecord?.edges)
    ? graphRecord.edges.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const edge = item as { source?: unknown; target?: unknown; label?: unknown };
        const source = typeof edge.source === "string" ? pointNames.get(edge.source) : undefined;
        const target = typeof edge.target === "string" ? pointNames.get(edge.target) : undefined;
        if (!source || !target) return [];
        return [`${source}—${typeof edge.label === "string" && edge.label.trim() ? edge.label.trim() : "支撑"}→${target}`];
      })
    : [];
  const courseEvidence = {
    课程信息: {
      课程名称: input.name,
      学科: input.subject,
      年级: input.grade,
      课程总时长: `${totalMinutes} 分钟`,
      课程说明: input.summary,
      驱动问题: input.drivingQuestion,
      学习目标: input.learningObjectives ?? [],
      课程难度: DIFFICULTY_LABELS[input.pblConfig?.difficultyLevel ?? "standard"] ?? "标准难度",
    },
    学情信息: {
      已有知识基础: input.learnerProfile?.priorKnowledge?.trim() || "未填写，不得据此断言学生没有先验知识",
      学习支持需求: input.learnerProfile?.learningNeeds?.trim() || "未填写，按年级采用保守支架",
      熟悉情境: input.learnerProfile?.familiarContexts?.trim() || "未填写，优先使用日常可理解情境",
    },
    知识点: pointRecords.map(({ name, level, description }) => ({ 名称: name, 教学层级: level, 说明: description })),
    知识关系: knowledgeRelations,
  };
  const user = `请为一节个人项目式学习课程分析时间安排。你负责教学判断和解释，系统会负责总时长守恒与边界校验。

课程与学情证据：
${JSON.stringify(courseEvidence, null, 2)}

必须针对性分析以下因素：
1. 年级和已有基础决定导入、讲解、操作与反思所需支架。
2. 知识点的层级、数量以及知识图谱的先修依赖决定知识建构时间。
3. 学习目标、难度和成果复杂度决定方案比较、制作迭代、展示评价所需时间。
4. 学习支持需求未填写时，必须在 assumptions 中用中文声明保守假设，不得写成“无学习需求”或假装已知学情。
5. 六个阶段必须且只能是 launch、ai-learning、proposal、make、showcase、reflection。
6. 六个阶段的 durationMin 应合计 ${totalMinutes} 分钟；每阶段至少 1 分钟；make 通常是最长阶段，如需例外必须在 rationale 中说明。
7. 每个 rationale 必须引用本课程的具体内容、知识结构或学情，不得只写通用比例。
8. rationale、evidence、assumptions 是教师直接阅读的文字，只能使用简体中文阶段名称和教学术语；stageKey 和 confidence 是仅有的英文结构枚举。知识点必须引用名称，不得引用 kp-1 一类内部 ID。
9. ${USER_FACING_LANGUAGE_RULE}

仅返回 JSON：
{
  "moduleTimingRecommendation": {
    "allocations": [
      { "stageKey": "launch", "durationMin": 8, "rationale": "string" },
      { "stageKey": "ai-learning", "durationMin": 18, "rationale": "string" },
      { "stageKey": "proposal", "durationMin": 8, "rationale": "string" },
      { "stageKey": "make", "durationMin": 38, "rationale": "string" },
      { "stageKey": "showcase", "durationMin": 12, "rationale": "string" },
      { "stageKey": "reflection", "durationMin": 6, "rationale": "string" }
    ],
    "evidence": ["实际使用的课程或学情依据"],
    "assumptions": ["信息缺失时采用的假设"],
    "confidence": "low|medium|high"
  }
}`;
  return {
    system: `你是一名课程时间设计专家。只返回严格 JSON，不输出 Markdown 或额外说明。${USER_FACING_LANGUAGE_RULE}\n${JSON_TEACHER_PROMPT_CONTRACT}`,
    user,
  };
}

export function buildTeachingOutlinePrompt(
  input: GenerateInput,
  context?: {
    pblOutline?: string;
    knowledgeGraph?: unknown;
    knowledgePoints?: unknown;
    projectMainline?: unknown;
    moduleTimingPlan?: unknown;
  },
): {
  system: string;
  user: string;
} {
  const totalMinutes = Math.max(0, Math.round(input.hours * 60));
  const stageList = input.stages
    .map((s) => `- ${s.key}（${s.label}）：${s.description}`)
    .join("\n");
  const user = `请基于以下课程信息与教师已确认的知识图谱，生成整节课程授课大纲。

这不是 OpenMAIC AI 授知场景大纲，而是教师备课用的教案级大纲：粒度应接近常规教案，例如“教师讲授 XX 知识点 8 分钟”“平台展示知识图谱并高亮 XX 节点”“AI 生成快速测验检查 XX 概念”“学生围绕驱动问题进行 XX 互动”等。

课程名称：${input.name}
学科：${input.subject} 年级：${input.grade} 课时：${input.hours}
简介：${input.summary || "（无）"}
驱动问题：${input.drivingQuestion || "（无）"}
个人项目配置：${personalProjectConfigText(input)}
${buildAuthoritativeCourseBasisPrompt(input)}
已确认 PBL 项目说明：${context?.pblOutline || "（尚未生成，可根据课程信息推断）"}
已确认项目主线：${JSON.stringify(context?.projectMainline ?? null)}
教师最终确认的时间安排（最高优先级）：${JSON.stringify(context?.moduleTimingPlan ?? null)}
每个顶级阶段必须严格使用时间安排中对应阶段的 durationMin、顺序和模块身份。多个知识点必须合并进唯一的 ai-learning 顶级阶段，不得为不同知识点重复创建 AI 授知或项目实践；reflection 必须是最后一个顶级阶段。
已确认知识点与图谱：${JSON.stringify({
    knowledgePoints: context?.knowledgePoints ?? [],
    knowledgeGraph: context?.knowledgeGraph ?? null,
  })}

课程阶段：
${stageList}

要求：
1. 生成六个且仅六个一级课程模块，stageKey 必须依次覆盖 launch、ai-learning、proposal、make、showcase、reflection；二级资源再在模块下展开，一级模块不是 OpenMAIC 场景列表。总课时为 ${totalMinutes} 分钟，各模块 durationMin 合计必须等于该总时长。
2. 每个活动必须写清：
   - teachingGoal：本活动教学目标
   - teacherRole：教师负责的讲授、组织、追问、评价或课堂管理动作
   - platformRole：平台负责展示、收集、分发、记录或联动的内容
   - aiRole：AI 负责生成、讲解、测验、反馈或高亮知识图谱的内容；没有则写“无”
   - studentActivity：学生要做的具体学习/互动任务
3. openMaicUse 必须明确标记：
   - "student-ai-learning"：仅用于 AI 授知阶段核心知识点内容，后续会进入学生 AI 课程
   - "none"：普通课堂活动；OpenMAIC 仅生成教师 PPT 与讲稿，不进入学生 AI 授知课程，也不进行 TTS
4. resourceTypes 对普通课堂活动只使用 ppt、script；interactive-demo 和 code-interactive 仅属于学生 AI 授知场景。
5. knowledgePointIds 只能引用已确认知识点 id；若活动不直接涉及知识点，可为空数组。
6. 大纲要有课堂可执行性，避免空泛口号。
7. 只为可提前确定的内容生成具体结论：项目导入、任务流程、评价规则、确定知识、案例演示、操作说明、课后延伸、价值升华和迁移问题。
8. 方案点评、作品点评、班级共性问题和汇报总结只能生成不含结论的主持支架（点评框架、追问清单、总结结构），不得预设学生表现；课堂获得真实产物、对话和观察后再动态填充。
9. 若已提供“教师最终确认的时间安排”，必须逐项原样采用，禁止按比例重新分配；仅在没有确认时间时，才按项目启动约 10%、AI 授知约 20%、方案构思约 10%、项目实践约 40%、成果汇报约 15%、反思迁移约 5% 给出建议起点。每个模块至少 1 分钟。
10. 所有已确认知识点 ID 必须至少出现在 AI 授知模块的 knowledgePointIds 中，并按照 foundation/core/application/extension 分级，不得新增或改写 ID。
11. 每个课程模块必须显式返回 title、durationMin、teachingGoal、teacherRole、platformRole、aiRole、studentActivity 这七个字段；字段值必须是非空字符串（durationMin 为正数）。某角色在该模块没有具体工作时也必须填写“无”，不得省略、填写 null 或空字符串。字段名必须使用示例中的英文名称。

仅返回 JSON：{
  "pblOutline": "100-200字项目式课程说明，聚焦驱动问题、成果产出和项目主线",
  "teachingOutline": [{
    "id": "to-1",
    "stageKey": "${input.stages[0]?.key ?? "launch"}",
    "title": "string",
    "durationMin": 10,
    "teachingGoal": "string",
    "teacherRole": "string",
    "platformRole": "string",
    "aiRole": "string",
    "studentActivity": "string",
    "activityKind": "knowledge",
    "knowledgePointIds": ["kp-1"],
    "openMaicUse": "none",
    "resourceTypes": ["ppt", "interactive-demo", "code-interactive", "script"],
    "notes": "string"
  }]
 }`;
  return { system: SYSTEM_PREAMBLE, user: `${user}\n${TEACHING_OUTLINE_ROUTING_RULES}` };
}

export function buildLessonOutlinePrompt(
  input: GenerateInput,
  context?: {
    knowledgeGraph?: unknown;
    knowledgePoints?: unknown;
    projectMainline?: unknown;
    teachingOutline?: unknown;
  },
): {
  system: string;
  user: string;
} {
  const totalMinutes = Math.max(0, Math.round(input.hours * 60));
  const stageList = input.stages
    .map((s) => `- ${s.key}（${s.label}）：${s.description}`)
    .join("\n");
  const user = `请基于以下课程信息、六个课程模块与已确认知识图谱，生成课程大纲。课程大纲是课程模块的深化，不是与课程模块一一对应的复制；一个课程模块可以拆出多个独立的 PPT、互动、练习或教师支架资源。

课程名称：${input.name}
学科：${input.subject} 年级：${input.grade} 课时：${input.hours}
驱动问题：${input.drivingQuestion || "（无）"}
个人项目配置：${personalProjectConfigText(input)}
${buildAuthoritativeCourseBasisPrompt(input)}
已确认知识点与图谱：${JSON.stringify({
    knowledgePoints: context?.knowledgePoints ?? [],
    knowledgeGraph: context?.knowledgeGraph ?? null,
  })}
已确认项目主线：${JSON.stringify(context?.projectMainline ?? null)}
已确认课程模块：${JSON.stringify(context?.teachingOutline ?? [])}
课程总时长：${totalMinutes} 分钟

课程阶段：
${stageList}

要求：
1. 为六个课程模块中需要细化的每个活动生成一个或多个二级条目，必须使用 parentActivityId 指向真实的课程模块 id；不能按数组位置推断父子关系。每个父模块的 targetDurationSec 合计必须等于父级 durationMin×60。
2. AI 授知阶段（stageKey=ai-learning）只生成学生学习资源：知识讲解使用 slide，互动/代码练习使用 interactive，测验使用 quiz；每个知识细化必须关联已确认 knowledgePointIds。
3. 引入、项目启动、方案构思、项目实践、成果汇报与评价、学习反思及迁移等普通课堂活动只生成教师可用的 PPT/讲稿资源或主持支架，audience 必须为 teacher，resourceTypes 只能是 ppt、script，ttsPolicy 必须是 none。
4. 每个二级条目必须填写 detailKind、knowledgePointIds、targetDurationSec 与 ttsPolicy。AI 授知条目的 targetDurationSec 应由父模块 durationMin 按知识点难度和教学任务拆分。页面边界由你根据概念依赖、示例、方法、对比、练习、证据检查和认知负荷动态决定：相关内容可以合并为一个清晰页面，需要独立视觉焦点的内容才拆成多个条目，不得按固定秒数或固定页数机械切分。不要使用固定的“4.5 字/秒”公式，服务端会根据实际选定的 TTS provider/model 注入内容量预算，生成时必须通过增删与当前 knowledgePointIds 直接相关的有效解释、案例、反例和分步说明让讲稿贴近模型预算；不得为了填满时长引入图谱之外的知识。
5. 必须先覆盖 foundation/core 节点，再安排 application/extension 节点；不得创造知识点 ID、改变已确认知识点含义，或超出课程年级的知识边界。每个 AI 授知条目必须能说明其内容如何服务于所列 knowledgePointIds。
6. objectives 必须明确写出将学习或应用的知识节点，activities 要说明学生如何通过案例、测验或小任务验证节点间关系。

仅返回 JSON：{ "lessonOutline": [{ "id": "lo-1", "stageKey": "ai-learning", "title": "string", "objectives": ["string"], "activities": ["string"], "durationMin": 10, "parentActivityId": "to-1", "detailKind": "knowledge-explanation", "knowledgePointIds": ["kp-1"], "resourceTypes": ["ppt"], "targetDurationSec": 600, "ttsPolicy": "target-duration" }] }`;
  return { system: SYSTEM_PREAMBLE, user };
}

export function buildEvaluationPlanPrompt(
  input: GenerateInput,
  context?: {
    pblOutline?: unknown;
    knowledgeGraph?: unknown;
    knowledgePoints?: unknown;
    projectMainline?: unknown;
    teachingOutline?: unknown;
    lessonOutline?: unknown;
  },
): {
  system: string;
  user: string;
} {
  const user = `请基于以下课程基础信息、知识图谱、六模块时间分配、课程模块和课程大纲，生成项目评价方案（4-6 个维度，AI 与教师各自维度内部权重分别合计 100%，含整体评价说明）。

课程名称：${input.name}
学科：${input.subject} 年级：${input.grade} 课时：${input.hours}
驱动问题：${input.drivingQuestion || "（无）"}
个人项目配置：${personalProjectConfigText(input)}
${buildAuthoritativeCourseBasisPrompt(input)}
已确认知识点与图谱：${JSON.stringify({
    knowledgePoints: context?.knowledgePoints ?? [],
    knowledgeGraph: context?.knowledgeGraph ?? null,
  })}
已确认 PBL 项目说明：${context?.pblOutline || "（无）"}
已确认项目主线：${JSON.stringify(context?.projectMainline ?? null)}
已确认课程模块：${JSON.stringify(context?.teachingOutline ?? [])}
已确认课程大纲：${JSON.stringify(context?.lessonOutline ?? [])}

要求：
1. 评价维度要能检查学生是否理解知识图谱中的核心节点及节点关系。
2. 至少一个维度关注知识迁移与项目应用，而不仅是展示表达。
3. 每个维度必须标记 responsibleRole：AI 负责学习过程、AI 协作健康度、证据迭代、专业知识准确性、方案逻辑与可行性；教师负责现场汇报、答辩回应、成果呈现、课堂规范与通用能力、项目价值理解。
4. AI 不预测、不建议教师分数。最终成绩由 AI 过程与专业评价 40% + 教师现场汇报评价 60% 合成；学生反思不计分，系统不设置同伴互评。
5. AI 协作健康度不能按 AI 使用次数高低评分，应观察问题是否具体、是否自行推进、是否核验修改、是否产生实际进展、是否比较求证、是否长期索要完整答案或代做；证据不足时该维度记 0 分并明确列出缺口。
6. overallRubric 明确两部分独立评分、缺一时最终分待完成。
7. 评价证据必须优先引用个人项目配置中的 evidenceRequirements；AI 过程评价关注方案选择、修订、测试和 AI 建议采纳/拒绝证据，教师评价关注 artifact 与 presentation，学生 reflection 只评价成长与迁移，不计入计分权重。
8. 评价维度必须覆盖 foundation/core 理解、application/extension 迁移、项目实践证据、成果表达与反思成长，并标明评价发生在哪个课程模块。
9. 权重规则：AI 负责的维度权重合计必须为 100，教师负责的维度权重合计也必须为 100。weight 为纯数字（如 20，不要写 "20%"）。

仅返回 JSON，结构如下（字段名必须完全一致）：
{
  "evaluationPlan": {
    "dimensions": [
      {
        "id": "ev-1",
        "name": "维度名称（必填，字符串）",
        "weight": 20,
        "description": "该维度的评价标准说明（字符串）",
        "responsibleRole": "ai"
      },
      {
        "id": "ev-2",
        "name": "维度名称（必填，字符串）",
        "weight": 30,
        "description": "该维度的评价标准说明（字符串）",
        "responsibleRole": "teacher"
      }
    ],
    "overallRubric": "整体评价说明字符串"
  }
}
注意：dimensions 数组必须包含 4-6 个对象；每个对象必须包含 name（字符串）、weight（数字）、responsibleRole（"ai" 或 "teacher"）；responsibleRole 为 "ai" 的维度 weight 合计 = 100，responsibleRole 为 "teacher" 的维度 weight 合计 = 100。`;
  return { system: SYSTEM_PREAMBLE, user };
}
