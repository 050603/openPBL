// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unlink } from "node:fs/promises";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  storedNames: [] as string[],
  uploadFileCreate: vi.fn(),
  courseResourceCreate: vi.fn(),
  courseUpdate: vi.fn(),
  courseCount: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth/request-guards", () => ({
  authenticateRequest: vi.fn(async () => ({ claims: { sub: "teacher-1", role: "teacher", sv: 1 } })),
  requireSameOrigin: vi.fn(() => null),
}));

vi.mock("@/lib/auth/distributed-rate-limit", () => ({
  checkDistributedRateLimit: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })),
}));

vi.mock("@/lib/auth/rate-limit", () => ({ rateLimitedResponse: vi.fn() }));

vi.mock("file-type", () => ({
  fileTypeFromBuffer: vi.fn(async () => ({ ext: "png", mime: "image/png" })),
}));

vi.mock("@/lib/db/client", () => ({
  isDatabaseConfigured: () => true,
  prisma: {
    course: { count: mocks.courseCount },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "./route";

const courseId = "course-1";

describe("teacher course resource upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storedNames.length = 0;
    mocks.courseCount.mockResolvedValue(1);
    mocks.uploadFileCreate.mockImplementation(async ({ data }: { data: { storedName: string } }) => {
      mocks.storedNames.push(data.storedName);
      return data;
    });
    mocks.courseResourceCreate.mockResolvedValue({});
    mocks.courseUpdate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      uploadFile: { create: mocks.uploadFileCreate },
      courseResource: { create: mocks.courseResourceCreate },
      course: { update: mocks.courseUpdate },
    }));
  });

  afterEach(async () => {
    await Promise.all(mocks.storedNames.map((storedName) =>
      unlink(path.resolve(".openpbl-data", "uploads", storedName)).catch(() => undefined),
    ));
  });

  it("accepts a legacy string course id and atomically binds the file to the course", async () => {
    const form = new FormData();
    form.append("file", new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], "project.png", { type: "image/png" }));
    form.append("title", "项目图片");
    form.append("courseId", courseId);
    form.append("bindAsCourseResource", "true");
    const request = new Request("http://localhost:3000/api/uploads", {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
      body: form,
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({ title: "项目图片", fileType: "PNG", boundToCourse: true });
    expect(mocks.uploadFileCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ courseId, refCount: 1, referencedBy: [payload.id] }),
    });
    expect(mocks.courseResourceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: payload.id, courseId, title: "项目图片", url: `/api/uploads/${payload.id}` }),
    });
    expect(mocks.courseUpdate).toHaveBeenCalledWith({
      where: { id: courseId },
      data: { version: { increment: 1 } },
    });
  });

  it("returns a diagnosable server error when database binding fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.transaction.mockRejectedValueOnce(new Error("database unavailable"));
    const form = new FormData();
    form.append("file", new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], "project.png", { type: "image/png" }));
    form.append("courseId", courseId);
    form.append("bindAsCourseResource", "true");

    const response = await POST(new Request("http://localhost:3000/api/uploads", {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "x-request-id": "upload-test-500" },
      body: form,
    }));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      code: "UPLOAD_SERVICE_ERROR",
      message: "上传服务暂时不可用，请稍后重试。",
      requestId: "upload-test-500",
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"requestId":"upload-test-500"'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"failureStage":"bind-database"'));
    errorSpy.mockRestore();
  });
});
