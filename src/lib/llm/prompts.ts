// Prompt templates for the 4 LLM actions.
// Each prompt asks the model to return a strict JSON object matching our schema.

import type { GenerateInput } from "./types";

const SYSTEM_PREAMBLE = `你是一名资深的 PBL（项目式学习）课程设计专家，擅长将学科课程转化为以驱动问题为核心的项目式学习课程。
请始终以严格 JSON 形式返回结果，不要包含任何额外说明文字。`;

const SCHEMA_HINT = `
返回 JSON 形如：
{
  "pblOutline": "string",
  "knowledgePoints": [{ "id": "kp-1", "name": "string", "description": "string", "keyInfo": "string", "relatedIds": ["kp-2"] }],
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
    "knowledgePointIds": ["kp-1"],
    "openMaicUse": "none|student-ai-learning|teacher-resource",
    "resourceTypes": ["ppt", "interactive-demo", "script", "project-brief"],
    "notes": "string"
  }],
  "lessonOutline": [{
    "id": "lo-1",
    "stageKey": "ai-learning",
    "title": "string",
    "objectives": ["string", "string"],
    "activities": ["string"],
    "durationMin": 45
  }],
  "evaluationPlan": {
    "dimensions": [{ "id": "ev-1", "name": "string", "weight": 20, "description": "string", "responsibleRole": "ai|teacher" }],
    "overallRubric": "string"
  }
}`;

export function buildFullCoursePrompt(input: GenerateInput): {
  system: string;
  user: string;
} {
  const stageList = input.stages
    .map((s) => `- ${s.key}（${s.label}）：${s.description}`)
    .join("\n");
  const user = `请基于以下课程信息，生成完整的 PBL 课程结构（包含 PBL 大纲、知识点、AI 授知章节大纲、评价方案）：

课程名称：${input.name}
学科：${input.subject}
年级：${input.grade}
课时：${input.hours} 课时
简介：${input.summary || "（无）"}
驱动问题：${input.drivingQuestion || "（无，请根据课程名称与简介推断）"}

课程阶段：
${stageList}

要求：
1. 知识点 6-10 个，名称精炼，粒度要比章节标题更细；每个知识点写出本节课关键信息 keyInfo
2. 生成 knowledgeGraph：节点必须与 knowledgePoints 对齐，边要清晰表达先修、支撑、应用、对比或迁移关系，至少 ${Math.max(5, input.hours * 2)} 条边
3. teachingOutline 是整节课程的教案级授课大纲，粒度为“讲授/互动/练习/项目布置/展示反馈”等教学活动，必须写清平台和 AI 负责什么、教师负责什么
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
已确认知识点与图谱：${JSON.stringify({
    knowledgePoints: context?.knowledgePoints ?? [],
    knowledgeGraph: context?.knowledgeGraph ?? null,
  })}

要求：PBL 大纲必须说明学生如何围绕知识图谱中的核心节点展开项目探究，并体现基础知识、方法工具、应用迁移之间的递进关系。

仅返回 JSON：{ "pblOutline": "string" }`;
  return { system: SYSTEM_PREAMBLE, user };
}

export function buildKnowledgeGraphPrompt(input: GenerateInput, context?: { pblOutline?: string }): {
  system: string;
  user: string;
} {
  const stageList = input.stages
    .map((s) => `- ${s.key}（${s.label}）：${s.description}`)
    .join("\n");
  const user = `请基于以下课程信息，生成本课知识点与知识图谱。知识点要比普通条目更精细，能够支撑后续 OpenMAIC AI 授知内容生成。

课程名称：${input.name}
学科：${input.subject} 年级：${input.grade} 课时：${input.hours}
简介：${input.summary || "（无）"}
驱动问题：${input.drivingQuestion || "（无）"}
已确认 PBL 大纲：${context?.pblOutline || "（尚未生成，请根据课程信息推断）"}

课程阶段：
${stageList}

要求：
1. 输出 6-10 个知识点，粒度要具体到概念、方法、模型、工具或判断标准。
2. 每个知识点包含 id、name、description、keyInfo、relatedIds。
3. knowledgeGraph.nodes 与 knowledgePoints 一一对应，节点 level 只能为 foundation/core/application/extension。
4. knowledgeGraph.edges 至少 ${Math.max(5, input.hours * 2)} 条，source/target 必须引用节点 id，label 用短语说明关系。
5. 必须清晰体现先修关系、概念支撑关系和在 PBL 项目中的应用关系。

仅返回 JSON：{
  "knowledgePoints": [{ "id": "kp-1", "name": "string", "description": "string", "keyInfo": "string", "relatedIds": ["kp-2"] }],
  "knowledgeGraph": {
    "nodes": [{ "id": "kp-1", "label": "string", "description": "string", "keyInfo": "string", "level": "foundation" }],
    "edges": [{ "id": "edge-1", "source": "kp-1", "target": "kp-2", "label": "支撑" }]
  }
}`;
  return { system: SYSTEM_PREAMBLE, user };
}

export function buildTeachingOutlinePrompt(
  input: GenerateInput,
  context?: {
    pblOutline?: string;
    knowledgeGraph?: unknown;
    knowledgePoints?: unknown;
  },
): {
  system: string;
  user: string;
} {
  const stageList = input.stages
    .map((s) => `- ${s.key}（${s.label}）：${s.description}`)
    .join("\n");
  const user = `请基于以下课程信息与教师已确认的知识图谱，生成整节课程授课大纲。

这不是 OpenMAIC AI 授知场景大纲，而是教师备课用的教案级大纲：粒度应接近常规教案，例如“教师讲授 XX 知识点 8 分钟”“平台展示知识图谱并高亮 XX 节点”“AI 生成快速测验检查 XX 概念”“学生围绕驱动问题进行 XX 互动”等。

课程名称：${input.name}
学科：${input.subject} 年级：${input.grade} 课时：${input.hours}
简介：${input.summary || "（无）"}
驱动问题：${input.drivingQuestion || "（无）"}
已确认 PBL 项目说明：${context?.pblOutline || "（尚未生成，可根据课程信息推断）"}
已确认知识点与图谱：${JSON.stringify({
    knowledgePoints: context?.knowledgePoints ?? [],
    knowledgeGraph: context?.knowledgeGraph ?? null,
  })}

课程阶段：
${stageList}

要求：
1. 生成 6-10 个授课活动，覆盖课程引入、核心知识讲授、AI 授知、个人项目推进、展示评价与反思。
2. 每个活动必须写清：
   - teachingGoal：本活动教学目标
   - teacherRole：教师负责的讲授、组织、追问、评价或课堂管理动作
   - platformRole：平台负责展示、收集、分发、记录或联动的内容
   - aiRole：AI 负责生成、讲解、测验、反馈或高亮知识图谱的内容；没有则写“无”
   - studentActivity：学生要做的具体学习/互动任务
3. openMaicUse 必须明确标记：
   - "student-ai-learning"：仅用于 AI 授知阶段核心知识点内容，后续会进入学生 AI 课程
   - "teacher-resource"：课程引入、PBL 项目布置、项目介绍材料、教师讲稿或 PPT 等，只供教师授课展示，不进入学生 AI 授知课程
   - "none"：普通线下/平台活动
4. resourceTypes 标记可直接生成的教师资源形式，允许 ppt、interactive-demo、script、project-brief、worksheet、rubric；需要教师现场操作或学生共同观察变化时优先使用 interactive-demo。
5. knowledgePointIds 只能引用已确认知识点 id；若活动不直接涉及知识点，可为空数组。
6. 大纲要有课堂可执行性，避免空泛口号。
7. 只为可提前确定的内容生成具体结论：项目导入、任务流程、评价规则、确定知识、案例演示、操作说明、课后延伸、价值升华和迁移问题。
8. 方案点评、作品点评、班级共性问题和汇报总结只能生成不含结论的主持支架（点评框架、追问清单、总结结构），不得预设学生表现；课堂获得真实产物、对话和观察后再动态填充。

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
    "knowledgePointIds": ["kp-1"],
    "openMaicUse": "none",
    "resourceTypes": ["ppt", "interactive-demo", "script"],
    "notes": "string"
  }]
}`;
  return { system: SYSTEM_PREAMBLE, user };
}

export function buildLessonOutlinePrompt(
  input: GenerateInput,
  context?: {
    knowledgeGraph?: unknown;
    knowledgePoints?: unknown;
    teachingOutline?: unknown;
  },
): {
  system: string;
  user: string;
} {
  const stageList = input.stages
    .map((s) => `- ${s.key}（${s.label}）：${s.description}`)
    .join("\n");
  const user = `请基于以下课程信息与已确认知识图谱，生成 AI 授知部分的章节大纲（按阶段），每个章节包含目标、活动、时长（分钟）。

课程名称：${input.name}
学科：${input.subject} 年级：${input.grade} 课时：${input.hours}
驱动问题：${input.drivingQuestion || "（无）"}
已确认知识点与图谱：${JSON.stringify({
    knowledgePoints: context?.knowledgePoints ?? [],
    knowledgeGraph: context?.knowledgeGraph ?? null,
  })}
已确认整课授课大纲：${JSON.stringify(context?.teachingOutline ?? [])}

课程阶段：
${stageList}

要求：
1. 仅生成 AI 授知阶段核心知识点内容，用于学生学习和测验，确保掌握课程必备知识点。
2. 不要把课程引入、PBL 项目布置、项目介绍材料写入学生 AI 授知章节；这些内容在整课授课大纲中以 teacher-resource 标记，后续作为教师资源生成和展示。
3. 必须先覆盖 foundation/core 节点，再安排 application/extension 节点。
4. objectives 必须明确写出将学习或应用的知识节点。
5. activities 要说明学生如何通过案例、测验或小任务验证节点间关系。

${SCHEMA_HINT}`;
  return { system: SYSTEM_PREAMBLE, user };
}

export function buildEvaluationPlanPrompt(input: GenerateInput, context?: { knowledgeGraph?: unknown; knowledgePoints?: unknown }): {
  system: string;
  user: string;
} {
  const user = `请基于以下课程信息与已确认知识图谱，生成项目评价方案（4-6 个维度，AI 与教师各自维度内部权重分别合计 100%，含整体评价说明）。

课程名称：${input.name}
学科：${input.subject} 年级：${input.grade} 课时：${input.hours}
驱动问题：${input.drivingQuestion || "（无）"}
已确认知识点与图谱：${JSON.stringify({
    knowledgePoints: context?.knowledgePoints ?? [],
    knowledgeGraph: context?.knowledgeGraph ?? null,
  })}

要求：
1. 评价维度要能检查学生是否理解知识图谱中的核心节点及节点关系。
2. 至少一个维度关注知识迁移与项目应用，而不仅是展示表达。
3. 每个维度必须标记 responsibleRole：AI 负责学习过程、AI 协作健康度、证据迭代、专业知识准确性、方案逻辑与可行性；教师负责现场汇报、答辩回应、成果呈现、课堂规范与通用能力、项目价值理解。
4. AI 不预测、不建议教师分数。最终成绩由 AI 过程与专业评价 40% + 教师现场汇报评价 60% 合成；学生反思不计分，系统不设置同伴互评。
5. AI 协作健康度不能按 AI 使用次数高低评分，应观察问题是否具体、是否自行推进、是否核验修改、是否产生实际进展、是否比较求证、是否长期索要完整答案或代做；证据不足时应标记暂无法评价。
6. overallRubric 明确两部分独立评分、缺一时最终分待完成。

仅返回 JSON：{ "evaluationPlan": { "dimensions": [...], "overallRubric": "string" } }`;
  return { system: SYSTEM_PREAMBLE, user };
}
