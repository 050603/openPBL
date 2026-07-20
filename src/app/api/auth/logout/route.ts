// Logout endpoint — clears auth cookies.

import { clearAuthCookies } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const cookies = clearAuthCookies();
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
