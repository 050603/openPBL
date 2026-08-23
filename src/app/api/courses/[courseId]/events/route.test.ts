import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/auth/request-guards", () => ({
  authenticateRequest: mocks.authenticateRequest,
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    course: { findUnique: mocks.findUnique },
    courseEvent: { findMany: mocks.findMany, findFirst: mocks.findFirst },
  },
}));
vi.mock("@/lib/observability/http", () => ({
  withHttpMetrics: (_method: string, _route: string, handler: unknown) => handler,
}));

import { GET } from "./route";

describe("course event synchronization feed", () => {
  beforeEach(() => {
    mocks.authenticateRequest.mockResolvedValue({
      claims: {
        sub: "student-2",
        role: "student",
        courseId: "course-1",
        studentId: "student-2",
        studentName: "学生2",
        sv: 1,
      },
    });
    mocks.findMany.mockResolvedValue([
      {
        cursor: BigInt(11),
        type: "UPDATE_STUDENT_PROGRESS",
        actorId: "student-1",
        actorRole: "student",
        courseVersion: 11,
        payload: { studentId: "student-1" },
        createdAt: new Date("2026-08-18T00:00:00.000Z"),
      },
      {
        cursor: BigInt(12),
        type: "UPSERT_ANNOUNCEMENT",
        actorId: "teacher-1",
        actorRole: "teacher",
        courseVersion: 12,
        payload: null,
        createdAt: new Date("2026-08-18T00:00:01.000Z"),
      },
    ]);
    mocks.findUnique.mockResolvedValue({ version: 12 });
    mocks.findFirst.mockResolvedValue({ courseVersion: 12 });
  });

  it("keeps shared teacher changes and advances over filtered peer progress", async () => {
    const response = await GET(
      new Request("http://localhost/api/courses/course-1/events?after=10"),
      { params: Promise.resolve({ courseId: "course-1" }) },
    );
    const body = await response.json() as {
      events: Array<{ type: string }>;
      nextCursor: string;
    };

    expect(body.events.map((event) => event.type)).toEqual(["UPSERT_ANNOUNCEMENT"]);
    expect(body.nextCursor).toBe("12");
  });

  it("requests canonical reconciliation when a course write has no durable event", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.findUnique.mockResolvedValue({ version: 14 });
    mocks.findFirst.mockResolvedValue({ courseVersion: 12 });

    const response = await GET(
      new Request("http://localhost/api/courses/course-1/events?after=12"),
      { params: Promise.resolve({ courseId: "course-1" }) },
    );
    const body = await response.json() as {
      requiresReconciliation: boolean;
      courseVersion: number;
    };

    expect(body.requiresReconciliation).toBe(true);
    expect(body.courseVersion).toBe(14);
  });
});
