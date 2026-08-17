import { createHash } from "node:crypto";
import type { SceneOutline } from "@openmaic/lib/types/generation";
import type { Scene } from "@openmaic/lib/types/stage";

export type PageCheckpointSnapshot = {
  pageKey: string;
  outlineFingerprint: string;
  scene: Scene;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function fingerprintSceneOutline(outline: SceneOutline): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(outline)))
    .digest("hex");
}

function isScene(value: unknown): value is Scene {
  if (!value || typeof value !== "object") return false;
  const scene = value as Partial<Scene>;
  return typeof scene.id === "string"
    && typeof scene.type === "string"
    && typeof scene.title === "string"
    && Boolean(scene.content && typeof scene.content === "object")
    && Array.isArray(scene.actions);
}

export function restoreSceneCheckpoint(
  outline: SceneOutline,
  checkpoint: PageCheckpointSnapshot | undefined,
  stageId: string,
): Scene | null {
  if (!checkpoint || checkpoint.pageKey !== outline.id) return null;
  if (checkpoint.outlineFingerprint !== fingerprintSceneOutline(outline)) return null;
  if (!isScene(checkpoint.scene)) return null;
  if (checkpoint.scene.type !== outline.type || checkpoint.scene.content.type !== outline.type) return null;
  return {
    ...checkpoint.scene,
    stageId,
    outlineId: outline.id,
    title: outline.title,
    order: outline.order,
    updatedAt: Date.now(),
  } as Scene;
}

