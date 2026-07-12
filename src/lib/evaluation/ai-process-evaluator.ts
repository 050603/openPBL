export type AiCollaborationEvidence = {
  interactionCount: number;
  specificContextCount: number;
  independentProgressCount: number;
  verificationCount: number;
  artifactChangeCount: number;
  corroborationCount: number;
  delegationPatternCount: number;
};

export type AiCollaborationHealth =
  | { status: "insufficient-evidence"; score: null; reasons: string[] }
  | { status: "scored"; score: number; reasons: string[] };

export function evaluateAiCollaborationHealth(evidence: AiCollaborationEvidence): AiCollaborationHealth {
  const observable = evidence.specificContextCount + evidence.independentProgressCount + evidence.verificationCount + evidence.artifactChangeCount + evidence.corroborationCount + evidence.delegationPatternCount;
  if (observable < 2) return { status: "insufficient-evidence", score: null, reasons: ["可观察的提问、核验或产物变化证据不足"] };
  const positive = Math.min(20, evidence.specificContextCount * 4) + Math.min(25, evidence.independentProgressCount * 5) + Math.min(20, evidence.verificationCount * 5) + Math.min(20, evidence.artifactChangeCount * 4) + Math.min(15, evidence.corroborationCount * 5);
  const penalty = Math.min(60, evidence.delegationPatternCount * 25);
  const score = Math.max(0, Math.min(100, positive - penalty));
  const reasons = [
    evidence.verificationCount ? "能核验或修改 AI 输出" : "尚未观察到核验行为",
    evidence.artifactChangeCount ? "对话后产生了实际产物推进" : "对话后产物推进证据不足",
    evidence.delegationPatternCount ? "出现直接索要完整答案或代做的模式" : "未发现明显代做依赖",
  ];
  return { status: "scored", score, reasons };
}
