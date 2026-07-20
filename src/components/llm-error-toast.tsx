"use client";

// LLM error toast — surfaces Chinese error messages and suggested actions for
// LLM-related failures (course generation + companion roundtable).
//
// Two entry points:
//   1. `LlmErrorToastListener` — a passive component that listens for
//      `llm-error` CustomEvents on `window` and shows a toast. Mount it once
//      near the app root.
//   2. `useLlmErrorToast` — a hook that returns a `showLlmError` function
//      callers can invoke directly when they catch an error response from
//      `/api/llm` or a `COMPANION_*_FAILED` SSE event from `/api/chat/companion`.
//
// Error codes mirror the `error` field returned by the server routes so the
// client can map a single string to a targeted message without `instanceof`
// checks on serialized errors.

import { useCallback, useEffect } from "react";
import { toast } from "sonner";

export type LlmErrorCode =
  | "LLM_NOT_CONFIGURED"
  | "LLM_RATE_LIMITED"
  | "LLM_TIMEOUT"
  | "LLM_JSON_MODE_UNSUPPORTED"
  | "LLM_STREAM_CORRUPTED"
  | "LLM_EMPTY_RESPONSE"
  | "LLM_OUTPUT_INCOMPLETE"
  | "LLM_CALL_FAILED"
  | "COMPANION_DIRECTOR_FAILED"
  | "COMPANION_GENERATION_FAILED";

type LlmErrorConfig = {
  title: string;
  description: string;
  /** Suggested next action shown as the toast body. */
  action?: string;
  /** sonner toast variant. Defaults to "error". */
  variant?: "error" | "warning";
};

/**
 * Mapping table from error code → Chinese message + suggested action.
 * Keep this in sync with the error → HTTP status mapping in
 * `src/app/api/llm/route.ts` and the `COMPANION_*_FAILED` prefixes emitted
 * by `src/app/api/chat/companion/route.ts`.
 */
export const LLM_ERROR_MESSAGES: Record<LlmErrorCode, LlmErrorConfig> = {
  LLM_NOT_CONFIGURED: {
    title: "AI 模型未配置",
    description: "AI 模型未配置，请在设置页配置后再试。",
    action: "前往设置 → AI 模型",
  },
  LLM_RATE_LIMITED: {
    title: "AI 服务繁忙",
    description: "AI 请求已被限流，请稍后重试。",
    action: "等待几十秒后重试",
    variant: "warning",
  },
  LLM_TIMEOUT: {
    title: "AI 响应超时",
    description: "AI 响应时间过长（超过 60 秒），请重试。",
    action: "检查网络或更换更快的模型",
  },
  LLM_JSON_MODE_UNSUPPORTED: {
    title: "模型不支持 JSON 模式",
    description: "当前模型不支持 JSON 模式，生成结构化内容时需要更换模型。",
    action: "前往设置更换支持 JSON 模式的模型",
  },
  LLM_STREAM_CORRUPTED: {
    title: "AI 流式响应异常",
    description: "AI 返回的流式数据格式异常，已中断本轮对话。",
    action: "重试，若持续出现请检查模型服务状态",
  },
  LLM_EMPTY_RESPONSE: {
    title: "AI 返回为空",
    description: "AI 未返回任何内容，请重试。",
    action: "重试，若持续出现请检查模型配置",
  },
  LLM_OUTPUT_INCOMPLETE: {
    title: "AI 输出字段不完整",
    description: "AI 返回的内容缺少过多必要字段，无法自动补全。",
    action: "重试，或调整提示词后重新生成",
  },
  LLM_CALL_FAILED: {
    title: "AI 调用失败",
    description: "AI 服务调用失败，请稍后重试。",
    action: "查看错误详情，若持续出现请检查模型配置",
  },
  COMPANION_DIRECTOR_FAILED: {
    title: "伴学调度失败",
    description: "AI 伴学导演调度失败，本轮对话无法开始。",
    action: "重试，若持续出现请检查模型配置",
  },
  COMPANION_GENERATION_FAILED: {
    title: "伴学回复失败",
    description: "AI 伴学回复生成失败，本轮对话已中断。",
    action: "重试，或更换伴学角色",
  },
};

function showToastForCode(code: LlmErrorCode, detail?: string) {
  const config = LLM_ERROR_MESSAGES[code];
  const description = detail
    ? `${config.description}\n${detail}`.trim()
    : config.description;
  const actionText = config.action ? `\n建议：${config.action}` : "";
  const variant = config.variant ?? "error";
  if (variant === "warning") {
    toast.warning(config.title, { description: `${description}${actionText}` });
  } else {
    toast.error(config.title, { description: `${description}${actionText}` });
  }
}

/**
 * Extract the LLM error code from a fetch Response body.
 * Returns `null` when the body does not contain a recognized `error` field.
 *
 * Usage:
 *   const res = await fetch("/api/llm", { ... });
 *   if (!res.ok) {
 *     const body = await res.json().catch(() => ({}));
 *     showLlmError(body.error, body.detail);
 *   }
 */
export function extractLlmErrorCode(body: unknown): LlmErrorCode | null {
  if (!body || typeof body !== "object") return null;
  const code = (body as { error?: unknown }).error;
  if (typeof code !== "string") return null;
  if (code in LLM_ERROR_MESSAGES) return code as LlmErrorCode;
  // Companion SSE errors prefix the code before the reason, e.g.
  // "COMPANION_DIRECTOR_FAILED: <reason>".
  const companionPrefix = (Object.keys(LLM_ERROR_MESSAGES) as LlmErrorCode[]).find(
    (key) => key.startsWith("COMPANION_") && code.startsWith(key),
  );
  return companionPrefix ?? null;
}

/**
 * Hook that returns a `showLlmError` function. Callers pass the error code
 * (from a JSON response body or an SSE `error` event message) plus an
 * optional detail string.
 */
export function useLlmErrorToast(): {
  showLlmError: (code: LlmErrorCode | string, detail?: string) => void;
} {
  const showLlmError = useCallback((code: LlmErrorCode | string, detail?: string) => {
    const known = (typeof code === "string" && code in LLM_ERROR_MESSAGES
      ? (code as LlmErrorCode)
      : null);
    if (known) {
      showToastForCode(known, detail);
      return;
    }
    // Companion SSE errors embed the code as a prefix: try to recover it.
    if (typeof code === "string") {
      const companionMatch = (Object.keys(LLM_ERROR_MESSAGES) as LlmErrorCode[]).find(
        (key) => key.startsWith("COMPANION_") && code.startsWith(key),
      );
      if (companionMatch) {
        const trailing = code.slice(companionMatch.length).replace(/^[:\s]+/, "");
        showToastForCode(companionMatch, trailing || detail);
        return;
      }
    }
    // Unknown code → generic fallback.
    toast.error("AI 调用失败", {
      description: detail ?? "发生未知错误，请重试。",
    });
  }, []);
  return { showLlmError };
}

/**
 * Extract the LLM error code from a Companion SSE error message.
 * Companion errors are emitted as `message: "COMPANION_*_FAILED: <reason>"`
 * (see `src/app/api/chat/companion/route.ts`).
 */
export function extractCompanionErrorCode(message: string): {
  code: LlmErrorCode;
  detail: string;
} | null {
  const match = (Object.keys(LLM_ERROR_MESSAGES) as LlmErrorCode[]).find(
    (key) => key.startsWith("COMPANION_") && message.startsWith(key),
  );
  if (!match) return null;
  const detail = message.slice(match.length).replace(/^[:\s]+/, "");
  return { code: match, detail };
}

type LlmErrorEventDetail = {
  code: LlmErrorCode | string;
  detail?: string;
};

/**
 * Passive listener component — mount once near the app root to display LLM
 * errors dispatched via `window.dispatchEvent(new CustomEvent("llm-error", { detail }))`.
 *
 * This gives deeply-nested components a way to trigger toasts without
 * prop-drilling the `showLlmError` callback.
 */
export function LlmErrorToastListener() {
  const { showLlmError } = useLlmErrorToast();
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<LlmErrorEventDetail>).detail;
      if (!detail) return;
      showLlmError(detail.code, detail.detail);
    };
    window.addEventListener("llm-error", handler as EventListener);
    return () => window.removeEventListener("llm-error", handler as EventListener);
  }, [showLlmError]);
  return null;
}
