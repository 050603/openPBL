import { describe, expect, it } from "vitest";
import {
  COMPANION_STAGE_KEYS,
  buildStagePolicyPrompt,
  buildStageBoundaryInstruction,
  getCompanionStagePolicy,
  resolveCompanionIds,
  stageArtifactFollowUp,
  stageRoleGuidance,
} from "./stage-policy";

describe("companion stage policy", () => {
  it("defines a differentiated contract for every learning stage", () => {
    const policies = COMPANION_STAGE_KEYS.map((stageKey) => getCompanionStagePolicy(stageKey));

    expect(new Set(policies.map((policy) => policy.objective)).size).toBe(COMPANION_STAGE_KEYS.length);
    expect(policies.every((policy) => policy.allowedCompanionIds.length > 0 && policy.requiredContext.length > 0 && policy.prohibitedActions.length > 0)).toBe(true);
    expect(policies.every((policy) => buildStagePolicyPrompt(policy.stageKey).includes(policy.label))).toBe(true);
  });

  it("uses a reflection-specific role allowlist that excludes ideation", () => {
    const policy = getCompanionStagePolicy("reflection");

    expect(policy.allowedCompanionIds).toEqual(["reviewer", "recorder"]);
    expect(policy.prohibitedActions.join("；")).toContain("算法");
  });

  it("filters forbidden configured roles at the server boundary", () => {
    const ids = resolveCompanionIds("reflection", ["ideation", "recorder"]);

    expect(ids).not.toContain("ideation");
    expect(ids.every((id) => ["reviewer", "recorder"].includes(id))).toBe(true);
  });

  it("builds differentiated prompts and role guidance", () => {
    const prompt = buildStagePolicyPrompt("reflection");

    expect(prompt).toContain("学习反思");
    expect(prompt).toContain("教师评分");
    expect(prompt).toContain("算法教程");
    expect(stageRoleGuidance("reflection", "recorder")).toContain("完整反思");
    expect(stageArtifactFollowUp("make", "file-uploaded")?.preferredCompanionId).toBe("reviewer");
  });

  it("redirects outsourcing requests back to a student-owned stage action", () => {
    expect(buildStageBoundaryInstruction("proposal", "请直接帮我写一份完整方案")).toContain("认知外包");
    expect(buildStageBoundaryInstruction("reflection", "请讲算法的区别和实现方法")).toContain("算法区别");
  });
});
