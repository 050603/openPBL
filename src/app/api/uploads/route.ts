import { randomUUID } from "node:crypto";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { prisma, isDatabaseConfigured } from "@/lib/db/client";
import { authenticateRequest, requireSameOrigin } from "@/lib/auth/request-guards";
import { checkDistributedRateLimit } from "@/lib/auth/distributed-rate-limit";
import { rateLimitedResponse } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataDir = process.env.UPLOAD_DIR?.trim() || path.resolve(".openpbl-data", "uploads");
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;

const UploadFieldsSchema = z.object({
  title: z.string().trim().max(200).optional(),
  courseId: z.string().trim().min(1).max(128).optional(),
  bindAsCourseResource: z.literal("true").optional(),
});

const ALLOWED_TYPES: Record<string, { detected: string[]; mime: string }> = {
  ".pdf": { detected: ["pdf"], mime: "application/pdf" },
  ".pptx": {
    detected: ["pptx"],
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  ".xlsx": {
    detected: ["xlsx"],
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  ".docx": {
    detected: ["docx"],
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  ".doc": { detected: ["doc"], mime: "application/msword" },
  ".mp4": { detected: ["mp4", "m4v"], mime: "video/mp4" },
  ".png": { detected: ["png"], mime: "image/png" },
  ".jpg": { detected: ["jpg"], mime: "image/jpeg" },
  ".jpeg": { detected: ["jpg"], mime: "image/jpeg" },
  ".webp": { detected: ["webp"], mime: "image/webp" },
};

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;
  if (!isDatabaseConfigured()) {
    return apiError(requestId, "DATABASE_REQUIRED", "上传功能需要连接数据库。", 503);
  }

  const limit = await checkDistributedRateLimit({
    namespace: "upload",
    key: auth.claims.sub ?? "unknown",
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterMs);

  const contentLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return apiError(requestId, "FILE_TOO_LARGE", "单个文件不能超过 50 MiB。", 413);
  }
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data")) {
    return apiError(requestId, "INVALID_CONTENT_TYPE", "请求必须使用 multipart/form-data。", 415);
  }

  let targetPath: string | null = null;
  let failureStage = "parse-form-data";
  try {
    const form = await request.formData().catch(() => {
      throw new UploadHttpError("INVALID_MULTIPART", "无法解析上传内容，请重新选择文件后重试。", 400);
    });
    const files = form.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File)) {
      throw new UploadHttpError("FILE_REQUIRED", "请选择一个文件上传。", 400);
    }

    const file = files[0];
    const originalName = path.basename(file.name).normalize("NFC");
    const extension = path.extname(originalName).toLowerCase();
    const expected = ALLOWED_TYPES[extension];
    if (!expected) {
      throw new UploadHttpError("UNSUPPORTED_FILE", "暂不支持该文件格式。", 415);
    }
    if (file.size <= 0) {
      throw new UploadHttpError("EMPTY_FILE", "不能上传空文件。", 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new UploadHttpError("FILE_TOO_LARGE", "单个文件不能超过 50 MiB。", 413);
    }

    failureStage = "validate-metadata";
    const rawFields = {
      title: getOptionalText(form, "title"),
      courseId: getOptionalText(form, "courseId"),
      bindAsCourseResource: getOptionalText(form, "bindAsCourseResource"),
    };
    const parsedFields = UploadFieldsSchema.safeParse(rawFields);
    if (!parsedFields.success) {
      throw new UploadHttpError("INVALID_METADATA", "课程或文件信息无效，请刷新页面后重试。", 400);
    }

    const courseId = parsedFields.data.courseId ?? null;
    const bindAsCourseResource = parsedFields.data.bindAsCourseResource === "true";
    if (bindAsCourseResource && auth.claims.role !== "teacher") {
      throw new UploadHttpError("FORBIDDEN", "只有教师可以发布课程资源。", 403);
    }
    if (bindAsCourseResource && !courseId) {
      throw new UploadHttpError("COURSE_REQUIRED", "发布课程资源时必须指定课程。", 400);
    }
    if (auth.claims.role === "student" && (!courseId || courseId !== auth.claims.courseId)) {
      throw new UploadHttpError("FORBIDDEN", "学生只能向当前课程上传文件。", 403);
    }
    if (courseId) {
      const courseExists = await prisma.course.count({ where: { id: courseId } });
      if (courseExists !== 1) {
        throw new UploadHttpError("COURSE_NOT_FOUND", "课程不存在或已被删除。", 404);
      }
    }

    failureStage = "inspect-file";
    const bytes = Buffer.from(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(bytes).catch(() => null);
    if (!detected || !expected.detected.includes(detected.ext)) {
      throw new UploadHttpError("FILE_SIGNATURE_MISMATCH", "文件内容与扩展名不匹配，可能是文件已损坏或仅修改了后缀名。", 415);
    }

    const id = randomUUID();
    const storedName = `${id}${extension}`;
    targetPath = path.join(dataDir, storedName);
    failureStage = "write-file";
    await mkdir(/* turbopackIgnore: true */ dataDir, { recursive: true });
    await writeFile(/* turbopackIgnore: true */ targetPath, bytes, {
      flag: "wx",
      mode: 0o600,
    });
    const info = await stat(/* turbopackIgnore: true */ targetPath);
    if (info.size <= 0 || info.size > MAX_UPLOAD_BYTES) {
      throw new UploadHttpError("INVALID_FILE_SIZE", "文件大小无效。", 413);
    }

    const title = parsedFields.data.title || originalName;
    const fileType = extension.slice(1).toUpperCase();
    const formattedSize = formatSize(info.size);
    const url = `/api/uploads/${id}`;
    failureStage = "bind-database";
    await prisma.$transaction(async (tx) => {
      await tx.uploadFile.create({
        data: {
          id,
          fileName: originalName,
          storedName,
          courseId,
          uploadedById: auth.claims.sub!,
          uploadedByRole: auth.claims.role,
          size: info.size,
          mimeType: expected.mime,
          referencedBy: bindAsCourseResource ? [id] : [],
          refCount: bindAsCourseResource ? 1 : 0,
        },
      });
      if (bindAsCourseResource && courseId) {
        await tx.courseResource.create({
          data: {
            id,
            courseId,
            title,
            type: fileType,
            size: formattedSize,
            description: "教师在项目启动阶段补充的课程资源",
            url,
            downloadedBy: [],
          },
        });
        await tx.course.update({
          where: { id: courseId },
          data: { version: { increment: 1 } },
        });
      }
    });

    return Response.json(
      { id, title, fileName: originalName, fileType, size: formattedSize, url, boundToCourse: bindAsCourseResource },
      { status: 201, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    if (targetPath) {
      await unlink(/* turbopackIgnore: true */ targetPath).catch(() => undefined);
    }
    if (error instanceof UploadHttpError) {
      return apiError(requestId, error.code, error.message, error.status);
    }
    const detail = serializeUploadError(error);
    console.error(`[uploads] Unexpected upload failure ${JSON.stringify({ requestId, failureStage, ...detail })}`);
    return apiError(requestId, "UPLOAD_SERVICE_ERROR", "上传服务暂时不可用，请稍后重试。", 500);
  }
}

class UploadHttpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function getOptionalText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function serializeUploadError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { error: String(error) };
  const databaseError = error as Error & { code?: string; meta?: unknown };
  return {
    name: databaseError.name,
    message: databaseError.message,
    code: databaseError.code,
    meta: databaseError.meta,
  };
}

function apiError(requestId: string, code: string, message: string, status: number): Response {
  return Response.json(
    { code, message, requestId },
    { status, headers: { "x-request-id": requestId } },
  );
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
