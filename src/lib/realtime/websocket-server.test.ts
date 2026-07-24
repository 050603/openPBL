// @vitest-environment node

import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signStudentToken } from "@/lib/auth/session";
import {
  __resetEventBusForTests,
  publishCourseEvent,
} from "./event-bus";
import {
  closeWebSocketServer,
  startWebSocketServer,
} from "./websocket-server";

const JWT_SECRET = "test-secret-that-is-longer-than-thirty-two-characters";

describe("realtime WebSocket authorization", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    __resetEventBusForTests();
  });

  afterEach(async () => {
    await closeWebSocketServer();
    delete process.env.JWT_SECRET;
  });

  it("delivers invalidations for the signed student course and rejects another course", async () => {
    const server = startWebSocketServer(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing WebSocket port");

    const { token, cookieName } = await signStudentToken({
      courseId: "course-allowed",
      studentId: "student-1",
      studentName: "Student",
    });
    const headers = { Cookie: `${cookieName}=${encodeURIComponent(token)}` };

    const allowed = new WebSocket(
      `ws://127.0.0.1:${address.port}/ws?role=student`,
      { headers },
    );
    await new Promise<void>((resolve, reject) => {
      allowed.once("open", resolve);
      allowed.once("error", reject);
    });
    const subscribed = waitForMessage(allowed, "subscribed");
    allowed.send(JSON.stringify({ type: "subscribe", courseId: "course-allowed" }));
    await subscribed;

    const invalidation = waitForMessage(allowed, "course-invalidated");
    await publishCourseEvent("course-allowed", {
      type: "course-updated",
      courseId: "course-allowed",
      at: "2026-07-23T00:00:00.000Z",
    });
    expect(await invalidation).toMatchObject({
      courseId: "course-allowed",
      version: "2026-07-23T00:00:00.000Z",
    });
    allowed.close();

    const forbidden = new WebSocket(
      `ws://127.0.0.1:${address.port}/ws?role=student`,
      { headers },
    );
    await new Promise<void>((resolve, reject) => {
      forbidden.once("open", resolve);
      forbidden.once("error", reject);
    });
    const forbiddenError = waitForMessage(forbidden, "error");
    forbidden.send(JSON.stringify({ type: "subscribe", courseId: "course-other" }));
    expect(await forbiddenError).toMatchObject({
      code: "COURSE_FORBIDDEN",
    });
  });
});

function waitForMessage(
  socket: WebSocket,
  type: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2_000);
    const onMessage = (raw: WebSocket.RawData) => {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (message.type !== type) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message);
    };
    socket.on("message", onMessage);
  });
}
