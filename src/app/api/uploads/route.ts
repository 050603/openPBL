import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import Busboy, { type BusboyFileStream } from "@fastify/busboy";
import { fileTypeFromFile } from "file-type";
import { z } from "zod";
import { prisma, isDatabaseConfigured } from "@/lib/db/client";
import { authenticateRequest, requireSameOrigin } from "@/lib/auth/request-guards";
import { checkDistributedRateLimit } from "@/lib/auth/distributed-rate-limit";
import { rateLimitedResponse } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataDir =
  process.env.UPLOAD_DIR?.trim() ||
  path.resolve(".openpbl-data", "uploads");
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;

const UploadFieldsSchema = z.object({
  title: z.string().trim().max(200).optional(),
  courseId: z.string().uuid().optional(),
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

type PendingFile = {
  id: string;
  originalName: string;
  storedName: string;
  targetPath: string;
  extension: string;
  stream: BusboyFileStream;
  write: Promise<void>;
};

export async function POST(request: Request) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;
  if (!isDatabaseConfigured()) {
    return apiError(request, "DATABASE_REQUIRED", "Uploads require the production database.", 503);
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
    return apiError(request, "FILE_TOO_LARGE", "Upload exceeds 50 MiB.", 413);
  }
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data") || !request.body) {
    return apiError(request, "INVALID_CONTENT_TYPE", "Expected multipart/form-data.", 415);
  }

  await mkdir(/* turbopackIgnore: true */ dataDir, { recursive: true });
  const fields: Record<string, string> = {};
  let pending: PendingFile | null = null;
  let parseError: Error | null = null;
  const parser = Busboy({
    headers: { "content-type": contentType },
    limits: {
      files: 1,
      fields: 4,
      parts: 5,
      fieldNameSize: 64,
      fieldSize: 1_024,
      fileSize: MAX_UPLOAD_BYTES,
      headerPairs: 64,
      headerSize: 16 * 1024,
    },
  });

  parser.on("field", (name, value, _nameTruncated, valueTruncated) => {
    if (valueTruncated) parseError = new Error("Form field is too large.");
    if (name === "title" || name === "courseId") fields[name] = value;
  });
  parser.on("file", (fieldName, stream, filename) => {
    if (pending || fieldName !== "file") {
      parseError = new Error("Exactly one file field is required.");
      stream.resume();
      return;
    }
    const originalName = path.basename(filename).normalize("NFC");
    const extension = path.extname(originalName).toLowerCase();
    if (!ALLOWED_TYPES[extension]) {
      parseError = new Error("Unsupported file extension.");
      stream.resume();
      return;
    }
    const id = randomUUID();
    const storedName = `${id}${extension}`;
    const targetPath = path.join(dataDir, storedName);
    stream.once("limit", () => {
      parseError = new Error("Upload exceeds 50 MiB.");
    });
    pending = {
      id,
      originalName,
      storedName,
      targetPath,
      extension,
      stream,
      write: pipeline(
        stream,
        createWriteStream(/* turbopackIgnore: true */ targetPath, {
          flags: "wx",
          mode: 0o600,
        }),
      ),
    };
  });
  parser.on("filesLimit", () => {
    parseError = new Error("Only one file is allowed.");
  });
  parser.on("fieldsLimit", () => {
    parseError = new Error("Too many form fields.");
  });
  parser.on("partsLimit", () => {
    parseError = new Error("Too many multipart sections.");
  });

  try {
    const input = Readable.fromWeb(
      request.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>,
    );
    await pipeline(input, parser);
    const completed = pending as PendingFile | null;
    if (completed) await completed.write;
    if (parseError) throw parseError;
    if (!completed) throw new Error("Missing file.");
    if (completed.stream.truncated) throw new Error("Upload exceeds 50 MiB.");

    const parsedFields = UploadFieldsSchema.safeParse(fields);
    if (!parsedFields.success) throw new Error("Invalid upload metadata.");
    const courseId = parsedFields.data.courseId ?? null;
    if (
      auth.claims.role === "student" &&
      (!courseId || courseId !== auth.claims.courseId)
    ) {
      throw new UploadHttpError("FORBIDDEN", "Students may upload only to their course.", 403);
    }
    if (courseId) {
      const courseExists = await prisma.course.count({ where: { id: courseId } });
      if (courseExists !== 1) throw new UploadHttpError("COURSE_NOT_FOUND", "Course not found.", 404);
    }

    const detected = await fileTypeFromFile(completed.targetPath);
    const expected = ALLOWED_TYPES[completed.extension];
    if (!detected || !expected.detected.includes(detected.ext)) {
      throw new UploadHttpError(
        "FILE_SIGNATURE_MISMATCH",
        "File contents do not match the extension.",
        415,
      );
    }
    const info = await stat(/* turbopackIgnore: true */ completed.targetPath);
    if (info.size <= 0 || info.size > MAX_UPLOAD_BYTES) {
      throw new UploadHttpError("FILE_TOO_LARGE", "Invalid upload size.", 413);
    }

    await prisma.uploadFile.create({
      data: {
        id: completed.id,
        fileName: completed.originalName,
        storedName: completed.storedName,
        courseId,
        uploadedById: auth.claims.sub!,
        uploadedByRole: auth.claims.role,
        size: info.size,
        mimeType: expected.mime,
        referencedBy: [],
        refCount: 0,
      },
    });

    return Response.json(
      {
        id: completed.id,
        title: parsedFields.data.title || completed.originalName,
        fileName: completed.originalName,
        fileType: completed.extension.slice(1).toUpperCase(),
        size: formatSize(info.size),
        url: `/api/uploads/${completed.id}`,
      },
      { status: 201 },
    );
  } catch (error) {
    const failed = pending as PendingFile | null;
    if (failed) {
      await unlink(/* turbopackIgnore: true */ failed.targetPath).catch(() => undefined);
    }
    if (error instanceof UploadHttpError) {
      return apiError(request, error.code, error.message, error.status);
    }
    const message = error instanceof Error ? error.message : "Upload failed.";
    const tooLarge = message.includes("50 MiB");
    return apiError(
      request,
      tooLarge ? "FILE_TOO_LARGE" : "INVALID_UPLOAD",
      tooLarge ? "Upload exceeds 50 MiB." : "The uploaded file is invalid.",
      tooLarge ? 413 : 400,
    );
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

function apiError(request: Request, code: string, message: string, status: number): Response {
  return Response.json(
    { code, message, requestId: request.headers.get("x-request-id") ?? "unknown" },
    { status },
  );
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
