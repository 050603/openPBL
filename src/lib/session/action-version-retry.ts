export class SessionActionRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly currentVersion?: number,
  ) {
    super(code);
    this.name = "SessionActionRequestError";
  }
}

export async function retryVersionConflict<T>(
  send: (expectedVersion: number | undefined) => Promise<T>,
  initialVersion: number | undefined,
  maxAttempts = 3,
): Promise<T> {
  let expectedVersion = initialVersion;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await send(expectedVersion);
    } catch (error) {
      const canRetryVersion =
        error instanceof SessionActionRequestError &&
        ((error.status === 409 && error.code === "VERSION_CONFLICT") ||
          (error.status === 428 && error.code === "EXPECTED_VERSION_REQUIRED")) &&
        Number.isSafeInteger(error.currentVersion);
      // Every application-level 400 has a structured code such as
      // INVALID_ACTION or COURSE_MISMATCH. The generic fallback means an edge
      // or interrupted response supplied no readable JSON body. Retrying the
      // same idempotent requestId is safe and prevents a transient transport
      // failure from leaving the UI permanently in "保存失败".
      const canRetryUnstructured400 =
        error instanceof SessionActionRequestError &&
        error.status === 400 &&
        error.code === "SESSION_ACTION_FAILED_400";
      if ((!canRetryVersion && !canRetryUnstructured400) || attempt >= maxAttempts) {
        throw error;
      }
      if (canRetryVersion) expectedVersion = error.currentVersion;
      if (canRetryUnstructured400) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 80));
      }
    }
  }
  throw new Error("SESSION_ACTION_RETRY_EXHAUSTED");
}
