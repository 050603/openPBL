import { describe, expect, it } from "vitest";
import { applyLearningEvidenceReview } from "./action-service";

describe("applyLearningEvidenceReview", () => {
  it("updates only the selected evidence and records teacher confirmation", () => {
    const result = applyLearningEvidenceReview(
      [
        { id: "evidence-1", status: "submitted", updatedAt: "earlier" },
        { id: "evidence-2", status: "submitted", updatedAt: "earlier" },
      ],
      {
        evidenceId: "evidence-1",
        status: "teacher-confirmed",
        feedback: " 方案可实施 ",
        reviewedAt: "2026-08-06T08:00:00.000Z",
      },
    );

    expect(result).toEqual([
      {
        id: "evidence-1",
        status: "teacher-confirmed",
        updatedAt: "2026-08-06T08:00:00.000Z",
        teacherFeedback: "方案可实施",
        confirmedAt: "2026-08-06T08:00:00.000Z",
      },
      { id: "evidence-2", status: "submitted", updatedAt: "earlier" },
    ]);
  });

  it("returns null when the evidence does not exist", () => {
    expect(applyLearningEvidenceReview([], {
      evidenceId: "missing",
      status: "needs-revision",
      reviewedAt: "2026-08-06T08:00:00.000Z",
    })).toBeNull();
  });
});
