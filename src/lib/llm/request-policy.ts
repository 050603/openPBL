import type { LlmCallRequest } from "@/lib/llm/types";

export type LlmRequestClass = "standard" | "long-generation";

const STANDARD_TIMEOUT_MS = 180_000;
const LONG_GENERATION_TIMEOUT_MS = 600_000;
const MIN_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 1_800_000;

type TimeoutEnvironment = Readonly<Record<string, string | undefined>>;

function boundedTimeout(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, parsed));
}

export function resolveLlmRequestTimeoutMs(
  requestClass: LlmRequestClass,
  environment: TimeoutEnvironment = process.env,
): number {
  return requestClass === "long-generation"
    ? boundedTimeout(
        environment.OPENPBL_LLM_LONG_REQUEST_TIMEOUT_MS,
        LONG_GENERATION_TIMEOUT_MS,
      )
    : boundedTimeout(
        environment.OPENPBL_LLM_REQUEST_TIMEOUT_MS,
        STANDARD_TIMEOUT_MS,
      );
}

export function requestClassForCourseContentAction(
  action: LlmCallRequest["action"],
): LlmRequestClass {
  return action === "knowledgeGraph"
    || action === "teachingOutline"
    || action === "lessonOutline"
    || action === "fullCourse"
    ? "long-generation"
    : "standard";
}
