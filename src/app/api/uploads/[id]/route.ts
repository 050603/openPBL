import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { authenticateRequest, requireSameOrigin } from "@/lib/auth/request-guards";
import type { AuthClaims } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().uuid() });
const dataDir =
  process.env.UPLOAD_DIR?.trim() ||
  path.resolve(".openpbl-data", "uploads");

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;
  const parsed = ParamsSchema.safeParse(await context.params);
  if (!parsed.success) return new Response(null, { status: 404 });

  const file = await prisma.uploadFile.findFirst({
    where: { id: parsed.data.id, deletedAt: null },
  });
  if (!file || !canAccess(auth.claims, file.courseId, file.uploadedById)) {
    return new Response(null, { status: 404 });
  }
  if (path.basename(file.storedName) !== file.storedName) return new Response(null, { status: 404 });
  const target = path.join(dataDir, file.storedName);
  let info;
  try {
    info = await stat(/* turbopackIgnore: true */ target);
  } catch {
    return new Response(null, { status: 404 });
  }

  const range = parseRange(request.headers.get("range"), info.size);
  if (request.headers.has("range") && !range) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${info.size}` },
    });
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? info.size - 1;
  const stream = createReadStream(/* turbopackIgnore: true */ target, { start, end });
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${info.size}` } : {}),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;
  const parsed = ParamsSchema.safeParse(await context.params);
  if (!parsed.success) return new Response(null, { status: 404 });
  const file = await prisma.uploadFile.findFirst({
    where: { id: parsed.data.id, deletedAt: null },
  });
  if (!file || (auth.claims.role !== "teacher" && file.uploadedById !== auth.claims.sub)) {
    return new Response(null, { status: 404 });
  }
  if (path.basename(file.storedName) !== file.storedName) {
    return new Response(null, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    const removedResource = await tx.courseResource.deleteMany({
      where: { id: file.id, ...(file.courseId ? { courseId: file.courseId } : {}) },
    });
    await tx.uploadFile.update({
      where: { id: file.id },
      data: { deletedAt: new Date(), referencedBy: [], refCount: 0 },
    });
    if (file.courseId && removedResource.count > 0) {
      await tx.course.update({
        where: { id: file.courseId },
        data: { version: { increment: 1 } },
      });
    }
  });
  await unlink(
    /* turbopackIgnore: true */ path.join(dataDir, file.storedName),
  ).catch((error) => {
    console.warn("[uploads] Resource metadata deleted but disk cleanup failed", {
      uploadId: file.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  return new Response(null, { status: 204 });
}

function canAccess(
  claims: AuthClaims,
  courseId: string | null,
  uploadedById: string,
): boolean {
  if (claims.role === "teacher") return true;
  if (claims.sub === uploadedById) return true;
  return !!courseId && claims.courseId === courseId;
}

function parseRange(
  header: string | null,
  totalSize: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, totalSize - suffix), end: totalSize - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : totalSize - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= totalSize ||
    end < start
  ) {
    return null;
  }
  return { start, end: Math.min(end, totalSize - 1) };
}
