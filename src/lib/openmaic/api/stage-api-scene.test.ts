import { describe, expect, it } from "vitest";
import { createSceneAPI } from "./stage-api-scene";
import type { StageStore } from "./stage-api-types";
import type { Scene, Stage } from "@openmaic/lib/types/stage";

function createStore() {
  let state = {
    stage: { id: "stage-1", name: "test" } as Stage,
    scenes: [] as Scene[],
    currentSceneId: null as string | null,
    mode: "playback" as const,
  };
  const store: StageStore = {
    getState: () => state,
    setState: (partial) => {
      state = { ...state, ...partial };
    },
    subscribe: () => () => undefined,
  };
  return { store, getState: () => state };
}

describe("createSceneAPI PBL metadata", () => {
  it("persists explicit routing metadata instead of dropping it", () => {
    const { store, getState } = createStore();
    const api = createSceneAPI(store);

    const result = api.create({
      type: "slide",
      title: "知识讲解",
      stageKey: "ai-learning",
      stageLabel: "AI 授知",
      audience: "student",
      generationPurpose: "knowledge-teaching",
      companionIds: ["explainer"],
      companionPrompt: "解释并追问",
      activityId: "activity-1",
      resourceTypes: ["ppt"],
    });

    expect(result.success).toBe(true);
    expect(getState().scenes[0]).toMatchObject({
      stageKey: "ai-learning",
      stageLabel: "AI 授知",
      audience: "student",
      generationPurpose: "knowledge-teaching",
      companionIds: ["explainer"],
      companionPrompt: "解释并追问",
      activityId: "activity-1",
      resourceTypes: ["ppt"],
    });
  });
});
