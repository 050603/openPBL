import { describe, expect, it } from "vitest";
import {
  crossedResourceProgressThresholds,
  resourceEventIdempotencyKey,
} from "./telemetry";

describe("resource telemetry thresholds", () => {
  it("emits only coarse thresholds and never regresses", () => {
    expect(crossedResourceProgressThresholds(0, 24)).toEqual([]);
    expect(crossedResourceProgressThresholds(0, 26)).toEqual([25]);
    expect(crossedResourceProgressThresholds(26, 76)).toEqual([50, 75]);
    expect(crossedResourceProgressThresholds(76, 100)).toEqual([100]);
    expect(crossedResourceProgressThresholds(90, 40)).toEqual([]);
  });

  it("keeps student and projection records independently idempotent", () => {
    const studentKey = resourceEventIdempotencyKey("course", "student", "resource", "progress", 50);
    const projectionKey = resourceEventIdempotencyKey("course", "student", "resource", "progress", 50, "teacher-projection");
    expect(studentKey).toBe("resource:course:student:resource:student:progress:50");
    expect(projectionKey).not.toBe(studentKey);
    expect(resourceEventIdempotencyKey("course", "student", "resource", "open")).toBe(
      resourceEventIdempotencyKey("course", "student", "resource", "open"),
    );
  });
});
