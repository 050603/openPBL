import { authenticateRequest, requireSameOrigin } from "@/lib/auth/request-guards";
import {
  getKnowledgeLectureTutorSettings,
  saveKnowledgeLectureTutorSettings,
} from "@/lib/knowledge-lecture-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;
  return Response.json({ settings: await getKnowledgeLectureTutorSettings() });
}

export async function POST(request: Request) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const auth = await authenticateRequest(request, "teacher");
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "INVALID_SETTINGS" }, { status: 400 });
  }
  return Response.json({ settings: await saveKnowledgeLectureTutorSettings(body) });
}
