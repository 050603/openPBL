// LLM client. Reads endpoint / api key / model from settings page (server-providers.yml),
// legacy ai-settings.json, or OPENPBL_LLM_* env vars (in that order via getActiveAiSettings).
// When all are missing, throws LlmNotConfiguredError so the UI can show an explicit error.

import {
  buildEvaluationPlanPrompt,
  buildFullCoursePrompt,
  buildKnowledgeGraphPrompt,
  buildLessonOutlinePrompt,
  buildPblOutlinePrompt,
  buildTeachingOutlinePrompt,
} from "./prompts";
import type { GenerateInput, LlmCallRequest, LlmCallResponse } from "./types";
import { LlmNotConfiguredError } from "./types";
import type {
  CourseContent,
  EvaluationPlan,
  KnowledgeGraph,
  LessonOutlineSection,
  TeachingOutlineSection,
} from "../session/types";
import { getActiveAiSettings } from "./settings";
import { validatePblKnowledgeAlignment } from "@/lib/pbl-outline-validation";
import {
  applyConfirmedPblTimingPlan,
  assessPblTeachingOutlineStructure,
  normalizePblTeachingOutline,
} from "@/lib/pbl-outline-normalization";
import {
  isPblModuleTimingPlanConfirmed,
  normalizePblStageKey,
  rescalePblDetailDurations,
} from "@/lib/pbl-time-model";

function env(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env) return process.env[name];
  return undefined;
}

export function isLlmConfigured(): boolean {
  return Boolean(env("OPENPBL_LLM_ENDPOINT") && env("OPENPBL_LLM_API_KEY"));
}

export async function isActiveLlmConfigured(): Promise<boolean> {
  const settings = await getActiveAiSettings();
  return Boolean(settings.endpoint && settings.apiKey);
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;
let llmCooldownUntil = 0;

export class LlmRateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number, detail = "") {
    super(`LLM 调用触发限流，${Math.ceil(retryAfterMs / 1000)} 秒后再试${detail ? `：${detail}` : ""}`);
    this.name = "LlmRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function isLlmCoolingDown(): boolean {
  return Date.now() < llmCooldownUntil;
}

function setRateLimitCooldown(res: Response, detail = ""): LlmRateLimitError {
  const retryAfter = res.headers.get("retry-after");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  const retryAfterMs = Number.isFinite(retryAfterSeconds)
    ? Math.max(1_000, retryAfterSeconds * 1_000)
    : DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  llmCooldownUntil = Math.max(llmCooldownUntil, Date.now() + retryAfterMs);
  return new LlmRateLimitError(retryAfterMs, detail);
}

export async function callLLM(
  messages: ChatMessage[],
  opts: { jsonMode?: boolean; abortSignal?: AbortSignal } = {},
): Promise<string> {
  return callChatCompletions(messages, {
    jsonMode: opts.jsonMode ?? false,
    abortSignal: opts.abortSignal,
  });
}

/**
 * Streaming LLM call — yields text deltas as they arrive.
 * Uses the same settings as callLLM but with stream: true.
 */
export async function* callLLMStream(
  messages: ChatMessage[],
  opts: { abortSignal?: AbortSignal } = {},
): AsyncGenerator<string, void, void> {
  if (isLlmCoolingDown()) {
    throw new LlmRateLimitError(Math.max(0, llmCooldownUntil - Date.now()));
  }

  const settings = await getActiveAiSettings();
  const endpoint = settings.endpoint || env("OPENPBL_LLM_ENDPOINT");
  const apiKey = settings.apiKey || env("OPENPBL_LLM_API_KEY");
  const model = settings.model || env("OPENPBL_LLM_MODEL") || "gpt-5.4-mini";

  if (!endpoint || !apiKey) throw new LlmNotConfiguredError();

  const url = endpoint.replace(/\/+$/, "") + "/chat/completions";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.5,
      stream: true,
    }),
    signal: opts.abortSignal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) throw setRateLimitCooldown(res, text);
    throw new Error(`LLM 调用失败：${res.status} ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("LLM 流式响应为空");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // Skip malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function isLlmReady(): Promise<boolean> {
  try {
    return !isLlmCoolingDown() && (await isActiveLlmConfigured());
  } catch {
    return false;
  }
}

export function parseLLMJson<T = unknown>(text: string): T {
  return extractJson(text) as T;
}

async function callChatCompletions(
  messages: ChatMessage[],
  opts: { jsonMode: boolean; abortSignal?: AbortSignal },
): Promise<string> {
  if (isLlmCoolingDown()) {
    throw new LlmRateLimitError(Math.max(0, llmCooldownUntil - Date.now()));
  }

  const settings = await getActiveAiSettings();
  const endpoint = settings.endpoint || env("OPENPBL_LLM_ENDPOINT");
  const apiKey = settings.apiKey || env("OPENPBL_LLM_API_KEY");
  const model = settings.model || env("OPENPBL_LLM_MODEL") || "gpt-5.4-mini";

  if (!endpoint || !apiKey) throw new LlmNotConfiguredError();

  const url = endpoint.replace(/\/+$/, "") + "/chat/completions";

  async function doFetch(useJsonMode: boolean): Promise<Response> {
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.5,
        ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: opts.abortSignal,
    });
  }

  let res = await doFetch(opts.jsonMode);

  if (!res.ok && opts.jsonMode) {
    const errText = await res.text().catch(() => "");
    if (
      res.status === 400 ||
      errText.toLowerCase().includes("response_format") ||
      errText.toLowerCase().includes("unsupported")
    ) {
      res = await doFetch(false);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) throw setRateLimitCooldown(res, text);
    throw new Error(`LLM 调用失败：${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM 返回为空");
  return content;
}

function extractJson(text: string): unknown {
  const candidates = [
    text.trim(),
    text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(),
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue with the bounded JSON fragments below.
    }
  }

  const fragments = [
    text.match(/\{[\s\S]*\}/)?.[0],
    text.match(/\[[\s\S]*\]/)?.[0],
  ].filter((fragment): fragment is string => Boolean(fragment));
  for (const fragment of fragments) {
    try {
      return JSON.parse(fragment);
    } catch {
      // Keep the original error category for the UI.
    }
  }
  throw new Error("LLM 返回非 JSON");
}

function emptyCourseContent(): CourseContent {
  return {
    pblOutline: "",
    knowledgePoints: [],
    knowledgeGraph: { nodes: [], edges: [] },
    teachingOutline: [],
    lessonOutline: [],
    evaluationPlan: { dimensions: [], overallRubric: "" },
  };
}

function requireText(value: unknown, scope: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${scope}失败：AI 返回结构不完整，请检查模型输出后重试。`);
  }
  return value.trim();
}

function validateKnowledgePoints(raw: unknown): CourseContent["knowledgePoints"] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("知识图谱生成失败：AI 未返回知识点。");
  }
  return raw.map((item, index) => {
    const point = item && typeof item === "object"
      ? item as {
          id?: string;
          name?: string;
          description?: string;
          keyInfo?: string;
          relatedIds?: unknown;
          level?: unknown;
        }
      : {};
    return {
      id: typeof point.id === "string" && point.id.trim() ? point.id.trim() : `kp-${index + 1}`,
      name: requireText(point.name, "知识点"),
      description: typeof point.description === "string" ? point.description.trim() : "",
      keyInfo: typeof point.keyInfo === "string" && point.keyInfo.trim() ? point.keyInfo.trim() : undefined,
      relatedIds: Array.isArray(point.relatedIds)
        ? point.relatedIds.filter((id): id is string => typeof id === "string")
        : undefined,
      level:
        point.level === "foundation" ||
        point.level === "core" ||
        point.level === "application" ||
        point.level === "extension"
          ? point.level
          : undefined,
    };
  });
}

function normalizeKnowledgeGraph(raw: unknown, knowledgePoints: CourseContent["knowledgePoints"]): KnowledgeGraph {
  const obj = raw && typeof raw === "object" ? raw as Partial<KnowledgeGraph> : {};
  if (!Array.isArray(obj.nodes) || obj.nodes.length === 0) {
    throw new Error("知识图谱生成失败：AI 未返回图谱节点。");
  }

  const nodes: KnowledgeGraph["nodes"] = obj.nodes.map((node, index) => ({
    id: typeof node.id === "string" && node.id ? node.id : knowledgePoints[index]?.id ?? `kp-${index + 1}`,
    label:
      typeof node.label === "string" && node.label.trim()
        ? node.label.trim()
        : knowledgePoints[index]?.name ?? requireText(undefined, "知识图谱节点"),
    description:
      typeof node.description === "string" && node.description.trim()
        ? node.description.trim()
        : knowledgePoints[index]?.description ?? "",
    keyInfo:
      typeof node.keyInfo === "string" && node.keyInfo.trim()
        ? node.keyInfo.trim()
        : knowledgePoints[index]?.keyInfo,
    level:
      node.level === "foundation" ||
      node.level === "core" ||
      node.level === "application" ||
      node.level === "extension"
        ? node.level
        : index < 2
          ? "foundation"
          : index < Math.max(4, Math.ceil(knowledgePoints.length * 0.6))
            ? "core"
            : "application",
    relatedLessonIds: Array.isArray(node.relatedLessonIds)
      ? node.relatedLessonIds.filter((id): id is string => typeof id === "string")
      : undefined,
  }));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray(obj.edges)
    ? obj.edges
        .map((edge, index) => ({
          id: typeof edge.id === "string" && edge.id ? edge.id : `edge-${index + 1}`,
          source: typeof edge.source === "string" ? edge.source : "",
          target: typeof edge.target === "string" ? edge.target : "",
          label: typeof edge.label === "string" && edge.label.trim() ? edge.label.trim() : "关联",
        }))
        .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target)
    : [];

  return { nodes, edges };
}

function applyGraphLevels(
  knowledgePoints: CourseContent["knowledgePoints"],
  graph: KnowledgeGraph,
): CourseContent["knowledgePoints"] {
  const levels = new Map(graph.nodes.map((node) => [node.id, node.level]));
  return knowledgePoints.map((point) => ({
    ...point,
    level: point.level ?? levels.get(point.id),
  }));
}

function validateLessonOutline(
  raw: unknown,
  input: GenerateInput,
  context?: Partial<Pick<CourseContent, "knowledgePoints" | "knowledgeGraph" | "teachingOutline">>,
): LessonOutlineSection[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("AI 授知大纲生成失败：AI 未返回章节大纲。");
  }
  const details = raw.map((item, index) => {
    const section = item && typeof item === "object" ? item as Partial<LessonOutlineSection> : {};
    const requestedStageKey = typeof section.stageKey === "string" ? section.stageKey.trim() : "";
    const stageKey = input.pblConfig?.generationTemplate === "pbl-six-stage"
      ? normalizePblStageKey(requestedStageKey) ?? "ai-learning"
      : (requestedStageKey || input.stages[0]?.key) ?? "ai-learning";
    const parent = context?.teachingOutline?.find((activity) => activity.id === section.parentActivityId);
    const isStudentKnowledge = stageKey === "ai-learning";
    return {
      id: typeof section.id === "string" && section.id.trim() ? section.id.trim() : `lo-${index + 1}`,
      stageKey,
      title: requireText(section.title, "AI 授知大纲"),
      objectives: Array.isArray(section.objectives)
        ? section.objectives.map((objective) => String(objective)).filter(Boolean)
        : [],
      activities: Array.isArray(section.activities)
        ? section.activities.map((activity) => String(activity)).filter(Boolean)
        : [],
      durationMin: Number.isFinite(Number(section.durationMin)) ? Math.max(1, Number(section.durationMin)) : 1,
      parentActivityId:
        typeof section.parentActivityId === "string" && section.parentActivityId.trim()
          ? section.parentActivityId.trim()
          : undefined,
      detailKind:
        typeof section.detailKind === "string" && DETAIL_KIND_VALUES.has(section.detailKind)
          ? section.detailKind
          : undefined,
      knowledgePointIds: Array.isArray(section.knowledgePointIds)
        ? section.knowledgePointIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
        : [],
      resourceTypes: isStudentKnowledge
        ? Array.isArray(section.resourceTypes)
          ? section.resourceTypes.filter(
              (type): type is NonNullable<LessonOutlineSection["resourceTypes"]>[number] =>
                typeof type === "string" && RESOURCE_TYPE_VALUES.has(type),
            )
          : ["ppt"]
        : ["ppt", "script"],
      targetDurationSec: Number.isFinite(Number(section.targetDurationSec))
        ? Math.max(60, Number(section.targetDurationSec))
        : Math.max(60, (parent?.durationMin ?? Number(section.durationMin) ?? 1) * 60),
      ttsPolicy: isStudentKnowledge ? "target-duration" : "none",
    } satisfies LessonOutlineSection;
  });

  if (input.pblConfig?.generationTemplate !== "pbl-six-stage" || !context?.knowledgePoints?.length) {
    return details;
  }

  const aiDetails = details.filter((detail) => detail.stageKey === "ai-learning");
  const covered = new Set(aiDetails.flatMap((detail) => detail.knowledgePointIds ?? []));
  const missingPoints = context.knowledgePoints.filter((point) => !covered.has(point.id));
  if (missingPoints.length === 0 || aiDetails.length === 0) return details;

  const parentId = aiDetails[0].parentActivityId ?? context.teachingOutline?.find((activity) => activity.stageKey === "ai-learning")?.id;
  const scaffoldDetails: LessonOutlineSection[] = missingPoints.map((point) => ({
    id: `lo-knowledge-coverage-${point.id}`,
    stageKey: "ai-learning",
    title: `知识点补充：${point.name}`,
    objectives: [point.description || point.name],
    activities: [`通过一个短案例或检查题验证“${point.name}”与项目驱动问题的关系。`],
    durationMin: 1,
    parentActivityId: parentId,
    detailKind: "knowledge-explanation",
    knowledgePointIds: [point.id],
    resourceTypes: ["ppt"],
    targetDurationSec: 60,
    ttsPolicy: "target-duration",
  }));
  const parentActivities = context.teachingOutline ?? [];
  return rescalePblDetailDurations<LessonOutlineSection>(
    [...details, ...scaffoldDetails],
    parentActivities,
  );
}

const RESOURCE_TYPE_VALUES = new Set([
  "ppt",
  "interactive-demo",
  "code-interactive",
  "script",
  "worksheet",
  "rubric",
  "project-brief",
]);
const DETAIL_KIND_VALUES = new Set([
  "teacher-introduction",
  "knowledge-explanation",
  "interactive-practice",
  "project-scaffold",
  "project-practice",
  "showcase-coaching",
  "reflection-transfer",
  "other",
]);

type JsonRecord = Record<string, unknown>;

function asJsonRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function textFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const text = value
      .map((item) => textFromUnknown(item))
      .filter((item): item is string => Boolean(item))
      .join("；");
    return text || undefined;
  }
  const record = asJsonRecord(value);
  if (!record) return undefined;
  for (const key of ["text", "value", "content", "description", "action", "task", "responsibility", "role", "name", "label", "key"]) {
    const text = textFromUnknown(record[key]);
    if (text) return text;
  }
  return undefined;
}

function firstValue(record: JsonRecord, keys: ReadonlyArray<string>): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function firstText(
  record: JsonRecord,
  keys: ReadonlyArray<string>,
  nestedRecords: ReadonlyArray<JsonRecord | undefined> = [],
): string | undefined {
  const values = [record, ...nestedRecords];
  for (const source of values) {
    if (!source) continue;
    for (const key of keys) {
      const text = textFromUnknown(source[key]);
      if (text) return text;
    }
  }
  return undefined;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function stringListFromUnknown(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[,，、;；\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      if (typeof item === "string") return stringListFromUnknown(item);
      const record = asJsonRecord(item);
      const id = record && firstText(record, ["id", "key", "value"]);
      return id ? [id] : [];
    })
    .filter(Boolean);
}

function unwrapTeachingOutlinePayload(raw: unknown, depth = 0): unknown {
  if (depth > 4) return undefined;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      return unwrapTeachingOutlinePayload(extractJson(raw), depth + 1);
    } catch {
      return undefined;
    }
  }
  const record = asJsonRecord(raw);
  if (!record) return undefined;
  for (const key of [
    "teachingOutline",
    "teachingModules",
    "courseModules",
    "modules",
    "outline",
    "activities",
    "items",
    "课程模块",
    "授课大纲",
    "data",
    "result",
  ]) {
    if (record[key] === undefined || record[key] === null) continue;
    const payload = unwrapTeachingOutlinePayload(record[key], depth + 1);
    if (payload !== undefined) return payload;
  }
  return undefined;
}

function normalizeTeachingOutlineStageKey(
  raw: JsonRecord,
  input: GenerateInput,
  index: number,
): string {
  const requested = firstText(raw, ["stageKey", "stage_key", "stage", "phase", "moduleStage", "阶段"]);
  const fallbackStage = input.stages[Math.min(index, Math.max(0, input.stages.length - 1))]?.key;
  if (input.pblConfig?.generationTemplate === "pbl-six-stage") {
    return normalizePblStageKey(requested) ?? fallbackStage ?? "launch";
  }
  const exact = requested && input.stages.some((stage) => stage.key === requested) ? requested : undefined;
  const byLabel = requested && input.stages.find((stage) => stage.label.trim() === requested)?.key;
  return exact ?? byLabel ?? fallbackStage ?? "launch";
}

function normalizeTeachingActivityKind(value: unknown): TeachingOutlineSection["activityKind"] {
  const normalized = textFromUnknown(value)?.trim().toLowerCase();
  const aliases: Record<string, NonNullable<TeachingOutlineSection["activityKind"]>> = {
    launch: "launch",
    introduction: "launch",
    引入: "launch",
    启动: "launch",
    knowledge: "knowledge",
    teaching: "knowledge",
    授知: "knowledge",
    knowledge_teaching: "knowledge",
    proposal: "proposal",
    design: "proposal",
    构思: "proposal",
    practice: "practice",
    make: "practice",
    project_practice: "practice",
    实践: "practice",
    showcase: "showcase",
    presentation: "showcase",
    汇报: "showcase",
    reflection: "reflection",
    transfer: "reflection",
    反思: "reflection",
    other: "other",
  };
  return normalized ? aliases[normalized] : undefined;
}

/**
 * Normalize the small structural variations commonly returned by LLMs.
 * The six role fields are operationally required by the editor, so missing
 * fields receive explicit, editable defaults instead of aborting the whole
 * course generation request.
 */
export function normalizeTeachingOutlineResponse(
  raw: unknown,
  input: GenerateInput,
  context?: Partial<Pick<CourseContent, "knowledgePoints" | "knowledgeGraph" | "moduleTimingPlan">>,
): TeachingOutlineSection[] {
  const payload = unwrapTeachingOutlinePayload(raw);
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error("授课大纲生成失败：AI 未返回教案级授课大纲。");
  }

  const parsed = payload.flatMap((item, index) => {
    const section = asJsonRecord(item);
    if (!section) return [];

    const stageKey = normalizeTeachingOutlineStageKey(section, input, index);
    const stageLabel = input.stages.find((stage) => stage.key === stageKey)?.label ?? stageKey;
    const roleRecords = [
      asJsonRecord(section.roles),
      asJsonRecord(section.responsibilities),
      asJsonRecord(section.roleAssignments),
    ];
    const missingFields: string[] = [];
    const read = (keys: ReadonlyArray<string>, label: string): string => {
      const value = firstText(section, keys, roleRecords);
      if (value) return value;
      missingFields.push(label);
      return "";
    };

    const title = read(["title", "name", "moduleName", "activityTitle", "课程模块"], "title") ||
      `${stageLabel || "课程"}模块`;
    const teachingGoal = read(
      ["teachingGoal", "teaching_goal", "goal", "objective", "teachingObjective", "教学目标"],
      "teachingGoal",
    ) || `围绕“${title}”完成本模块的核心学习任务。`;
    const teacherRole = read(
      ["teacherRole", "teacher_role", "teacher", "teacherAction", "teacherTasks", "教师职责", "教师角色"],
      "teacherRole",
    ) || `教师组织“${title}”，明确任务要求并根据学生表现进行指导。`;
    const platformRole = read(
      ["platformRole", "platform_role", "platform", "platformAction", "platformTasks", "平台职责", "平台作用"],
      "platformRole",
    ) || "平台展示本模块资源，收集过程证据并记录学习结果。";
    const aiRole = read(
      ["aiRole", "ai_role", "ai", "aiAction", "aiTasks", "AI职责", "AI作用"],
      "aiRole",
    ) || (stageKey === "ai-learning"
      ? "AI 提供分步讲解、练习与反馈，帮助学生独立完成任务，不直接给出最终答案。"
      : "AI 提供伴学提示与澄清问题，不代替学生完成项目。");
    const studentActivity = read(
      ["studentActivity", "student_activity", "student", "studentTask", "studentAction", "studentTasks", "学生活动", "学习任务"],
      "studentActivity",
    ) || `学生围绕“${title}”完成任务并提交过程证据。`;

    const rawResources = firstValue(section, ["resourceTypes", "resource_types", "resources", "资源类型"]);
    const resourceTypes = stringListFromUnknown(rawResources).filter(
      (type): type is NonNullable<TeachingOutlineSection["resourceTypes"]>[number] => RESOURCE_TYPE_VALUES.has(type),
    );
    const normalizedResourceTypes: NonNullable<TeachingOutlineSection["resourceTypes"]> = resourceTypes.length > 0
      ? resourceTypes
      : stageKey === "ai-learning"
        ? ["ppt"]
        : ["ppt", "script"];
    const rawKnowledgePointIds = firstValue(section, [
      "knowledgePointIds",
      "knowledge_point_ids",
      "knowledgeIds",
      "knowledgePoints",
      "知识点ID",
    ]);
    const knowledgePointIds = stringListFromUnknown(rawKnowledgePointIds);
    const requestedOpenMaicUse = firstText(section, ["openMaicUse", "openMAICUse", "openmaicUse", "aiRoute", "route"]);
    const openMaicUse = requestedOpenMaicUse === "student-ai-learning" || requestedOpenMaicUse === "student_ai_learning"
      ? "student-ai-learning"
      : stageKey === "ai-learning"
        ? "student-ai-learning"
        : "none";
    const durationMin = Math.max(
      1,
      Math.round(toFiniteNumber(firstValue(section, ["durationMin", "durationMinutes", "duration", "minutes", "时长"]), 1)),
    );
    const notes = firstText(section, ["notes", "note", "remarks", "备注"]);
    const normalizationNote = missingFields.length > 0
      ? `AI 输出缺少字段（${missingFields.join("、")}），系统已补全，请教师核查。`
      : undefined;

    return [{
      id: firstText(section, ["id", "moduleId", "activityId"]) ?? `to-${index + 1}`,
      stageKey,
      title,
      durationMin,
      teachingGoal,
      teacherRole,
      platformRole,
      aiRole,
      studentActivity,
      activityKind: normalizeTeachingActivityKind(firstValue(section, ["activityKind", "activity_kind", "kind", "type", "活动类型"])),
      knowledgePointIds,
      openMaicUse,
      resourceTypes: normalizedResourceTypes,
      notes: [notes, normalizationNote].filter(Boolean).join("；"),
    } satisfies TeachingOutlineSection];
  });

  if (parsed.length === 0) {
    throw new Error("授课大纲生成失败：AI 未返回可用课程模块。");
  }

  if (input.pblConfig?.generationTemplate !== "pbl-six-stage") return parsed;
  const options = {
    totalMinutes: Math.max(0, Math.round(input.hours * 60)),
    topic: input.name,
    subject: input.subject,
    summary: input.summary,
    grade: input.grade,
    difficulty: input.pblConfig.difficultyLevel,
    knowledgePoints: context?.knowledgePoints,
    knowledgeGraph: context?.knowledgeGraph,
  };
  const normalized = context?.moduleTimingPlan
    && isPblModuleTimingPlanConfirmed(context.moduleTimingPlan)
    ? applyConfirmedPblTimingPlan(parsed, context.moduleTimingPlan, options)
    : normalizePblTeachingOutline(parsed, options);
  const structureIssues = assessPblTeachingOutlineStructure(normalized);
  if (structureIssues.length > 0) {
    throw new Error(`授课大纲结构校验失败：${structureIssues.map((issue) => issue.message).join("；")}`);
  }
  return normalized;
}

function validateTeachingOutline(
  raw: unknown,
  input: GenerateInput,
  context?: Partial<Pick<CourseContent, "knowledgePoints" | "knowledgeGraph">>,
): TeachingOutlineSection[] {
  return normalizeTeachingOutlineResponse(raw, input, context);
}

function validateEvaluationPlan(raw: unknown): EvaluationPlan {
  const plan = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawDimensions = plan.dimensions;
  if (!Array.isArray(rawDimensions) || rawDimensions.length === 0) {
    throw new Error("评价方案生成失败：AI 未返回评价维度。");
  }

  type RawDimension = Record<string, unknown>;
  const parsed = (rawDimensions as RawDimension[]).map((dimension, index) => {
    // Accept common field name aliases for "name"
    const name =
      pickString(dimension, ["name", "title", "dimensionName", "维度名称", "label"]) ??
      "";
    if (!name) {
      throw new Error(`评价方案生成失败：第 ${index + 1} 个维度缺少名称字段（name）。`);
    }

    // Parse weight: accept number, numeric string, or "20%" format
    const weight = parseWeight(dimension);

    // Accept common field name aliases for "description"
    const description =
      pickString(dimension, ["description", "desc", "说明", "标准", "criteria"]) ?? "";

    // Accept common field name aliases for "responsibleRole"
    const roleRaw = pickString(dimension, ["responsibleRole", "role", "负责人", "评价方"]);
    const responsibleRole: "ai" | "teacher" | undefined =
      roleRaw === "ai" || roleRaw === "teacher"
        ? roleRaw
        : roleRaw === "AI" || roleRaw === "ai过程" || roleRaw === "AI过程"
          ? "ai"
          : roleRaw === "教师" || roleRaw === "teacher"
            ? "teacher"
            : undefined;

    const id =
      typeof dimension.id === "string" && dimension.id.trim()
        ? dimension.id.trim()
        : `ev-${index + 1}`;

    return { id, name, weight, description, responsibleRole };
  });

  // Normalize weights: ensure each role group sums to 100
  const normalized = normalizeDimensionWeights(parsed);

  const overallRubric =
    pickString(plan, ["overallRubric", "rubric", "整体评价", "评价说明"]) ?? "";

  return { dimensions: normalized, overallRubric };
}

/** Try multiple keys on a record and return the first non-empty string value. */
function pickString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const val = record[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return undefined;
}

/** Parse a weight value that may be a number, numeric string, or "20%" format. */
function parseWeight(dimension: Record<string, unknown>): number {
  const raw = dimension.weight ?? dimension["权重"] ?? dimension["percentage"] ?? dimension["ratio"];
  if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[%％]/g, "").trim();
    const num = Number(cleaned);
    if (!Number.isNaN(num)) return num;
  }
  return 0;
}

/**
 * Normalize dimension weights so that AI dimensions sum to 100 and teacher
 * dimensions sum to 100. Dimensions without a role are grouped together and
 * also normalized to 100. If all weights in a group are 0, distribute evenly.
 */
function normalizeDimensionWeights(
  dimensions: Array<{ id: string; name: string; weight: number; description: string; responsibleRole?: "ai" | "teacher" }>,
): Array<{ id: string; name: string; weight: number; description: string; responsibleRole?: "ai" | "teacher" }> {
  const groups: Record<string, number[]> = { ai: [], teacher: [], unassigned: [] };
  const groupIndex: Array<{ group: string; idx: number }> = [];

  dimensions.forEach((dim, idx) => {
    const group = dim.responsibleRole ?? "unassigned";
    groups[group].push(dim.weight);
    groupIndex.push({ group, idx });
  });

  const normalizedWeights: Record<string, number[]> = {};
  for (const [group, weights] of Object.entries(groups)) {
    if (weights.length === 0) continue;
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum === 0) {
      // All zero → distribute evenly
      normalizedWeights[group] = weights.map(() => Math.round(100 / weights.length));
    } else if (sum === 100) {
      normalizedWeights[group] = weights;
    } else {
      // Scale proportionally, round, then fix rounding error on last element
      const scaled = weights.map((w) => Math.round((w / sum) * 100));
      const diff = 100 - scaled.reduce((a, b) => a + b, 0);
      if (scaled.length > 0) scaled[scaled.length - 1] += diff;
      normalizedWeights[group] = scaled;
    }
  }

  return dimensions.map((dim, idx) => {
    const group = groupIndex[idx].group;
    const weightArr = normalizedWeights[group];
    const weightIdx = groupIndex.filter((g) => g.group === group).findIndex((g) => g.idx === idx);
    return { ...dim, weight: weightArr?.[weightIdx] ?? dim.weight };
  });
}

function validateFullCourse(json: unknown, input: GenerateInput): CourseContent {
  const data = json && typeof json === "object" ? json as Partial<CourseContent> : {};
  const parsedKnowledgePoints = validateKnowledgePoints(data.knowledgePoints);
  const knowledgeGraph = normalizeKnowledgeGraph(data.knowledgeGraph, parsedKnowledgePoints);
  const knowledgePoints = applyGraphLevels(parsedKnowledgePoints, knowledgeGraph);
  const teachingOutline = data.teachingOutline
    ? validateTeachingOutline(data.teachingOutline, input, { knowledgePoints, knowledgeGraph })
    : [];
  const lessonOutline = validateLessonOutline(data.lessonOutline, input, {
    knowledgePoints,
    knowledgeGraph,
    teachingOutline,
  });
  if (input.pblConfig?.generationTemplate === "pbl-six-stage") {
    const activityIds = new Set(teachingOutline.map((activity) => activity.id));
    const orphanDetails = lessonOutline.filter(
      (detail) => !detail.parentActivityId || !activityIds.has(detail.parentActivityId),
    );
    if (orphanDetails.length > 0) {
      throw new Error("课程大纲生成失败：存在未关联课程模块的资源。");
    }
    const studentDetails = lessonOutline.filter((detail) => detail.stageKey === "ai-learning");
    const knowledgeValidation = validatePblKnowledgeAlignment(
      studentDetails,
      knowledgePoints,
      { requireReferences: true, requireCoverage: true },
    );
    if (knowledgeValidation.issues.length > 0) {
      throw new Error(
        `课程大纲知识点校验失败：${knowledgeValidation.issues[0]?.message ?? "请检查知识点关联。"}`,
      );
    }
  }
  return {
    pblOutline: requireText(data.pblOutline, "PBL 大纲"),
    knowledgePoints,
    knowledgeGraph,
    teachingOutline,
    lessonOutline,
    evaluationPlan: validateEvaluationPlan(data.evaluationPlan),
  };
}

export async function generateCourseContent(
  request: LlmCallRequest,
  opts?: { signal?: AbortSignal },
): Promise<LlmCallResponse> {
  const { action, input } = request;

  if (!(await isActiveLlmConfigured())) throw new LlmNotConfiguredError();

  let system = "";
  let user = "";
  switch (action) {
    case "pblOutline": {
      const prompt = buildPblOutlinePrompt(input, request.context);
      system = prompt.system;
      user = prompt.user;
      break;
    }
    case "lessonOutline": {
      const prompt = buildLessonOutlinePrompt(input, request.context);
      system = prompt.system;
      user = prompt.user;
      break;
    }
    case "teachingOutline": {
      const prompt = buildTeachingOutlinePrompt(input, request.context);
      system = prompt.system;
      user = prompt.user;
      break;
    }
    case "knowledgeGraph": {
      const prompt = buildKnowledgeGraphPrompt(input, request.context);
      system = prompt.system;
      user = prompt.user;
      break;
    }
    case "evaluationPlan": {
      const prompt = buildEvaluationPlanPrompt(input, request.context);
      system = prompt.system;
      user = prompt.user;
      break;
    }
    case "fullCourse": {
      const prompt = buildFullCoursePrompt(input);
      system = prompt.system;
      user = prompt.user;
      break;
    }
  }

  const text = await callChatCompletions(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { jsonMode: true, abortSignal: opts?.signal },
  );

  const json = extractJson(text);

  if (action === "pblOutline") {
    return {
      content: { ...emptyCourseContent(), pblOutline: requireText((json as { pblOutline?: unknown }).pblOutline, "PBL 大纲") },
      source: "llm",
    };
  }
  if (action === "lessonOutline") {
    return {
      content: {
        ...emptyCourseContent(),
        lessonOutline: validateLessonOutline(
          (json as { lessonOutline?: unknown }).lessonOutline,
          input,
          request.context,
        ),
      },
      source: "llm",
    };
  }
  if (action === "teachingOutline") {
    const jsonRecord = asJsonRecord(json);
    return {
      content: {
        ...emptyCourseContent(),
        pblOutline:
          typeof jsonRecord?.pblOutline === "string"
            ? jsonRecord.pblOutline.trim()
            : "",
        teachingOutline: normalizeTeachingOutlineResponse(
          json,
          input,
          request.context,
        ),
      },
      source: "llm",
    };
  }
  if (action === "knowledgeGraph") {
    const parsedKnowledgePoints = validateKnowledgePoints((json as { knowledgePoints?: unknown }).knowledgePoints);
    const knowledgeGraph = normalizeKnowledgeGraph((json as { knowledgeGraph?: unknown }).knowledgeGraph, parsedKnowledgePoints);
    const knowledgePoints = applyGraphLevels(parsedKnowledgePoints, knowledgeGraph);
    return {
      content: {
        ...emptyCourseContent(),
        knowledgePoints,
        knowledgeGraph,
      },
      source: "llm",
    };
  }
  if (action === "evaluationPlan") {
    return {
      content: { ...emptyCourseContent(), evaluationPlan: validateEvaluationPlan((json as { evaluationPlan?: unknown }).evaluationPlan) },
      source: "llm",
    };
  }
  return { content: validateFullCourse(json, input), source: "llm" };
}
