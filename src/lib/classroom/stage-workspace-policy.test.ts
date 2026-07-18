import { describe, expect, it } from "vitest";
import {
  DEFAULT_STAGE_WORKSPACE_POLICY,
  getStageWorkspacePolicy,
  normalizeStageWorkspacePolicy,
  resolveStageWorkspaceMode,
  updateStageWorkspacePolicy,
} from "./stage-workspace-policy";

describe("stage workspace policy", () => {
  it("keeps old courses student-controlled with the companion workspace as default from stage three", () => {
    expect(getStageWorkspacePolicy(undefined, "proposal")).toEqual(DEFAULT_STAGE_WORKSPACE_POLICY);
    expect(resolveStageWorkspaceMode(getStageWorkspacePolicy(undefined, "proposal"))).toBe("companions");
  });

  it("keeps project launch and AI learning in the traditional task workspace", () => {
    expect(getStageWorkspacePolicy(undefined, "launch")).toEqual({ access: "task-only", defaultMode: "task" });
    expect(getStageWorkspacePolicy({ "ai-learning": { access: "companions-only", defaultMode: "companions" } }, "ai-learning"))
      .toEqual({ access: "task-only", defaultMode: "task" });
    expect(updateStageWorkspacePolicy(undefined, "launch", { access: "student-choice" }).launch)
      .toEqual({ access: "task-only", defaultMode: "task" });
  });

  it("forces the only available mode even when a student saved another preference", () => {
    expect(resolveStageWorkspaceMode({ access: "task-only", defaultMode: "companions" }, "companions")).toBe("task");
    expect(resolveStageWorkspaceMode({ access: "companions-only", defaultMode: "task" }, "task")).toBe("companions");
  });

  it("uses a valid student choice before the configured default", () => {
    const policy = normalizeStageWorkspacePolicy({ access: "student-choice", defaultMode: "task" });
    expect(resolveStageWorkspaceMode(policy)).toBe("task");
    expect(resolveStageWorkspaceMode(policy, "companions")).toBe("companions");
  });

  it("normalizes a policy when the teacher changes its access", () => {
    const policies = updateStageWorkspacePolicy(undefined, "make", { access: "task-only" });
    expect(policies.make).toEqual({ access: "task-only", defaultMode: "task" });
  });
});
