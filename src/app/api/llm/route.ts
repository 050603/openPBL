// Server-side route for the LLM generation API.
// Centralizes the LLM call so the browser never holds the API key.

import { NextRequest } from "next/server";
import { generateCourseContent, isActiveLlmConfigured } from "@/lib/llm/client";
import type { LlmCallRequest } from "@/lib/llm/types";
import { LlmNotConfiguredError } from "@/lib/llm/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: LlmCallRequest;
  try {
    body = (await req.json()) as LlmCallRequest;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (!body || !body.action || !body.input) {
    return Response.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }
  try {
    const result = await generateCourseContent(body);
    return Response.json({
      ...result,
      llmConfigured: await isActiveLlmConfigured(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isNotConfigured = e instanceof LlmNotConfiguredError;
    return Response.json(
      { error: isNotConfigured ? "LLM_NOT_CONFIGURED" : "LLM_CALL_FAILED", detail: message },
      { status: isNotConfigured ? 503 : 500 },
    );
  }
}
