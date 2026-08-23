// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  transaction: vi.fn(),
  resourceDeleteMany: vi.fn(),
  uploadUpdate: vi.fn(),
  courseUpdate: vi.fn(),
  courseEventCreate: vi.fn(),
  publishCourseEvent: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("@/lib/auth/request-guards", () => ({
  authenticateRequest: vi.fn(async () => ({ claims: { sub: "teacher-1", role: "teacher", sv: 1 } })),
  requireSameOrigin: vi.fn(() => null),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    uploadFile: { findFirst: mocks.findFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/realtime/event-bus", () => ({
  publishCourseEvent: mocks.publishCourseEvent,
}));

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  unlink: mocks.unlink,
}));

import { DELETE } from "./route";

const uploadId = "11111111-1111-4111-8111-111111111111";
const courseId = "course-1";

describe("DELETE /api/uploads/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({
      id: uploadId,
      courseId,
      uploadedById: "teacher-1",
      storedName: `${uploadId}.pdf`,
    });
    mocks.resourceDeleteMany.mockResolvedValue({ count: 1 });
    mocks.uploadUpdate.mockResolvedValue({});
    mocks.courseUpdate.mockResolvedValue({ version: 8 });
    mocks.courseEventCreate.mockResolvedValue({ cursor: BigInt(42), courseVersion: 8 });
    mocks.publishCourseEvent.mockResolvedValue(undefined);
    mocks.unlink.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      courseResource: { deleteMany: mocks.resourceDeleteMany },
      uploadFile: { update: mocks.uploadUpdate },
      course: { update: mocks.courseUpdate },
      courseEvent: { create: mocks.courseEventCreate },
    }));
  });

  it("removes the course binding, retires the upload record and deletes the disk file", async () => {
    const response = await DELETE(
      new Request(`http://localhost:3000/api/uploads/${uploadId}`, {
        method: "DELETE",
        headers: { Origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: uploadId }) },
    );

    expect(response.status).toBe(204);
    expect(mocks.resourceDeleteMany).toHaveBeenCalledWith({ where: { id: uploadId, courseId } });
    expect(mocks.uploadUpdate).toHaveBeenCalledWith({
      where: { id: uploadId },
      data: { deletedAt: expect.any(Date), referencedBy: [], refCount: 0 },
    });
    expect(mocks.courseUpdate).toHaveBeenCalledWith({
      where: { id: courseId },
      data: { version: { increment: 1 } },
      select: { version: true },
    });
    expect(mocks.courseEventCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ courseId, courseVersion: 8 }),
    }));
    expect(mocks.publishCourseEvent).toHaveBeenCalledWith(
      courseId,
      expect.objectContaining({ payload: expect.objectContaining({ eventCursor: "42" }) }),
    );
    expect(mocks.unlink).toHaveBeenCalledWith(expect.stringContaining(`${uploadId}.pdf`));
  });
});
