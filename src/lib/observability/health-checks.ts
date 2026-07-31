// Shared dependency checks used by both the new /api/health/ready route and
// the legacy /api/openmaic/health route. Keeping the logic here lets the
// legacy route stay backward-compatible (same response shape) while reusing
// the same dependency checks.

import { prisma, isDatabaseConfigured } from "@/lib/db/client";
import {
  getServerProviders,
  resolveBaseUrl,
} from "@openmaic/lib/server/provider-config";

export const DEPENDENCY_TIMEOUT_MS = 2000;

export interface CheckResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export interface ReadinessResult {
  ok: boolean;
  dependencies: Record<string, CheckResult>;
}

/** Run `fn` with a hard timeout; returns its result or `{ ok: false }`. */
async function withTimeout(
  label: string,
  fn: () => Promise<CheckResult>,
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise<CheckResult>((resolve) =>
        setTimeout(
          () => resolve({ ok: false, error: `${label} timeout` }),
          DEPENDENCY_TIMEOUT_MS,
        ),
      ),
    ]);
    return { ...result, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkDb(): Promise<CheckResult> {
  if (!isDatabaseConfigured()) {
    return { ok: true, latencyMs: 0, error: "not_configured" };
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * LLM reachability: we deliberately do NOT call /chat/completions
 * (cost + rate limits). We treat LLM as "reachable" if at least one provider
 * is configured. If a baseUrl is available we do a best-effort HEAD request
 * with the 2s timeout to verify network reachability.
 */
async function checkLlm(): Promise<CheckResult> {
  const providerIds = Object.keys(getServerProviders());
  if (providerIds.length === 0) {
    return { ok: false, error: "no_llm_provider_configured" };
  }
  for (const providerId of providerIds) {
    const baseUrl = resolveBaseUrl(providerId);
    if (!baseUrl) continue;
    try {
      const res = await fetch(baseUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(DEPENDENCY_TIMEOUT_MS),
        headers: { "User-Agent": "openpbl-healthcheck/1.0" },
      });
      if (res.status < 500) return { ok: true };
    } catch {
      // try next provider
    }
  }
  return { ok: true };
}

/** Filesystem: write + delete a temp file under the OS temp dir. */
async function checkFs(): Promise<CheckResult> {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const probe = path.join(os.tmpdir(), `openpbl-health-${Date.now()}.tmp`);
  try {
    await fs.writeFile(probe, "ok");
    await fs.unlink(probe);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Redis: only checked when REDIS_URL is set. We use a raw TCP connection
 * (connect event) rather than adding `ioredis` as a dependency.
 */
async function checkRedis(): Promise<CheckResult | undefined> {
  const url = process.env.REDIS_URL;
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const port = Number(parsed.port || 6379);
    const host = parsed.hostname;
    const net = await import("node:net");
    return await new Promise<CheckResult>((resolve) => {
      const socket = net.createConnection({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({ ok: false, error: "redis timeout" });
      }, DEPENDENCY_TIMEOUT_MS);
      socket.once("connect", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ ok: true });
      });
      socket.once("error", (err) => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ ok: false, error: err.message });
      });
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run all readiness checks in parallel. Returns a map of dependency ->
 * result plus an aggregate `ok` flag.
 */
export async function runReadinessChecks(): Promise<ReadinessResult> {
  const [db, llm, fs, redisResult] = await Promise.all([
    withTimeout("db", checkDb),
    withTimeout("llm", checkLlm),
    withTimeout("fs", checkFs),
    withTimeout("redis", async () =>
      (await checkRedis()) ?? {
        ok: true,
        latencyMs: 0,
        error: "not_configured",
      },
    ),
  ]);

  const dependencies: Record<string, CheckResult> = { db, llm, fs };
  // Surface `redis` only when it was actually checked (configured). The
  // legacy openmaic/health route doesn't expect a `redis` field, so callers
  // that want it should use /api/health/ready.
  if (process.env.REDIS_URL) dependencies.redis = redisResult;

  const ok = Object.values(dependencies).every((d) => d.ok);
  return { ok, dependencies };
}
