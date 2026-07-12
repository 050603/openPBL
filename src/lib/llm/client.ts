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
import { normalizePblTeachingOutline } from "@/lib/pbl-outline-normalization";
import {
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
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM 返回非 JSON");
    return JSON.parse(match[0]);
  }
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
  context?: Pick<CourseContent, "knowledgePoints" | "knowledgeGraph" | "teachingOutline">,
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
    };
  });

  if (input.pblConfig?.generationTemplate !== "pbl-six-stage" || !context?.knowledgePoints?.length) {
    return details;
  }

  const aiDetails = details.filter((detail) => detail.stageKey === "ai-learning");
  const covered = new Set(aiDetails.flatMap((detail) => detail.knowledgePointIds ?? []));
  const missingPoints = context.knowledgePoints.filter((point) => !covered.has(point.id));
  if (missingPoints.length === 0 || aiDetails.length === 0) return details;

  const parentId = aiDetails[0].parentActivityId ?? context.teachingOutline?.find((activity) => activity.stageKey === "ai-learning")?.id;
  const scaffoldDetails: LessonOutlineSection[] = missingPoints.map((point, index) => ({
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
  return rescalePblDetailDurations(
    [...details, ...scaffoldDetails],
    parentActivities,
  );
}

const OPEN_MAIC_USE_VALUES = new Set(["none", "student-ai-learning"]);
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
const TTS_POLICY_VALUES = new Set(["none", "target-duration"]);

function validateTeachingOutline(
  raw: unknown,
  input: GenerateInput,
  context?: Pick<CourseContent, "knowledgePoints" | "knowledgeGraph">,
): TeachingOutlineSection[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("授课大纲生成失败：AI 未返回教案级授课大纲。");
  }
  const stageKeys = new Set(input.stages.map((stage) => stage.key));
  const parsed = raw.map((item, index) => {
    const section =
      item && typeof item === "object" ? item as Partial<TeachingOutlineSection> : {};
    const openMaicUse =
      typeof section.openMaicUse === "string" && OPEN_MAIC_USE_VALUES.has(section.openMaicUse)
        ? section.openMaicUse
        : "none";
    return {
      id: typeof section.id === "string" && section.id.trim() ? section.id.trim() : `to-${index + 1}`,
      stageKey: (() => {
        const requested = typeof section.stageKey === "string" ? section.stageKey.trim() : "";
        if (input.pblConfig?.generationTemplate === "pbl-six-stage") {
          return normalizePblStageKey(requested) ?? input.stages[Math.min(index, input.stages.length - 1)]?.key ?? "launch";
        }
        if (requested && stageKeys.has(requested)) return requested;
        return input.stages[Math.min(index, input.stages.length - 1)]?.key ?? "launch";
      })(),
      title: requireText(section.title, "授课大纲"),
      durationMin: Number.isFinite(Number(section.durationMin)) ? Math.max(1, Number(section.durationMin)) : 1,
      teachingGoal: requireText(section.teachingGoal, "授课大纲"),
      teacherRole: requireText(section.teacherRole, "授课大纲"),
      platformRole: requireText(section.platformRole, "授课大纲"),
      aiRole: requireText(section.aiRole, "授课大纲"),
      studentActivity: requireText(section.studentActivity, "授课大纲"),
      activityKind:
        typeof section.activityKind === "string" &&
        ["launch", "knowledge", "proposal", "practice", "showcase", "reflection", "other"].includes(section.activityKind)
          ? section.activityKind
          : undefined,
      knowledgePointIds: Array.isArray(section.knowledgePointIds)
        ? section.knowledgePointIds.filter((id): id is string => typeof id === "string")
        : [],
      openMaicUse,
      resourceTypes: Array.isArray(section.resourceTypes)
        ? section.resourceTypes.filter(
            (type): type is NonNullable<TeachingOutlineSection["resourceTypes"]>[number] =>
              typeof type === "string" && RESOURCE_TYPE_VALUES.has(type),
          )
        : [],
      notes: typeof section.notes === "string" ? section.notes.trim() : "",
    };
  });

  if (input.pblConfig?.generationTemplate !== "pbl-six-stage") return parsed;
  return normalizePblTeachingOutline(parsed, {
    totalMinutes: Math.max(0, Math.round(input.hours * 60)),
    topic: input.name,
    subject: input.subject,
    summary: input.summary,
    grade: input.grade,
    difficulty: input.pblConfig.difficultyLevel,
    knowledgePoints: context?.knowledgePoints,
    knowledgeGraph: context?.knowledgeGraph,
  });
}

function validateEvaluationPlan(raw: unknown): EvaluationPlan {
  const plan = raw && typeof raw === "object" ? raw as Partial<EvaluationPlan> : {};
  if (!Array.isArray(plan.dimensions) || plan.dimensions.length === 0) {
    throw new Error("评价方案生成失败：AI 未返回评价维度。");
  }
  return {
    dimensions: (plan.dimensions as {
      id?: string;
      name?: string;
      weight?: number;
      description?: string;
      responsibleRole?: unknown;
    }[])
      .map((dimension, index) => ({
        id: typeof dimension.id === "string" && dimension.id.trim() ? dimension.id.trim() : `ev-${index + 1}`,
        name: requireText(dimension.name, "评价方案"),
        weight: Number(dimension.weight ?? 0),
        description: typeof dimension.description === "string" ? dimension.description.trim() : "",
        responsibleRole:
          dimension.responsibleRole === "ai" || dimension.responsibleRole === "teacher"
            ? dimension.responsibleRole
            : undefined,
      })),
    overallRubric: typeof plan.overallRubric === "string" ? plan.overallRubric.trim() : "",
  };
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
      throw new Error("二级资源细化生成失败：存在未关联一级活动的资源。");
    }
    const studentDetails = lessonOutline.filter((detail) => detail.stageKey === "ai-learning");
    const knowledgeValidation = validatePblKnowledgeAlignment(
      studentDetails,
      knowledgePoints,
      { requireReferences: true },
    );
    if (knowledgeValidation.issues.length > 0) {
      throw new Error(
        `二级资源细化知识点校验失败：${knowledgeValidation.issues[0]?.message ?? "请检查知识点关联。"}`,
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
    return {
      content: {
        ...emptyCourseContent(),
        pblOutline:
          typeof (json as { pblOutline?: unknown }).pblOutline === "string"
            ? ((json as { pblOutline: string }).pblOutline).trim()
            : "",
        teachingOutline: validateTeachingOutline(
          (json as { teachingOutline?: unknown }).teachingOutline,
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
