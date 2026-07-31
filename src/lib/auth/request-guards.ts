import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  readAuthFromRequest,
  getRequestedAuthRole,
  type AuthClaims,
  type AuthRole,
} from "@/lib/auth/session";
import { hasCurrentSessionVersion } from "@/lib/auth/session-version";

export async function authenticateRequest(
  request: Request,
  role?: AuthRole,
): Promise<{ claims: AuthClaims } | { response: Response }> {
  const claims = await readAuthFromRequest(
    request,
    role ?? getRequestedAuthRole(request),
  );
  if (!claims || !(await hasCurrentSessionVersion(claims))) {
    return {
      response: Response.json(
        { code: "UNAUTHORIZED", message: "Authentication required.", requestId: requestId(request) },
        { status: 401 },
      ),
    };
  }
  return { claims };
}

export function requireSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Non-browser clients must explicitly opt in with a same-origin Referer or
    // use the load-test token accepted by the dedicated test-data API.
    const referer = request.headers.get("referer");
    if (!referer) return forbidden(request, "Missing Origin header.");
    try {
      if (new URL(referer).origin === expectedOrigin(request)) return null;
    } catch {
      // fall through
    }
    return forbidden(request, "Cross-origin request rejected.");
  }
  try {
    if (new URL(origin).origin === expectedOrigin(request)) return null;
  } catch {
    // fall through
  }
  return forbidden(request, "Cross-origin request rejected.");
}

export function authorizeInternalMonitor(request: Request): Response | null {
  const expected = process.env.INTERNAL_MONITOR_TOKEN;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided || !safeEqual(expected, provided)) {
    return new Response(null, { status: 404 });
  }
  return null;
}

function expectedOrigin(request: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return new URL(configured).origin;
  return new URL(request.url).origin;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function forbidden(request: Request, message: string): Response {
  return Response.json(
    { code: "CSRF_REJECTED", message, requestId: requestId(request) },
    { status: 403 },
  );
}

function requestId(request: Request): string {
  return request.headers.get("x-request-id") ?? randomUUID();
}
