// Next.js instrumentation hook. Runs once per server process at startup.
// We use it to:
//   - Initialize prom-client's default metrics collection (heap,
//     event loop, CPU, GC, ...) on the Node.js runtime.
//   - Register SIGTERM / SIGINT handlers so the process shuts down
//     gracefully (Stage 7): flip the shutdown flag, run cleanup hooks,
//     close the WebSocket server + Prisma connection, then exit 0.
//
// The actual metric collection is also guarded inside metrics.ts against
// double-init in dev (HMR), but importing here ensures it runs even before
// any route handler executes.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Side-effect import: triggers collectDefaultMetrics() exactly once.
    await import("@/lib/observability/metrics");

    // Stage 4: start the WebSocket server for realtime session sync.
    // Best-effort — if the port is in use (e.g. dev HMR spinning up a
    // second instance), startWebSocketServer logs an error and returns
    // null; clients fall back to long-polling.
    const { startWebSocketServer } = await import("@/lib/realtime/websocket-server");
    const wsPort = Number(process.env.WEBSOCKET_PORT ?? "3001");
    startWebSocketServer(wsPort);

    // Register graceful-shutdown signal handlers (Stage 7).
    // The signal handlers MUST only be installed on the Node.js runtime —
    // the Edge runtime has no `process.on`.
    await installShutdownHandlers();
  }
}

async function installShutdownHandlers(): Promise<void> {
  const { beginShutdown, SHUTDOWN_TIMEOUT_MS } = await import(
    "@/lib/runtime/lifecycle"
  );
  const { logger } = await import("@/lib/observability/logger");

  let shuttingDown = false;

  const handleSignal = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    // Hard ceiling: even if beginShutdown() hangs (e.g. a hook ignores its
    // timeout), force-exit slightly after the budget. `.unref()` so this
    // timer doesn't keep the event loop alive on its own.
    const forceExitTimer = setTimeout(() => {
      logger.error(
        { signal, budgetMs: SHUTDOWN_TIMEOUT_MS },
        "graceful shutdown exceeded budget; forcing exit",
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS + 2_000);
    forceExitTimer.unref?.();

    // 1) Flip isShuttingDown() -> health checks return 503, LB drains.
    // 2) Run registered cleanup hooks (each with its own timeout).
    beginShutdown(`received ${signal}`)
      .then(async () => {
        // 3) Close the WebSocket server if it exists. The module is optional
        //    (not all deployments use WebSocket), so a missing import is
        //    expected — we use a variable path so TypeScript treats it as
        //    `Promise<any>` and the runtime resolves it lazily.
        await closeWebSocketServerIfPresent();

        // 4) Close the database connection. Prisma is always instantiated
        //    (singleton), but if DATABASE_URL is unset (Demo mode) calling
        //    $disconnect is a safe no-op.
        try {
          const { prisma } = await import("@/lib/db/client");
          await prisma.$disconnect();
        } catch (err) {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            "prisma.$disconnect() failed during shutdown",
          );
        }

        // 5) Exit cleanly.
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          "graceful shutdown threw; forcing exit",
        );
        process.exit(1);
      });
  };

  process.on("SIGTERM", () => handleSignal("SIGTERM"));
  process.on("SIGINT", () => handleSignal("SIGINT"));
}

/**
 * Best-effort close of the WebSocket server. The realtime module is not yet
 * present in every deployment, so we resolve the path lazily and treat any
 * import failure as "no WS server running".
 */
async function closeWebSocketServerIfPresent(): Promise<void> {
  const { logger } = await import("@/lib/observability/logger");
  // Variable path -> dynamic import typed as Promise<any> by TypeScript,
  // so a missing module does not break compilation.
  const modulePath = "@/lib/realtime/websocket-server";
  try {
    const mod = (await import(modulePath)) as {
      getWebSocketServer?: () => {
        close?: () => Promise<void> | void;
      } | null | undefined;
    };
    const ws = mod.getWebSocketServer?.();
    if (ws?.close) {
      await Promise.resolve(ws.close());
      logger.info("WebSocket server closed during shutdown");
    }
  } catch (err) {
    // Module doesn't exist or isn't initialized — expected in many setups.
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "WebSocket server module unavailable; skipping close",
    );
  }
}
