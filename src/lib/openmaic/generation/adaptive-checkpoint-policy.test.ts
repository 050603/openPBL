import { describe, expect, it } from "vitest";
import { ensureAdaptiveCheckpointQuizzes } from "./adaptive-checkpoint-policy";
import type { SceneOutline } from "@openmaic/lib/types/generation";

function scene(
  id: string,
  type: SceneOutline["type"],
  knowledgePointIds: string[],
): SceneOutline {
  return {
    id,
    type,
    title: id,
    description: id,
    keyPoints: [id],
    order: 0,
    stageKey: "ai-learning",
    stageLabel: "AI 授知",
    audience: "student",
    generationPurpose: "knowledge-teaching",
    parentActivityId: "activity-ai",
    activityId: "activity-ai",
    detailKind: "knowledge-explanation",
    knowledgePointIds,
    targetDurationSec: 180,
    ttsPolicy: "target-duration",
  };
}

describe("ensureAdaptiveCheckpointQuizzes", () => {
  it("adds a short quiz after every contiguous knowledge block", () => {
    const result = ensureAdaptiveCheckpointQuizzes([
      scene("kp1-explain", "slide", ["kp-1"]),
      scene("kp1-practice", "interactive", ["kp-1"]),
      scene("kp2-explain", "slide", ["kp-2"]),
    ]);

    expect(result.map((outline) => [outline.id, outline.type])).toEqual([
      ["kp1-explain", "slide"],
      ["kp1-practice", "interactive"],
      ["checkpoint-kp1-practice", "quiz"],
      ["kp2-explain", "slide"],
      ["checkpoint-kp2-explain", "quiz"],
    ]);
    expect(result[2].knowledgePointIds).toEqual(["kp-1"]);
    expect(result[2].quizConfig?.questionCount).toBeGreaterThanOrEqual(1);
  });

  it("keeps an existing matching checkpoint instead of duplicating it", () => {
    const result = ensureAdaptiveCheckpointQuizzes([
      scene("kp1-explain", "slide", ["kp-1"]),
      scene("kp1-check", "quiz", ["kp-1"]),
    ]);

    expect(result.filter((outline) => outline.type === "quiz")).toHaveLength(1);
    expect(result[1].id).toBe("kp1-check");
  });

  it("does not alter teacher resources", () => {
    const teacher = {
      ...scene("teacher-slide", "slide", ["kp-1"]),
      stageKey: "launch",
      audience: "teacher" as const,
      generationPurpose: "teacher-resource" as const,
    };
    expect(ensureAdaptiveCheckpointQuizzes([teacher])).toEqual([teacher]);
  });
});
