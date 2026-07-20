// WebSocket server for realtime session sync.
//
// Runs on a separate Node.js port (default 3001) since Next.js App Router
// does not expose WebSocket upgrade handling on its route handlers. Started
// once per server process via src/instrumentation.ts.
//
// Connection lifecycle:
//   1. Client opens ws://host:port?courseId=xxx with auth cookie in header.
//   2. Server verifies JWT (or allows demo mode if JWT_SECRET is unset).
//   3. Client sends `{type:"subscribe", courseId:"xxx"}` to join a room.
//   4. Server pushes `{type:"patch", courseId, event}` whenever the event-bus
//      publishes an event for that courseId.
//   5. 30s ping / 90s timeout heartbeat keeps connection alive.
//
// Failures (port in use, etc.) are caught and logged — the server does NOT
// throw. Clients will fail to connect and fall back to long-polling.

import { WebSocketServer, WebSocket } from "ws";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import {
  subscribeCourseEvents,
  unsubscribeCourseEvents,
  type RealtimeEvent,
} from "./event-bus";

const TEACHER_COOKIE = "openpbl_teacher";
const STUDENT_COOKIE = "openpbl_student";
const ISSUER = "openpbl";
const AUDIENCE = "openpbl-app";
const PING_INTERVAL_MS = 30_000;
const CONNECTION_TIMEOUT_MS = 90_000;

let serverInstance: WebSocketServer | null = null;

/**
 * Per-course room: the set of WebSocket clients currently subscribed.
 * Maintained alongside the event-bus subscription so that broadcastToCourse
 * can push arbitrary messages directly without going through the bus.
 */
const roomsByCourse = new Map<string, Set<WebSocket>>();

interface ClientState {
  /** CourseId the client is currently subscribed to. */
  courseId: string | undefined;
  /** Last pong timestamp (ms since epoch). */
  lastPongAt: number;
  /** The event-bus handler registered for this client, if subscribed. */
  handler: ((event: RealtimeEvent) => void) | null;
}

function getSecret(): Uint8Array | null {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 32) return null;
  return new TextEncoder().encode(raw);
}

function readCookie(headerValue: string | undefined, name: string): string | null {
  if (!headerValue) return null;
  const parts = headerValue.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function verifyAuth(cookieHeader: string | undefined): Promise<boolean> {
  const secret = getSecret();
  // Demo mode: skip auth.
  if (!secret) return true;
  const teacherToken = readCookie(cookieHeader, TEACHER_COOKIE);
  const studentToken = readCookie(cookieHeader, STUDENT_COOKIE);
  const token = teacherToken ?? studentToken;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return isAuthClaims(payload);
  } catch {
    return false;
  }
}

function isAuthClaims(payload: JWTPayload): boolean {
  return payload.role === "teacher" || payload.role === "student";
}

function parseSubscribeMessage(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const raw = data as Record<string, unknown>;
  if (raw.type !== "subscribe") return null;
  const courseId = raw.courseId;
  return typeof courseId === "string" && courseId.length > 0 ? courseId : null;
}

function safeParse(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function sendJson(ws: WebSocket, message: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(message));
  } catch (err) {
    console.error("[websocket-server] send failed:", err);
  }
}

function joinRoom(courseId: string, ws: WebSocket): void {
  let room = roomsByCourse.get(courseId);
  if (!room) {
    room = new Set();
    roomsByCourse.set(courseId, room);
  }
  room.add(ws);
}

function leaveRoom(courseId: string, ws: WebSocket): void {
  const room = roomsByCourse.get(courseId);
  if (!room) return;
  room.delete(ws);
  if (room.size === 0) {
    roomsByCourse.delete(courseId);
  }
}

function attachClient(ws: WebSocket): ClientState {
  const state: ClientState = {
    courseId: undefined,
    lastPongAt: Date.now(),
    handler: null,
  };

  ws.on("message", (raw) => {
    const text = typeof raw === "string" ? raw : raw.toString("utf8");
    const parsed = safeParse(text);
    const courseId = parseSubscribeMessage(parsed);
    if (!courseId) return;

    // Unsubscribe from previous course if switching.
    if (state.courseId && state.handler) {
      unsubscribeCourseEvents(state.courseId, state.handler);
      leaveRoom(state.courseId, ws);
    }

    state.courseId = courseId;
    state.handler = (event: RealtimeEvent) => {
      sendJson(ws, { type: "patch", courseId, event });
    };
    subscribeCourseEvents(courseId, state.handler);
    joinRoom(courseId, ws);
    sendJson(ws, { type: "subscribed", courseId });
  });

  ws.on("pong", () => {
    state.lastPongAt = Date.now();
  });

  ws.on("close", () => {
    if (state.courseId && state.handler) {
      unsubscribeCourseEvents(state.courseId, state.handler);
      leaveRoom(state.courseId, ws);
    }
    state.handler = null;
    state.courseId = undefined;
  });

  ws.on("error", (err) => {
    console.error("[websocket-server] client error:", err);
  });

  return state;
}

/**
 * Start the WebSocket server. Safe to call multiple times — returns the
 * existing instance if already started. Throws are caught and logged; in
 * that case getWebSocketServer() returns null and callers degrade to
 * long-polling.
 */
export function startWebSocketServer(port = 3001): WebSocketServer | null {
  if (serverInstance) return serverInstance;
  try {
    const wss = new WebSocketServer({ port });

    wss.on("connection", (ws, req) => {
      const cookieHeader = req.headers.cookie;
      void verifyAuth(cookieHeader).then((ok) => {
        if (!ok) {
          sendJson(ws, { type: "error", code: "UNAUTHORIZED" });
          ws.close(4001, "UNAUTHORIZED");
          return;
        }
        const state = attachClient(ws);

        const pingTimer = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          // Stale connection: haven't received pong within timeout window.
          if (Date.now() - state.lastPongAt > CONNECTION_TIMEOUT_MS) {
            try {
              ws.terminate();
            } catch {
              /* noop */
            }
            return;
          }
          try {
            ws.ping();
          } catch (err) {
            console.error("[websocket-server] ping failed:", err);
          }
        }, PING_INTERVAL_MS);

        ws.on("close", () => {
          clearInterval(pingTimer);
        });
      });
    });

    wss.on("error", (err) => {
      console.error("[websocket-server] server error:", err);
    });

    wss.on("listening", () => {
      console.info(`[websocket-server] listening on port ${port}`);
    });

    serverInstance = wss;
    return wss;
  } catch (err) {
    console.error("[websocket-server] failed to start:", err);
    serverInstance = null;
    return null;
  }
}

/**
 * Returns the running WebSocketServer, or null if it hasn't been started
 * (or failed to start). Used by callers (e.g. session store) to decide
 * whether broadcasting is worthwhile.
 */
export function getWebSocketServer(): WebSocketServer | null {
  return serverInstance;
}

/**
 * Broadcast an arbitrary message to all clients currently subscribed to a
 * given course room. Used by callers that need to push a custom payload
 * (e.g. companion messages, projection updates) outside the event-bus flow.
 */
export function broadcastToCourse(courseId: string, message: unknown): void {
  if (!serverInstance || !courseId) return;
  const room = roomsByCourse.get(courseId);
  if (!room || room.size === 0) return;
  for (const ws of Array.from(room)) {
    sendJson(ws, message);
  }
}
