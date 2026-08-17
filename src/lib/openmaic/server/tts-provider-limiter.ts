type WaitingTask = {
  start: () => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

type ProviderPool = {
  active: number;
  limit: number;
  queue: WaitingTask[];
};

const pools = new Map<string, ProviderPool>();

function pump(pool: ProviderPool): void {
  while (pool.active < pool.limit && pool.queue.length > 0) {
    const waiting = pool.queue.shift()!;
    if (waiting.signal?.aborted) {
      waiting.reject(waiting.signal.reason ?? new DOMException("Aborted", "AbortError"));
      continue;
    }
    if (waiting.onAbort) waiting.signal?.removeEventListener("abort", waiting.onAbort);
    pool.active += 1;
    waiting.start();
  }
}

/**
 * Enforce one provider's configured concurrency across every classroom and
 * adaptive branch in this server process. Per-classroom pools alone can burst
 * far beyond a shared API-key quota when several resources generate together.
 */
export function runWithGlobalTtsProviderSlot<T>(
  providerId: string,
  limit: number,
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const pool = pools.get(providerId) ?? { active: 0, limit: safeLimit, queue: [] };
  pool.limit = Math.min(pool.limit, safeLimit);
  pools.set(providerId, pool);

  return new Promise<T>((resolve, reject) => {
    const waiting: WaitingTask = {
      signal,
      reject,
      start: () => {
        operation().then(resolve, reject).finally(() => {
          pool.active -= 1;
          pump(pool);
        });
      },
    };
    waiting.onAbort = () => {
      const index = pool.queue.indexOf(waiting);
      if (index >= 0) pool.queue.splice(index, 1);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", waiting.onAbort, { once: true });
    pool.queue.push(waiting);
    pump(pool);
  });
}
