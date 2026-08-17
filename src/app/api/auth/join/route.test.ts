// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const prerequisites = vi.hoisted(() => ({
  authConfigured: false,
  databaseConfigured: false,
}));

vi.mock("@/lib/db/client", () => ({
  isDatabaseConfigured: () => prerequisites.databaseConfigured,
}));

vi.mock("@/lib/auth/session", () => ({
  isAuthConfigured: () => prerequisites.authConfigured,
  signStudentToken: vi.fn(),
  STUDENT_COOKIE_NAME: "openpbl_student",
  getAuthCookieOptions: vi.fn(),
}));

vi.mock("@/lib/auth/request-guards", () => ({
  requireSameOrigin: () => null,
}));

vi.mock("@/lib/auth/distributed-rate-limit", () => ({
  checkDistributedRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  getClientIp: () => "127.0.0.1",
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));

vi.mock("@/lib/realtime/event-bus", () => ({
  publishCourseEvent: vi.fn(),
}));

vi.mock("@/lib/db/transaction-retry", () => ({
  runMutationTransaction: vi.fn(),
}));

import { POST } from "./route";

beforeEach(() => {
  prerequisites.authConfigured = false;
  prerequisites.databaseConfigured = false;
});

function joinRequest() {
  return new Request("http://localhost/api/auth/join", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
    },
    body: JSON.stringify({ inviteCode: "A2K9QP", studentName: "小林" }),
  });
}

describe("student join prerequisites", () => {
  it("returns the legacy-compatible auth code when JWT is not configured", async () => {
    const response = await POST(joinRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_NOT_CONFIGURED",
      error: "AUTH_NOT_CONFIGURED",
    });
  });

  it("reports a missing database separately from missing JWT configuration", async () => {
    prerequisites.authConfigured = true;

    const response = await POST(joinRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "DB_NOT_CONFIGURED",
      error: "DB_NOT_CONFIGURED",
    });
  });
});
