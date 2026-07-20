// Prometheus metrics (prom-client) for the openPBL app.
//
// Exposes:
//   - HTTP request counter + histogram (method, route, status)
//   - LLM call counter / duration / token counters (provider, model)
//   - TTS request counter (provider, status)
//   - WebSocket / classroom / online-student gauges
//   - DB query duration histogram (operation)
//   - Default Node.js runtime metrics (heap, event loop, CPU, GC)
//
// The single default Registry is exported as `register` for the
// /api/metrics endpoint. All metrics are registered on it implicitly.

import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
  register,
} from "prom-client";

// Ensure default metrics (event loop lag, heap, CPU, GC, ...) are collected
// exactly once per process, even under Next.js hot-reload in dev.
declare global {
  // eslint-disable-next-line no-var
  var __openPblDefaultMetricsInitialized: boolean | undefined;
}

if (!globalThis.__openPblDefaultMetricsInitialized) {
  collectDefaultMetrics({
    register: register as Registry,
    eventLoopMonitoringPrecision: 10,
  });
  globalThis.__openPblDefaultMetricsInitialized = true;
}

/** HTTP request volume, labeled by method / route / final status code. */
export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests handled.",
  labelNames: ["method", "route", "status"] as const,
});

/** HTTP request latency in seconds. */
export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency in seconds.",
  labelNames: ["method", "route"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/** LLM call volume, labeled by provider / model / status (success|error). */
export const llmCallsTotal = new Counter({
  name: "llm_calls_total",
  help: "Total number of LLM API calls.",
  labelNames: ["provider", "model", "status"] as const,
});

/** LLM call latency in seconds. */
export const llmCallDurationSeconds = new Histogram({
  name: "llm_call_duration_seconds",
  help: "LLM API call latency in seconds.",
  labelNames: ["provider", "model"] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120],
});

/** LLM token usage, labeled by type (prompt|completion|total). */
export const llmTokensTotal = new Counter({
  name: "llm_tokens_total",
  help: "Total tokens consumed by LLM calls.",
  labelNames: ["provider", "model", "type"] as const,
});

/** TTS request volume, labeled by provider / status. */
export const ttsRequestsTotal = new Counter({
  name: "tts_requests_total",
  help: "Total number of TTS requests.",
  labelNames: ["provider", "status"] as const,
});

/** Currently active WebSocket connections. */
export const websocketConnectionsActive = new Gauge({
  name: "websocket_connections_active",
  help: "Number of currently active WebSocket connections.",
});

/** Number of active classrooms (in-progress sessions). */
export const classroomActiveTotal = new Gauge({
  name: "classroom_active_total",
  help: "Number of currently active classrooms.",
});

/** Number of students currently online. */
export const studentsOnlineTotal = new Gauge({
  name: "students_online_total",
  help: "Number of students currently online.",
});

/** Database query latency in seconds, labeled by Prisma operation. */
export const dbQueryDurationSeconds = new Histogram({
  name: "db_query_duration_seconds",
  help: "Database query latency in seconds.",
  labelNames: ["operation"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export { register };
