// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claims: {
    sub: "student-1",
    role: "student" as const,
    courseId: "11111111-1111-4111-8111-111111111111",
    studentId: "student-1",
    studentName: "测试学生",
    sv: 1,
  },
  getRedisClient: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth/request-guards", () => ({
  authenticateRequest: vi.fn(async () => ({ claims: mocks.claims })),
  requireSameOrigin: vi.fn(() => null),
}));

vi.mock("@/lib/redis/client", () => ({
  getRedisClient: mocks.getRedisClient,
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    student: {
      updateMany: mocks.updateMany,
      findMany: mocks.findMany,
    },
  },
}));

import { DELETE, GET, PUT } from "./route";

const courseId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ courseId }) };

function request(method: string) {
  return new Request(`http://localhost:3000/api/courses/${courseId}/presence`, {
    method,
    headers: { Origin: "http://localhost:3000" },
  });
}

describe("course presence database fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRedisClient.mockResolvedValue(null);
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("persists a student heartbeat when Redis is unavailable", async () => {
    const response = await PUT(request("PUT"), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ online: true, degraded: true, source: "database" });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { courseId, id: "student-1" },
      data: { lastSeenAt: expect.any(String), version: { increment: 1 } },
    });
  });

  it("uses the database when Redis disconnects at runtime", async () => {
    mocks.getRedisClient.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const response = await PUT(request("PUT"), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ online: true, degraded: true, source: "database" });
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
  });

  it("returns only database heartbeats that have not expired", async () => {
    const now = Date.now();
    mocks.findMany.mockResolvedValue([
      { id: "student-1", name: "在线学生", lastSeenAt: new Date(now - 5_000).toISOString() },
      { id: "student-2", name: "离线学生", lastSeenAt: new Date(now - 90_000).toISOString() },
    ]);

    const response = await GET(request("GET"), context);
    const payload = await response.json();

    expect(payload).toMatchObject({ degraded: true, source: "database" });
    expect(payload.members).toEqual([
      { id: "student-1", role: "student", name: "在线学生" },
    ]);
  });

  it("clears the database heartbeat on an explicit leave", async () => {
    const response = await DELETE(request("DELETE"), context);

    expect(response.status).toBe(204);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { courseId, id: "student-1" },
      data: { lastSeenAt: null, version: { increment: 1 } },
    });
  });
});
