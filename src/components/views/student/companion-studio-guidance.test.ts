import { describe, expect, it } from "vitest";

import { getCompanionStudioGuidance } from "./companion-studio-guidance";

describe("getCompanionStudioGuidance", () => {
  it("turns proposal readiness into a focused ideation guide", () => {
    const guidance = getCompanionStudioGuidance("proposal", {
      status: "working",
      reason: "下一步：补充验证方式与方案风险。",
    });

    expect(guidance).toMatchObject({
      tone: "proposal",
      eyebrow: "构思 · 验证",
      objective: "把方向变成一份可实施、可验证的方案",
      actionLabel: "打开方案工作台",
      nextStep: "补充验证方式与方案风险。",
    });
    expect(guidance.quickPrompts).toEqual([
      "帮我比较两个方案方向",
      "检查方案里还缺什么证据",
      "把下一步拆成可执行步骤",
    ]);
  });

  it("gives project practice its own testing and iteration prompts", () => {
    const guidance = getCompanionStudioGuidance("make", {
      status: "not-started",
      reason: "还没有提交作品版本。",
    });

    expect(guidance).toMatchObject({
      tone: "make",
      eyebrow: "制作 · 测试 · 迭代",
      objective: "完成作品、保留版本，并根据测试持续迭代",
      actionLabel: "打开实践工作台",
      nextStep: "还没有提交作品版本。",
    });
    expect(guidance.quickPrompts).toEqual([
      "检查当前版本最需要改进的地方",
      "帮我设计一个可执行的测试",
      "根据测试结果规划下一版",
    ]);
  });

  it("keeps calibration and completion states actionable", () => {
    expect(
      getCompanionStudioGuidance("proposal", {
        status: "awaiting-calibration",
        reason: "等待教师校准。",
      }).nextStep,
    ).toBe("方案已提交，等待教师校准；你可以继续检查风险与证据。");

    expect(
      getCompanionStudioGuidance("make", {
        status: "ready",
        reason: "阶段已完成。",
      }).nextStep,
    ).toBe("作品版本已提交；可以继续测试并上传改进版。");
  });

  it("falls back safely for any future companion stage", () => {
    const guidance = getCompanionStudioGuidance("future-stage", {
      status: "needs-revision",
      reason: "需要补充关键证据。",
    });

    expect(guidance.tone).toBe("default");
    expect(guidance.nextStep).toBe("需要补充关键证据。");
    expect(guidance.quickPrompts).toHaveLength(3);
  });
});
