import { describe, expect, it } from "vitest";
import { ActionEnvelopeSchema } from "./contracts";

const requestId = "018f47a2-89d4-7c12-a4f4-18f244f6ec0b";

describe("ActionEnvelopeSchema", () => {
  it("accepts a bounded, valid progress update", () => {
    expect(ActionEnvelopeSchema.safeParse({
      requestId,
      action: {
        type: "UPDATE_STUDENT_PROGRESS",
        payload: {
          courseId: "course-1",
          studentId: "student-1",
          stageKey: "research",
          value: 75,
        },
      },
    }).success).toBe(true);
  });

  it("rejects invalid progress, unknown actions, and non-UUID request IDs", () => {
    expect(ActionEnvelopeSchema.safeParse({
      requestId,
      action: {
        type: "UPDATE_STUDENT_PROGRESS",
        payload: {
          courseId: "course-1",
          studentId: "student-1",
          stageKey: "research",
          value: 101,
        },
      },
    }).success).toBe(false);
    expect(ActionEnvelopeSchema.safeParse({
      requestId,
      action: { type: "UNSAFE_ACTION", payload: {} },
    }).success).toBe(false);
    expect(ActionEnvelopeSchema.safeParse({
      requestId: "not-a-uuid",
      action: { type: "SET_UI_STATE", payload: {} },
    }).success).toBe(false);
  });
});
