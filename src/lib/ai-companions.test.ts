import { describe, expect, it } from "vitest";
import { AI_COMPANIONS, buildCompanionSystemPrompt, recommendedCompanions } from "./ai-companions";

describe("AI companions", () => {
  it("provides six distinct learning roles", () => {
    expect(AI_COMPANIONS).toHaveLength(6);
    expect(new Set(AI_COMPANIONS.map((item) => item.role)).size).toBe(6);
  });

  it("recommends role-appropriate companions for project practice", () => {
    expect(recommendedCompanions("make").map((item) => item.id)).toEqual(["knowledge", "ideation", "critic", "planner", "reviewer", "recorder"]);
  });

  it("enforces student ownership in every role prompt", () => {
    const prompt = buildCompanionSystemPrompt({ companion: AI_COMPANIONS[2], courseName: "AI 校园", drivingQuestion: "如何设计？", stageLabel: "方案构思与校准", teacherContext: "先说明证据", studentWork: "我准备做一个校园用电提醒器", peerResponses: ["知知：需要先定义用电数据来源"] });
    expect(prompt).toContain("不直接代替学生完成最终作品");
    expect(prompt).toContain("不替学生作最终决定");
    expect(prompt).toContain("采纳或拒绝建议的理由");
    expect(prompt).toContain("校园用电提醒器");
    expect(prompt).toContain("不要复述前序伙伴");
    expect(prompt).toContain("现在就能完成的动作");
  });
});
