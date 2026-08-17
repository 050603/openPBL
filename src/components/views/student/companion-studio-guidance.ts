import type { StageReadiness } from "@/lib/learning-evidence/types";

type GuidanceReadiness = Pick<StageReadiness, "status" | "reason">;

export type CompanionStudioGuidance = {
  tone: "proposal" | "make" | "default";
  eyebrow: string;
  objective: string;
  actionLabel: string;
  quickPrompts: readonly [string, string, string];
  nextStep: string;
};

const proposalGuidance = {
  tone: "proposal",
  eyebrow: "构思 · 验证",
  objective: "把方向变成一份可实施、可验证的方案",
  actionLabel: "打开方案工作台",
  quickPrompts: [
    "帮我比较两个方案方向",
    "检查方案里还缺什么证据",
    "把下一步拆成可执行步骤",
  ],
} as const;

const makeGuidance = {
  tone: "make",
  eyebrow: "制作 · 测试 · 迭代",
  objective: "完成作品、保留版本，并根据测试持续迭代",
  actionLabel: "打开实践工作台",
  quickPrompts: [
    "检查当前版本最需要改进的地方",
    "帮我设计一个可执行的测试",
    "根据测试结果规划下一版",
  ],
} as const;

const defaultGuidance = {
  tone: "default",
  eyebrow: "探索 · 推进",
  objective: "和智能体一起梳理思路，明确当前最值得推进的一步",
  actionLabel: "打开阶段工作台",
  quickPrompts: [
    "帮我梳理当前思路",
    "检查我还缺少什么证据",
    "把下一步拆成可执行步骤",
  ],
} as const;

function normalizeReadinessReason(reason: string) {
  return reason.replace(/^下一步[：:][\s]*/, "").trim();
}

function getNextStep(
  tone: CompanionStudioGuidance["tone"],
  readiness: GuidanceReadiness,
) {
  if (readiness.status === "awaiting-calibration" && tone === "proposal") {
    return "方案已提交，等待教师校准；你可以继续检查风险与证据。";
  }

  if (readiness.status === "ready") {
    if (tone === "proposal") {
      return "方案已达标；回看教师校准与最终决定。";
    }
    if (tone === "make") {
      return "作品版本已提交；可以继续测试并上传改进版。";
    }
  }

  return normalizeReadinessReason(readiness.reason) || "选择一位智能体，先说说你正在解决的问题。";
}

export function getCompanionStudioGuidance(
  stageKey: string,
  readiness: GuidanceReadiness,
): CompanionStudioGuidance {
  const base = stageKey === "proposal"
    ? proposalGuidance
    : stageKey === "make"
      ? makeGuidance
      : defaultGuidance;

  return {
    ...base,
    nextStep: getNextStep(base.tone, readiness),
  };
}
