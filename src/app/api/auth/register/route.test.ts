// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transactionTeacher = {
    count: vi.fn(),
    create: vi.fn(),
  };
  return {
    teacherCount: vi.fn(),
    transactionTeacher,
    executeRaw: vi.fn(),
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        $executeRaw: vi.fn(),
        teacher: transactionTeacher,
      }),
    ),
    hashPassword: vi.fn(async () => "$argon2id$test"),
    signTeacherToken: vi.fn(async () => ({
      token: "signed-token",
      cookieName: "openpbl_teacher",
      maxAge: 3600,
    })),
    resetRateLimit: vi.fn(async () => undefined),
    readAuthFromRequest: vi.fn(),
    hasCurrentSessionVersion: vi.fn(async () => true),
  };
});

vi.mock("@/lib/db/client", () => ({
  isDatabaseConfigured: () => true,
  prisma: {
    teacher: { count: mocks.teacherCount },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: mocks.hashPassword,
}));

vi.mock("@/lib/auth/session", () => ({
  isAuthConfigured: () => true,
  readAuthFromRequest: mocks.readAuthFromRequest,
  signTeacherToken: mocks.signTeacherToken,
  TEACHER_COOKIE_NAME: "openpbl_teacher",
  getAuthCookieOptions: () => ({
    path: "/",
    maxAge: 3600,
    sameSite: "lax",
    secure: false,
  }),
}));

vi.mock("@/lib/auth/session-version", () => ({
  hasCurrentSessionVersion: mocks.hasCurrentSessionVersion,
}));

vi.mock("@/lib/auth/request-guards", () => ({
  requireSameOrigin: () => null,
}));

vi.mock("@/lib/auth/distributed-rate-limit", () => ({
  checkDistributedRateLimit: async () => ({
    allowed: true,
    remaining: 4,
    retryAfterMs: 0,
  }),
  resetDistributedRateLimit: mocks.resetRateLimit,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  getClientIp: () => "127.0.0.1",
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));

import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    async (callback: (tx: unknown) => unknown) =>
      callback({
        $executeRaw: mocks.executeRaw,
        teacher: mocks.transactionTeacher,
      }),
  );
});

describe("teacher registration route", () => {
  it("requires authentication when a teacher exists", async () => {
    mocks.teacherCount.mockResolvedValue(1);
    mocks.readAuthFromRequest.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/auth/register"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      available: false,
      code: "TEACHER_AUTH_REQUIRED",
    });
  });

  it("allows an authenticated teacher to open account creation", async () => {
    mocks.teacherCount.mockResolvedValue(1);
    mocks.readAuthFromRequest.mockResolvedValue({
      sub: "teacher-1",
      role: "teacher",
      username: "teacher",
      displayName: "王老师",
      sv: 1,
    });

    const response = await GET(
      new Request("http://localhost/api/auth/register"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      available: true,
      mode: "authenticated",
    });
  });

  it("creates and signs in the first teacher", async () => {
    mocks.readAuthFromRequest.mockResolvedValue(null);
    mocks.transactionTeacher.count.mockResolvedValue(0);
    mocks.transactionTeacher.create.mockResolvedValue({
      id: "teacher-1",
      username: "teacher",
      displayName: "王老师",
      sessionVersion: 1,
    });

    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          username: "Teacher",
          displayName: "王老师",
          password: "correct-horse-battery-staple",
          confirmPassword: "correct-horse-battery-staple",
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.clone().json()).resolves.toMatchObject({
      bootstrap: true,
    });
    expect(response.headers.get("set-cookie")).toContain(
      "openpbl_teacher=signed-token",
    );
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.transactionTeacher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: "teacher",
          passwordHash: "$argon2id$test",
        }),
      }),
    );
  });

  it("creates another teacher without replacing the current session", async () => {
    mocks.readAuthFromRequest.mockResolvedValue({
      sub: "teacher-1",
      role: "teacher",
      username: "teacher",
      displayName: "王老师",
      sv: 1,
    });
    mocks.transactionTeacher.count.mockResolvedValue(1);
    mocks.transactionTeacher.create.mockResolvedValue({
      id: "teacher-2",
      username: "teacher.two",
      displayName: "李老师",
      sessionVersion: 1,
    });

    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          username: "teacher.two",
          displayName: "李老师",
          password: "correct-horse-battery-staple",
          confirmPassword: "correct-horse-battery-staple",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      bootstrap: false,
      user: { username: "teacher.two" },
    });
  });

  it("rejects an unauthenticated additional teacher", async () => {
    mocks.readAuthFromRequest.mockResolvedValue(null);
    mocks.transactionTeacher.count.mockResolvedValue(1);

    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          username: "teacher",
          displayName: "王老师",
          password: "correct-horse-battery-staple",
          confirmPassword: "correct-horse-battery-staple",
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "TEACHER_AUTH_REQUIRED",
    });
  });
});
