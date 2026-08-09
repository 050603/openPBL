import { Prisma, type CourseGenerationJob } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { createLogger } from "@openmaic/lib/logger";
import {
  generateClassroom,
  type ClassroomGenerationProgress,
  type GenerateClassroomInput,
} from "@openmaic/lib/server/classroom-generation";
import { generateClassroomAssets } from "@openmaic/lib/server/classroom-asset-generation";
import { splitGeneratedClassroom } from "@/lib/openmaic-bridge/server-classroom-split";
import { linkClassroomToCourse } from "@/lib/openmaic-bridge/course-linker";
import { isAbortError } from "@openmaic/lib/generation/generation-retry";
import { getCourse, updateCourse } from "@/lib/session/server-store";
import { selectAdaptiveBranchesForGeneration } from "@/lib/teacher/adaptive-resource-generation";
import type { SceneOutline } from "@/lib/openmaic/types/generation";

const log = createLogger("CourseGenerationWorker");
const POLL_INTERVAL_MS = 1_500;
const STALE_AFTER_MS = 30 * 60 * 1_000;
const MAX_STORED_EVENTS = 80;

export type PersistedCourseGenerationRequest = GenerateClassroomInput & {
  courseId: string;
  courseTitle?: string;
  moduleTimingPlan?: unknown;
  adaptiveBranchCount?: number;
};

export type CourseGenerationJobEvent = {
  step: string;
  progress: number;
  message: string;
  scenesGenerated: number;
  totalScenes: number;
  ts: number;
};

let workerStarted = false;
let stopping = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let activeController: AbortController | null = null;

function asEvents(value: Prisma.JsonValue): CourseGenerationJobEvent[] {
  return Array.isArray(value)
    ? value.filter((item): item is CourseGenerationJobEvent => Boolean(item && typeof item === "object"))
    : [];
}

function localizedProgress(progress: ClassroomGenerationProgress): string {
  switch (progress.step) {
    case "initializing": return "正在初始化课程生成环境";
    case "researching": return "正在整理课程资料与教学要求";
    case "generating_outlines": return "正在生成课程结构与页面安排";
    case "generating_scenes":
      return progress.scenesGenerated > 0 && progress.totalScenes
        ? `已完成 ${progress.scenesGenerated} / ${progress.totalScenes} 个课堂页面`
        : "正在制作课堂页面与讲授内容";
    case "generating_media": return "正在补充课程图片与媒体资源";
    case "generating_tts": return "正在生成课堂语音";
    case "persisting": return "正在保存并检查课程内容";
    case "completed": return "课程内容已生成完成";
  }
}

function initialEstimateSeconds(totalScenes: number): number {
  // The current generator normally completes a 14-page course in roughly ten
  // minutes. This baseline is replaced by observed throughput as pages finish.
  return Math.max(5 * 60, 120 + Math.max(totalScenes, 6) * 35);
}

function estimateRemainingSeconds(input: {
  startedAt: Date;
  scenePhaseStartedAt: number | null;
  scenesGenerated: number;
  totalScenes: number;
  progress: number;
}): number {
  const elapsed = Math.max(1, (Date.now() - input.startedAt.getTime()) / 1_000);
  if (input.scenesGenerated > 0 && input.totalScenes > input.scenesGenerated) {
    const phaseElapsed = input.scenePhaseStartedAt
      ? Math.max(1, (Date.now() - input.scenePhaseStartedAt) / 1_000)
      : elapsed;
    const observedWallSecondsPerPage = phaseElapsed / input.scenesGenerated;
    const secondsPerPage = Math.min(75, Math.max(25, observedWallSecondsPerPage));
    return Math.max(45, Math.round((input.totalScenes - input.scenesGenerated) * secondsPerPage + 60));
  }
  if (input.progress >= 90) return Math.max(20, Math.round(elapsed * 0.08));
  const baseline = initialEstimateSeconds(input.totalScenes);
  return Math.max(45, Math.round(baseline - elapsed));
}

async function persistProgress(
  job: CourseGenerationJob,
  progress: ClassroomGenerationProgress,
  scenePhaseStartedAt: number | null,
): Promise<void> {
  const message = localizedProgress(progress);
  const event: CourseGenerationJobEvent = {
    step: progress.step,
    // The primary classroom owns 0-90. Splitting, adaptive resources and the
    // final durable save own the remaining range.
    progress: Math.max(job.progress, Math.min(90, progress.progress)),
    message,
    scenesGenerated: Math.max(job.scenesGenerated, progress.scenesGenerated),
    totalScenes: progress.totalScenes ?? job.totalScenes,
    ts: Date.now(),
  };
  const events = [...asEvents(job.events), event].slice(-MAX_STORED_EVENTS);
  const remaining = estimateRemainingSeconds({
    startedAt: job.startedAt ?? job.createdAt,
    scenePhaseStartedAt,
    scenesGenerated: event.scenesGenerated,
    totalScenes: event.totalScenes,
    progress: event.progress,
  });
  const updated = await prisma.courseGenerationJob.update({
    where: { id: job.id },
    data: {
      step: event.step,
      progress: event.progress,
      message,
      scenesGenerated: event.scenesGenerated,
      totalScenes: event.totalScenes,
      estimatedRemainingSeconds: remaining,
      events: events as unknown as Prisma.InputJsonValue,
      lastHeartbeatAt: new Date(),
      version: { increment: 1 },
    },
  });
  Object.assign(job, updated);
}

async function persistAdaptiveProgress(
  job: CourseGenerationJob,
  input: { completed: number; total: number; branchProgress: number; title: string },
): Promise<void> {
  const combined = input.total > 0
    ? (input.completed + Math.max(0, Math.min(100, input.branchProgress)) / 100) / input.total
    : 1;
  const progress = Math.min(98, 90 + Math.round(combined * 8));
  const message = `正在生成分层学习资源：${input.title}（${Math.min(input.completed + 1, input.total)} / ${input.total}）`;
  const event: CourseGenerationJobEvent = {
    step: "generating_adaptive_resources",
    progress,
    message,
    scenesGenerated: job.scenesGenerated,
    totalScenes: job.totalScenes,
    ts: Date.now(),
  };
  const events = [...asEvents(job.events), event].slice(-MAX_STORED_EVENTS);
  const updated = await prisma.courseGenerationJob.update({
    where: { id: job.id },
    data: {
      step: event.step,
      progress: Math.max(job.progress, progress),
      message,
      estimatedRemainingSeconds: Math.max(30, (input.total - input.completed) * 90),
      events: events as unknown as Prisma.InputJsonValue,
      lastHeartbeatAt: new Date(),
      version: { increment: 1 },
    },
  });
  Object.assign(job, updated);
}

async function prepareAdaptiveResources(
  job: CourseGenerationJob,
  courseId: string,
  signal: AbortSignal,
): Promise<void> {
  const course = await getCourse(courseId);
  const plan = course?.content.adaptiveLearningPlan;
  if (!course || !plan?.enabled || plan.status !== "teacher-confirmed") return;
  const branches = selectAdaptiveBranchesForGeneration(plan.branches);
  if (branches.length === 0) return;

  const resources = new Map<string, NonNullable<(typeof branches)[number]["preparedResource"]>>();
  for (let index = 0; index < branches.length; index += 1) {
    const branch = branches[index];
    try {
      const sceneOutline: SceneOutline = {
        id: `adaptive-${branch.id}`,
        type: branch.sceneType ?? "slide",
        title: branch.title,
        description: branch.objective,
        keyPoints: branch.keyPoints,
        teachingObjective: branch.objective,
        estimatedDuration: branch.targetDurationSec,
        targetDurationSec: branch.targetDurationSec,
        order: 0,
        stageKey: "ai-learning",
        stageLabel: "AI 授知",
        audience: "student",
        generationPurpose: "knowledge-teaching",
        detailKind: "knowledge-explanation",
        knowledgePointIds: branch.anchorKnowledgePointIds,
        ttsPolicy: "target-duration",
        resourceTypes: branch.sceneType === "interactive" ? ["interactive-demo"] : ["ppt"],
      };
      const generated = await generateClassroom({
        courseTitle: `${course.name} · ${branch.title}`,
        requirement: [
          `生成一份可由教师预览、可在同一播放器中连续插入主课程的${branch.kind === "prerequisite" ? "先决知识回顾" : "额外学习"}资源。`,
          `主课程：${course.name}`,
          `分支目标：${branch.objective}`,
          `知识要点：${branch.keyPoints.join("、")}`,
          `相对主课新增价值：${branch.noveltyStatement}`,
          `教师指导：${branch.generationGuidance || "遵循分支目标与课程原有教学风格。"}`,
          `总时长控制在 ${branch.targetDurationSec} 秒左右，结尾自然返回主课程。`,
        ].join("\n"),
        sceneOutlines: [sceneOutline],
        enableTTS: true,
        interactiveMode: branch.sceneType === "interactive",
      }, {
        signal,
        onProgress: (progress) => persistAdaptiveProgress(job, {
          completed: index,
          total: branches.length,
          branchProgress: progress.progress,
          title: branch.title,
        }),
      });
      const split = await splitGeneratedClassroom({
        stage: generated.stage,
        scenes: generated.scenes,
        courseName: `${course.name} · ${branch.title}`,
        pblMode: false,
        signal,
      });
      resources.set(branch.id, {
        status: "ready",
        classroomId: split.studentClassroomId,
        scenesCount: split.studentSceneCount,
        generatedAt: new Date().toISOString(),
      });
      await persistAdaptiveProgress(job, {
        completed: index + 1,
        total: branches.length,
        branchProgress: 0,
        title: branch.title,
      });
    } catch (error) {
      if (signal.aborted || isAbortError(error)) throw error;
      resources.set(branch.id, {
        status: "failed",
        generatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await updateCourse(courseId, (current) => ({
    ...current,
    content: {
      ...current.content,
      adaptiveLearningPlan: {
        ...plan,
        updatedAt: new Date().toISOString(),
        branches: plan.branches.map((branch) => ({
          ...branch,
          preparedResource: resources.get(branch.id) ?? branch.preparedResource,
        })),
      },
    },
  }));
}

async function claimNextJob(): Promise<CourseGenerationJob | null> {
  const candidate = await prisma.courseGenerationJob.findFirst({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;
  const now = new Date();
  const claimed = await prisma.courseGenerationJob.updateMany({
    where: { id: candidate.id, status: "queued" },
    data: {
      status: "running",
      step: "initializing",
      message: "正在启动课程生成任务",
      startedAt: now,
      lastHeartbeatAt: now,
      error: null,
      attempt: { increment: 1 },
      version: { increment: 1 },
    },
  });
  return claimed.count === 1
    ? prisma.courseGenerationJob.findUnique({ where: { id: candidate.id } })
    : null;
}

async function runJob(job: CourseGenerationJob): Promise<void> {
  const request = job.request as unknown as PersistedCourseGenerationRequest;
  const generationInput = { ...request };
  const courseId = generationInput.courseId;
  delete (generationInput as Partial<PersistedCourseGenerationRequest>).courseId;
  delete (generationInput as Partial<PersistedCourseGenerationRequest>).moduleTimingPlan;
  delete (generationInput as Partial<PersistedCourseGenerationRequest>).adaptiveBranchCount;
  const controller = new AbortController();
  activeController = controller;
  let scenePhaseStartedAt: number | null = null;

  try {
    const generated = await generateClassroom(generationInput, {
      signal: controller.signal,
      onProgress: async (progress) => {
        if (progress.step === "generating_scenes" && scenePhaseStartedAt === null) {
          scenePhaseStartedAt = Date.now();
        }
        await persistProgress(job, progress, scenePhaseStartedAt);
      },
    });
    const split = await splitGeneratedClassroom({
      stage: generated.stage,
      scenes: generated.scenes,
      courseName: request.courseTitle,
      pblMode:
        request.pblProfile?.generationTemplate === "pbl-six-stage" ||
        Boolean(request.pblTeachingActivities?.length),
      signal: controller.signal,
    });
    await linkClassroomToCourse(courseId, split.studentClassroomId, {
      scenesCount: split.studentSceneCount,
      stageName: generated.stage.name,
      teacherClassroomId: split.teacherClassroomId,
      teacherResourceScenes: split.teacherResourceScenes,
    }, { signal: controller.signal });
    await prepareAdaptiveResources(job, courseId, controller.signal);

    const result = {
      id: split.studentClassroomId,
      scenesCount: split.studentSceneCount,
      studentSceneCount: split.studentSceneCount,
      teacherSceneCount: split.teacherSceneCount,
      teacherClassroomId: split.teacherClassroomId,
      teacherResourceScenes: split.teacherResourceScenes,
      pblCoverage: split.pblCoverage,
      qualityReport: generated.qualityReport,
      stage: { id: generated.stage.id, name: generated.stage.name },
    };
    const finalEvent: CourseGenerationJobEvent = {
      step: "completed",
      progress: 100,
      message: "课程内容已生成完成",
      scenesGenerated: split.studentSceneCount,
      totalScenes: Math.max(job.totalScenes, split.studentSceneCount),
      ts: Date.now(),
    };
    await prisma.courseGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        step: "completed",
        progress: 100,
        message: finalEvent.message,
        scenesGenerated: finalEvent.scenesGenerated,
        totalScenes: finalEvent.totalScenes,
        estimatedRemainingSeconds: 0,
        result: result as unknown as Prisma.InputJsonValue,
        events: [...asEvents(job.events), finalEvent].slice(-MAX_STORED_EVENTS) as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
        lastHeartbeatAt: new Date(),
        version: { increment: 1 },
      },
    });

    const baseUrl = process.env.PUBLIC_BASE_URL;
    if (baseUrl) {
      try {
        await generateClassroomAssets({
          ...generated.assetContext,
          baseUrl,
          studentClassroomId: split.studentClassroomId,
          studentScenes: split.studentScenes,
          teacherClassroomId: split.teacherClassroomId || undefined,
          teacherScenes: split.teacherScenes,
          signal: controller.signal,
        });
      } catch (assetError) {
        log.error("Background classroom asset generation failed", assetError);
      }
    }
  } catch (error) {
    if (stopping && (controller.signal.aborted || isAbortError(error))) {
      await prisma.courseGenerationJob.updateMany({
        where: { id: job.id, status: "running" },
        data: { status: "queued", step: "queued", message: "等待服务器继续生成", lastHeartbeatAt: new Date() },
      });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Course generation job ${job.id} failed`, error);
    await prisma.courseGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        step: "failed",
        message: "课程生成未完成",
        error: message,
        estimatedRemainingSeconds: null,
        completedAt: new Date(),
        lastHeartbeatAt: new Date(),
        version: { increment: 1 },
      },
    });
  } finally {
    if (activeController === controller) activeController = null;
  }
}

async function tick(): Promise<void> {
  if (stopping) return;
  try {
    const job = await claimNextJob();
    if (job) await runJob(job);
  } catch (error) {
    log.error("Course generation worker tick failed", error);
  } finally {
    if (!stopping) {
      timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      timer.unref?.();
    }
  }
}

export async function startCourseGenerationWorker(): Promise<void> {
  if (workerStarted) return;
  workerStarted = true;
  stopping = false;
  await prisma.courseGenerationJob.updateMany({
    where: {
      status: "running",
      OR: [
        { lastHeartbeatAt: null },
        { lastHeartbeatAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
      ],
    },
    data: { status: "queued", step: "queued", message: "等待服务器继续生成" },
  });
  void tick();
}

export async function stopCourseGenerationWorker(): Promise<void> {
  stopping = true;
  if (timer) clearTimeout(timer);
  timer = null;
  activeController?.abort(new Error("Server shutting down"));
}
