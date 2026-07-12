import { describe, expect, it } from "vitest";
import type { LearningEvent, LearningSignal } from "@/lib/session/types";
import {
  aggregateCommonIssues,
  analyzeStudentLearning,
  dedupeLearningEvents,
} from "./analyzer";

const BASE_TIME = Date.parse("2026-07-11T10:00:00.000Z");

function event(
  id: string,
  type: LearningEvent["type"],
  offsetMs: number,
  patch: Partial<LearningEvent> = {},
): LearningEvent {
  return {
    id,
    idempotencyKey: patch.idempotencyKey ?? id,
    courseId: "course-1",
    studentId: patch.studentId ?? "student-1",
    stageKey: "ai-learning",
    sceneId: "scene-1",
    type,
    occurredAt: new Date(BASE_TIME + offsetMs).toISOString(),
    ...patch,
  };
}

describe("learning analytics", () => {
  it("deduplicates retried events by idempotency key", () => {
    const first = event("event-1", "heartbeat", 0, { idempotencyKey: "same", durationMs: 30_000, visible: true });
    const retry = event("event-2", "heartbeat", 1_000, { idempotencyKey: "same", durationMs: 30_000, visible: true });
    expect(dedupeLearningEvents([first, retry])).toEqual([first]);
  });

  it("counts only foreground heartbeat duration and flags 1.5x dwell overrun", () => {
    const result = analyzeStudentLearning({
      events: [
        event("visible-1", "heartbeat", 0, { durationMs: 100_000, visible: true }),
        event("hidden", "heartbeat", 100_000, { durationMs: 500_000, visible: false }),
        event("visible-2", "heartbeat", 110_000, { durationMs: 90_001, visible: true }),
      ],
      expectedDurationSec: 120,
      now: BASE_TIME + 190_001,
    });

    expect(result.metrics.effectiveDurationMs).toBe(190_001);
    expect(result.signals).toContainEqual(expect.objectContaining({ kind: "dwell-overrun" }));
  });

  it("flags the second replay of the same scene", () => {
    const result = analyzeStudentLearning({
      events: [
        event("enter", "scene-enter", 0),
        event("replay-1", "scene-replay", 20_000),
        event("replay-2", "scene-replay", 40_000),
      ],
      expectedDurationSec: 120,
      now: BASE_TIME + 40_000,
    });

    expect(result.metrics.replayCount).toBe(2);
    expect(result.signals).toContainEqual(expect.objectContaining({ kind: "repeated-playback" }));
  });

  it("flags three minutes of inactivity", () => {
    const result = analyzeStudentLearning({
      events: [event("enter", "scene-enter", 0)],
      expectedDurationSec: 120,
      now: BASE_TIME + 180_001,
    });
    expect(result.signals).toContainEqual(expect.objectContaining({ kind: "idle" }));
  });

  it("flags three consecutive conversation rounds without progress", () => {
    const result = analyzeStudentLearning({
      events: [event("enter", "stage-enter", 0)],
      expectedDurationSec: 120,
      now: BASE_TIME,
      conversationRounds: [
        { id: "round-1", progressed: false },
        { id: "round-2", progressed: false },
        { id: "round-3", progressed: false },
      ],
    });
    expect(result.signals).toContainEqual(expect.objectContaining({ kind: "conversation-no-progress" }));
  });

  it("escalates unresolved signals after two AI intervention attempts", () => {
    const result = analyzeStudentLearning({
      events: [event("enter", "scene-enter", 0)],
      expectedDurationSec: 120,
      now: BASE_TIME + 180_001,
      aiInterventionAttempts: 2,
    });
    expect(result.signals.find((signal) => signal.kind === "idle")).toMatchObject({
      severity: "high",
      aiInterventionAttempts: 2,
    });
  });

  it("aggregates an issue at 30 percent or at least five students", () => {
    const makeSignal = (studentId: string, issue = "idle:ai-learning:scene-1"): LearningSignal => ({
      id: `signal-${studentId}`,
      courseId: "course-1",
      studentId,
      stageKey: "ai-learning",
      sceneId: "scene-1",
      kind: "idle",
      severity: "warning",
      status: "open",
      title: "学习停滞",
      summary: "超过三分钟无活动",
      normalizedIssueKey: issue,
      evidenceEventIds: [],
      aiInterventionAttempts: 0,
      firstDetectedAt: new Date(BASE_TIME).toISOString(),
      lastDetectedAt: new Date(BASE_TIME).toISOString(),
    });

    expect(aggregateCommonIssues([0, 1, 2].map((n) => makeSignal(`s-${n}`)), 10)).toHaveLength(1);
    expect(aggregateCommonIssues([0, 1, 2, 3, 4].map((n) => makeSignal(`s-${n}`)), 100)).toHaveLength(1);
    expect(aggregateCommonIssues([0, 1, 2, 3].map((n) => makeSignal(`s-${n}`)), 100)).toHaveLength(0);
  });
});
