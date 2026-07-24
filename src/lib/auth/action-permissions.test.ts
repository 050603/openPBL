import { describe, expect, it } from "vitest";
import { isActionAllowed, isStudentActionForSelf } from "./action-permissions";
import type { SessionAction } from "@/lib/session/actions";

describe("isStudentActionForSelf", () => {
  it("accepts a student's own nested submission in the bound course", () => {
    const action = {
      type: "UPSERT_SUBMISSION",
      payload: {
        courseId: "course-1",
        submission: { studentId: "student-1" },
      },
    } as SessionAction;

    expect(
      isStudentActionForSelf(action, "student-1", "course-1"),
    ).toBe(true);
  });

  it("rejects a nested payload targeting another student", () => {
    const action = {
      type: "UPSERT_SUBMISSION",
      payload: {
        courseId: "course-1",
        submission: { studentId: "student-2" },
      },
    } as SessionAction;

    expect(
      isStudentActionForSelf(action, "student-1", "course-1"),
    ).toBe(false);
  });

  it("rejects an action targeting another course", () => {
    const action = {
      type: "HEARTBEAT",
      payload: {
        courseId: "course-2",
        studentId: "student-1",
        lastSeenAt: "2026-07-23T00:00:00.000Z",
      },
    } as SessionAction;

    expect(
      isStudentActionForSelf(action, "student-1", "course-1"),
    ).toBe(false);
  });

  it("checks the JOIN_CLASS student id nested under payload.student", () => {
    const action = {
      type: "JOIN_CLASS",
      payload: {
        courseId: "course-1",
        student: {
          id: "student-2",
          name: "李四",
          joinedAt: "2026-07-23T00:00:00.000Z",
          stageProgress: {},
        },
      },
    } as SessionAction;

    expect(
      isStudentActionForSelf(action, "student-1", "course-1"),
    ).toBe(false);
  });

  it("allows students to persist their own companion records", () => {
    const action = {
      type: "UPSERT_AI_SUPPORT",
      payload: {
        courseId: "course-1",
        support: { studentId: "student-1" },
      },
    } as SessionAction;

    expect(isActionAllowed("student", action.type)).toBe(true);
    expect(isStudentActionForSelf(action, "student-1", "course-1")).toBe(true);
  });

  it("rejects companion process records for another student", () => {
    const action = {
      type: "ADD_COMPANION_PROCESS_RECORD",
      payload: {
        courseId: "course-1",
        record: { studentId: "student-2" },
      },
    } as SessionAction;

    expect(isActionAllowed("student", action.type)).toBe(true);
    expect(isStudentActionForSelf(action, "student-1", "course-1")).toBe(false);
  });

  it("allows students to complete only their own todo state", () => {
    const action = {
      type: "SET_STUDENT_TODO_COMPLETION",
      payload: {
        courseId: "course-1",
        todoId: "todo-1",
        studentId: "student-1",
        completed: true,
      },
    } as SessionAction;

    expect(isActionAllowed("student", action.type)).toBe(true);
    expect(isStudentActionForSelf(action, "student-1", "course-1")).toBe(true);
    expect(isStudentActionForSelf(action, "student-2", "course-1")).toBe(false);
    expect(
      isStudentActionForSelf(
        {
          type: "SET_STUDENT_TODO_COMPLETION",
          payload: {
            courseId: "course-1",
            todoId: "todo-1",
            completed: true,
          },
        } as SessionAction,
        "student-1",
        "course-1",
      ),
    ).toBe(false);
  });

  it("allows a student to create and resolve only their own companion confirmation", () => {
    const createAction = {
      type: "UPSERT_COMPANION_CONFIRMATION",
      payload: {
        courseId: "course-1",
        confirmation: { studentId: "student-1" },
      },
    } as SessionAction;
    const resolveAction = {
      type: "RESOLVE_COMPANION_CONFIRMATION",
      payload: {
        courseId: "course-1",
        confirmationId: "confirmation-1",
        status: "confirmed",
        resolvedAt: "2026-07-24T00:00:00.000Z",
        studentId: "student-1",
      },
    } as SessionAction;

    expect(isActionAllowed("student", createAction.type)).toBe(true);
    expect(isActionAllowed("student", resolveAction.type)).toBe(true);
    expect(isStudentActionForSelf(createAction, "student-1", "course-1")).toBe(true);
    expect(isStudentActionForSelf(createAction, "student-2", "course-1")).toBe(false);
    expect(isStudentActionForSelf(resolveAction, "student-1", "course-1")).toBe(true);
    expect(isStudentActionForSelf(resolveAction, "student-2", "course-1")).toBe(false);
  });

  it("requires a student id when a student updates a project topic", () => {
    const action = {
      type: "SET_GROUP_TOPIC",
      payload: {
        courseId: "course-1",
        groupId: "group-1",
        patch: { topic: "校园节水" },
        studentId: "student-1",
      },
    } as SessionAction;

    expect(isActionAllowed("student", action.type)).toBe(true);
    expect(isStudentActionForSelf(action, "student-1", "course-1")).toBe(true);
    expect(isStudentActionForSelf(action, "student-2", "course-1")).toBe(false);
  });
});
