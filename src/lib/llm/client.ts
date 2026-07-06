// LLM client. Reads endpoint / api key / model from settings page (server-providers.yml),
// legacy ai-settings.json, or OPENPBL_LLM_* env vars (in that order via getActiveAiSettings).
// When all are missing, throws LlmNotConfiguredError so the UI can fall back to sample content.

import {
  buildEvaluationPlanPrompt,
  buildFullCoursePrompt,
  buildLessonOutlinePrompt,
  buildPblOutlinePrompt,
} from "./prompts";
import type { GenerateInput, LlmCallRequest, LlmCallResponse } from "./types";
import { LlmNotConfiguredError } from "./types";
import { buildSampleContent, buildSamplePblOutline } from "./fallback";
import type { CourseContent, EvaluationPlan, LessonOutlineSection } from "../session/types";
import { getActiveAiSettings } from "./settings";

function env(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    return process.env[name];
  }
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

/**
 * 公共 LLM 调用入口：供 support-engine.ts 等模块使用，
 * 统一走系统 LLM 配置（ai-settings.json / server-providers.yml / 环境变量）。
 *
 * - LLM 未配置或调用失败时抛出 LlmNotConfiguredError / Error
 * - 调用方可通过 try/catch 自行实现本地规则兜底
 * - jsonMode=true 时优先用 response_format，不支持则自动降级重试
 *
 * @example
 * ```ts
 * const text = await callLLM([
 *   { role: "system", content: "你是 PBL 课程设计专家。" },
 *   { role: "user", content: "请生成 3 个驱动问题。" },
 * ], { jsonMode: true });
 * ```
 */
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
 * 检查当前是否配置了可用 LLM。
 * 供 support-engine.ts 在调用前预检，未配置时直接走本地兜底。
 */
export async function isLlmReady(): Promise<boolean> {
  try {
    return await isActiveLlmConfigured();
  } catch {
    return false;
  }
}

/**
 * 从 LLM 返回文本中提取 JSON 对象。
 * 优先严格 JSON.parse，失败时回退到匹配第一个 {...} 块。
 */
export function parseLLMJson<T = unknown>(text: string): T {
  return extractJson(text) as T;
}

async function callChatCompletions(
  messages: ChatMessage[],
  opts: { jsonMode: boolean; abortSignal?: AbortSignal },
): Promise<string> {
  const settings = await getActiveAiSettings();
  const endpoint = settings.endpoint || env("OPENPBL_LLM_ENDPOINT");
  const apiKey = settings.apiKey || env("OPENPBL_LLM_API_KEY");
  const model = settings.model || env("OPENPBL_LLM_MODEL") || "gpt-5.4-mini";

  if (!endpoint || !apiKey) {
    throw new LlmNotConfiguredError();
  }

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

  // 部分 provider/模型不支持 response_format 参数，
  // 首次调用失败时去掉 JSON 模式重试一次（依赖 prompt 引导 + extractJson 兜底）
  if (!res.ok && opts.jsonMode) {
    const errText = await res.text().catch(() => "");
    if (
      res.status === 400 ||
      errText.toLowerCase().includes("response_format") ||
      errText.toLowerCase().includes("unsupported")
    ) {
      res = await doFetch(false);
    }
    // 若仍失败，继续走下面的错误处理
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
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
  // Try strict parse first
  try {
    return JSON.parse(text);
  } catch {
    // Fall back: find first { ... } block
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("LLM 返回非 JSON");
    return JSON.parse(m[0]);
  }
}

function validateFullCourse(json: unknown, input: GenerateInput): CourseContent {
  const j = json as Partial<CourseContent>;
  if (!j || typeof j !== "object") throw new Error("LLM 返回结构错误");

  const pblOutline = String(j.pblOutline ?? "").trim();
  const knowledgePoints = Array.isArray(j.knowledgePoints)
    ? (j.knowledgePoints as { id?: string; name?: string; description?: string }[]).map((k, i) => ({
        id: String(k.id ?? `kp-${i + 1}`),
        name: String(k.name ?? "").trim() || `知识点 ${i + 1}`,
        description: String(k.description ?? "").trim(),
      }))
    : [];

  const lessonOutline: LessonOutlineSection[] = Array.isArray(j.lessonOutline)
    ? (j.lessonOutline as Partial<LessonOutlineSection>[]).map((l, i) => ({
        id: String(l.id ?? `lo-${i + 1}`),
        stageKey: String(l.stageKey ?? input.stages[0]?.key ?? "ai-learning"),
        title: String(l.title ?? "").trim() || `章节 ${i + 1}`,
        objectives: Array.isArray(l.objectives) ? l.objectives.map((o) => String(o)) : [],
        activities: Array.isArray(l.activities) ? l.activities.map((a) => String(a)) : [],
        durationMin: Number(l.durationMin ?? 45),
      }))
    : [];

  const ep = (j.evaluationPlan ?? {}) as Partial<EvaluationPlan>;
  const dimensions = Array.isArray(ep.dimensions)
    ? (ep.dimensions as { id?: string; name?: string; weight?: number; description?: string }[]).map(
        (d, i) => ({
          id: String(d.id ?? `ev-${i + 1}`),
          name: String(d.name ?? "").trim() || `维度 ${i + 1}`,
          weight: Number(d.weight ?? 0),
          description: String(d.description ?? "").trim(),
        }),
      )
    : [];
  const overallRubric = String(ep.overallRubric ?? "").trim();

  return { pblOutline, knowledgePoints, lessonOutline, evaluationPlan: { dimensions, overallRubric } };
}

export async function generateCourseContent(
  request: LlmCallRequest,
  opts?: { signal?: AbortSignal },
): Promise<LlmCallResponse> {
  const { action, input, useSample } = request;

  // Caller asked explicitly for the sample (UI fallback button).
  if (useSample) {
    if (action === "pblOutline") {
      return {
        content: { ...buildSampleContent(input), ...buildSamplePblOutline(input) } as CourseContent,
        source: "sample",
      };
    }
    return { content: buildSampleContent(input), source: "sample" };
  }

  // LLM not configured → return sample so the demo flow can still run.
  if (!(await isActiveLlmConfigured())) {
    if (action === "pblOutline") {
      return {
        content: { ...buildSampleContent(input), ...buildSamplePblOutline(input) } as CourseContent,
        source: "sample",
      };
    }
    return { content: buildSampleContent(input), source: "sample" };
  }

  // Real LLM call.
  let system = "";
  let user = "";
  switch (action) {
    case "pblOutline": {
      const p = buildPblOutlinePrompt(input);
      system = p.system;
      user = p.user;
      break;
    }
    case "lessonOutline": {
      const p = buildLessonOutlinePrompt(input);
      system = p.system;
      user = p.user;
      break;
    }
    case "evaluationPlan": {
      const p = buildEvaluationPlanPrompt(input);
      system = p.system;
      user = p.user;
      break;
    }
    case "fullCourse": {
      const p = buildFullCoursePrompt(input);
      system = p.system;
      user = p.user;
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
    const sample = buildSamplePblOutline(input);
    return {
      content: { ...buildSampleContent(input), pblOutline: String((json as { pblOutline?: string }).pblOutline ?? sample.pblOutline) },
      source: "llm",
    };
  }
  if (action === "lessonOutline") {
    const sample = buildSampleContent(input);
    return {
      content: { ...sample, lessonOutline: validateFullCourse({ lessonOutline: (json as { lessonOutline?: unknown }).lessonOutline, knowledgePoints: sample.knowledgePoints, pblOutline: sample.pblOutline, evaluationPlan: sample.evaluationPlan }, input).lessonOutline },
      source: "llm",
    };
  }
  if (action === "evaluationPlan") {
    const sample = buildSampleContent(input);
    return {
      content: { ...sample, evaluationPlan: validateFullCourse({ evaluationPlan: (json as { evaluationPlan?: unknown }).evaluationPlan, knowledgePoints: sample.knowledgePoints, pblOutline: sample.pblOutline, lessonOutline: sample.lessonOutline }, input).evaluationPlan },
      source: "llm",
    };
  }
  return { content: validateFullCourse(json, input), source: "llm" };
}
