import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { prisma, isDatabaseConfigured } from "@/lib/db/client";
import { incrementRef } from "@/lib/uploads/reference-tracker";
import {
  uploadLimiter,
  getClientIp,
  rateLimitKey,
  rateLimitedResponse,
} from "@/lib/auth/rate-limit";
import { isAuthConfigured } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataDir = path.join(process.cwd(), ".openpbl-data", "uploads");

// Stage 6: 50 MiB upload cap + MIME/extension whitelist.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".pptx",
  ".xlsx",
  ".mp4",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".doc",
  ".docx",
]);

const EXTENSION_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function POST(request: NextRequest) {
  // Stage 3: rate limit uploads (20/hour/user).
  if (isAuthConfigured()) {
    const ip = getClientIp(request);
    const rl = uploadLimiter.check(rateLimitKey(request, ip));
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);
  }

  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "");
  const courseIdRaw = form.get("courseId");
  const courseId =
    typeof courseIdRaw === "string" && courseIdRaw.length > 0 ? courseIdRaw : null;

  if (!(file instanceof File)) {
    return Response.json({ error: "缺少上传文件" }, { status: 400 });
  }

  // Size cap — checked up front from the parsed File metadata. The streaming
  // write below simply transfers bytes; the parsed `file.size` is the source
  // of truth for the limit because formData has already buffered the headers.
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "FILE_TOO_LARGE" }, { status: 413 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return Response.json({ error: "UNSUPPORTED_FILE_TYPE" }, { status: 415 });
  }

  await mkdir(dataDir, { recursive: true });

  const safeBase = path
    .basename(file.name, ext)
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, "-")
    .slice(0, 80);
  const storedName = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safeBase || "file"}${ext}`;
  const uploadId = `upload-${storedName}`;
  const targetPath = path.join(dataDir, storedName);

  // Stream the incoming File into a write stream. We deliberately avoid
  // `Buffer.from(await file.arrayBuffer())` so 50 MiB videos do not sit
  // entirely in heap. Errors mid-stream (disk full, permission, etc.) leave
  // a partial file behind — the catch block removes it.
  const writeStream = createWriteStream(targetPath);

  try {
    const source = Readable.fromWeb(
      file.stream() as unknown as import("stream/web").ReadableStream<Uint8Array>,
    );
    await pipeline(source, writeStream);
  } catch (err) {
    await unlink(targetPath).catch(() => undefined);
    console.error("[uploads] stream write failed:", err);
    return Response.json({ error: "UPLOAD_FAILED" }, { status: 500 });
  }

  const mimeType = EXTENSION_MIME[ext] ?? (file.type || "application/octet-stream");

  // Persist file metadata + register the initial reference. Skipped in demo
  // mode (no DATABASE_URL) so the upload endpoint stays usable without a DB.
  if (isDatabaseConfigured()) {
    const fileId = randomUUID();
    try {
      await prisma.uploadFile.create({
        data: {
          id: fileId,
          fileName: file.name,
          storedName,
          courseId,
          size: file.size,
          mimeType,
          referencedBy: [],
          refCount: 0,
        },
      });
      await incrementRef(fileId, uploadId);
    } catch (err) {
      // Metadata write is best-effort: the file is already on disk and the
      // client can still download it. Orphan-cleanup will reconcile later.
      console.error("[uploads] metadata write failed:", err);
    }
  }

  return Response.json({
    id: uploadId,
    title: title || file.name,
    fileName: file.name,
    fileType: inferFileType(file.name, file.type),
    size: formatSize(file.size),
    url: `/api/uploads?file=${encodeURIComponent(storedName)}`,
  });
}

export async function GET(request: NextRequest) {
  const fileName = request.nextUrl.searchParams.get("file");
  if (!fileName) {
    return Response.json({ error: "缺少文件名" }, { status: 400 });
  }

  const safeName = path.basename(fileName);
  const target = path.join(dataDir, safeName);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(dataDir))) {
    return Response.json({ error: "非法文件路径" }, { status: 400 });
  }

  let info;
  try {
    info = await stat(resolved);
  } catch {
    return Response.json({ error: "文件不存在" }, { status: 404 });
  }

  const contentType = contentTypeFor(safeName);
  const disposition = `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`;

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const parsed = parseRange(rangeHeader, info.size);
    if (!parsed) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${info.size}`,
        },
      });
    }
    const { start, end } = parsed;
    const stream = createReadStream(resolved, { start, end });
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${info.size}`,
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposition,
      },
    });
  }

  const stream = createReadStream(resolved);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(info.size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": disposition,
    },
  });
}

/**
 * Parse a single-range `Range: bytes=` header. Supports `bytes=a-b`,
 * `bytes=a-` (to EOF) and `bytes=-b` (last b bytes). Returns null on any
 * malformed input so the caller can fall back to 416.
 */
function parseRange(header: string, totalSize: number): { start: number; end: number } | null {
  const trimmed = header.trim();
  if (!trimmed.startsWith("bytes=")) return null;
  const spec = trimmed.slice(6).trim();
  if (!spec) return null;

  // Only the first range is honoured; multipart Range is not supported.
  const first = spec.split(",")[0]?.trim();
  if (!first || !first.includes("-")) return null;

  const [startStr, endStr] = first.split("-");
  const start = startStr ? Number(startStr) : NaN;
  const end = endStr ? Number(endStr) : NaN;

  if (startStr === "" && endStr !== "") {
    // suffix: last N bytes
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const s = Math.max(0, totalSize - suffix);
    return { start: s, end: totalSize - 1 };
  }
  if (!Number.isFinite(start) || start < 0 || start >= totalSize) return null;
  const e = Number.isFinite(end) ? Math.min(end, totalSize - 1) : totalSize - 1;
  if (e < start) return null;
  return { start, end: e };
}

function inferFileType(fileName: string, mime: string): string {
  const ext = path.extname(fileName).replace(".", "").toUpperCase();
  if (ext) return ext;
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("presentation")) return "PPTX";
  if (mime.includes("spreadsheet")) return "XLSX";
  if (mime.includes("video")) return "MP4";
  return "FILE";
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return EXTENSION_MIME[ext] ?? "application/octet-stream";
}
