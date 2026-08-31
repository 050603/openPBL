import { isRetryableGenerationError } from "@openmaic/lib/generation/generation-retry";

export const MAX_MANAGED_COURSE_GENERATION_RECOVERIES = 2;
const PERSISTED_FAILURE_PREFIX = "OPENPBL_COURSE_GENERATION_FAILURE_V1:";
const MAX_PERSISTED_ERROR_MESSAGE_LENGTH = 4_000;

type PersistedCourseGenerationFailure = {
  version: 1;
  retryable: boolean;
  name: string;
  message: string;
  code?: string | number;
  status?: number;
};

export type ManagedCourseGenerationRequest = {
  managedRecoveryCount?: number;
};

export function createManagedCourseGenerationRecoveryRequest<T extends object>(
  request: T & ManagedCourseGenerationRequest,
  error: unknown,
): (T & ManagedCourseGenerationRequest) | null {
  // A provider can fail before the first page reaches its checkpoint. Those
  // failures still benefit from the same bounded managed recovery; requiring a
  // checkpoint here turned a brief first-page outage into a terminal job.
  if (!isRetryableGenerationError(error)) return null;
  const recoveryCount = request.managedRecoveryCount ?? 0;
  if (recoveryCount >= MAX_MANAGED_COURSE_GENERATION_RECOVERIES) return null;
  return { ...request, managedRecoveryCount: recoveryCount + 1 };
}

function errorRecord(error: unknown): Record<string, unknown> | null {
  return typeof error === "object" && error !== null
    ? error as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const record = errorRecord(error);
  return stringValue(record?.message) ?? String(error);
}

function redactPersistedErrorMessage(message: string): string {
  return message
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(
      /((?:api[-_ ]?key|authorization|token|secret|password)\s*["']?\s*[:=]\s*["']?)([^"'\s,;&]+)/gi,
      "$1[REDACTED]",
    )
    .replace(/\bsk-[a-z0-9_-]{8,}\b/gi, "[REDACTED]")
    .slice(0, MAX_PERSISTED_ERROR_MESSAGE_LENGTH);
}

/**
 * Persist enough internal failure metadata to classify a later recovery after
 * a process restart. Route responses must format this value before returning
 * it; the diagnostic text is deliberately not a teacher-facing message.
 */
export function serializeCourseGenerationFailure(error: unknown): string {
  const record = errorRecord(error);
  const status = numberValue(record?.statusCode ?? record?.status ?? record?.status_code);
  const code = stringValue(record?.code) ?? numberValue(record?.code);
  const failure: PersistedCourseGenerationFailure = {
    version: 1,
    retryable: isRetryableGenerationError(error),
    name: error instanceof Error
      ? error.name
      : stringValue(record?.name) ?? "Error",
    message: redactPersistedErrorMessage(errorMessage(error)),
    ...(code !== undefined ? { code } : {}),
    ...(status !== undefined ? { status } : {}),
  };
  return `${PERSISTED_FAILURE_PREFIX}${JSON.stringify(failure)}`;
}

function parsePersistedFailure(value: string): PersistedCourseGenerationFailure | null {
  if (!value.startsWith(PERSISTED_FAILURE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(value.slice(PERSISTED_FAILURE_PREFIX.length)) as Partial<PersistedCourseGenerationFailure>;
    if (
      parsed.version !== 1
      || typeof parsed.retryable !== "boolean"
      || typeof parsed.name !== "string"
      || typeof parsed.message !== "string"
    ) return null;
    return parsed as PersistedCourseGenerationFailure;
  } catch {
    return null;
  }
}

/** Restore the original retry classification without exposing its diagnostic. */
export function deserializeCourseGenerationFailure(value: string): Error {
  const persisted = parsePersistedFailure(value);
  if (!persisted) {
    const legacy = new Error(value);
    // Older rows stored the already-formatted transient teacher message. Keep
    // those jobs recoverable after deploying the structured format.
    if (value.includes("AI 页面生成服务连续多次未能完成")) {
      Object.assign(legacy, { isRetryable: true });
    }
    return legacy;
  }
  const error = new Error(persisted.message);
  error.name = persisted.name;
  Object.assign(error, {
    isRetryable: persisted.retryable,
    ...(persisted.code !== undefined ? { code: persisted.code } : {}),
    ...(persisted.status !== undefined ? { status: persisted.status } : {}),
  });
  return error;
}

export function formatCourseGenerationErrorForTeacher(error: unknown): string {
  if (isRetryableGenerationError(error)) {
    return "AI 页面生成服务连续多次未能完成最后的课堂页面；已经生成的页面均已保留，请稍后继续。";
  }
  return "课程生成遇到无法继续的系统错误；已经生成的页面均已保留，请稍后继续。";
}

export function formatPersistedCourseGenerationErrorForTeacher(value: string): string {
  return formatCourseGenerationErrorForTeacher(deserializeCourseGenerationFailure(value));
}
