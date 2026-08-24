import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { isBackgroundCourseGenerationEnabled } from "@/lib/course-generation/capability";
import {
  cancelCourseDesignJob,
  pauseCourseDesignForOutlineReview,
  resumeCourseDesignAfterOutlineReview,
  runCourseDesignJob,
  resumeRecoverableCourseDesignJob,
  initialQuickGenerationEstimateSeconds,
  type QuickDesignRequest,
} from "@/lib/course-design/job-runner";
import { isAuthConfigured, readAuthFromRequest } from "@/lib/auth/session";
import { isSameCourseDesignRequest } from "@/lib/course-design/resume-policy";
import { formatFatalCourseDesignError } from "@/lib/course-design/failure-policy";
import type { LessonOutlineSection, OpenMaicSceneOutlineSnapshot } from "@/lib/session/types";
import { getCourse } from "@/lib/session/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(request: NextRequest): Promise<string | null> {
  if (!isAuthConfigured()) return null;
  const claims = await readAuthFromRequest(request, "teacher");
  return claims?.role === "teacher" ? (claims.sub ?? "") : "";
}

function responseJob(job: Awaited<ReturnType<typeof prisma.courseDesignGenerationJob.findUnique>>) {
  if (!job) return null;
  const request = job.request as unknown as Partial<QuickDesignRequest>;
  return {
    id: job.id,
    status: job.status,
    step: job.step,
    reviewStatus: job.reviewStatus,
    reviewAvailableUntil: job.reviewAvailableUntil?.toISOString() ?? null,
    stepIndex: job.stepIndex,
    progress: job.progress,
    message: job.message,
    estimatedRemainingSeconds: job.estimatedRemainingSeconds,
    trace: job.trace,
    qualityReport: job.qualityReport,
    // Never expose model review diagnostics or historical raw worker errors to
    // teachers. Correctable failures are resumed by GET; terminal failures use
    // a safe, actionable system-level message only.
    error: job.status === "failed" && job.error
      ? formatFatalCourseDesignError(new Error(job.error))
      : null,
    startedAt: job.startedAt?.toISOString() ?? null,
    lastHeartbeatAt: job.lastHeartbeatAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(),
    requestPreview: {
      teacherBrief: typeof request.teacherBrief === "string" ? request.teacherBrief : "",
      options: request.options ?? null,
    },
  };
}

async function structuredResponse(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    const migrationMissing = error instanceof Prisma.PrismaClientKnownRequestError
      && (error.code === "P2021" || error.code === "P2022");
    return Response.json({
      error: migrationMissing ? "FAST_GENERATION_MIGRATION_REQUIRED" : "FAST_GENERATION_UNAVAILABLE",
      detail: migrationMissing
        ? "快速生成所需的数据库迁移尚未应用，请先执行 prisma migrate deploy 后重试。"
        : "快速生成服务暂时不可用，请稍后重试。",
    }, { status: 503 });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  return structuredResponse(async () => {
    const requestedBy = await authorize(request);
    if (requestedBy === "") return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { courseId } = await context.params;
    let job = await prisma.courseDesignGenerationJob.findUnique({ where: { courseId } });
    if (job?.status === "failed") {
      job = await resumeRecoverableCourseDesignJob(courseId);
    }
    const course = job && ["review_available", "paused"].includes(job.status)
      ? await getCourse(courseId)
      : null;
    return Response.json({
      backgroundEnabled: isBackgroundCourseGenerationEnabled(),
      job: responseJob(job),
      outlinePreview: course?.content._openmaicSceneOutlines ?? [],
    });
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  return structuredResponse(async () => {
    const requestedBy = await authorize(request);
    if (requestedBy === "") return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { courseId } = await context.params;
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) return Response.json({ error: "Course not found" }, { status: 404 });
    const body = await request.json().catch(() => null) as {
      teacherBrief?: unknown;
      options?: Partial<NonNullable<QuickDesignRequest["options"]>>;
    } | null;
    const teacherBrief = typeof body?.teacherBrief === "string" ? body.teacherBrief.trim().slice(0, 4_000) : "";
    if (!teacherBrief) return Response.json({ error: "请先描述课程生成要求。" }, { status: 400 });
    const quickRequest: QuickDesignRequest = {
      courseId,
      teacherBrief,
      options: {
        enableImageGeneration: body?.options?.enableImageGeneration !== false,
        enableTTS: body?.options?.enableTTS !== false,
        enableVideoGeneration: body?.options?.enableVideoGeneration === true,
      },
    };
    const requestJson = quickRequest as unknown as Prisma.InputJsonValue;
    const estimate = initialQuickGenerationEstimateSeconds(quickRequest.options);
    let job = await prisma.courseDesignGenerationJob.findUnique({ where: { courseId } });

    if (!job) {
      job = await prisma.courseDesignGenerationJob.create({
        data: { courseId, requestedBy: requestedBy || null, request: requestJson, estimatedRemainingSeconds: estimate },
      });
    } else if (job.status === "failed" || job.status === "cancelled") {
      const preserveValidatedStages = isSameCourseDesignRequest(job.request, quickRequest);
      job = await prisma.courseDesignGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "queued",
          step: "queued",
          reviewStatus: "unavailable",
          reviewAvailableUntil: null,
          stepIndex: 0,
          progress: 0,
          message: "快速生成任务已重新提交",
          estimatedRemainingSeconds: estimate,
          request: requestJson,
          trace: preserveValidatedStages
            ? job.trace as Prisma.InputJsonValue
            : [],
          qualityReport: Prisma.JsonNull,
          error: null,
          startedAt: null,
          completedAt: null,
          lastHeartbeatAt: null,
          retryAt: null,
          version: { increment: 1 },
        },
      });
    }

    const backgroundEnabled = isBackgroundCourseGenerationEnabled();
    if (!backgroundEnabled && job.status === "queued") {
      const startedAt = new Date();
      const claimed = await prisma.courseDesignGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "running",
          step: "base",
          message: "正在分析课程信息",
          startedAt,
          lastHeartbeatAt: startedAt,
          attempt: { increment: 1 },
          version: { increment: 1 },
        },
      });
      job = claimed;
      void runCourseDesignJob(claimed);
    }

    return Response.json({ backgroundEnabled, job: responseJob(job) }, { status: 202 });
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  return structuredResponse(async () => {
    const requestedBy = await authorize(request);
    if (requestedBy === "") return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { courseId } = await context.params;
    const body = await request.json().catch(() => null) as {
      action?: unknown;
      lessonOutline?: unknown;
      sceneOutlines?: unknown;
    } | null;
    if (body?.action !== "pause" && body?.action !== "resume") {
      return Response.json({ error: "INVALID_REVIEW_ACTION" }, { status: 400 });
    }

    let job = body.action === "pause"
      ? await pauseCourseDesignForOutlineReview(courseId)
      : await resumeCourseDesignAfterOutlineReview(courseId, {
          lessonOutline: Array.isArray(body.lessonOutline)
            ? body.lessonOutline.slice(0, 240) as LessonOutlineSection[]
            : undefined,
          sceneOutlines: Array.isArray(body.sceneOutlines)
            ? body.sceneOutlines.slice(0, 240) as OpenMaicSceneOutlineSnapshot[]
            : undefined,
        });
    if (!job) return Response.json({ error: "FAST_GENERATION_NOT_FOUND" }, { status: 404 });

    const backgroundEnabled = isBackgroundCourseGenerationEnabled();
    if (body.action === "resume" && !backgroundEnabled && job.status === "queued") {
      const startedAt = new Date();
      job = await prisma.courseDesignGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "running",
          message: "正在按教师确认的大纲继续生成",
          startedAt: job.startedAt ?? startedAt,
          lastHeartbeatAt: startedAt,
          attempt: { increment: 1 },
          version: { increment: 1 },
        },
      });
      void runCourseDesignJob(job);
    }

    return Response.json({ backgroundEnabled, job: responseJob(job) });
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  return structuredResponse(async () => {
    const requestedBy = await authorize(request);
    if (requestedBy === "") return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { courseId } = await context.params;
    const job = await cancelCourseDesignJob(courseId);
    return Response.json({
      backgroundEnabled: isBackgroundCourseGenerationEnabled(),
      job: responseJob(job),
    });
  });
}
