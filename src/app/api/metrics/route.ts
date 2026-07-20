// Prometheus metrics scrape endpoint.
// GET /api/metrics -> text/plain Prometheus exposition format.

import { register } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const metrics = await register.metrics();
  return new Response(metrics, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
