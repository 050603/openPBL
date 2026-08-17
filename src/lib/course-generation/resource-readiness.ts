import type { TeachingToolPlanItem } from "@/lib/openmaic/types/generation";
import type { Scene } from "@/lib/openmaic/types/stage";
import {
  applyPlannedTeachingToolActions,
  normalizeTeachingToolPlan,
  summarizeActualTeachingTools,
} from "@/lib/openmaic/generation/teaching-tool-plan";
import { normalizeWhiteboardActionLifecycle } from "@/lib/openmaic/generation/whiteboard-action-lifecycle";

export type MissingTeachingToolResource = {
  kind: "teaching-tool";
  outlineId: string;
  sceneId: string;
  title: string;
  tool: "whiteboard" | "spotlight" | "laser-pointer" | "interactive-widget";
};

export type MissingTtsResource = {
  kind: "tts";
  sceneId: string;
  actionId: string;
  title: string;
};

type ResourceReadinessOutline = {
  id: string;
  title: string;
  teachingToolPlan?: TeachingToolPlanItem[];
};

export function findMissingTeachingToolResources(
  outlines: ReadonlyArray<ResourceReadinessOutline>,
  scenes: ReadonlyArray<Scene>,
): MissingTeachingToolResource[] {
  const sceneByOutlineId = new Map(scenes.map((scene) => [scene.outlineId?.trim() || scene.id, scene]));
  return outlines.flatMap((outline) => {
    const scene = sceneByOutlineId.get(outline.id);
    if (!scene) return [];
    const actualTools = new Set(summarizeActualTeachingTools(scene.actions).map((item) => item.tool));
    return normalizeTeachingToolPlan(outline.teachingToolPlan).flatMap((item) =>
      item.required !== false && !actualTools.has(item.tool)
        ? [{
            kind: "teaching-tool" as const,
            outlineId: outline.id,
            sceneId: scene.id,
            title: outline.title,
            tool: item.tool,
          }]
        : [],
    );
  });
}

export function findMissingTtsResources(
  scenes: ReadonlyArray<Scene>,
): MissingTtsResource[] {
  return scenes.flatMap((scene) => {
    if (scene.ttsPolicy === "none") return [];
    return (scene.actions ?? []).flatMap((action) =>
      action.type === "speech" && action.text.trim() && !action.audioUrl
        ? [{
            kind: "tts" as const,
            sceneId: scene.id,
            actionId: action.id,
            title: scene.title,
          }]
        : [],
    );
  });
}

export function repairMissingTeachingToolResources(
  outlines: ReadonlyArray<ResourceReadinessOutline>,
  scenes: ReadonlyArray<Scene>,
): { changed: boolean; scenes: Scene[] } {
  const outlineById = new Map(outlines.map((outline) => [outline.id, outline]));
  let changed = false;
  const repairedScenes = scenes.map((scene) => {
    const outline = outlineById.get(scene.outlineId?.trim() || "");
    if (!outline) return scene;
    const actions = normalizeWhiteboardActionLifecycle(
      applyPlannedTeachingToolActions(outline, scene.actions ?? []),
    );
    if (actions.length === (scene.actions ?? []).length) return scene;
    changed = true;
    return { ...scene, actions };
  });
  return { changed, scenes: repairedScenes };
}
