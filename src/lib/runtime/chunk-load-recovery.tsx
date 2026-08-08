"use client";

import { useEffect } from "react";

const RECOVERY_STORAGE_KEY = "openpbl:chunk-recovery-at";

export const CHUNK_RECOVERY_COOLDOWN_MS = 30_000;

function errorText(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value) {
    return String((value as { message?: unknown }).message ?? "");
  }
  return "";
}

export function isChunkLoadError(value: unknown): boolean {
  return /ChunkLoadError|Failed to load chunk|Loading chunk .* failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    errorText(value),
  );
}

export function claimChunkRecovery(
  storage: Pick<Storage, "getItem" | "setItem">,
  now = Date.now(),
): boolean {
  const stored = storage.getItem(RECOVERY_STORAGE_KEY);
  const previous = stored === null ? Number.NaN : Number(stored);
  if (Number.isFinite(previous) && now - previous < CHUNK_RECOVERY_COOLDOWN_MS) {
    return false;
  }
  storage.setItem(RECOVERY_STORAGE_KEY, String(now));
  return true;
}

async function discardObsoleteClientCaches(): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if ("serviceWorker" in navigator) {
    tasks.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.allSettled(registrations.map((registration) => registration.unregister())),
        ),
    );
  }

  if ("caches" in window) {
    tasks.push(
      window.caches
        .keys()
        .then((keys) =>
          Promise.allSettled(
            keys
              .filter((key) => /openpbl|next|workbox/i.test(key))
              .map((key) => window.caches.delete(key)),
          ),
        ),
    );
  }

  await Promise.allSettled(tasks);
}

/**
 * A stale browser can request a chunk that a restarted dev server no longer
 * owns. Recover once with a hard page reload; the cooldown prevents a broken
 * deployment or network outage from causing an infinite refresh loop.
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    let recoveryStarted = false;

    const recover = (reason: unknown) => {
      if (recoveryStarted || !isChunkLoadError(reason)) return;

      try {
        if (!claimChunkRecovery(window.sessionStorage)) return;
      } catch {
        // Storage may be unavailable in privacy modes. The in-memory guard
        // still guarantees no more than one reload during this page lifetime.
      }

      recoveryStarted = true;
      void discardObsoleteClientCaches().finally(() => window.location.reload());
    };

    const onError = (event: ErrorEvent) => recover(event.error ?? event.message);
    const onUnhandledRejection = (event: PromiseRejectionEvent) => recover(event.reason);

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
