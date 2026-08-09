import { describe, expect, it } from "vitest";
import { completedSceneGenerationProgress } from "./classroom-generation";

describe("classroom scene generation progress", () => {
  it("advances for every completed page instead of waiting for the whole batch", () => {
    expect(completedSceneGenerationProgress(1, 14)).toBe(34);
    expect(completedSceneGenerationProgress(9, 14)).toBe(68);
    expect(completedSceneGenerationProgress(14, 14)).toBe(90);
  });
});
