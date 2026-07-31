import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PblModuleTimingPanel } from "./pbl-module-timing-panel";
import { buildPblModelTimingPlan } from "@/lib/pbl-time-model";

const modules = [
  { id: "launch", stageKey: "launch", durationMin: 1 },
  { id: "knowledge", stageKey: "ai-learning", durationMin: 1 },
  { id: "proposal", stageKey: "proposal", durationMin: 1 },
  { id: "practice", stageKey: "make", durationMin: 1 },
  { id: "showcase", stageKey: "showcase", durationMin: 1 },
  { id: "reflection", stageKey: "reflection", durationMin: 1 },
];

describe("PblModuleTimingPanel", () => {
  it("discloses the model source, confidence, evidence, assumptions, and stage rationale", () => {
    const plan = buildPblModelTimingPlan(60, modules, {
      allocations: [
        { stageKey: "launch", durationMin: 6, rationale: "用校园案例建立驱动问题。" },
        { stageKey: "ai-learning", durationMin: 14, rationale: "两个核心知识点存在先修依赖。" },
        { stageKey: "proposal", durationMin: 6, rationale: "需要比较两种方案。" },
        { stageKey: "make", durationMin: 24, rationale: "保留制作与迭代时间。" },
        { stageKey: "showcase", durationMin: 7, rationale: "完成展示和反馈。" },
        { stageKey: "reflection", durationMin: 3, rationale: "形成迁移计划。" },
      ],
      evidence: ["八年级", "学生需要分步案例"],
      assumptions: ["按常规班额估算"],
      confidence: "high",
    });
    const plannedModules = modules.map((module) => ({
      ...module,
      durationMin: plan.allocations.find((item) => item.id === module.id)?.durationMin ?? 1,
    }));

    render(
      <PblModuleTimingPanel
        moduleActivities={plannedModules}
        readOnly
        timingPlan={plan}
        totalMinutes={60}
      />,
    );

    expect(screen.getByText(/大模型分析 · 高置信度/)).toBeTruthy();
    expect(screen.getByText(/学生需要分步案例/)).toBeTruthy();
    expect(screen.getByText(/按常规班额估算/)).toBeTruthy();
    expect(screen.getByText(/两个核心知识点存在先修依赖/)).toBeTruthy();
  });
});
