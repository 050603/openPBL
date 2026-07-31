import { describe, expect, it } from "vitest";
import {
  currentGenerationProgress,
  mapAdaptiveGenerationProgress,
  mapPrimaryGenerationProgress,
} from "./course-generation-progress";

describe("course generation progress", () => {
  it("reserves the final range for post-processing and adaptive resources", () => {
    expect(mapPrimaryGenerationProgress(0)).toBe(0);
    expect(mapPrimaryGenerationProgress(50)).toBe(41);
    expect(mapPrimaryGenerationProgress(100)).toBe(82);
  });

  it("combines parallel adaptive branch progress", () => {
    expect(mapAdaptiveGenerationProgress([0, 0])).toBe(86);
    expect(mapAdaptiveGenerationProgress([100, 50])).toBe(95);
    expect(mapAdaptiveGenerationProgress([100, 100])).toBe(98);
  });

  it("does not report completion until the workflow finishes", () => {
    expect(currentGenerationProgress([])).toBe(0);
    expect(currentGenerationProgress([82, 98, 99])).toBe(99);
    expect(currentGenerationProgress([82, 98], true)).toBe(100);
  });
});
