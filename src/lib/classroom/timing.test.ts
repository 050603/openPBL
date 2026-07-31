import { describe, expect, it } from "vitest";
import {
  adjustClassroomStageTiming,
  completeClassroomTiming,
  createClassroomTimingState,
  deriveClassroomTimingSnapshot,
  pauseClassroomTiming,
  resetActiveClassroomStageTiming,
  resumeClassroomTiming,
  transitionClassroomStageTiming,
} from "./timing";

const stages = [
  { key: "launch", label: "项目启动" },
  { key: "ai-learning", label: "AI 授知" },
  { key: "proposal", label: "方案构思" },
  { key: "make", label: "项目实践" },
  { key: "showcase", label: "成果汇报" },
  { key: "reflection", label: "学习反思" },
];

const projectMainline = {
  totalMinutes: 60,
  allocatedMinutes: 60,
  modules: [
    { stageKey: "launch" as const, label: "项目启动", activityIds: [], durationMin: 5, startMin: 0, endMin: 5, knowledgePointIds: [], resourcePlan: "" },
    { stageKey: "ai-learning" as const, label: "AI 授知", activityIds: [], durationMin: 15, startMin: 5, endMin: 20, knowledgePointIds: [], resourcePlan: "" },
    { stageKey: "proposal" as const, label: "方案构思", activityIds: [], durationMin: 10, startMin: 20, endMin: 30, knowledgePointIds: [], resourcePlan: "" },
    { stageKey: "make" as const, label: "项目实践", activityIds: [], durationMin: 15, startMin: 30, endMin: 45, knowledgePointIds: [], resourcePlan: "" },
    { stageKey: "showcase" as const, label: "成果汇报", activityIds: [], durationMin: 10, startMin: 45, endMin: 55, knowledgePointIds: [], resourcePlan: "" },
    { stageKey: "reflection" as const, label: "学习反思", activityIds: [], durationMin: 5, startMin: 55, endMin: 60, knowledgePointIds: [], resourcePlan: "" },
  ],
};

describe("classroom timing state machine", () => {
  it("starts from the confirmed six-stage mainline", () => {
    const state = createClassroomTimingState({
      stages,
      totalMinutes: 60,
      projectMainline,
      now: "2026-07-28T01:00:00.000Z",
    });

    expect(state.status).toBe("running");
    expect(state.activeStageKey).toBe("launch");
    expect(state.stages.map((stage) => stage.basePlannedSec)).toEqual([
      300, 900, 600, 900, 600, 300,
    ]);
    expect(state.stages.map((stage) => stage.status)).toEqual([
      "active", "pending", "pending", "pending", "pending", "pending",
    ]);
  });

  it("derives live elapsed and remaining time from absolute timestamps after reload", () => {
    const state = createClassroomTimingState({
      stages,
      totalMinutes: 60,
      projectMainline,
      now: "2026-07-28T01:00:00.000Z",
    });
    const reloaded = JSON.parse(JSON.stringify(state));
    const snapshot = deriveClassroomTimingSnapshot(
      reloaded,
      "2026-07-28T01:02:30.000Z",
    );

    expect(snapshot.courseElapsedSec).toBe(150);
    expect(snapshot.courseRemainingSec).toBe(3_450);
    expect(snapshot.activeStage?.elapsedSec).toBe(150);
    expect(snapshot.activeStage?.remainingSec).toBe(150);
    expect(snapshot.activeStage?.progressPercent).toBe(50);
  });

  it("freezes elapsed time while paused and continues from the resumed timestamp", () => {
    const running = createClassroomTimingState({
      stages,
      totalMinutes: 60,
      projectMainline,
      now: "2026-07-28T01:00:00.000Z",
    });
    const paused = pauseClassroomTiming(running, "2026-07-28T01:02:00.000Z");
    expect(deriveClassroomTimingSnapshot(paused, "2026-07-28T01:12:00.000Z").courseElapsedSec).toBe(120);

    const resumed = resumeClassroomTiming(paused, "2026-07-28T01:12:00.000Z");
    expect(deriveClassroomTimingSnapshot(resumed, "2026-07-28T01:13:00.000Z").courseElapsedSec).toBe(180);
  });

  it("settles the current stage and activates the selected next stage", () => {
    const running = createClassroomTimingState({
      stages,
      totalMinutes: 60,
      projectMainline,
      now: "2026-07-28T01:00:00.000Z",
    });
    const next = transitionClassroomStageTiming(
      running,
      "ai-learning",
      "2026-07-28T01:04:00.000Z",
    );

    expect(next.activeStageKey).toBe("ai-learning");
    expect(next.stages[0]).toMatchObject({ status: "completed", elapsedSec: 240 });
    expect(next.stages[1]).toMatchObject({ status: "active", startedAt: "2026-07-28T01:04:00.000Z" });
    expect(deriveClassroomTimingSnapshot(next, "2026-07-28T01:05:00.000Z").activeStage?.elapsedSec).toBe(60);
  });

  it("marks intentionally skipped stages complete so they do not remain in the projection", () => {
    const running = createClassroomTimingState({
      stages,
      totalMinutes: 60,
      projectMainline,
      now: "2026-07-28T01:00:00.000Z",
    });
    const skipped = transitionClassroomStageTiming(
      running,
      "make",
      "2026-07-28T01:02:00.000Z",
    );
    const snapshot = deriveClassroomTimingSnapshot(
      skipped,
      "2026-07-28T01:02:00.000Z",
    );

    expect(skipped.stages.slice(0, 3).map((stage) => stage.status)).toEqual([
      "completed", "completed", "completed",
    ]);
    expect(snapshot.courseRemainingSec).toBe(1_800);
    expect(snapshot.scheduleVarianceSec).toBe(-1_680);
  });

  it("extends the active stage by borrowing time from pending stages without changing the course total", () => {
    const running = createClassroomTimingState({
      stages,
      totalMinutes: 60,
      projectMainline,
      now: "2026-07-28T01:00:00.000Z",
    });
    const adjusted = adjustClassroomStageTiming(running, "launch", 120);
    const snapshot = deriveClassroomTimingSnapshot(adjusted, "2026-07-28T01:00:00.000Z");

    expect(snapshot.coursePlannedSec).toBe(3_600);
    expect(snapshot.activeStage?.plannedSec).toBe(420);
    expect(snapshot.stages.slice(1).reduce((sum, stage) => sum + stage.plannedSec, 0)).toBe(3_180);
  });

  it("resets only the active stage clock and can finish the session", () => {
    const running = createClassroomTimingState({
      stages,
      totalMinutes: 60,
      projectMainline,
      now: "2026-07-28T01:00:00.000Z",
    });
    const reset = resetActiveClassroomStageTiming(
      running,
      "2026-07-28T01:03:00.000Z",
    );
    expect(deriveClassroomTimingSnapshot(reset, "2026-07-28T01:03:30.000Z").activeStage?.elapsedSec).toBe(30);

    const completed = completeClassroomTiming(
      reset,
      "2026-07-28T01:04:00.000Z",
    );
    expect(completed.status).toBe("completed");
    expect(completed.activeStageKey).toBeUndefined();
    expect(deriveClassroomTimingSnapshot(completed, "2026-07-28T01:10:00.000Z").courseElapsedSec).toBe(60);
  });
});
