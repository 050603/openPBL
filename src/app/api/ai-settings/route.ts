import { readAiSettings, saveAiSettings, toPublicAiSettings } from "@/lib/llm/settings";
import type { AiProviderSettings } from "@/lib/session/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await readAiSettings();
  return Response.json(toPublicAiSettings(settings));
}

export async function POST(req: Request) {
  let body: AiProviderSettings;
  try {
    body = (await req.json()) as AiProviderSettings;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (!body.endpoint || !body.model) {
    return Response.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }
  const settings = await saveAiSettings(body);
  return Response.json(toPublicAiSettings(settings));
}
