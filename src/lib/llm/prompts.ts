// Prompt templates for the 4 LLM actions.
// Each prompt asks the model to return a strict JSON object matching our schema.

import type { GenerateInput } from "./types";

const SYSTEM_PREAMBLE = `你是一名资深的 PBL（项目式学习）课程设计专家，擅长将学科课程转化为以驱动问题为核心的项目式学习课程。
请始终以严格 JSON 形式返回结果，不要包含任何额外说明文字。`;

const SCHEMA_HINT = `
返回 JSON 形如：
{
  "pblOutline": "string",
  "knowledgePoints": [{ "id": "kp-1", "name": "string", "description": "string" }],
  "lessonOutline": [{
    "id": "lo-1",
    "stageKey": "ai-learning",
    "title": "string",
    "objectives": ["string", "string"],
    "activities": ["string"],
    "durationMin": 45
  }],
  "evaluationPlan": {
    "dimensions": [{ "id": "ev-1", "name": "string", "weight": 20, "description": "string" }],
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
1. 知识点 4-8 个，名称精炼、描述 1-2 句
2. AI 授知章节大纲覆盖每个阶段的"AI 授知"环节（如不存在可省略）
3. 评价维度 4-6 个，权重合计 100%
4. 语言：简体中文
${SCHEMA_HINT}`;
  return { system: SYSTEM_PREAMBLE, user };
}

export function buildPblOutlinePrompt(input: GenerateInput): {
  system: string;
  user: string;
} {
  const user = `请基于以下课程信息，重新生成 PBL 大纲（200-400 字），要求结构清晰、目标明确、突出学生主体性。

课程名称：${input.name}
学科：${input.subject} 年级：${input.grade} 课时：${input.hours}
简介：${input.summary || "（无）"}
驱动问题：${input.drivingQuestion || "（无）"}

仅返回 JSON：{ "pblOutline": "string" }`;
  return { system: SYSTEM_PREAMBLE, user };
}

export function buildLessonOutlinePrompt(input: GenerateInput): {
  system: string;
  user: string;
} {
  const stageList = input.stages
    .map((s) => `- ${s.key}（${s.label}）：${s.description}`)
    .join("\n");
  const user = `请基于以下课程信息，生成 AI 授知部分的章节大纲（按阶段），每个章节包含目标、活动、时长（分钟）。

课程名称：${input.name}
学科：${input.subject} 年级：${input.grade} 课时：${input.hours}
驱动问题：${input.drivingQuestion || "（无）"}

课程阶段：
${stageList}

${SCHEMA_HINT}`;
  return { system: SYSTEM_PREAMBLE, user };
}

export function buildEvaluationPlanPrompt(input: GenerateInput): {
  system: string;
  user: string;
} {
  const user = `请基于以下课程信息，生成项目评价方案（4-6 个维度，权重合计 100%，含整体评价说明）。

课程名称：${input.name}
学科：${input.subject} 年级：${input.grade} 课时：${input.hours}
驱动问题：${input.drivingQuestion || "（无）"}

仅返回 JSON：{ "evaluationPlan": { "dimensions": [...], "overallRubric": "string" } }`;
  return { system: SYSTEM_PREAMBLE, user };
}
