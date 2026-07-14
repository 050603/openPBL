import { describe, expect, it } from "vitest";
import type { CompanionThread, TeacherAgentDirective } from "@/lib/session/types";
import { activeDirectivesForStudent, recorderVisibility, shouldSendStageOpening, shouldUseReviewer } from "./orchestrator";

const thread: CompanionThread = { id: "thread-1", courseId: "course-1", studentId: "student-1", stageKey: "proposal", messages: [], createdAt: "2026-07-11T10:00:00.000Z", updatedAt: "2026-07-11T10:00:00.000Z" };

describe("companion orchestrator policies", () => {
  it("sends only one opening per student and stage", () => {
    expect(shouldSendStageOpening(thread)).toBe(true);
    expect(shouldSendStageOpening({ ...thread, openingSentAt: "2026-07-11T10:01:00.000Z" })).toBe(false);
  });

  it("keeps recorder summaries teacher-only except milestones and loss of focus", () => {
    expect(recorderVisibility("idle")).toBe("teacher-only");
    expect(recorderVisibility("milestone")).toBe("student-and-teacher");
    expect(recorderVisibility("no-progress")).toBe("student-and-teacher");
  });

  it("activates reviewer for artifact changes and milestones", () => {
    expect(shouldUseReviewer("artifact-stalled")).toBe(true);
    expect(shouldUseReviewer("milestone")).toBe(true);
    expect(shouldUseReviewer("idle")).toBe(false);
  });

  it("applies active course and student directives until completed or revoked", () => {
    const base: TeacherAgentDirective = { id: "d1", courseId: "course-1", stageKey: "proposal", targetStudentIds: [], targetScope: "course", goal: "补充证据", instruction: "引导学生找到证据", successCriteria: ["产物包含证据"], status: "active", teacherName: "教师", createdAt: "2026-07-11T10:00:00.000Z", updatedAt: "2026-07-11T10:00:00.000Z" };
    expect(activeDirectivesForStudent([base, { ...base, id: "d2", targetScope: "student", targetStudentIds: ["student-2"] }], "student-1", "proposal").map((item) => item.id)).toEqual(["d1"]);
  });
});
