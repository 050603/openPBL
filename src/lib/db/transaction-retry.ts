import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

const MAX_ATTEMPTS = 5;

/**
 * Run a short PostgreSQL mutation transaction with bounded retries.
 *
 * Callers acquire a narrow advisory lock (course, invite code, or bootstrap)
 * as their first statement. READ COMMITTED then observes fresh data after a
 * waiter obtains that lock, while unique constraints and mutation receipts
 * preserve idempotency. Deadlocks and database serialization errors remain
 * retryable as a final safety net.
 */
export async function runMutationTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      });
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isRetryableTransactionError(error)) {
        throw error;
      }
      await delay(retryDelayMs(attempt));
    }
  }
}

export function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  if (error.code !== "P2010") return false;

  const databaseCode =
    error.meta && typeof error.meta === "object" && "code" in error.meta
      ? String(error.meta.code)
      : "";
  return databaseCode === "40001" || databaseCode === "40P01";
}

function retryDelayMs(attempt: number): number {
  const base = Math.min(10 * 2 ** (attempt - 1), 80);
  return base + Math.floor(Math.random() * base);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
