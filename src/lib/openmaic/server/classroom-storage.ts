import { promises as fs } from 'fs';
import path from 'path';
import type { Scene, Stage } from '@openmaic/lib/types/stage';

export const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureClassroomsDir() {
  await ensureDir(CLASSROOMS_DIR);
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

/** Serialize read-modify-write updates for one classroom snapshot. */
const classroomLocks = new Map<string, Promise<void>>();

async function withClassroomLock<T>(classroomId: string, fn: () => Promise<T>): Promise<T> {
  const previous = classroomLocks.get(classroomId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  classroomLocks.set(classroomId, current);

  try {
    await previous;
    return await fn();
  } finally {
    release();
    if (classroomLocks.get(classroomId) === current) {
      classroomLocks.delete(classroomId);
    }
  }
}

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
  assetGeneration?: ClassroomAssetGenerationStatus;
}

export type ClassroomAssetGenerationStatus = {
  status: 'running' | 'completed' | 'partial-failure';
  requested: number;
  completed: number;
  failures: Array<{ elementId: string; type: 'image' | 'video' | 'tts'; error: string }>;
  updatedAt: string;
};

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  const filePath = path.join(CLASSROOMS_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as PersistedClassroomData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
  },
): Promise<PersistedClassroomData> {
  return withClassroomLock(data.id, async () => {
    const next: PersistedClassroomData = {
      id: data.id,
      stage: data.stage,
      scenes: data.scenes,
      createdAt: new Date().toISOString(),
    };

    await ensureClassroomsDir();
    const filePath = path.join(CLASSROOMS_DIR, `${data.id}.json`);
    await writeJsonFileAtomic(filePath, next);
    return next;
  });
}

/**
 * Atomically replace only the scene payload of an already persisted classroom.
 * This is used by background media/TTS tasks so completed assets are visible
 * without rewriting the stage metadata or the original creation timestamp.
 */
export async function updatePersistedClassroomScenes(
  classroomId: string,
  scenes: Scene[],
): Promise<PersistedClassroomData> {
  return withClassroomLock(classroomId, async () => {
    const existing = await readClassroom(classroomId);
    if (!existing) {
      throw new Error(`Classroom not found while updating scenes: ${classroomId}`);
    }

    const updated: PersistedClassroomData = {
      ...existing,
      scenes,
    };
    const filePath = path.join(CLASSROOMS_DIR, `${classroomId}.json`);
    await writeJsonFileAtomic(filePath, updated);
    return updated;
  });
}

export async function updatePersistedClassroomAssetStatus(
  classroomId: string,
  assetGeneration: ClassroomAssetGenerationStatus,
): Promise<PersistedClassroomData> {
  return withClassroomLock(classroomId, async () => {
    const existing = await readClassroom(classroomId);
    if (!existing) throw new Error(`Classroom not found while updating asset status: ${classroomId}`);
    const updated = { ...existing, assetGeneration };
    await writeJsonFileAtomic(path.join(CLASSROOMS_DIR, `${classroomId}.json`), updated);
    return updated;
  });
}
