// One-shot migration: read .openpbl-data/session.json and persist every course
// to the PostgreSQL database via the session repository.
//
// Usage: `pnpm tsx scripts/migrate-json-to-db.ts`
//
// After successful migration, the JSON file is renamed to `session.json.migrated.bak`
// so subsequent server starts use the database.

import { readFile, rename, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma, isDatabaseConfigured } from "../src/lib/db/client";
import { saveCourse, loadSessionState } from "../src/lib/db/session-repository";
import type { SessionState } from "../src/lib/session/actions";
import type { Course } from "../src/lib/session/types";

const DATA_DIR = path.join(process.cwd(), ".openpbl-data");
const SESSION_FILE = path.join(DATA_DIR, "session.json");
const MIGRATED_BAK = path.join(DATA_DIR, "session.json.migrated.bak");

async function main() {
  if (!isDatabaseConfigured()) {
    console.error("DATABASE_URL is not set. Export it before running this script.");
    process.exit(1);
  }

  if (!existsSync(SESSION_FILE)) {
    console.log("No session.json found — nothing to migrate.");
    return;
  }

  console.log(`Reading ${SESSION_FILE}...`);
  const raw = await readFile(SESSION_FILE, "utf8");
  const parsed = JSON.parse(raw) as SessionState;

  const courses = parsed.courses ?? [];
  console.log(`Found ${courses.length} course(s) to migrate.`);

  // Verify DB connectivity
  await prisma.$connect();
  console.log("Database connected.");

  // Ensure SessionMeta singleton exists
  await prisma.sessionMeta.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      joinedCourseId: parsed.joinedCourseId ?? null,
      userRole: parsed.user?.role ?? "teacher",
      userName: parsed.user?.name ?? "教师",
      studentId: parsed.studentId ?? null,
      studentName: parsed.studentName ?? null,
    },
    update: {
      joinedCourseId: parsed.joinedCourseId ?? null,
      userRole: parsed.user?.role ?? "teacher",
      userName: parsed.user?.name ?? "教师",
      studentId: parsed.studentId ?? null,
      studentName: parsed.studentName ?? null,
    },
  });

  let migrated = 0;
  let failed = 0;
  for (const course of courses) {
    try {
      await saveCourse(course as Course);
      migrated++;
      console.log(`  ✓ ${course.id} — ${course.name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${course.id} — ${course.name}`);
      console.error(`    ${(err as Error).message}`);
    }
  }

  console.log(`\nMigration complete: ${migrated} succeeded, ${failed} failed.`);

  // Verify
  const state = await loadSessionState();
  if (state.courses.length !== courses.length) {
    console.warn(
      `Warning: expected ${courses.length} courses in DB but found ${state.courses.length}.`,
    );
  } else {
    console.log(`Verified: ${state.courses.length} course(s) in database.`);

    // Rename JSON file to mark as migrated
    if (existsSync(MIGRATED_BAK)) {
      console.log(`${MIGRATED_BAK} already exists; overwriting.`);
    }
    await rename(SESSION_FILE, MIGRATED_BAK);
    // Write a tiny marker file so server-store.ts knows migration is done
    await writeFile(
      SESSION_FILE,
      JSON.stringify({ migrated: true, migratedAt: new Date().toISOString() }, null, 2),
      "utf8",
    );
    console.log(`Renamed original to ${MIGRATED_BAK}.`);
  }

  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
