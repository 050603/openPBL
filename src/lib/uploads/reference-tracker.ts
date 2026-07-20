// File reference tracker for upload management (Stage 6).
//
// Each UploadFile row tracks which uploads (by upload ID) currently reference
// the underlying disk file. When refCount drops to 0 the disk file is removed
// and the DB row is deleted, so unreferenced files do not accumulate.

import { unlink } from "node:fs/promises";
import path from "node:path";
import type { UploadFile } from "@prisma/client";
import { prisma } from "@/lib/db/client";

const dataDir = path.join(process.cwd(), ".openpbl-data", "uploads");

function normalizeRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is string => typeof r === "string");
}

/**
 * Mark `fileId` as referenced by `refBy` (an upload ID). Idempotent — adding
 * the same refBy twice is a no-op. refCount is recomputed from the array
 * length so it never drifts from reality.
 */
export async function incrementRef(fileId: string, refBy: string): Promise<void> {
  const record = await prisma.uploadFile.findUnique({ where: { id: fileId } });
  if (!record) return;
  const refs = normalizeRefs(record.referencedBy);
  if (refs.includes(refBy)) return;
  const nextRefs = [...refs, refBy];
  await prisma.uploadFile.update({
    where: { id: fileId },
    data: {
      referencedBy: nextRefs,
      refCount: nextRefs.length,
    },
  });
}

/**
 * Remove `refBy` from the file's reference list. When the list becomes empty
 * the disk file is unlinked and the DB row is deleted. Missing files on disk
 * (ENOENT) are tolerated — the row is still removed.
 */
export async function decrementRef(fileId: string, refBy: string): Promise<void> {
  const record = await prisma.uploadFile.findUnique({ where: { id: fileId } });
  if (!record) return;
  const refs = normalizeRefs(record.referencedBy);
  const nextRefs = refs.filter((r) => r !== refBy);

  if (nextRefs.length === 0) {
    try {
      await unlink(path.join(dataDir, record.storedName));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
    await prisma.uploadFile.delete({ where: { id: fileId } }).catch(() => undefined);
    return;
  }

  await prisma.uploadFile.update({
    where: { id: fileId },
    data: {
      referencedBy: nextRefs,
      refCount: nextRefs.length,
    },
  });
}

/**
 * Current refCount for a file. Returns 0 when the row does not exist.
 */
export async function getRefCount(fileId: string): Promise<number> {
  const record = await prisma.uploadFile.findUnique({
    where: { id: fileId },
    select: { refCount: true },
  });
  return record?.refCount ?? 0;
}

/**
 * List UploadFile rows with refCount = 0. Useful for diagnosing leaks; the
 * actual cleanup of orphan disk files lives in `./cleanup`.
 */
export async function listOrphans(): Promise<UploadFile[]> {
  return prisma.uploadFile.findMany({ where: { refCount: 0 } });
}
