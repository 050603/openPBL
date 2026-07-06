import { readSessionState } from "@/lib/session/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readSessionState();
  return Response.json(state);
}
