import { describe, expect, it } from "vitest";
import type { SceneOutline } from "@openmaic/lib/types/generation";
import { ensureTerminalMasteryAssessment } from "./terminal-mastery-assessment-policy";

function scene(id: string, type: SceneOutline["type"], knowledgePointIds: string[]): SceneOutline {
  return {
    id, type, title: id, description: id, keyPoints: [id], order: 0,
    stageKey: "ai-learning", stageLabel: "AI 授课", audience: "student",
    generationPurpose: "knowledge-teaching", parentActivityId: "activity-ai",
    activityId: "activity-ai", detailKind: "knowledge-explanation",
    knowledgePointIds, targetDurationSec: 180, ttsPolicy: "target-duration",
  };
}

describe("ensureTerminalMasteryAssessment", () => {
  it("folds block quizzes into one assessment after all teaching pages", () => {
    const result = ensureTerminalMasteryAssessment([
      scene("explain-1", "slide", ["kp-1"]),
      scene("check-1", "quiz", ["kp-1"]),
      scene("practice-2", "interactive", ["kp-2"]),
      scene("check-2", "quiz", ["kp-2"]),
    ]);
    expect(result.map((item) => item.type)).toEqual(["slide", "interactive", "quiz"]);
    expect(result.at(-1)).toMatchObject({
      id: "check-2",
      title: "主课达标测",
      knowledgePointIds: ["kp-1", "kp-2"],
    });
    const teachingDuration = result.slice(0, -1).reduce(
      (sum, item) => sum + (item.targetDurationSec ?? 0),
      0,
    );
    expect((result.at(-1)?.targetDurationSec ?? 0) / (
      teachingDuration + (result.at(-1)?.targetDurationSec ?? 0)
    )).toBeLessThanOrEqual(0.2);
  });

  it("adds one terminal assessment when the model omitted it", () => {
    const result = ensureTerminalMasteryAssessment([
      scene("explain", "slide", ["kp-1"]),
      scene("practice", "interactive", ["kp-1"]),
    ]);
    expect(result.filter((item) => item.type === "quiz")).toHaveLength(1);
    expect(result.at(-1)?.type).toBe("quiz");
  });

  it("does not alter teacher-only resources", () => {
    const teacher = { ...scene("teacher", "slide", ["kp-1"]), audience: "teacher" as const };
    expect(ensureTerminalMasteryAssessment([teacher])).toEqual([teacher]);
  });
});
