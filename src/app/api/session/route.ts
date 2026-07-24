import { readSessionState } from "@/lib/session/server-store";
import {
  getRequestedAuthRole,
  readAuthFromRequest,
  isAuthConfigured,
} from "@/lib/auth/session";
import { scopeSessionStateForAuth } from "@/lib/auth/session-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // 纵深防御：middleware 已拦截未认证请求，
  // 但这里二次校验以防 matcher 遗漏（如裸路径）。
  if (isAuthConfigured()) {
    const claims = await readAuthFromRequest(req, getRequestedAuthRole(req));
    if (!claims) {
      return Response.json(
        { error: "UNAUTHORIZED", message: "请先登录" },
        { status: 401 },
      );
    }
    try {
      const state = await readSessionState();
      return Response.json(scopeSessionStateForAuth(state, claims));
    } catch (error) {
      console.error("[session] unable to load session state:", error);
      return Response.json(
        { error: "SESSION_UNAVAILABLE", message: "课堂数据服务暂时不可用" },
        { status: 503 },
      );
    }
  }
  try {
    return Response.json(await readSessionState());
  } catch (error) {
    console.error("[session] unable to load session state:", error);
    return Response.json(
      { error: "SESSION_UNAVAILABLE", message: "课堂数据服务暂时不可用" },
      { status: 503 },
    );
  }
}
