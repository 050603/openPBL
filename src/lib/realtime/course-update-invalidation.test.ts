import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  publishCourseEvent: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: { courseEvent: { create: mocks.create } },
}));
vi.mock("@/lib/realtime/event-bus", () => ({
  publishCourseEvent: mocks.publishCourseEvent,
}));

import { persistCourseUpdateInvalidation } from "./course-update-invalidation";

describe("durable direct course update invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ cursor: BigInt(42) });
    mocks.publishCourseEvent.mockResolvedValue(undefined);
  });

  it("writes a cursor before publishing the low-latency notification", async () => {
    await expect(persistCourseUpdateInvalidation({
      courseId: "course-1",
      courseVersion: 8,
      updatedAt: "2026-08-20T00:00:00.000Z",
    })).resolves.toBe("42");

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ courseId: "course-1", courseVersion: 8 }),
    }));
    expect(mocks.publishCourseEvent).toHaveBeenCalledWith(
      "course-1",
      expect.objectContaining({
        payload: expect.objectContaining({ eventCursor: "42" }),
      }),
    );
  });

  it("marks student-owned updates so peers do not refresh", async () => {
    await persistCourseUpdateInvalidation({
      courseId: "course-1",
      courseVersion: 9,
      updatedAt: "2026-08-20T00:00:00.000Z",
      targetStudentId: "student-1",
    });

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({ scope: "student", studentId: "student-1" }),
      }),
    }));
    expect(mocks.publishCourseEvent).toHaveBeenCalledWith(
      "course-1",
      expect.objectContaining({
        payload: expect.objectContaining({ scope: "student", studentId: "student-1" }),
      }),
    );
  });
});
