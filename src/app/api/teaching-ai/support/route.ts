// 服务端 API 路由：统一暴露 teaching-ai/support-engine 的所有函数。
// 客户端组件必须通过此路由调用，避免将 callLLM → settings → node:fs/promises
// 等服务端模块拉入客户端 bundle。

import { NextRequest } from "next/server";
import {
  buildReflectionEvidencePrompts,
  buildShowcaseCoach,
  buildTeacherInterventionSignals,
  diagnoseAllProposals,
  diagnoseGroupIdea,
  diagnoseProjectArtifact,
  generateLiveEvaluation,
  generateProcessEvaluation,
  generateProjectSkeleton,
  suggestProjectDirections,
} from "@/lib/teaching-ai/support-engine";

export const dynamic = "force-dynamic";

type SupportRequest = {
  action: string;
  input: unknown;
};

const HANDLERS: Record<
  string,
  (input: unknown) => Promise<unknown>
> = {
  diagnoseGroupIdea: (input) => diagnoseGroupIdea(input as Parameters<typeof diagnoseGroupIdea>[0]),
  diagnoseProjectArtifact: (input) =>
    diagnoseProjectArtifact(input as Parameters<typeof diagnoseProjectArtifact>[0]),
  buildShowcaseCoach: (input) => buildShowcaseCoach(input as Parameters<typeof buildShowcaseCoach>[0]),
  buildReflectionEvidencePrompts: (input) =>
    buildReflectionEvidencePrompts(input as Parameters<typeof buildReflectionEvidencePrompts>[0]),
  buildTeacherInterventionSignals: (input) => {
    const { course, stageKey } = input as { course: Parameters<typeof buildTeacherInterventionSignals>[0]; stageKey: string };
    return buildTeacherInterventionSignals(course, stageKey);
  },
  generateProjectSkeleton: (input) =>
    generateProjectSkeleton(input as Parameters<typeof generateProjectSkeleton>[0]),
  diagnoseAllProposals: (input) => diagnoseAllProposals(input as Parameters<typeof diagnoseAllProposals>[0]),
  generateProcessEvaluation: (input) =>
    generateProcessEvaluation(input as Parameters<typeof generateProcessEvaluation>[0]),
  generateLiveEvaluation: (input) =>
    generateLiveEvaluation(input as Parameters<typeof generateLiveEvaluation>[0]),
  suggestProjectDirections: (input) =>
    suggestProjectDirections(input as Parameters<typeof suggestProjectDirections>[0]),
};

export async function POST(req: NextRequest) {
  let body: SupportRequest;
  try {
    body = (await req.json()) as SupportRequest;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (!body?.action || !body.input) {
    return Response.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  const handler = HANDLERS[body.action];
  if (!handler) {
    return Response.json({ error: `UNKNOWN_ACTION: ${body.action}` }, { status: 400 });
  }

  try {
    const result = await handler(body.input);
    return Response.json({ result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[api/teaching-ai/support] action=${body.action} failed:`, message);
    return Response.json({ error: "SUPPORT_CALL_FAILED", detail: message }, { status: 500 });
  }
}
