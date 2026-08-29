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

  it("accepts a student code artifact submission", () => {
    const now = new Date().toISOString();
    expect(ActionEnvelopeSchema.safeParse({
      requestId,
      action: {
        type: "UPSERT_SUBMISSION",
        payload: {
          courseId: "course-1",
          submission: {
            id: "submission-1",
            courseId: "course-1",
            studentId: "student-1",
            studentName: "学生",
            stageKey: "make",
            type: "code",
            title: "Python 项目代码",
            content: JSON.stringify({ version: 1, language: "python", activeFileId: "main", files: [] }),
            createdAt: now,
            updatedAt: now,
          },
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
