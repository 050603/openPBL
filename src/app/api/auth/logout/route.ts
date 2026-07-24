// Logout endpoint — clears auth cookies.

import {
  clearAuthCookies,
  getRequestedAuthRole,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Keep the other role signed in when teacher and student tabs coexist.
  // Omitting the role header remains an explicit full logout.
  const cookies = clearAuthCookies(getRequestedAuthRole(request));
  const setCookieHeaders = cookies.map(
    (c) =>
      `${c.name}=${c.value}; Path=${c.path}; Max-Age=${c.maxAge}; HttpOnly; SameSite=${c.sameSite}${c.secure ? "; Secure" : ""}`,
  );
  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "Set-Cookie": setCookieHeaders.join(", "),
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}
