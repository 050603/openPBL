import { describe, expect, it } from "vitest";
import type { SceneOutline } from "@/lib/openmaic/types/generation";
import type { Scene } from "@/lib/openmaic/types/stage";
import {
  findMissingTeachingToolResources,
  findMissingTtsResources,
  repairMissingTeachingToolResources,
} from "./resource-readiness";

const outline = {
  id: "quiz-1",
  title: "主课达标测",
  type: "quiz",
  order: 0,
  teachingToolPlan: [{
    id: "plan-1",
    tool: "whiteboard",
    trigger: "作答前",
    purpose: "回顾判断标准",
    content: ["判断标准"],
    required: true,
  }],
} as SceneOutline;

const scene = {
  id: "scene-1",
  outlineId: "quiz-1",
  title: "主课达标测",
  order: 0,
  type: "quiz",
  ttsPolicy: "target-duration",
  actions: [{ id: "speech-1", type: "speech", text: "开始测验" }],
} as Scene;

describe("course resource readiness", () => {
  it("reports a required planned action that is absent from the generated scene", () => {
    expect(findMissingTeachingToolResources([outline], [scene])).toMatchObject([{
      title: "主课达标测",
      tool: "whiteboard",
    }]);
  });

  it("reports only narrated speech actions without configured audio", () => {
    const withEmptyTransition = {
      ...scene,
      actions: [
        ...scene.actions!,
        { id: "transition", type: "speech" as const, text: "" },
        { id: "ready", type: "speech" as const, text: "已有音频", audioUrl: "/ready.wav" },
      ],
    };
    expect(findMissingTtsResources([withEmptyTransition])).toEqual([{
      kind: "tts",
      sceneId: "scene-1",
      actionId: "speech-1",
      title: "主课达标测",
    }]);
  });

  it("repairs only missing planned actions and then passes the readiness check", () => {
    const repaired = repairMissingTeachingToolResources([outline], [scene]);
    expect(repaired.changed).toBe(true);
    expect(findMissingTeachingToolResources([outline], repaired.scenes)).toEqual([]);
    expect(repaired.scenes[0]?.actions?.some((action) => action.type === "wb_draw_text")).toBe(true);
  });
});
