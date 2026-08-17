import { describe, expect, it } from "vitest";
import {
  createManagedCourseGenerationRecoveryRequest,
  formatCourseGenerationErrorForTeacher,
} from "./failure-policy";

const inferenceAbort = new Error(
  "An error occurred in model serving, error message is: [Inference engine abort. Finish reason: [UNKNOWN].]",
);

describe("managed classroom-generation recovery", () => {
  it("retries a transient final-page failure while preserving completed page checkpoints", () => {
    expect(createManagedCourseGenerationRecoveryRequest(
      { courseId: "course-1" },
      inferenceAbort,
      19,
    )).toMatchObject({ managedRecoveryCount: 1 });
  });

  it("does not create an unbounded recovery loop", () => {
    expect(createManagedCourseGenerationRecoveryRequest(
      { courseId: "course-1", managedRecoveryCount: 2 },
      inferenceAbort,
      19,
    )).toBeNull();
  });

  it("does not expose raw model-serving diagnostics to teachers", () => {
    const message = formatCourseGenerationErrorForTeacher(inferenceAbort);
    expect(message).toContain("已经生成的页面均已保留");
    expect(message).not.toContain("Inference engine");
  });
});
