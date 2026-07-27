import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { authenticateRequest } from "@/lib/auth/request-guards";
import { withHttpMetrics } from "@/lib/observability/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  after: z.string().regex(/^\d+$/).default("0"),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

async function getCourseEvents(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;
  const { courseId } = await context.params;
  if (auth.claims.role === "student" && auth.claims.courseId !== courseId) {
    return new Response(null, { status: 404 });
  }
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    after: url.searchParams.get("after") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json(
      {
        code: "INVALID_CURSOR",
        message: "Event cursor is invalid.",
        requestId: request.headers.get("x-request-id") ?? "unknown",
      },
      { status: 400 },
    );
  }
  const events = await prisma.courseEvent.findMany({
    where: { courseId, cursor: { gt: BigInt(parsed.data.after) } },
    orderBy: { cursor: "asc" },
    take: parsed.data.limit,
  });
  return Response.json({
    events: events.map((event) => ({
      cursor: event.cursor.toString(),
      type: event.type,
      courseVersion: event.courseVersion,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    })),
    nextCursor: events.at(-1)?.cursor.toString() ?? parsed.data.after,
    hasMore: events.length === parsed.data.limit,
  });
}

export const GET = withHttpMetrics(
  "GET",
  "/api/courses/:courseId/events",
  getCourseEvents,
);
