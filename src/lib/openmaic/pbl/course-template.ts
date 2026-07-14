import { getCompanion } from "@/lib/ai-companions";
import type { PblCourseConfig } from "@/lib/pbl-course-config";
import type { SceneOutline } from "@openmaic/lib/types/generation";
import { COMPANION_STAGE_KEYS, buildStagePolicyPrompt, resolveCompanionIds } from "@/lib/companion/stage-policy";

export const PBL_STAGE_KEYS = COMPANION_STAGE_KEYS;

export type PblStageKey = (typeof PBL_STAGE_KEYS)[number];
export type PblSceneAudience = "student" | "teacher";
export type PblSceneGenerationPurpose =
  | "knowledge-teaching"
  | "teacher-resource"
  | "facilitation-scaffold"
  | "companion-guidance";

export type PblStageDefinition = {
  key: PblStageKey;
  label: string;
  responsibility: string;
  allowedAudience: PblSceneAudience;
  studentLearningRequired?: boolean;
  teacherResourceRequired?: boolean;
};

export const PBL_STAGE_DEFINITIONS: PblStageDefinition[] = [
  {
    key: "launch",
    label: "项目启动",
    responsibility: "教师发布真实情境、驱动问题、成果要求和评价边界。",
    allowedAudience: "teacher",
    teacherResourceRequired: true,
  },
  {
    key: "ai-learning",
    label: "AI 授知",
    responsibility: "学生学习项目所需的核心知识，并通过 slide、quiz 或 interactive 验证理解。",
    allowedAudience: "student",
    studentLearningRequired: true,
  },
  {
    key: "proposal",
    label: "方案构思与校准",
    responsibility: "学生独立形成方案，AI 伴学提供多角度支架，教师主持校准。",
    allowedAudience: "teacher",
  },
  {
    key: "make",
    label: "项目实践",
    responsibility: "学生完成作品并保存数据、测试、修订和 AI 决策证据。",
    allowedAudience: "teacher",
  },
  {
    key: "showcase",
    label: "成果汇报与评价",
    responsibility: "学生表达作品与证据，教师评价成果和表达，AI 汇总过程证据。",
    allowedAudience: "teacher",
    teacherResourceRequired: true,
  },
  {
    key: "reflection",
    label: "学习反思",
    responsibility: "学生反思成长和 AI 使用，教师主持迁移，记记整理可追溯证据。",
    allowedAudience: "teacher",
  },
];

export const PBL_REQUIRED_TEACHER_RESOURCE_STAGE_KEYS = PBL_STAGE_DEFINITIONS.filter(
  (stage) => stage.teacherResourceRequired,
).map((stage) => stage.key);

export type PblStageCoverageEntry = {
  stageKey: PblStageKey;
  total: number;
  student: number;
  teacher: number;
  studentLearning: number;
  teacherSupport: number;
};

export type PblStageCoverage = {
  ok: boolean;
  entries: Record<PblStageKey, PblStageCoverageEntry>;
  missingStageKeys: PblStageKey[];
  missingStudentLearningStageKeys: PblStageKey[];
  missingTeacherResourceStageKeys: PblStageKey[];
  routingViolations: string[];
  metadataWarnings: string[];
};

function emptyCoverageEntry(stageKey: PblStageKey): PblStageCoverageEntry {
  return {
    stageKey,
    total: 0,
    student: 0,
    teacher: 0,
    studentLearning: 0,
    teacherSupport: 0,
  };
}

function stageDefinition(stageKey?: string): PblStageDefinition | undefined {
  return PBL_STAGE_DEFINITIONS.find((stage) => stage.key === stageKey);
}

/**
 * Check the structural contract of the PBL outline. The check intentionally
 * distinguishes missing stages from missing teacher resources: not every
 * stage needs a PPT, while launch and showcase must remain teachable offline.
 */
export function checkPblStageCoverage(
  outlines: Array<
    Pick<SceneOutline, "stageKey" | "stageLabel" | "audience" | "generationPurpose" | "title"> & {
      type?: string;
    }
  >,
): PblStageCoverage {
  const entries = Object.fromEntries(
    PBL_STAGE_KEYS.map((stageKey) => [stageKey, emptyCoverageEntry(stageKey)]),
  ) as Record<PblStageKey, PblStageCoverageEntry>;
  const routingViolations: string[] = [];
  const metadataWarnings: string[] = [];

  for (const [index, outline] of outlines.entries()) {
    const stage = stageDefinition(outline.stageKey);
    const label = outline.title?.trim() || `场景 ${index + 1}`;
    if (!stage) {
      metadataWarnings.push(`${label} 未标注有效的 PBL 阶段`);
      continue;
    }

    const entry = entries[stage.key];
    entry.total += 1;
    if (outline.audience === "student") entry.student += 1;
    if (outline.audience === "teacher") entry.teacher += 1;

    const isStudentLearning =
      outline.audience === "student" &&
      stage.key === "ai-learning" &&
      ["slide", "quiz", "interactive"].includes(outline.type ?? "");
    const isTeacherSupport =
      outline.audience === "teacher" && stage.key !== "ai-learning";
    if (isStudentLearning) entry.studentLearning += 1;
    if (isTeacherSupport) entry.teacherSupport += 1;

    if (!outline.audience) {
      metadataWarnings.push(`${label} 未标注场景受众`);
    } else if (outline.audience !== stage.allowedAudience) {
      routingViolations.push(
        `${label} 属于“${stage.label}”，但被标记为${outline.audience === "student" ? "学生课堂" : "教师资源"}`,
      );
    }

    if (!outline.generationPurpose) {
      metadataWarnings.push(`${label} 未标注生成目的`);
    }
    if (!outline.stageLabel) {
      metadataWarnings.push(`${label} 未标注阶段名称`);
    }
  }

  const missingStageKeys = PBL_STAGE_KEYS.filter((stageKey) => entries[stageKey].total === 0);
  const missingStudentLearningStageKeys = PBL_STAGE_DEFINITIONS.filter(
    (stage) => stage.studentLearningRequired && entries[stage.key].studentLearning === 0,
  ).map((stage) => stage.key);
  const missingTeacherResourceStageKeys = PBL_REQUIRED_TEACHER_RESOURCE_STAGE_KEYS.filter(
    (stageKey) => entries[stageKey].teacher === 0,
  );

  return {
    ok:
      missingStudentLearningStageKeys.length === 0 &&
      missingTeacherResourceStageKeys.length === 0 &&
      routingViolations.length === 0,
    entries,
    missingStageKeys,
    missingStudentLearningStageKeys,
    missingTeacherResourceStageKeys,
    routingViolations,
    metadataWarnings,
  };
}

export function formatPblStageDefinitionsForPrompt(): string {
  return JSON.stringify(PBL_STAGE_DEFINITIONS, null, 2);
}

/**
 * Context injected into scene-content/action prompts. The dedicated course
 * template creates the outline; this keeps the same contract visible when a
 * concrete slide, quiz, widget, or teacher script is generated later.
 */
export function formatPblSceneContext(
  outline: Pick<
    SceneOutline,
    | "stageKey"
    | "stageLabel"
    | "audience"
    | "generationPurpose"
    | "companionIds"
    | "companionPrompt"
    | "activityId"
    | "parentActivityId"
    | "detailKind"
    | "knowledgePointIds"
    | "targetDurationSec"
    | "segmentIndex"
    | "segmentCount"
    | "segmentRole"
    | "ttsPolicy"
    | "timingPlan"
    | "resourceTypes"
  >,
  config?: PblCourseConfig,
): string {
  if (!outline.stageKey && !outline.audience && !config) return "";

  const stage = stageDefinition(outline.stageKey);
  const stageKey = outline.stageKey;
  const evidence = (config?.evidenceRequirements ?? [])
    .filter((item) => !stageKey || item.stageKeys.includes(stageKey))
    .map((item) => `${item.label}${item.required ? "（必需）" : "（可选）"}`);
  const configuredCompanions = outline.companionIds?.length
    ? outline.companionIds
    : config?.companionIds ?? [];
  const companions = stageKey
    ? resolveCompanionIds(stageKey, configuredCompanions)
    : configuredCompanions;
  const companionDetails = companions.map((id) => {
    const companion = getCompanion(id as Parameters<typeof getCompanion>[0]);
    return `${companion.name}（${id}）：${companion.instruction}`;
  });

  return [
    "## PBL 场景契约",
    `阶段：${outline.stageLabel || stage?.label || outline.stageKey || "未标注"}`,
    `阶段 key：${outline.stageKey || "未标注"}`,
    `受众：${outline.audience === "student" ? "学生课堂" : outline.audience === "teacher" ? "教师资源" : "未标注"}`,
    `生成目的：${outline.generationPurpose || "未标注"}`,
    outline.activityId ? `对应课堂活动：${outline.activityId}` : "",
    outline.parentActivityId ? `所属课程模块：${outline.parentActivityId}` : "",
    outline.detailKind ? `课程大纲资源角色：${outline.detailKind}` : "",
    outline.knowledgePointIds?.length
      ? `关联知识点 ID：${outline.knowledgePointIds.join("、")}`
      : "",
    outline.resourceTypes?.length
      ? `要求的资源类型：${outline.resourceTypes.join("、")}`
      : "",
    `本阶段分工：${stage?.responsibility || "遵守课程的显式阶段标注。"}`,
    `伴学角色：${companions.length ? companions.join("、") : "按当前场景需要选择，不新增角色。"}`,
    companionDetails.length ? `伴学职责：${companionDetails.join("；")}` : "",
    stageKey ? `阶段伴学服务契约：\n${buildStagePolicyPrompt(stageKey)}` : "",
    `本阶段过程证据：${evidence.length ? evidence.join("、") : "按课程配置记录自然产生的过程证据。"}`,
    outline.segmentCount && outline.segmentCount > 1
      ? `Page segment ${outline.segmentIndex ?? 1}/${outline.segmentCount}; focus on ${outline.segmentRole || "one coherent subtopic"} and do not repeat sibling pages.`
      : "",
    outline.ttsPolicy === "target-duration" && outline.targetDurationSec
      ? outline.timingPlan
        ? `学生 TTS 模型：${outline.timingPlan.providerId}/${outline.timingPlan.modelId || "default"}；AI 朗读目标：${outline.timingPlan.targetDurationSec} 秒；内容量控制在 ${outline.timingPlan.minUnits}-${outline.timingPlan.maxUnits} ${outline.timingPlan.unit === "latin-word" ? "英文词" : "中文字符/混合文本单位"}，必须通过与当前知识点直接相关的有效概念、依据、案例、反例和分步解释贴近目标，不得使用固定的 4.5 字/秒公式或引入图谱之外的知识。`
        : `学生 TTS 目标：${outline.targetDurationSec} 秒；服务端会按实际 TTS 模型参数计算所需内容量，必须通过与当前知识点直接相关的有效概念、依据、案例、反例和分步解释贴近目标，不得使用固定的 4.5 字/秒公式或引入图谱之外的知识。`
      : outline.ttsPolicy === "none"
        ? "TTS 规则：本课程大纲资源是教师普通课堂资源，不生成 TTS。"
        : "",
    outline.companionPrompt ? `伴学引导提示：${outline.companionPrompt}` : "",
    "硬性边界：学生是个人项目负责人；教师资源不能进入学生 AI 授知内容；AI 伴学只能提问、解释、质疑、建议和记录，不能替学生做最终决策或代做作品。",
  ]
    .filter(Boolean)
    .join("\n");
}
