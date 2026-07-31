import { z } from "zod";
import { authenticateRequest, requireSameOrigin } from "@/lib/auth/request-guards";
import { getRedisClient } from "@/lib/redis/client";
import type { AuthClaims } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ courseId: z.string().uuid() });
const PRESENCE_TTL_MS = 60_000;
const KEY_TTL_SECONDS = 120;

export async function PUT(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;
  const parsed = ParamsSchema.safeParse(await context.params);
  if (!parsed.success) return new Response(null, { status: 404 });
  if (auth.claims.role === "student" && auth.claims.courseId !== parsed.data.courseId) {
    return new Response(null, { status: 404 });
  }
  const redis = await getRedisClient();
  if (!redis) return Response.json({ online: true, degraded: true });

  const now = Date.now();
  const member = `${auth.claims.role}:${auth.claims.sub}`;
  const zset = presenceKey(parsed.data.courseId);
  const details = detailsKey(parsed.data.courseId);
  await redis
    .multi()
    .zAdd(zset, { score: now, value: member })
    .zRemRangeByScore(zset, 0, now - PRESENCE_TTL_MS)
    .hSet(details, member, JSON.stringify(publicPresence(auth.claims)))
    .expire(zset, KEY_TTL_SECONDS)
    .expire(details, KEY_TTL_SECONDS)
    .exec();
  return Response.json({ online: true, expiresInSeconds: PRESENCE_TTL_MS / 1_000 });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;
  const parsed = ParamsSchema.safeParse(await context.params);
  if (!parsed.success) return new Response(null, { status: 404 });
  if (auth.claims.role === "student" && auth.claims.courseId !== parsed.data.courseId) {
    return new Response(null, { status: 404 });
  }
  const redis = await getRedisClient();
  if (redis) {
    const member = `${auth.claims.role}:${auth.claims.sub}`;
    await redis
      .multi()
      .zRem(presenceKey(parsed.data.courseId), member)
      .hDel(detailsKey(parsed.data.courseId), member)
      .exec();
  }
  return new Response(null, { status: 204 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;
  const parsed = ParamsSchema.safeParse(await context.params);
  if (!parsed.success) return new Response(null, { status: 404 });
  if (auth.claims.role === "student" && auth.claims.courseId !== parsed.data.courseId) {
    return new Response(null, { status: 404 });
  }
  const redis = await getRedisClient();
  if (!redis) return Response.json({ members: [], degraded: true });
  const now = Date.now();
  const zset = presenceKey(parsed.data.courseId);
  await redis.zRemRangeByScore(zset, 0, now - PRESENCE_TTL_MS);
  const members = await redis.zRangeByScore(zset, now - PRESENCE_TTL_MS, "+inf");
  const details = members.length
    ? await redis.hmGet(detailsKey(parsed.data.courseId), members)
    : [];
  return Response.json({
    members: details.flatMap((value) => {
      if (!value) return [];
      try {
        return [JSON.parse(value) as unknown];
      } catch {
        return [];
      }
    }),
  });
}

function publicPresence(claims: AuthClaims) {
  return claims.role === "teacher"
    ? { id: claims.sub, role: claims.role, name: claims.displayName }
    : { id: claims.studentId, role: claims.role, name: claims.studentName };
}

function presenceKey(courseId: string): string {
  return `openpbl:presence:${courseId}`;
}

function detailsKey(courseId: string): string {
  return `openpbl:presence-details:${courseId}`;
}
