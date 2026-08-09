import { Prisma } from "@prisma/client";
import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { isBackgroundCourseGenerationEnabled } from "@/lib/course-generation/capability";
import type { PersistedCourseGenerationRequest } from "@/lib/course-generation/job-runner";
import { isAuthConfigured, readAuthFromRequest } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(request: NextRequest): Promise<string | null> {
  if (!isAuthConfigured()) return null;
  const claims = await readAuthFromRequest(request, "teacher");
  return claims?.role === "teacher" ? (claims.sub ?? "") : "";
}

function responseJob(job: Awaited<ReturnType<typeof prisma.courseGenerationJob.findUnique>>) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    step: job.step,
    progress: job.progress,
    message: job.message,
    scenesGenerated: job.scenesGenerated,
    totalScenes: job.totalScenes,
    estimatedRemainingSeconds: job.estimatedRemainingSeconds,
    events: job.events,
    result: job.result,
    error: job.error,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  const requestedBy = await authorize(request);
  if (requestedBy === "") return Response.json({ error: "Unauthorized" }, { status: 401 });
  const backgroundEnabled = isBackgroundCourseGenerationEnabled();
  if (!backgroundEnabled) return Response.json({ backgroundEnabled, job: null });
  const { courseId } = await context.params;
  const job = await prisma.courseGenerationJob.findUnique({ where: { courseId } });
  return Response.json({ backgroundEnabled, job: responseJob(job) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  const requestedBy = await authorize(request);
  if (requestedBy === "") return Response.json({ error: "Unauthorized" }, { status: 401 });
  const backgroundEnabled = isBackgroundCourseGenerationEnabled();
  if (!backgroundEnabled) return Response.json({ backgroundEnabled, job: null });

  const { courseId } = await context.params;
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) return Response.json({ error: "Course not found" }, { status: 404 });

  const body = await request.json() as PersistedCourseGenerationRequest;
  if (body.courseId !== courseId || typeof body.requirement !== "string" || !body.requirement.trim()) {
    return Response.json({ error: "Invalid generation request" }, { status: 400 });
  }
  const totalScenes = Array.isArray(body.sceneOutlines) ? body.sceneOutlines.length : 0;
  const adaptiveBranchCount = Math.max(0, Math.round(body.adaptiveBranchCount ?? 0));
  const initialEstimate = Math.max(
    5 * 60,
    120 + Math.max(totalScenes, 6) * 35 + adaptiveBranchCount * 90,
  );
  const requestJson = body as unknown as Prisma.InputJsonValue;
  let job = await prisma.courseGenerationJob.findUnique({ where: { courseId } });

  if (!job) {
    try {
      job = await prisma.courseGenerationJob.create({
        data: {
          courseId,
          requestedBy: requestedBy || null,
          request: requestJson,
          totalScenes,
          estimatedRemainingSeconds: initialEstimate,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      job = await prisma.courseGenerationJob.findUnique({ where: { courseId } });
    }
  } else if (job.status === "failed") {
    job = await prisma.courseGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "queued",
        step: "queued",
        progress: 0,
        message: "课程生成任务已重新提交",
        scenesGenerated: 0,
        totalScenes,
        estimatedRemainingSeconds: initialEstimate,
        request: requestJson,
        result: Prisma.JsonNull,
        events: [],
        error: null,
        startedAt: null,
        completedAt: null,
        lastHeartbeatAt: null,
        version: { increment: 1 },
      },
    });
  }

  return Response.json({ backgroundEnabled, job: responseJob(job) }, { status: 202 });
}
