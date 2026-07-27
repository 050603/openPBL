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
      const canRetry =
        error instanceof SessionActionRequestError &&
        error.status === 409 &&
        error.code === "VERSION_CONFLICT" &&
        Number.isSafeInteger(error.currentVersion) &&
        attempt < maxAttempts;
      if (!canRetry) throw error;
      expectedVersion = error.currentVersion;
    }
  }
  throw new Error("SESSION_ACTION_RETRY_EXHAUSTED");
}
