// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  transaction: vi.fn(),
  resourceDeleteMany: vi.fn(),
  resourceFindFirst: vi.fn(),
  resourceUpdate: vi.fn(),
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
    courseResource: { findFirst: mocks.resourceFindFirst },
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

import { DELETE, GET, PATCH } from "./route";

const uploadId = "11111111-1111-4111-8111-111111111111";
const courseId = "course-1";

describe("DELETE /api/uploads/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({
      id: uploadId,
      courseId,
      uploadedById: "teacher-1",
      fileName: "课堂演示.pptx",
      storedName: `${uploadId}.pdf`,
      previewStoredName: `${uploadId}.classroom.pdf`,
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      previewMimeType: "application/pdf",
    });
    mocks.resourceDeleteMany.mockResolvedValue({ count: 1 });
    mocks.resourceUpdate.mockResolvedValue({});
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

  afterEach(async () => {
    await rm(path.resolve(".openpbl-data", "uploads", `${uploadId}.classroom.pdf`), {
      force: true,
    });
  });

  it("serves the generated PDF for the authenticated classroom variant", async () => {
    const previewPath = path.resolve(".openpbl-data", "uploads", `${uploadId}.classroom.pdf`);
    await mkdir(path.dirname(previewPath), { recursive: true });
    await writeFile(previewPath, "%PDF-1.7\nclassroom-preview", { mode: 0o600 });

    const response = await GET(
      new Request(`http://localhost:3000/api/uploads/${uploadId}?variant=classroom`),
      { params: Promise.resolve({ id: uploadId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(encodeURIComponent("课堂演示-课堂版.pdf"));
    expect(Buffer.from(await response.arrayBuffer()).toString()).toContain("%PDF-1.7");
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
    expect(mocks.unlink).toHaveBeenCalledWith(expect.stringContaining(`${uploadId}.classroom.pdf`));
  });

  it("changes an existing PDF between continuous reading and slide playback", async () => {
    mocks.resourceFindFirst.mockResolvedValue({
      id: uploadId,
      courseId,
      type: "PDF",
      previewType: null,
    });
    mocks.transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      courseResource: { update: mocks.resourceUpdate },
      course: { update: mocks.courseUpdate },
      courseEvent: { create: mocks.courseEventCreate },
    }));

    const response = await PATCH(
      new Request(`http://localhost:3000/api/uploads/${uploadId}`, {
        method: "PATCH",
        headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
        body: JSON.stringify({ displayMode: "slides" }),
      }),
      { params: Promise.resolve({ id: uploadId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: uploadId, displayMode: "slides" });
    expect(mocks.resourceUpdate).toHaveBeenCalledWith({
      where: { id: uploadId },
      data: { displayMode: "slides" },
    });
    expect(mocks.publishCourseEvent).toHaveBeenCalledWith(
      courseId,
      expect.objectContaining({ payload: expect.objectContaining({ eventCursor: "42" }) }),
    );
  });
});
