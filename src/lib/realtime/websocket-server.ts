import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import {
  STUDENT_COOKIE_NAME,
  TEACHER_COOKIE_NAME,
  verifyToken,
  type AuthClaims,
  type AuthRole,
} from "@/lib/auth/session";
import {
  subscribeCourseEvents,
  unsubscribeCourseEvents,
  type RealtimeEvent,
  type RealtimeEventHandler,
} from "./event-bus";

const PING_INTERVAL_MS = 30_000;
const CONNECTION_TIMEOUT_MS = 90_000;
let serverInstance: WebSocketServer | null = null;

interface ClientState {
  claims: AuthClaims;
  courseId?: string;
  handler?: RealtimeEventHandler;
  lastPongAt: number;
}

function readCookie(headerValue: string | undefined, name: string): string | null {
  for (const part of (headerValue ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function requestedRole(req: IncomingMessage): AuthRole | null {
  const url = new URL(req.url ?? "/", "http://websocket.internal");
  const role = url.searchParams.get("role");
  return role === "teacher" || role === "student" ? role : null;
}

async function authenticate(req: IncomingMessage): Promise<AuthClaims | null> {
  const role = requestedRole(req);
  if (!role) return null;
  const cookieName = role === "teacher" ? TEACHER_COOKIE_NAME : STUDENT_COOKIE_NAME;
  const token = readCookie(req.headers.cookie, cookieName);
  if (!token) return null;
  const claims = await verifyToken(token);
  return claims?.role === role ? claims : null;
}

function sendJson(ws: WebSocket, message: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function parseCourseId(raw: WebSocket.RawData): string | null {
  try {
    const message = JSON.parse(raw.toString("utf8")) as {
      type?: unknown;
      courseId?: unknown;
    };
    return message.type === "subscribe" &&
      typeof message.courseId === "string" &&
      message.courseId.length > 0
      ? message.courseId
      : null;
  } catch {
    return null;
  }
}

function canSubscribe(claims: AuthClaims, courseId: string): boolean {
  return claims.role === "teacher" || claims.courseId === courseId;
}

function unsubscribe(state: ClientState): void {
  if (state.courseId && state.handler) {
    unsubscribeCourseEvents(state.courseId, state.handler);
  }
  state.courseId = undefined;
  state.handler = undefined;
}

function attachClient(ws: WebSocket, claims: AuthClaims): void {
  const state: ClientState = { claims, lastPongAt: Date.now() };

  ws.on("message", (raw) => {
    const courseId = parseCourseId(raw);
    if (!courseId) {
      sendJson(ws, { type: "error", code: "INVALID_MESSAGE" });
      return;
    }
    if (!canSubscribe(state.claims, courseId)) {
      sendJson(ws, { type: "error", code: "COURSE_FORBIDDEN" });
      ws.close(4003, "COURSE_FORBIDDEN");
      return;
    }

    unsubscribe(state);
    state.courseId = courseId;
    state.handler = (event: RealtimeEvent) => {
      sendJson(ws, {
        type: "course-invalidated",
        courseId,
        version: event.at,
        reason: event.type,
      });
    };
    subscribeCourseEvents(courseId, state.handler);
    sendJson(ws, { type: "subscribed", courseId });
  });

  ws.on("pong", () => {
    state.lastPongAt = Date.now();
  });
  ws.on("close", () => unsubscribe(state));
  ws.on("error", (error) => console.error("[websocket-server] client error:", error));

  const pingTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - state.lastPongAt > CONNECTION_TIMEOUT_MS) {
      ws.terminate();
      return;
    }
    ws.ping();
  }, PING_INTERVAL_MS);
  pingTimer.unref?.();
  ws.once("close", () => clearInterval(pingTimer));
}

export function startWebSocketServer(port = 3001): WebSocketServer {
  if (serverInstance) return serverInstance;
  const server = new WebSocketServer({ port });
  server.on("connection", (ws, req) => {
    void authenticate(req).then((claims) => {
      if (!claims) {
        sendJson(ws, { type: "error", code: "UNAUTHORIZED" });
        ws.close(4001, "UNAUTHORIZED");
        return;
      }
      attachClient(ws, claims);
    });
  });
  server.on("error", (error) => console.error("[websocket-server] server error:", error));
  server.on("listening", () =>
    console.info(`[websocket-server] listening on port ${port}`),
  );
  serverInstance = server;
  return server;
}

export function getWebSocketServer(): WebSocketServer | null {
  return serverInstance;
}

export async function closeWebSocketServer(): Promise<void> {
  const server = serverInstance;
  serverInstance = null;
  if (!server) return;
  for (const client of server.clients) client.close(1001, "SERVER_SHUTDOWN");
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
