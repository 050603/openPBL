import { describe, expect, it } from "vitest";
import {
  DEFAULT_STAGE_WORKSPACE_POLICY,
  getStageWorkspacePolicy,
  normalizeStageWorkspacePolicy,
  resolveStageWorkspaceMode,
  stageSupportsCompanionWorkspace,
  updateStageWorkspacePolicy,
} from "./stage-workspace-policy";

describe("stage workspace policy", () => {
  it("keeps the first two stages fixed to the traditional learning page", () => {
    ["launch", "ai-learning"].forEach((stageKey) => {
      expect(stageSupportsCompanionWorkspace(stageKey)).toBe(false);
      expect(getStageWorkspacePolicy(undefined, stageKey)).toEqual({
        access: "task-only",
        defaultMode: "task",
      });
    });
  });

  it("defaults stages three through six to teacher-enabled student choice", () => {
    ["proposal", "make", "showcase", "reflection"].forEach((stageKey) => {
      expect(stageSupportsCompanionWorkspace(stageKey)).toBe(true);
      expect(getStageWorkspacePolicy(undefined, stageKey)).toEqual(
        DEFAULT_STAGE_WORKSPACE_POLICY,
      );
    });
  });

  it("normalizes each teacher-controlled access mode", () => {
    expect(
      normalizeStageWorkspacePolicy({
        access: "task-only",
        defaultMode: "companions",
      }),
    ).toEqual({ access: "task-only", defaultMode: "task" });
    expect(
      normalizeStageWorkspacePolicy({
        access: "companions-only",
        defaultMode: "task",
      }),
    ).toEqual({ access: "companions-only", defaultMode: "companions" });
    expect(
      normalizeStageWorkspacePolicy({
        access: "student-choice",
        defaultMode: "task",
      }),
    ).toEqual({ access: "student-choice", defaultMode: "task" });
  });

  it("lets enforced teacher policy override the saved student preference", () => {
    expect(
      resolveStageWorkspaceMode(
        { access: "task-only", defaultMode: "task" },
        "companions",
      ),
    ).toBe("task");
    expect(
      resolveStageWorkspaceMode(
        { access: "companions-only", defaultMode: "companions" },
        "task",
      ),
    ).toBe("companions");
    expect(
      resolveStageWorkspaceMode(
        { access: "student-choice", defaultMode: "companions" },
        "task",
      ),
    ).toBe("task");
  });

  it("refuses companion policies for the first two stages", () => {
    const policies = updateStageWorkspacePolicy(undefined, "launch", {
      access: "companions-only",
    });
    expect(policies.launch).toEqual({
      access: "task-only",
      defaultMode: "task",
    });
  });

  it("persists teacher control for supported stages", () => {
    const policies = updateStageWorkspacePolicy(undefined, "make", {
      access: "task-only",
    });
    expect(policies.make).toEqual({
      access: "task-only",
      defaultMode: "task",
    });
  });
});
