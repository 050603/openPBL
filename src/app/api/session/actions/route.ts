import { dispatchSessionAction } from "@/lib/session/server-store";
import type { SessionAction } from "@/lib/session/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let action: SessionAction;
  try {
    action = (await req.json()) as SessionAction;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (!action || typeof action.type !== "string") {
    return Response.json({ error: "INVALID_ACTION" }, { status: 400 });
  }

  const state = await dispatchSessionAction(action);
  return Response.json(state);
}
