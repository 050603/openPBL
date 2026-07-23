import { readSessionState } from "@/lib/session/server-store";
import { readAuthFromRequest, isAuthConfigured } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // 纵深防御：middleware 已拦截未认证请求，
  // 但这里二次校验以防 matcher 遗漏（如裸路径）。
  if (isAuthConfigured()) {
    const claims = await readAuthFromRequest(req);
    if (!claims) {
      return Response.json(
        { error: "UNAUTHORIZED", message: "请先登录" },
        { status: 401 },
      );
    }
  }
  const state = await readSessionState();
  return Response.json(state);
}
