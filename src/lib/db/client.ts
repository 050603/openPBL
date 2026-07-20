// Prisma client singleton.
// Avoids exhausting DB connections in dev (Next.js hot reload would otherwise
// create a new PrismaClient on every reload).

import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __openPblPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__openPblPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__openPblPrisma = prisma;
}

/**
 * Whether the database layer is configured.
 * When false, callers should fall back to the JSON file store and log a warning.
 */
export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return Boolean(url && url.startsWith("postgres"));
}
