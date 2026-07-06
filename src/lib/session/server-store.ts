import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { applySessionAction, initialSessionState } from "./actions";
import type { SessionAction, SessionState } from "./actions";
import { makeSeedCourses } from "./seed";
import type { Course } from "./types";

const DATA_DIR = path.join(process.cwd(), ".openpbl-data");
const SESSION_FILE = path.join(DATA_DIR, "session.json");
const SESSION_FILE_TMP = path.join(DATA_DIR, "session.json.tmp");

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

function seededState(): SessionState {
  return {
    ...initialSessionState(),
    courses: makeSeedCourses(),
    hydrated: true,
    updatedAt: new Date().toISOString(),
  };
}

// Read the persisted session state.
// If the file is missing or corrupt we fall back to seed data, but ONLY
// when the file genuinely does not exist yet. Transient read failures
// (e.g. the file is being atomically renamed by a concurrent write on
// Windows) are retried instead of silently replacing real state with
// seed data, which previously caused the "course disappears" bug.
export async function readSessionState(): Promise<SessionState> {
  await ensureDataDir();

  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 50;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const raw = await readFile(SESSION_FILE, "utf8");
      const parsed = JSON.parse(raw) as SessionState;
      return {
        ...seededState(),
        ...parsed,
        hydrated: true,
        courses: parsed.courses ?? [],
      };
    } catch (err) {
      // If the file simply does not exist yet, seed it for the first time.
      if (!existsSync(SESSION_FILE)) {
        const initial = seededState();
        await writeSessionState(initial);
        return initial;
      }
      // Transient failure (file locked mid-write on Windows, partial JSON
      // from a concurrent rename, etc.) - wait briefly and retry.
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      // Last resort: return seed state without throwing, so the
      // server does not crash. The serialization queue below ensures
      // we rarely reach this point.
      console.error("[server-store] readSessionState exhausted retries:", err);
      return seededState();
    }
  }

  return seededState();
}

// Atomically write the session state.
// Writes to a temp file first, then renames it to the final path.
// This prevents concurrent readers from seeing a half-written file
// (which previously caused JSON parse errors and seed-state fallback
// leading to loss of all real course data).
export async function writeSessionState(state: SessionState): Promise<void> {
  await ensureDataDir();
  const payload = JSON.stringify({ ...state, hydrated: true }, null, 2);
  // Write to temp file, then atomically rename.
  await writeFile(SESSION_FILE_TMP, payload, "utf8");
  await rename(SESSION_FILE_TMP, SESSION_FILE);
}

// Process a session action.
// Actions are serialized through a promise chain so that rapid
// consecutive commits (e.g. a student submission triggers
// upsertSubmission + addActivity + updateStudentProgress in the same
// tick) are applied to the file one-at-a-time. Without this, concurrent
// reads/writes caused the server to lose data or fall back to seed
// state, which made courses disappear.
let actionChain: Promise<unknown> = Promise.resolve();

export async function dispatchSessionAction(action: SessionAction): Promise<SessionState> {
  const run = async (): Promise<SessionState> => {
    const current = await readSessionState();
    const next = applySessionAction(current, action);
    await writeSessionState(next);
    return next;
  };

  // Chain this action after the previous one. If the previous action
  // failed, we still proceed (the catch on the chain prevents one
  // failure from blocking all subsequent actions).
  const result = actionChain.then(run);
  actionChain = result.catch(() => undefined);
  return result;
}

// Read a single course by id.
export async function getCourse(courseId: string): Promise<Course | undefined> {
  const state = await readSessionState();
  return state.courses.find((c) => c.id === courseId);
}

// Update a single course via an updater function.
// Chained onto the same actionChain so commits are serialized with
// other dispatchSessionAction calls (prevents lost updates on rapid
// consecutive writes).
export async function updateCourse(
  courseId: string,
  updater: (course: Course) => Course,
): Promise<SessionState> {
  const run = async (): Promise<SessionState> => {
    const current = await readSessionState();
    const courses = current.courses.map((c) =>
      c.id === courseId ? updater(c) : c,
    );
    const next: SessionState = {
      ...current,
      courses,
      updatedAt: new Date().toISOString(),
    };
    await writeSessionState(next);
    return next;
  };
  const result = actionChain.then(run);
  actionChain = result.catch(() => undefined);
  return result;
}
