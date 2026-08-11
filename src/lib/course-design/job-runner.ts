import { Prisma, type CourseDesignGenerationJob } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { callLLM, generateCourseContent, parseLLMJson } from "@/lib/llm/client";
import { generateProjectSkeleton } from "@/lib/teaching-ai/support-engine";
import { buildCourseGenerationInput } from "@/lib/teacher/course-generation-input";
import { getCourse, updateCourse } from "@/lib/session/server-store";
import {
  buildPblModuleTimingPlan,
  buildPblProjectMainline,
  isPblModuleTimingPlanConfirmed,
} from "@/lib/pbl-time-model";
import { normalizePblTeachingOutline } from "@/lib/pbl-outline-normalization";
import {
  ADAPTIVE_LEARNING_GENERATION_POLICY,
  buildAdaptiveLearningGenerationContext,
  confirmAdaptiveLearningPlan,
  createDefaultAdaptiveLearningPlan,
  ensureAdaptiveResourceCoverage,
  evaluateAdaptiveLearningPlanQuality,
  improveAdaptiveLearningPlanQuality,
  normalizeAdaptiveLearningPlan,
} from "@/lib/adaptive-learning";
import {
  buildPblActivityCatalog,
  buildPblCourseRequirement,
  buildCourseTeachingConstraints,
  buildTeacherActivityRequirements,
} from "@/lib/openmaic/pbl/course-request";
import type {
  Course,
  CourseContent,
  CourseDesignGenerationArtifact,
  CourseDesignGenerationTraceEntry,
  LessonOutlineSection,
  OpenMaicSceneOutlineSnapshot,
} from "@/lib/session/types";
import {
  estimatePersistedCourseGenerationSeconds,
  resetCourseGenerationCheckpoints,
  type PersistedCourseGenerationRequest,
} from "@/lib/course-generation/job-runner";
import type { SceneOutline } from "@/lib/openmaic/types/generation";
import { generateSceneOutlinesFromRequirements } from "@/lib/openmaic/generation/outline-generator";
import type { UserRequirements } from "@/lib/openmaic/types/generation";
import {
  DEFAULT_PBL_EVIDENCE_REQUIREMENTS,
  normalizePblCourseConfig,
} from "@/lib/pbl-course-config";
import {
  ensureEvaluationResponsibility,
  evaluateEvaluationPlan,
  evaluateLessonOutlines,
  evaluatePositioning,
  evaluateProjectDesign,
  type StageQualityResult,
} from "@/lib/course-design/quality-gates";
import { runWithCourseGenerationLlmContext } from "@/lib/course-generation/llm-concurrency";
import {
  canResumeAfterValidatedLessonOutline,
  canResumeAfterValidatedTeachingOutline,
} from "@/lib/course-design/resume-policy";

const POLL_INTERVAL_MS = 1_500;
const STALE_AFTER_MS = 30 * 60 * 1_000;
const MAX_TRACE_ENTRIES = 24;
const MAX_AGENT_REVIEW_ROUNDS = 4;
// Main-course page planning is a large structured response. Use an observed
// wall-time estimate rather than the former 180-second hard-deadline value.
const STEP_ESTIMATES = [90, 110, 80, 80, 120, 300, 80, 55];
const OUTLINE_REVIEW_WINDOW_MS = 10_000;

export type QuickDesignRequest = {
  courseId: string;
  teacherBrief: string;
  options?: {
    interactiveMode: boolean;
    enableImageGeneration: boolean;
    enableTTS: boolean;
    enableVideoGeneration: boolean;
  };
  resumeFromOutlineReview?: boolean;
};

export type QuickDesignTraceEvent = CourseDesignGenerationTraceEntry & {
  progress: number;
  stepIndex: number;
};

let workerStarted = false;
let stopping = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let activeController: AbortController | null = null;
let activeCourseId: string | null = null;

class CourseDesignCancelledError extends Error {
  constructor() {
    super("课程生成已由教师中断");
    this.name = "CourseDesignCancelledError";
  }
}

function traceEvents(value: Prisma.JsonValue): QuickDesignTraceEvent[] {
  return Array.isArray(value)
    ? value.filter((item): item is QuickDesignTraceEvent => Boolean(item && typeof item === "object"))
    : [];
}

function finalClassroomEstimateSeconds(options?: QuickDesignRequest["options"]): number {
  return 8 * 60
    + (options?.enableImageGeneration === false ? 0 : 60)
    + (options?.enableTTS === false ? 0 : 60)
    + (options?.enableVideoGeneration === true ? 180 : 0)
    + (options?.interactiveMode === true ? 45 : 0);
}

function remainingSeconds(stepIndex: number, options?: QuickDesignRequest["options"]): number {
  return STEP_ESTIMATES.slice(stepIndex + 1).reduce((sum, seconds) => sum + seconds, 0)
    + finalClassroomEstimateSeconds(options);
}

export function initialQuickGenerationEstimateSeconds(options?: QuickDesignRequest["options"]): number {
  return STEP_ESTIMATES.reduce((sum, seconds) => sum + seconds, 0)
    + finalClassroomEstimateSeconds(options);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function awaitOutlineReviewCheckpoint(
  job: CourseDesignGenerationJob,
  controller: AbortController,
): Promise<void> {
  const reviewAvailableUntil = new Date(Date.now() + OUTLINE_REVIEW_WINDOW_MS);
  const updated = await prisma.courseDesignGenerationJob.update({
    where: { id: job.id },
    data: {
      status: "review_available",
      reviewStatus: "available",
      reviewAvailableUntil,
      step: "lessonOutline",
      stepIndex: 5,
      progress: Math.max(job.progress, 76),
      message: "课程页面大纲已生成，可在继续前查看和修改",
      lastHeartbeatAt: new Date(),
      version: { increment: 1 },
    },
  });
  Object.assign(job, updated);
  let heartbeatAt = Date.now();

  while (true) {
    if (controller.signal.aborted) throw controller.signal.reason ?? new CourseDesignCancelledError();
    const current = await prisma.courseDesignGenerationJob.findUnique({
      where: { id: job.id },
      select: { status: true, reviewStatus: true, reviewAvailableUntil: true },
    });
    if (!current || current.status === "cancelling" || current.status === "cancelled") {
      throw new CourseDesignCancelledError();
    }
    if (current.reviewStatus === "approved" && (current.status === "running" || current.status === "queued")) {
      return;
    }
    if (current.status === "paused") {
      if (Date.now() - heartbeatAt >= 2_000) {
        await prisma.courseDesignGenerationJob.updateMany({
          where: { id: job.id, status: "paused" },
          data: { lastHeartbeatAt: new Date() },
        });
        heartbeatAt = Date.now();
      }
      await wait(650);
      continue;
    }
    const deadline = current.reviewAvailableUntil?.getTime() ?? reviewAvailableUntil.getTime();
    if (current.status === "review_available" && Date.now() >= deadline) {
      const resumed = await prisma.courseDesignGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "running",
          reviewStatus: "auto-continued",
          reviewAvailableUntil: null,
          message: "未收到修改，正在按当前页面大纲继续生成",
          lastHeartbeatAt: new Date(),
          version: { increment: 1 },
        },
      });
      Object.assign(job, resumed);
      return;
    }
    await wait(500);
  }
}

export async function pauseCourseDesignForOutlineReview(
  courseId: string,
): Promise<CourseDesignGenerationJob | null> {
  const job = await prisma.courseDesignGenerationJob.findUnique({ where: { courseId } });
  if (!job || job.status !== "review_available") return job;
  const paused = await prisma.courseDesignGenerationJob.updateMany({
    where: { id: job.id, status: "review_available" },
    data: {
      status: "paused",
      reviewStatus: "paused",
      reviewAvailableUntil: null,
      message: "生成已暂停，等待教师审阅页面大纲",
      lastHeartbeatAt: new Date(),
      version: { increment: 1 },
    },
  });
  return paused.count === 1
    ? prisma.courseDesignGenerationJob.findUnique({ where: { id: job.id } })
    : prisma.courseDesignGenerationJob.findUnique({ where: { id: job.id } });
}

export async function resumeCourseDesignAfterOutlineReview(
  courseId: string,
  review?: {
    lessonOutline?: LessonOutlineSection[];
    sceneOutlines?: OpenMaicSceneOutlineSnapshot[];
  },
): Promise<CourseDesignGenerationJob | null> {
  const job = await prisma.courseDesignGenerationJob.findUnique({ where: { courseId } });
  if (!job || (job.status !== "paused" && job.status !== "review_available")) return job;

  if (review?.lessonOutline || review?.sceneOutlines) {
    await updateCourse(courseId, (course) => ({
      ...course,
      content: {
        ...course.content,
        ...(review.lessonOutline
          ? { lessonOutline: review.lessonOutline }
          : review.sceneOutlines
            ? { lessonOutline: review.sceneOutlines.map(sceneOutlineToLessonSection) }
            : {}),
        ...(review.sceneOutlines ? { _openmaicSceneOutlines: review.sceneOutlines } : {}),
      },
    }));
  }

  const request = job.request as unknown as QuickDesignRequest;
  const hasLiveRunner = Boolean(
    job.lastHeartbeatAt && Date.now() - job.lastHeartbeatAt.getTime() < 5_000,
  );
  return prisma.courseDesignGenerationJob.update({
    where: { id: job.id },
    data: {
      status: hasLiveRunner ? "running" : "queued",
      reviewStatus: "approved",
      reviewAvailableUntil: null,
      request: {
        ...request,
        resumeFromOutlineReview: true,
      } as unknown as Prisma.InputJsonValue,
      message: "已采用教师确认的页面大纲，正在继续生成",
      lastHeartbeatAt: new Date(),
      version: { increment: 1 },
    },
  });
}

async function recordStep(
  job: CourseDesignGenerationJob,
  input: Omit<QuickDesignTraceEvent, "completedAt">,
): Promise<QuickDesignTraceEvent> {
  const status = await prisma.courseDesignGenerationJob.findUnique({
    where: { id: job.id },
    select: { status: true },
  });
  if (status?.status === "cancelling" || status?.status === "cancelled") {
    throw new CourseDesignCancelledError();
  }
  const event: QuickDesignTraceEvent = { ...input, completedAt: new Date().toISOString() };
  const trace = [...traceEvents(job.trace), event].slice(-MAX_TRACE_ENTRIES);
  const updated = await prisma.courseDesignGenerationJob.update({
    where: { id: job.id },
    data: {
      step: event.step,
      stepIndex: event.stepIndex,
      progress: Math.max(job.progress, event.progress),
      message: event.summary,
      estimatedRemainingSeconds: remainingSeconds(
        event.stepIndex,
        (job.request as unknown as QuickDesignRequest).options,
      ),
      trace: trace as unknown as Prisma.InputJsonValue,
      lastHeartbeatAt: new Date(),
      version: { increment: 1 },
    },
  });
  Object.assign(job, updated);
  return event;
}

async function beginStep(
  job: CourseDesignGenerationJob,
  step: string,
  stepIndex: number,
  progress: number,
  message: string,
): Promise<void> {
  const updated = await prisma.courseDesignGenerationJob.update({
    where: { id: job.id },
    data: {
      step,
      stepIndex,
      progress: Math.max(job.progress, progress),
      message,
      estimatedRemainingSeconds: remainingSeconds(
        stepIndex,
        (job.request as unknown as QuickDesignRequest).options,
      ),
      lastHeartbeatAt: new Date(),
      version: { increment: 1 },
    },
  });
  Object.assign(job, updated);
}

function toSceneOutline(section: LessonOutlineSection, index: number): SceneOutline & OpenMaicSceneOutlineSnapshot {
  return {
    id: section.id,
    type: "slide",
    title: section.title,
    description: section.activities.join("；") || section.title,
    keyPoints: section.objectives,
    estimatedDuration: section.durationMin * 60,
    order: index,
    stageKey: section.stageKey,
    parentActivityId: section.parentActivityId,
    detailKind: section.detailKind,
    knowledgePointIds: section.knowledgePointIds,
    resourceTypes: section.resourceTypes,
    targetDurationSec: section.targetDurationSec ?? section.durationMin * 60,
    segmentIndex: section.segmentIndex,
    segmentCount: section.segmentCount,
    segmentRole: section.segmentRole,
    segmentGroupId: section.segmentGroupId,
    ttsPolicy: section.ttsPolicy,
    timingPlan: section.timingPlan,
  } as SceneOutline & OpenMaicSceneOutlineSnapshot;
}

function sceneOutlineToLessonSection(
  scene: SceneOutline | OpenMaicSceneOutlineSnapshot,
  index: number,
): LessonOutlineSection {
  const targetSeconds = scene.targetDurationSec ?? scene.estimatedDuration ?? 60;
  const title = scene.title?.trim() || `课堂页面 ${index + 1}`;
  return {
    id: scene.id || `lesson-${index + 1}`,
    stageKey: scene.stageKey ?? "ai-learning",
    title,
    objectives: scene.keyPoints ?? [],
    activities: [scene.description || title],
    durationMin: Math.max(1, Math.round(targetSeconds / 60)),
    parentActivityId: scene.parentActivityId,
    detailKind: scene.detailKind,
    knowledgePointIds: scene.knowledgePointIds,
    resourceTypes: scene.resourceTypes,
    targetDurationSec: targetSeconds,
    segmentIndex: scene.segmentIndex,
    segmentCount: scene.segmentCount,
    segmentRole: scene.segmentRole,
    segmentGroupId: scene.segmentGroupId,
    ttsPolicy: scene.ttsPolicy,
    timingPlan: scene.timingPlan,
  };
}

type AiStageAudit = {
  passed: boolean;
  summary: string;
  issues: string[];
};

async function auditStage(
  label: string,
  snapshot: unknown,
  deterministic: StageQualityResult,
  signal: AbortSignal,
): Promise<AiStageAudit> {
  if (!deterministic.passed) {
    return {
      passed: false,
      summary: deterministic.issues.join("；"),
      issues: deterministic.issues,
    };
  }
  try {
    const response = await callLLM([
      {
        role: "system",
        content: "你是课程设计质量审校员。检查当前阶段是否完整、适龄、可执行，并与上游数据一致。不要改写内容，只返回 JSON。",
      },
      {
        role: "user",
        content: JSON.stringify({
          stage: label,
          deterministicChecks: deterministic.checks,
          snapshot,
          output: { passed: true, summary: "string", issues: ["string"] },
        }),
      },
    ], { jsonMode: true, abortSignal: signal, maxTransientRetries: 1 });
    const parsed = parseLLMJson<{ passed?: unknown; summary?: unknown; issues?: unknown }>(response);
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 6)
      : [];
    return {
      passed: parsed.passed !== false && issues.length === 0,
      summary: typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : "当前阶段已通过 AI 审校",
      issues,
    };
  } catch {
    return { passed: true, summary: "当前阶段已通过结构化质量检查", issues: [] };
  }
}

function stageSummaryInput(course: Course, request: QuickDesignRequest, correction?: string) {
  return buildCourseGenerationInput({
    ...course,
    summary: [
      course.summary,
      `教师补充要求：${request.teacherBrief.trim()}`,
      request.options?.interactiveMode
        ? "已开启丰富互动模式：学生知识学习页面应形成讲解—操作—反馈节奏，并提高互动页面比例。"
        : "使用普通生成模式：仅在确有教学价值时安排互动页面。",
      correction ? `上一轮质量审校意见：${correction}` : "",
    ].filter(Boolean).join("\n"),
  });
}

async function inferCourseSeed(
  course: Course,
  request: QuickDesignRequest,
  signal: AbortSignal,
): Promise<Pick<Course, "name" | "subject" | "grade" | "hours">> {
  const response = await callLLM([
    {
      role: "system",
      content: "你是课程定位分析助手。根据教师输入提取课程名称、学科、年级和合理课时。课时只能是 1 至 5 的整数。不要生成课程内容，只返回 JSON。",
    },
    {
      role: "user",
      content: JSON.stringify({
        existing: { name: course.name, subject: course.subject, grade: course.grade, hours: course.hours },
        teacherBrief: request.teacherBrief,
        output: { name: "string", subject: "string", grade: "string", hours: 2 },
      }),
    },
  ], { jsonMode: true, abortSignal: signal, maxTransientRetries: 1 });
  const parsed = parseLLMJson<Record<string, unknown>>(response);
  return {
    name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 40) : course.name,
    subject: typeof parsed.subject === "string" && parsed.subject.trim() ? parsed.subject.trim().slice(0, 40) : course.subject,
    grade: typeof parsed.grade === "string" && parsed.grade.trim() ? parsed.grade.trim().slice(0, 30) : course.grade,
    hours: typeof parsed.hours === "number" && Number.isFinite(parsed.hours)
      ? Math.max(1, Math.min(5, Math.round(parsed.hours)))
      : Math.max(1, Math.min(5, Math.round(course.hours || 2))),
  };
}

type PositioningDetails = {
  summary: string;
  learningObjectives: string[];
  learnerProfile?: Course["learnerProfile"];
  drivingQuestion: string;
};

type AgentStageReview = {
  revisionCount: number;
  resolvedIssues: string[];
  advisoryIssues: string[];
};

type AgentStageResult<T> = {
  value: T;
  review: AgentStageReview;
};

export async function generatePositioningDetails(
  course: Course,
  seed: Pick<Course, "name" | "subject" | "grade" | "hours">,
  request: QuickDesignRequest,
  correction: string,
  signal: AbortSignal,
): Promise<PositioningDetails> {
  const sharedInput = {
    courseName: seed.name,
    subject: seed.subject,
    grade: seed.grade,
    hours: seed.hours,
    summary: request.teacherBrief,
    initialDrivingQuestion: [
      request.teacherBrief,
      correction ? `上一轮审校意见：${correction}` : "",
    ].filter(Boolean).join("\n"),
    learningObjectives: course.learningObjectives,
    learnerProfile: course.learnerProfile,
  };
  const [objectivesResult, summaryResult, learnerResult, questionResult] = await Promise.allSettled([
    generateProjectSkeleton({ ...sharedInput, targetPart: "learningObjectives" }, { abortSignal: signal }),
    generateProjectSkeleton({ ...sharedInput, targetPart: "summary" }, { abortSignal: signal }),
    generateProjectSkeleton({ ...sharedInput, targetPart: "learnerProfile" }, { abortSignal: signal }),
    generateProjectSkeleton({ ...sharedInput, targetPart: "drivingQuestions" }, { abortSignal: signal }),
  ]);
  const learningObjectives = objectivesResult.status === "fulfilled"
    ? objectivesResult.value.learningObjectiveOptions[0] ?? []
    : [];
  const summary = summaryResult.status === "fulfilled"
    ? summaryResult.value.summaryOptions[0] ?? ""
    : "";
  const learnerProfile = learnerResult.status === "fulfilled"
    ? learnerResult.value.learnerProfileOptions[0]
    : undefined;
  const drivingQuestion = questionResult.status === "fulfilled"
    ? questionResult.value.drivingQuestions[0] ?? ""
    : "";
  if (learningObjectives.length >= 3 && summary && learnerProfile && drivingQuestion) {
    return { learningObjectives, summary, learnerProfile, drivingQuestion };
  }

  const fallbackResponse = await callLLM([
    {
      role: "system",
      content: "你是 PBL 课程定位设计师。补齐一份可直接采用的课程底稿，不要返回候选列表。目标必须可观察、可评价；课程说明包含真实情境、范围、学生任务和预期判断；驱动问题必须真实、开放、有成果边界并以问号结尾。只能返回 JSON。",
    },
    {
      role: "user",
      content: JSON.stringify({
        course: seed,
        teacherBrief: request.teacherBrief,
        previousReview: correction || undefined,
        alreadyGenerated: {
          learningObjectives: learningObjectives.length ? learningObjectives : undefined,
          summary: summary || undefined,
          learnerProfile,
          drivingQuestion: drivingQuestion || undefined,
        },
        output: {
          learningObjectives: ["string", "string", "string"],
          summary: "string",
          learnerProfile: {
            priorKnowledge: "string",
            learningNeeds: "string",
            familiarContexts: "string",
          },
          drivingQuestion: "string？",
        },
      }),
    },
  ], { jsonMode: true, abortSignal: signal, maxTransientRetries: 1 });
  const fallback = parseLLMJson<Record<string, unknown>>(fallbackResponse);
  const rawProfile = fallback.learnerProfile && typeof fallback.learnerProfile === "object"
    ? fallback.learnerProfile as Record<string, unknown>
    : {};
  const fallbackObjectives = Array.isArray(fallback.learningObjectives)
    ? fallback.learningObjectives.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 6)
    : [];
  return {
    learningObjectives: learningObjectives.length >= 3 ? learningObjectives : fallbackObjectives,
    summary: summary || (typeof fallback.summary === "string" ? fallback.summary.trim() : ""),
    learnerProfile: learnerProfile ?? {
      priorKnowledge: typeof rawProfile.priorKnowledge === "string" ? rawProfile.priorKnowledge.trim() : "",
      learningNeeds: typeof rawProfile.learningNeeds === "string" ? rawProfile.learningNeeds.trim() : "",
      familiarContexts: typeof rawProfile.familiarContexts === "string" ? rawProfile.familiarContexts.trim() : "",
    },
    drivingQuestion: drivingQuestion || (typeof fallback.drivingQuestion === "string" ? fallback.drivingQuestion.trim() : ""),
  };
}

export async function revisePositioningCandidate(
  current: Course,
  request: QuickDesignRequest,
  issues: string[],
  signal: AbortSignal,
): Promise<Course> {
  const response = await callLLM([
    {
      role: "system",
      content: `你是快速课程设计代理，正在修订已经由课程定位 AI 生成的完整阶段结果。你的职责不是指出问题，而是直接解决问题并返回可采用的新版本。
必须同时满足：
1. 驱动问题涉及的核心概念、任务和成果必须在课程目标与课程说明中有对应要求；课程目标也必须服务于同一驱动问题。
2. 保持教师明确提出的主题、对象和课时不变；课时不足时缩小任务、案例、成果或目标数量，不要虚增课时。
3. 每课时按 60 分钟计算，必须留出讲授、学生制作、反馈和总结时间；通常保留 3 至 4 个可观察目标和一个主要成果。
4. 采用最小必要修改，保留当前版本中已经合理的内容。
5. 直接返回修订后的 JSON，不要输出解释、建议或候选列表。`,
    },
    {
      role: "user",
      content: JSON.stringify({
        teacherBrief: request.teacherBrief,
        fixedConstraints: {
          name: current.name,
          subject: current.subject,
          grade: current.grade,
          hours: current.hours,
          totalMinutes: Math.round(current.hours * 60),
        },
        current: {
          summary: current.summary,
          learningObjectives: current.learningObjectives,
          learnerProfile: current.learnerProfile,
          drivingQuestion: current.drivingQuestion,
        },
        reviewIssues: issues,
        output: {
          summary: "string",
          learningObjectives: ["string", "string", "string"],
          learnerProfile: {
            priorKnowledge: "string",
            learningNeeds: "string",
            familiarContexts: "string",
          },
          drivingQuestion: "string？",
        },
      }),
    },
  ], { jsonMode: true, abortSignal: signal, maxTransientRetries: 1 });
  const parsed = parseLLMJson<Record<string, unknown>>(response);
  const objectives = Array.isArray(parsed.learningObjectives)
    ? parsed.learningObjectives.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 4)
    : [];
  const rawProfile = parsed.learnerProfile && typeof parsed.learnerProfile === "object"
    ? parsed.learnerProfile as Record<string, unknown>
    : {};
  const drivingQuestion = typeof parsed.drivingQuestion === "string" ? parsed.drivingQuestion.trim() : "";
  return {
    ...current,
    summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : current.summary,
    learningObjectives: objectives.length >= 3 ? objectives : current.learningObjectives,
    learnerProfile: {
      priorKnowledge: typeof rawProfile.priorKnowledge === "string" ? rawProfile.priorKnowledge.trim() : current.learnerProfile?.priorKnowledge,
      learningNeeds: typeof rawProfile.learningNeeds === "string" ? rawProfile.learningNeeds.trim() : current.learnerProfile?.learningNeeds,
      familiarContexts: typeof rawProfile.familiarContexts === "string" ? rawProfile.familiarContexts.trim() : current.learnerProfile?.familiarContexts,
    },
    drivingQuestion: drivingQuestion
      ? /[？?]$/.test(drivingQuestion) ? drivingQuestion : `${drivingQuestion}？`
      : current.drivingQuestion,
  };
}

export async function generatePositioning(
  course: Course,
  request: QuickDesignRequest,
  signal: AbortSignal,
): Promise<AgentStageResult<Course>> {
  const seed = await inferCourseSeed(course, request, signal);
  const details = await generatePositioningDetails(course, seed, request, "", signal);
  let candidate: Course = {
    ...course,
    ...seed,
    summary: details.summary || request.teacherBrief,
    learningObjectives: details.learningObjectives.length ? details.learningObjectives : course.learningObjectives ?? [],
    learnerProfile: details.learnerProfile ?? course.learnerProfile,
    drivingQuestion: details.drivingQuestion || course.drivingQuestion,
  };
  const resolvedIssues: string[] = [];
  let latestIssues: string[] = [];
  for (let attempt = 0; attempt < MAX_AGENT_REVIEW_ROUNDS; attempt += 1) {
    const quality = evaluatePositioning(candidate);
    const audit = await auditStage("课程定位", {
      name: candidate.name,
      subject: candidate.subject,
      grade: candidate.grade,
      hours: candidate.hours,
      summary: candidate.summary,
      objectives: candidate.learningObjectives,
      drivingQuestion: candidate.drivingQuestion,
      previousIssues: latestIssues,
    }, quality, signal);
    if (audit.passed) {
      return {
        value: candidate,
        review: { revisionCount: attempt, resolvedIssues, advisoryIssues: [] },
      };
    }
    latestIssues = audit.issues.length ? audit.issues : [audit.summary];
    if (attempt < MAX_AGENT_REVIEW_ROUNDS - 1) {
      resolvedIssues.push(...latestIssues);
      try {
        candidate = await revisePositioningCandidate(candidate, request, latestIssues, signal);
      } catch {
        const regenerated = await generatePositioningDetails(candidate, seed, request, latestIssues.join("；"), signal);
        candidate = {
          ...candidate,
          summary: regenerated.summary || candidate.summary,
          learningObjectives: regenerated.learningObjectives.length ? regenerated.learningObjectives : candidate.learningObjectives,
          learnerProfile: regenerated.learnerProfile ?? candidate.learnerProfile,
          drivingQuestion: regenerated.drivingQuestion || candidate.drivingQuestion,
        };
      }
    }
  }
  const structural = evaluatePositioning(candidate);
  if (!structural.passed) {
    throw new Error(`课程定位代理无法生成结构完整的数据：${structural.issues.join("；")}`);
  }
  return {
    value: candidate,
    review: {
      revisionCount: MAX_AGENT_REVIEW_ROUNDS - 1,
      resolvedIssues,
      advisoryIssues: latestIssues,
    },
  };
}

async function generateProjectDesign(
  course: Course,
  request: QuickDesignRequest,
  signal: AbortSignal,
): Promise<Course> {
  let correction = "";
  let latestCandidate = course;
  let latestQuality = evaluateProjectDesign(course);
  for (let attempt = 0; attempt < MAX_AGENT_REVIEW_ROUNDS; attempt += 1) {
    const response = await callLLM([
      {
        role: "system",
        content: "你是 PBL 项目成果设计师。生成个人项目的作品、表达、反思和过程证据要求。成果必须在课程课时内可完成，且能证明课程目标达成。只返回 JSON。",
      },
      {
        role: "user",
        content: JSON.stringify({
          course: stageSummaryInput(course, request, correction),
          knowledgePoints: course.content.knowledgePoints,
          requiredEvidenceKinds: DEFAULT_PBL_EVIDENCE_REQUIREMENTS.map((item) => ({ kind: item.kind, label: item.label })),
          output: {
            difficultyLevel: "introductory|standard|advanced",
            artifact: "string",
            presentation: "string",
            reflection: "string",
            evidenceKinds: ["idea-draft"],
            inquiryQuestions: ["string"],
          },
        }),
      },
    ], { jsonMode: true, abortSignal: signal, maxTransientRetries: 1 });
    const parsed = parseLLMJson<Record<string, unknown>>(response);
    const selectedKinds = new Set(
      Array.isArray(parsed.evidenceKinds)
        ? parsed.evidenceKinds.filter((item): item is string => typeof item === "string")
        : [],
    );
    const evidenceRequirements = DEFAULT_PBL_EVIDENCE_REQUIREMENTS.filter(
      (item) => selectedKinds.has(item.kind) || item.required,
    );
    const difficultyLevel = parsed.difficultyLevel === "introductory" || parsed.difficultyLevel === "advanced"
      ? parsed.difficultyLevel
      : "standard";
    const candidate: Course = {
      ...course,
      expectedOutcome: typeof parsed.artifact === "string" ? parsed.artifact.trim() : course.expectedOutcome,
      pblConfig: normalizePblCourseConfig({
        ...course.pblConfig,
        difficultyLevel,
        evidenceRequirements,
        outcome: {
          artifact: typeof parsed.artifact === "string" ? parsed.artifact.trim() : "",
          presentation: typeof parsed.presentation === "string" ? parsed.presentation.trim() : "",
          reflection: typeof parsed.reflection === "string" ? parsed.reflection.trim() : "",
        },
        inquiryQuestions: Array.isArray(parsed.inquiryQuestions)
          ? parsed.inquiryQuestions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [course.drivingQuestion],
      }),
    };
    const quality = evaluateProjectDesign(candidate);
    latestCandidate = candidate;
    latestQuality = quality;
    const audit = await auditStage("项目成果", {
      outcome: candidate.pblConfig?.outcome,
      evidenceRequirements: candidate.pblConfig?.evidenceRequirements,
    }, quality, signal);
    if (audit.passed) return candidate;
    correction = audit.issues.join("；") || audit.summary;
  }
  if (latestQuality.passed) return latestCandidate;
  throw new Error(`项目成果代理无法生成结构完整的数据：${latestQuality.issues.join("；")}`);
}

async function generateTeachingStructure(
  course: Course,
  content: CourseContent,
  request: QuickDesignRequest,
  signal: AbortSignal,
  correction: string,
) {
  const totalMinutes = Math.max(1, Math.round(course.hours * 60));
  const timing = await generateCourseContent({
    action: "moduleTimingPlan",
    input: stageSummaryInput(course, request, correction),
    context: { knowledgePoints: content.knowledgePoints, knowledgeGraph: content.knowledgeGraph },
  }, { signal });
  if (!timing.content.moduleTimingPlan) throw new Error("六阶段时间建议生成失败");
  const confirmedPlan = buildPblModuleTimingPlan(
    totalMinutes,
    timing.content.teachingOutline ?? [],
    {
      topic: course.name,
      subject: course.subject,
      summary: course.summary,
      grade: course.grade,
      difficulty: course.pblConfig?.difficultyLevel ?? "standard",
      learningObjectives: course.learningObjectives,
      learnerProfile: course.learnerProfile,
      knowledgePoints: content.knowledgePoints,
      knowledgeGraph: content.knowledgeGraph,
    },
    { status: "confirmed", preserveCurrentDurations: true },
  );
  const generatedModules = await generateCourseContent({
    action: "teachingOutline",
    input: stageSummaryInput(course, request, correction),
    context: {
      knowledgePoints: content.knowledgePoints,
      knowledgeGraph: content.knowledgeGraph,
      moduleTimingPlan: confirmedPlan,
      projectMainline: buildPblProjectMainline(totalMinutes, timing.content.teachingOutline ?? []),
    },
  }, { signal });
  const teachingOutline = normalizePblTeachingOutline(generatedModules.content.teachingOutline ?? [], {
    totalMinutes,
    topic: course.name,
    subject: course.subject,
    summary: course.summary,
    grade: course.grade,
    difficulty: course.pblConfig?.difficultyLevel ?? "standard",
    learningObjectives: course.learningObjectives,
    learnerProfile: course.learnerProfile,
    knowledgePoints: content.knowledgePoints,
    knowledgeGraph: content.knowledgeGraph,
  }).map((activity) => ({
    ...activity,
    durationMin: confirmedPlan.allocations.find((item) => item.id === activity.id)?.durationMin ?? activity.durationMin,
  }));
  const moduleTimingPlan = buildPblModuleTimingPlan(totalMinutes, teachingOutline, undefined, {
    status: "confirmed",
    preserveCurrentDurations: true,
  });
  const projectMainline = buildPblProjectMainline(totalMinutes, teachingOutline);
  if (teachingOutline.length !== 6 || !isPblModuleTimingPlanConfirmed(moduleTimingPlan)) {
    throw new Error("六阶段架构未通过阶段数量或总时长校验");
  }
  return { totalMinutes, teachingOutline, moduleTimingPlan, projectMainline };
}

async function generateMainCourseOutlines(
  course: Course,
  content: CourseContent,
  request: QuickDesignRequest,
  signal: AbortSignal,
  correction?: string,
): Promise<Array<SceneOutline & OpenMaicSceneOutlineSnapshot>> {
  const requirements: UserRequirements = {
    requirement: [
      buildPblCourseRequirement(course, content, []),
      correction ? `上一轮质量审校意见（必须纠正）：${correction}` : "",
    ].filter(Boolean).join("\n\n"),
    pblProfile: course.pblConfig,
    pblTeachingActivities: buildTeacherActivityRequirements(content),
    pblActivityCatalog: buildPblActivityCatalog(content),
    knowledgePoints: content.knowledgePoints.map((point) => ({ id: point.id, name: point.name })),
    teachingConstraints: buildCourseTeachingConstraints(course, content),
    interactiveMode: request.options?.interactiveMode === true,
  };
  const result = await generateSceneOutlinesFromRequirements(
    requirements,
    undefined,
    undefined,
    async (system, user) => callLLM(
      [{ role: "system", content: system }, { role: "user", content: user }],
      {
        jsonMode: true,
        abortSignal: signal,
        requestClass: "long-generation",
        maxTransientRetries: 1,
      },
    ),
    undefined,
    {
      imageGenerationEnabled: request.options?.enableImageGeneration === true,
      videoGenerationEnabled: request.options?.enableVideoGeneration === true,
    },
  );
  if (!result.success || !result.data) throw new Error(result.error || "主课脚本生成失败");
  return result.data.outlines as Array<SceneOutline & OpenMaicSceneOutlineSnapshot>;
}

function evaluateQuality(course: Course): { score: number; summary: string; checks: string[] } {
  const content = course.content;
  const positioning = evaluatePositioning(course);
  const project = evaluateProjectDesign(course);
  const evaluation = evaluateEvaluationPlan(content.evaluationPlan);
  const lesson = evaluateLessonOutlines(
    sceneOutlinesFromContent(content),
    content.interactiveMode === true,
    buildPblActivityCatalog(content),
  );
  const checks = [
    positioning.passed ? "课程定位字段完整并通过审校" : positioning.issues.join("；"),
    content.knowledgePoints.length > 0 ? `知识图谱包含 ${content.knowledgePoints.length} 个知识点` : "知识图谱缺少知识点",
    project.passed ? "项目成果包含作品、表达、反思和过程证据" : project.issues.join("；"),
    evaluation.passed ? "AI 与教师评价职责完整" : evaluation.issues.join("；"),
    content.teachingOutline?.length === 6 ? "六阶段课程架构完整" : `课程架构包含 ${content.teachingOutline?.length ?? 0} 个阶段`,
    isPblModuleTimingPlanConfirmed(content.moduleTimingPlan) ? "课程总时长与六阶段分配一致" : "课程时间尚未通过校验",
    lesson.passed ? `主课脚本包含 ${content.lessonOutline.length} 个合格课堂资源` : lesson.issues.join("；"),
    content.adaptiveLearningPlan?.branches.length ? `个性化路径包含 ${content.adaptiveLearningPlan.branches.length} 条候选路径` : "个性化路径为空",
  ];
  const passed = [
    positioning.passed,
    content.knowledgePoints.length > 0,
    project.passed,
    evaluation.passed,
    content.teachingOutline?.length === 6,
    isPblModuleTimingPlanConfirmed(content.moduleTimingPlan),
    lesson.passed,
    Boolean(content.adaptiveLearningPlan?.branches.length),
  ].filter(Boolean).length;
  const score = Math.round((passed / 8) * 100);
  return {
    score,
    summary: score === 100 ? "七阶段数据、时间、脚本、评价和个性化路径均已通过自动检查。" : `已通过 ${passed} / 8 项核心检查，请在分步设计中复核提醒项。`,
    checks,
  };
}

async function runAiQualityReview(
  course: Course,
  deterministic: ReturnType<typeof evaluateQuality>,
  signal: AbortSignal,
): Promise<ReturnType<typeof evaluateQuality>> {
  try {
    const response = await callLLM([
      {
        role: "system",
        content: "你是资深课程设计审校员。请检查课程各阶段是否一致、完整、适龄、可实施，尤其检查知识目标、项目成果、评价标准、阶段架构、主课脚本和个性化路径之间的对齐。只能返回 JSON。",
      },
      {
        role: "user",
        content: JSON.stringify({
          course: {
            name: course.name,
            subject: course.subject,
            grade: course.grade,
            hours: course.hours,
            objectives: course.learningObjectives,
            drivingQuestion: course.drivingQuestion,
          },
          design: {
            knowledgePoints: course.content.knowledgePoints,
            teachingOutline: course.content.teachingOutline,
            lessonOutline: course.content.lessonOutline,
            evaluationPlan: course.content.evaluationPlan,
            adaptiveLearningPlan: course.content.adaptiveLearningPlan,
          },
          deterministicChecks: deterministic.checks,
          output: { score: 0, summary: "string", checks: ["string"] },
        }),
      },
    ], { jsonMode: true, abortSignal: signal, maxTransientRetries: 1 });
    const parsed = parseLLMJson<{ score?: unknown; summary?: unknown; checks?: unknown }>(response);
    const score = typeof parsed.score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.score))) : deterministic.score;
    const checks = Array.isArray(parsed.checks)
      ? parsed.checks.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 10)
      : [];
    return {
      score: Math.min(deterministic.score, score),
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : deterministic.summary,
      checks: [...deterministic.checks, ...checks],
    };
  } catch {
    return deterministic;
  }
}

async function generateAdaptivePlan(
  course: Course,
  content: CourseContent,
  mainScenes: Array<SceneOutline & OpenMaicSceneOutlineSnapshot>,
  signal: AbortSignal,
) {
  const fallback = createDefaultAdaptiveLearningPlan({
    knowledgePoints: content.knowledgePoints,
    knowledgeGraph: content.knowledgeGraph,
    mainScenes,
  });
  const adaptiveContext = buildAdaptiveLearningGenerationContext({
    knowledgePoints: content.knowledgePoints,
    knowledgeGraph: content.knowledgeGraph,
    mainScenes,
  });
  try {
    const messages = [
      {
        role: "system",
        content: ADAPTIVE_LEARNING_GENERATION_POLICY,
      },
      {
        role: "user",
        content: JSON.stringify({
          course: { name: course.name, grade: course.grade, subject: course.subject },
          knowledgePoints: content.knowledgePoints,
          ...adaptiveContext,
          mainScenes: mainScenes.map((scene) => ({
            id: scene.id,
            title: scene.title,
            type: scene.type,
            stageKey: scene.stageKey,
            knowledgePointIds: scene.knowledgePointIds,
            keyPoints: scene.keyPoints,
          })),
          output: {
            enabled: true,
            timeBudgetMin: 8,
            prerequisiteKnowledgePoints: [{
              id: "prereq-data",
              name: "学生上课前应已掌握的具体知识",
              description: "该知识的课前掌握边界，不得复述本课新授内容",
              keyInfo: "准确表述",
              relatedIds: ["受影响的本课知识点 id"],
            }],
            pretest: {
              title: "string",
              introduction: "string",
              estimatedMinutes: 3,
              questions: [{
                id: "string",
                type: "single-choice|true-false|matching",
                prompt: "具体概念、情境、计算、辨析或操作题",
                options: ["string", "string", "string", "string"],
                correctOptionIndex: 0,
                matchingPairs: [{ left: "待匹配项", right: "正确对应项" }],
                rationale: "正确依据，以及缺失后会阻碍的后续知识",
                knowledgePointIds: ["prerequisite-kp-id"],
              }],
            },
            enrichmentStrategy: {
              recommendedMin: fallback.enrichmentStrategy?.recommendedMin,
              recommendedMax: fallback.enrichmentStrategy?.recommendedMax,
              runtimeMaxPerStudent: fallback.enrichmentStrategy?.runtimeMaxPerStudent,
              summary: "整门课的拓展机会判断",
              decisions: [{
                id: "opportunity-id",
                decision: "selected|rejected",
                title: "具体且唯一的拓展主题",
                valueType: "task-transfer|concept-depth|classic-extension",
                rationale: "新增价值与取舍理由",
                anchorKnowledgePointIds: ["kp-id"],
                afterAssessmentSceneId: "quiz-id",
                branchId: "selected branch id",
              }],
            },
            branches: [{
              id: "string",
              kind: "prerequisite|worked-example|application|extension",
              title: "string",
              objective: "string",
              keyPoints: ["string"],
              anchorKnowledgePointIds: ["kp-id"],
              prerequisiteKnowledgePointIds: ["kp-id"],
              noveltyStatement: "string",
              mainCourseOverlapSceneIds: ["scene-id"],
              sceneType: "slide|interactive",
              targetDurationSec: 180,
              generationGuidance: "string",
              trigger: {
                placement: "before-main-course|after-module",
                assessmentSceneIds: ["scene-id"],
                evidenceRule: "pretest-gap|module-mastery",
                scoreThreshold: 80,
                minimumRemainingSec: 180,
              },
            }],
          },
        }),
      },
    ] as const;
    let response = await callLLM([...messages], {
      jsonMode: true,
      abortSignal: signal,
      requestClass: "long-generation",
      maxTransientRetries: 1,
    });
    const normalizeResponse = (value: string) => ensureAdaptiveResourceCoverage(
      improveAdaptiveLearningPlanQuality(
        normalizeAdaptiveLearningPlan(parseLLMJson<unknown>(value), fallback),
        fallback,
        { knowledgePoints: content.knowledgePoints, knowledgeGraph: content.knowledgeGraph, mainScenes },
      ),
      { knowledgePoints: content.knowledgePoints, knowledgeGraph: content.knowledgeGraph, mainScenes },
    );
    let plan = normalizeResponse(response);
    let quality = evaluateAdaptiveLearningPlanQuality(plan, { knowledgePoints: content.knowledgePoints, mainScenes });
    if (!quality.passed) {
      response = await callLLM([
        ...messages,
        { role: "assistant", content: response },
        {
          role: "user",
          content: `前一版未通过质量门：${quality.issues.join("；")}。重新生成完整方案：前序部分必须是新授内容之前的基础知识，并形成 5 分钟内客观题前测与逐点补缺；拓展部分先做全课机会评估，再按建议数量 ${quality.recommendedMin}-${quality.recommendedMax} 选择互不重复的最高价值主题，放在学完全部依赖知识后的最佳测验之后。禁止每章凑数，也禁止内容丰富的课程无理由为零。只返回完整 JSON。`,
        },
      ], {
        jsonMode: true,
        abortSignal: signal,
        requestClass: "long-generation",
        maxTransientRetries: 1,
      });
      plan = normalizeResponse(response);
      quality = evaluateAdaptiveLearningPlanQuality(plan, { knowledgePoints: content.knowledgePoints, mainScenes });
    }
    if (!quality.passed) {
      throw new Error(`个性化学习路径未通过质量门：${quality.issues.join("；")}`);
    }
    return confirmAdaptiveLearningPlan(plan);
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("个性化学习路径生成失败，未写入空白降级方案。", { cause: error });
  }
}

async function persistCanonicalContent(
  courseId: string,
  content: CourseContent,
  request: QuickDesignRequest,
  job: CourseDesignGenerationJob,
): Promise<Course> {
  await updateCourse(courseId, (current) => ({
    ...current,
    content: {
      ...current.content,
      ...content,
      designGenerationTrace: {
        mode: "quick",
        teacherBrief: request.teacherBrief,
        startedAt: (job.startedAt ?? job.createdAt).toISOString(),
        entries: traceEvents(job.trace),
      },
    },
  }));
  const saved = await getCourse(courseId);
  if (!saved) throw new Error("课程保存失败");
  return saved;
}

/**
 * Merge only authoring fields produced by the quick-design worker into the
 * latest aggregate. The worker can run for many minutes while other session
 * writes advance Course.version, so a captured Course must never replace the
 * complete current aggregate.
 */
export function mergeGeneratedCourseSnapshot(current: Course, generated: Course): Course {
  return {
    ...current,
    name: generated.name,
    subject: generated.subject,
    grade: generated.grade,
    hours: generated.hours,
    summary: generated.summary,
    drivingQuestion: generated.drivingQuestion,
    learningObjectives: generated.learningObjectives,
    expectedOutcome: generated.expectedOutcome,
    learnerProfile: generated.learnerProfile,
    pblConfig: generated.pblConfig,
    content: {
      ...current.content,
      ...generated.content,
    },
  };
}

async function saveGeneratedCourse(courseId: string, generated: Course): Promise<Course> {
  await updateCourse(courseId, (current) => mergeGeneratedCourseSnapshot(current, generated));
  const saved = await getCourse(courseId);
  if (!saved) throw new Error("课程保存失败");
  return saved;
}

function artifact(
  id: string,
  kind: CourseDesignGenerationArtifact["kind"],
  eyebrow: string,
  title: string,
  summary: string,
  accent: CourseDesignGenerationArtifact["accent"],
  items: CourseDesignGenerationArtifact["items"],
  visualization?: CourseDesignGenerationArtifact["visualization"],
): CourseDesignGenerationArtifact {
  const itemLimit = kind === "pages" ? 80 : 8;
  return { id, kind, eyebrow, title, summary, accent, items: items.filter((item) => item.value.trim()).slice(0, itemLimit), visualization };
}

async function enqueueClassroomGeneration(course: Course, options?: QuickDesignRequest["options"]): Promise<void> {
  const sceneOutlines = (course.content._openmaicSceneOutlines ?? []).map((scene, index) => ({
    ...scene,
    id: scene.id,
    type: scene.type === "quiz" || scene.type === "interactive" || scene.type === "pbl" ? scene.type : "slide",
    title: scene.title,
    description: scene.description || scene.title,
    keyPoints: scene.keyPoints ?? [],
    estimatedDuration: scene.estimatedDuration ?? scene.targetDurationSec ?? 300,
    order: scene.order ?? index,
  })) as Array<SceneOutline & OpenMaicSceneOutlineSnapshot>;
  const request: PersistedCourseGenerationRequest = {
    courseId: course.id,
    courseTitle: course.name,
    requirement: buildPblCourseRequirement(course, course.content, sceneOutlines),
    pblProfile: course.pblConfig,
    moduleTimingPlan: course.content.moduleTimingPlan,
    pblTeachingActivities: buildTeacherActivityRequirements(course.content),
    pblActivityCatalog: buildPblActivityCatalog(course.content),
    knowledgePoints: course.content.knowledgePoints,
    teachingConstraints: buildCourseTeachingConstraints(course, course.content),
    sceneOutlines,
    adaptiveBranchCount: course.content.adaptiveLearningPlan?.branches.filter((branch) => branch.enabled !== false).length ?? 0,
    enableWebSearch: false,
    enableImageGeneration: options?.enableImageGeneration ?? true,
    enableVideoGeneration: options?.enableVideoGeneration ?? false,
    enableTTS: options?.enableTTS ?? true,
    interactiveMode: options?.interactiveMode === true,
    ttsLanguage: "zh-CN",
    agentMode: "default",
  };
  const totalScenes = sceneOutlines.length;
  const initialEstimate = estimatePersistedCourseGenerationSeconds({
    totalScenes,
    adaptiveBranchCount: request.adaptiveBranchCount,
    enableImageGeneration: request.enableImageGeneration,
    enableVideoGeneration: request.enableVideoGeneration,
    enableTTS: request.enableTTS,
  });
  const existingGenerationJob = await prisma.courseGenerationJob.findUnique({
    where: { courseId: course.id },
    select: { id: true },
  });
  if (existingGenerationJob) {
    await resetCourseGenerationCheckpoints(existingGenerationJob.id);
  }
  await prisma.courseGenerationJob.upsert({
    where: { courseId: course.id },
    create: {
      courseId: course.id,
      request: request as unknown as Prisma.InputJsonValue,
      totalScenes,
      estimatedRemainingSeconds: initialEstimate,
      message: "课程设计已完成，等待生成课堂内容",
    },
    update: {
      status: "queued",
      step: "queued",
      progress: 0,
      message: "课程设计已完成，等待生成课堂内容",
      scenesGenerated: 0,
      totalScenes,
      estimatedRemainingSeconds: initialEstimate,
      request: request as unknown as Prisma.InputJsonValue,
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

function sceneOutlinesFromContent(content: CourseContent): Array<SceneOutline & OpenMaicSceneOutlineSnapshot> {
  const source = content._openmaicSceneOutlines?.length
    ? content._openmaicSceneOutlines
    : content.lessonOutline.map(toSceneOutline);
  return source.map((scene, index) => ({
    ...scene,
    id: scene.id,
    type: scene.type === "quiz" || scene.type === "interactive" || scene.type === "pbl" ? scene.type : "slide",
    title: scene.title,
    description: scene.description || scene.title,
    keyPoints: scene.keyPoints ?? [],
    estimatedDuration: scene.estimatedDuration ?? scene.targetDurationSec ?? 300,
    order: scene.order ?? index,
  })) as Array<SceneOutline & OpenMaicSceneOutlineSnapshot>;
}

async function completeCourseDesignFromTeachingOutline(
  job: CourseDesignGenerationJob,
  request: QuickDesignRequest,
  initialCourse: Course,
  initialContent: CourseContent,
  controller: AbortController,
): Promise<void> {
  let course = initialCourse;
  let content = initialContent;
  const teachingOutline = content.teachingOutline ?? [];
  let sceneOutlines: Array<SceneOutline & OpenMaicSceneOutlineSnapshot> = [];
  let correction = "";
  await beginStep(job, "lessonOutline", 5, 66, "正在逐页编写学生页面、互动与教师资源");
  for (let attempt = 0; attempt < MAX_AGENT_REVIEW_ROUNDS; attempt += 1) {
    sceneOutlines = await generateMainCourseOutlines(
      course,
      content,
      request,
      controller.signal,
      correction,
    );
    const quality = evaluateLessonOutlines(
      sceneOutlines,
      request.options?.interactiveMode === true,
      buildPblActivityCatalog(content),
    );
    const audit = await auditStage("主课脚本", {
      courseOutline: teachingOutline,
      pages: sceneOutlines.map((scene) => ({
        title: scene.title,
        type: scene.type,
        audience: scene.audience,
        stageKey: scene.stageKey,
        duration: scene.targetDurationSec ?? scene.estimatedDuration,
      })),
      correction,
    }, quality, controller.signal);
    if (audit.passed || (attempt === MAX_AGENT_REVIEW_ROUNDS - 1 && quality.passed)) break;
    correction = audit.issues.join("；") || audit.summary;
    if (attempt === MAX_AGENT_REVIEW_ROUNDS - 1) {
      throw new Error(`主课脚本代理无法生成结构完整的数据：${quality.issues.join("；")}`);
    }
  }
  content = {
    ...content,
    lessonOutline: sceneOutlines.map(sceneOutlineToLessonSection),
    _openmaicSceneOutlines: sceneOutlines,
    interactiveMode: request.options?.interactiveMode === true,
  };
  course = { ...course, content };
  course = await saveGeneratedCourse(request.courseId, course);
  const lessonQuality = evaluateLessonOutlines(
    sceneOutlines,
    request.options?.interactiveMode === true,
    buildPblActivityCatalog(content),
  );
  await recordStep(job, {
    step: "lessonOutline",
    stepIndex: 5,
    progress: 80,
    label: "主课脚本",
    summary: `已生成 ${sceneOutlines.length} 个课堂资源，包含学生页面、互动和教师资源`,
    status: "completed",
    checks: lessonQuality.checks,
    artifacts: [artifact(
      "course-outline",
      "pages",
      "主课脚本 · 页面与资源",
      "课程大纲",
      `共 ${sceneOutlines.length} 个页面与资源，按课程阶段排列。可在卡片内滚动预览，或展开详细大纲进行审阅和修改。`,
      "blue",
      sceneOutlines.map((scene) => ({
        label: scene.stageKey || "课程阶段",
        value: scene.title,
        meta: `${scene.audience === "teacher" ? "教师资源" : scene.type === "interactive" ? "互动页面" : scene.type === "quiz" ? "课堂检测" : "学生页面"} · ${Math.max(1, Math.round((scene.targetDurationSec ?? scene.estimatedDuration ?? 60) / 60))} 分钟`,
      })),
    )],
  });
  await persistCanonicalContent(request.courseId, content, request, job);

  await awaitOutlineReviewCheckpoint(job, controller);
  const reviewedCourse = await getCourse(request.courseId);
  if (!reviewedCourse) throw new Error("课程保存失败");
  content = reviewedCourse.content;
  sceneOutlines = sceneOutlinesFromContent(content);
  await completeCourseDesignAfterOutline(
    job,
    request,
    reviewedCourse,
    content,
    sceneOutlines,
    controller,
  );
}

async function completeCourseDesignAfterOutline(
  job: CourseDesignGenerationJob,
  request: QuickDesignRequest,
  course: Course,
  initialContent: CourseContent,
  initialSceneOutlines: Array<SceneOutline & OpenMaicSceneOutlineSnapshot>,
  controller: AbortController,
): Promise<void> {
  let content = initialContent;
  await beginStep(job, "adaptiveLearning", 6, 82, "正在规划诊断补缺与达标拓展路径");
  const adaptivePlan = await generateAdaptivePlan(
    course,
    content,
    initialSceneOutlines,
    controller.signal,
  );
  const adaptiveQuality = evaluateAdaptiveLearningPlanQuality(adaptivePlan, {
    knowledgePoints: content.knowledgePoints,
    mainScenes: initialSceneOutlines,
  });
  const adaptiveIssues = [
    ...adaptiveQuality.issues,
    ...(adaptivePlan.branches.length > 0 ? [] : ["未生成任何个性化学习分支"]),
  ];
  const adaptiveAudit = await auditStage("个性化学习路径", {
    knowledgePoints: content.knowledgePoints,
    mainScenes: initialSceneOutlines.map((scene) => ({ id: scene.id, title: scene.title, stageKey: scene.stageKey })),
    adaptivePlan,
  }, {
    passed: adaptiveIssues.length === 0,
    issues: adaptiveIssues,
    checks: [`${adaptivePlan.branches.length} 条学习分支`, "先修补缺与课后拓展已区分", "分支锚点来自真实主课页面"],
  }, controller.signal);
  if (!adaptiveAudit.passed && adaptiveIssues.length > 0) {
    throw new Error(`个性化学习路径代理无法生成结构完整的数据：${adaptiveIssues.join("；")}`);
  }
  content = { ...content, adaptiveLearningPlan: adaptivePlan };
  await recordStep(job, {
    step: "adaptiveLearning",
    stepIndex: 6,
    progress: 88,
    label: "个性化学习路径",
    summary: `已规划 ${adaptivePlan.branches.length} 条可审核的个性化学习路径`,
    status: adaptiveAudit.passed ? "completed" : "warning",
    checks: [
      "先决知识回顾已规划",
      adaptivePlan.branches.some((branch) => branch.kind !== "prerequisite")
        ? "仅在存在明确新增价值的位置规划可选拓展"
        : "未发现必须增加的拓展内容，保留完整主课路径",
      ...(!adaptiveAudit.passed ? ["AI 审校建议已记录，结构检查通过后继续"] : []),
    ],
    artifacts: [artifact("adaptive-branches", "branches", "个性化路径 · 学习分支", `${adaptivePlan.branches.length} 条按学习证据触发的路径`, "分支锚定本次主课页面，并避免重复讲授主课已经覆盖的内容。", "violet", adaptivePlan.branches.slice(0, 8).map((branch) => ({
      label: branch.kind === "prerequisite" ? "课前补缺" : branch.kind === "extension" ? "达标拓展" : branch.kind === "application" ? "迁移应用" : "例题支架",
      value: branch.title,
      meta: branch.objective,
    })))],
  });
  await persistCanonicalContent(request.courseId, content, request, job);

  const savedCourse = await getCourse(request.courseId);
  if (!savedCourse) throw new Error("课程保存失败");
  await beginStep(job, "qualityReview", 7, 92, "正在逐项复核课程目标、评价、时间与资源覆盖");
  const deterministicQuality = evaluateQuality(savedCourse);
  const quality = await runAiQualityReview(
    savedCourse,
    deterministicQuality,
    controller.signal,
  );
  await recordStep(job, {
    step: "qualityReview",
    stepIndex: 7,
    progress: 96,
    label: "综合质量复核",
    summary: quality.summary,
    status: quality.score === 100 ? "completed" : "warning",
    checks: quality.checks,
    artifacts: [artifact("quality-audit", "audit", "综合复核 · 质量报告", `${quality.score} 分`, quality.summary, quality.score >= 90 ? "green" : "orange", quality.checks.slice(0, 8).map((check, index) => ({
      label: `检查 ${index + 1}`,
      value: check,
    })))],
  });
  const completedAt = new Date().toISOString();
  await updateCourse(request.courseId, (current) => ({
    ...current,
    content: {
      ...current.content,
      designGenerationTrace: {
        mode: "quick",
        teacherBrief: request.teacherBrief,
        startedAt: (job.startedAt ?? job.createdAt).toISOString(),
        completedAt,
        entries: traceEvents(job.trace),
        qualityScore: quality.score,
        qualitySummary: quality.summary,
      },
    },
  }));
  if (deterministicQuality.score < 80) {
    throw new Error(`课程设计代理未能补齐必要结构（${deterministicQuality.score} 分）：${deterministicQuality.checks.join("；")}`);
  }
  const completedCourse = await getCourse(request.courseId);
  if (!completedCourse) throw new Error("课程保存失败");
  await enqueueClassroomGeneration(completedCourse, request.options);
  await prisma.courseDesignGenerationJob.update({
    where: { id: job.id },
    data: {
      status: "completed",
      step: "completed",
      stepIndex: 8,
      progress: 100,
      message: "课程设计已通过检查，课堂内容已进入生成队列",
      estimatedRemainingSeconds: 0,
      qualityReport: quality as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
      lastHeartbeatAt: new Date(),
      version: { increment: 1 },
    },
  });
}

export async function runCourseDesignJob(job: CourseDesignGenerationJob): Promise<void> {
  return runWithCourseGenerationLlmContext(() => runCourseDesignJobWithGenerationContext(job));
}

async function runCourseDesignJobWithGenerationContext(job: CourseDesignGenerationJob): Promise<void> {
  const request = job.request as unknown as QuickDesignRequest;
  const controller = new AbortController();
  activeController = controller;
  activeCourseId = request.courseId;
  try {
    const initialCourse = await getCourse(request.courseId);
    if (!initialCourse) throw new Error("课程不存在");
    const existingOutlines = sceneOutlinesFromContent(initialCourse.content);
    const canResumeValidatedOutline = canResumeAfterValidatedLessonOutline({
      trace: job.trace,
      outlines: existingOutlines,
      interactiveMode: request.options?.interactiveMode ?? false,
      activityCatalog: buildPblActivityCatalog(initialCourse.content),
    });
    if (
      (request.resumeFromOutlineReview && initialCourse.content.lessonOutline.length > 0)
      || canResumeValidatedOutline
    ) {
      await completeCourseDesignAfterOutline(
        job,
        request,
        initialCourse,
        initialCourse.content,
        existingOutlines,
        controller,
      );
      return;
    }
    const canResumeValidatedTeaching = canResumeAfterValidatedTeachingOutline({
      trace: job.trace,
      positioningPassed: evaluatePositioning(initialCourse).passed,
      projectDesignPassed: evaluateProjectDesign(initialCourse).passed,
      evaluationPlanPassed: evaluateEvaluationPlan(initialCourse.content.evaluationPlan).passed,
      knowledgePointCount: initialCourse.content.knowledgePoints.length,
      knowledgeGraphNodeCount: initialCourse.content.knowledgeGraph?.nodes.length ?? 0,
      teachingOutlineCount: initialCourse.content.teachingOutline?.length ?? 0,
      timingPlanConfirmed: isPblModuleTimingPlanConfirmed(initialCourse.content.moduleTimingPlan),
    });
    if (canResumeValidatedTeaching) {
      await completeCourseDesignFromTeachingOutline(
        job,
        request,
        initialCourse,
        initialCourse.content,
        controller,
      );
      return;
    }
    const positioning = await generatePositioning(initialCourse, request, controller.signal);
    let course = positioning.value;
    course = await saveGeneratedCourse(request.courseId, course);
    const positioningQuality = evaluatePositioning(course);
    await recordStep(job, {
      step: "base",
      stepIndex: 0,
      progress: 10,
      label: "课程定位",
      summary: `已确定《${course.name}》的教学对象、课时边界与课程目标`,
      status: "completed",
      checks: [
        ...positioningQuality.checks,
        positioning.review.revisionCount > 0
          ? `设计代理已完成 ${positioning.review.revisionCount} 轮审校与定向修订`
          : "设计代理一次审校通过",
        ...(positioning.review.advisoryIssues.length ? ["剩余建议已记录，不阻断后续生成"] : []),
      ],
      artifacts: [
        artifact("base-identity", "facts", "课程定位 · 基础信息", course.name, course.summary, "orange", [
          { label: "学科", value: course.subject || "综合实践" },
          { label: "学习对象", value: course.grade || "待确认" },
          { label: "课时", value: `${course.hours} 课时` },
          { label: "学习基础", value: course.learnerProfile?.priorKnowledge || "按课程要求分析" },
        ]),
        artifact("base-intent", "outcome", "课程定位 · 核心任务", course.drivingQuestion || "课程驱动问题", course.summary, "blue", [
          ...(course.learningObjectives ?? []).slice(0, 4).map((value, index) => ({ label: `目标 ${index + 1}`, value })),
          { label: "预期成果", value: course.expectedOutcome || course.pblConfig?.outcome.artifact || "项目成果待细化" },
        ]),
      ],
    });
    await persistCanonicalContent(request.courseId, course.content, request, job);

    let content = course.content;
    let correction = "";
    await beginStep(job, "knowledgePoints", 1, 12, "正在建立课程目标与知识图谱");
    for (let attempt = 0; attempt < MAX_AGENT_REVIEW_ROUNDS; attempt += 1) {
      const generated = await generateCourseContent({
        action: "knowledgeGraph",
        input: stageSummaryInput(course, request, correction),
        context: { teacherRequiredKnowledgePoints: content.teacherRequiredKnowledgePoints },
      }, { signal: controller.signal });
      const knowledgeGraph = generated.content.knowledgeGraph ?? { nodes: [], edges: [] };
      const candidate = {
        ...content,
        knowledgePoints: generated.content.knowledgePoints,
        knowledgeGraph,
      };
      const issues = [
        candidate.knowledgePoints.length >= 3 ? "" : "知识点数量不足",
        candidate.knowledgeGraph.nodes.length >= candidate.knowledgePoints.length ? "" : "知识图谱节点未覆盖全部知识点",
      ].filter(Boolean);
      const deterministic: StageQualityResult = {
        passed: issues.length === 0,
        issues,
        checks: [`${candidate.knowledgePoints.length} 个知识点`, `${candidate.knowledgeGraph.edges.length} 条知识关联`, "课程目标已映射到知识边界"],
      };
      const audit = await auditStage("目标与知识图谱", {
        objectives: course.learningObjectives,
        knowledgePoints: candidate.knowledgePoints,
        knowledgeGraph: candidate.knowledgeGraph,
      }, deterministic, controller.signal);
      if (audit.passed || (attempt === MAX_AGENT_REVIEW_ROUNDS - 1 && deterministic.passed)) {
        content = candidate;
        correction = "";
        break;
      }
      correction = audit.issues.join("；") || audit.summary;
      if (attempt === MAX_AGENT_REVIEW_ROUNDS - 1) {
        throw new Error(`目标与知识图谱代理无法生成结构完整的数据：${deterministic.issues.join("；")}`);
      }
    }
    course = { ...course, content };
    course = await saveGeneratedCourse(request.courseId, course);
    await recordStep(job, {
      step: "knowledgePoints",
      stepIndex: 1,
      progress: 23,
      label: "目标与知识图谱",
      summary: `已生成 ${content.knowledgePoints.length} 个知识点并建立 ${content.knowledgeGraph?.edges.length ?? 0} 条关联`,
      status: "completed",
      checks: ["知识边界已确认", "前置与迁移关系已检查", "已与课程目标对齐"],
      artifacts: [
        artifact("knowledge-graph", "graph", "目标与知识图谱", `${content.knowledgePoints.length} 个知识节点 · ${content.knowledgeGraph?.edges.length ?? 0} 条关联`, "基础、核心、应用与拓展", "blue", content.knowledgePoints.slice(0, 8).map((point, index) => ({
          label: point.level === "foundation" ? "基础" : point.level === "application" ? "应用" : point.level === "extension" ? "拓展" : `节点 ${index + 1}`,
          value: point.name,
          meta: point.description,
        })), { knowledgeGraph: content.knowledgeGraph, knowledgePoints: content.knowledgePoints }),
      ],
    });
    await persistCanonicalContent(request.courseId, content, request, job);

    await beginStep(job, "projectDesign", 2, 25, "正在把驱动问题转化为项目成果与过程证据");
    course = await generateProjectDesign(course, request, controller.signal);
    content = course.content;
    course = await saveGeneratedCourse(request.courseId, course);
    const projectQuality = evaluateProjectDesign(course);
    await recordStep(job, {
      step: "projectDesign",
      stepIndex: 2,
      progress: 36,
      label: "项目成果",
      summary: `已确定项目作品“${course.pblConfig?.outcome.artifact}”及配套学习证据`,
      status: "completed",
      checks: projectQuality.checks,
      artifacts: [artifact("project-outcome", "outcome", "项目成果 · 成果契约", course.pblConfig?.outcome.artifact || "项目成果", "作品、表达、反思和过程证据已经形成同一套成果要求。", "violet", [
        { label: "最终作品", value: course.pblConfig?.outcome.artifact || "" },
        { label: "成果表达", value: course.pblConfig?.outcome.presentation || "" },
        { label: "项目反思", value: course.pblConfig?.outcome.reflection || "" },
        ...(course.pblConfig?.evidenceRequirements ?? []).slice(0, 4).map((item) => ({ label: "过程证据", value: item.label, meta: item.description })),
      ])],
    });
    await persistCanonicalContent(request.courseId, content, request, job);

    correction = "";
    await beginStep(job, "evaluationPlan", 3, 38, "正在设计 AI、教师与学生共同参与的评价方案");
    for (let attempt = 0; attempt < MAX_AGENT_REVIEW_ROUNDS; attempt += 1) {
      const generated = await generateCourseContent({
        action: "evaluationPlan",
        input: stageSummaryInput(course, request, correction),
        context: {
          knowledgePoints: content.knowledgePoints,
          knowledgeGraph: content.knowledgeGraph,
          pblOutline: JSON.stringify(course.pblConfig?.outcome ?? {}),
        },
      }, { signal: controller.signal });
      const evaluationPlan = ensureEvaluationResponsibility(generated.content.evaluationPlan);
      const quality = evaluateEvaluationPlan(evaluationPlan);
      const audit = await auditStage("成功标准", {
        outcome: course.pblConfig?.outcome,
        evaluationPlan,
      }, quality, controller.signal);
      if (audit.passed || (attempt === MAX_AGENT_REVIEW_ROUNDS - 1 && quality.passed)) {
        content = { ...content, evaluationPlan };
        correction = "";
        break;
      }
      correction = audit.issues.join("；") || audit.summary;
      if (attempt === MAX_AGENT_REVIEW_ROUNDS - 1) {
        throw new Error(`成功标准代理无法生成结构完整的数据：${quality.issues.join("；")}`);
      }
    }
    course = { ...course, content };
    course = await saveGeneratedCourse(request.courseId, course);
    const evaluationQuality = evaluateEvaluationPlan(content.evaluationPlan);
    await recordStep(job, {
      step: "evaluationPlan",
      stepIndex: 3,
      progress: 49,
      label: "成功标准",
      summary: `已生成 ${content.evaluationPlan.dimensions.length} 个可观察维度，并逐项核对评分证据与达成要求`,
      status: "completed",
      checks: evaluationQuality.checks,
      artifacts: [
        artifact("evaluation-dimensions", "rubric", "成功标准 · 评价维度", `${content.evaluationPlan.dimensions.length} 个可观察维度`, content.evaluationPlan.overallRubric, "green", content.evaluationPlan.dimensions.slice(0, 8).map((dimension) => ({
          label: `${dimension.weight}%`,
          value: dimension.name,
          meta: dimension.description,
          evaluator: dimension.responsibleRole ?? "teacher",
        }))),
      ],
    });
    await persistCanonicalContent(request.courseId, content, request, job);

    await beginStep(job, "teachingOutline", 4, 51, "正在编排六阶段任务、角色与课程时间");
    correction = "";
    let teachingStructure: Awaited<ReturnType<typeof generateTeachingStructure>> | undefined;
    for (let attempt = 0; attempt < MAX_AGENT_REVIEW_ROUNDS; attempt += 1) {
      teachingStructure = await generateTeachingStructure(course, content, request, controller.signal, correction);
      const teachingAudit = await auditStage("六阶段架构", {
        totalMinutes: teachingStructure.totalMinutes,
        outcome: course.pblConfig?.outcome,
        evaluationPlan: content.evaluationPlan,
        teachingOutline: teachingStructure.teachingOutline,
      }, {
        passed: true,
        issues: [],
        checks: ["六阶段顺序完整", `总时长 ${teachingStructure.totalMinutes} 分钟`, "项目成果与评价要求已作为上游约束"],
      }, controller.signal);
      if (teachingAudit.passed || attempt === MAX_AGENT_REVIEW_ROUNDS - 1) break;
      correction = teachingAudit.issues.join("；") || teachingAudit.summary;
    }
    if (!teachingStructure) throw new Error("六阶段架构代理未返回可保存的数据");
    const { totalMinutes, teachingOutline, moduleTimingPlan, projectMainline } = teachingStructure;
    content = { ...content, teachingOutline, moduleTimingPlan, projectMainline };
    course = { ...course, content };
    course = await saveGeneratedCourse(request.courseId, course);
    await recordStep(job, {
      step: "teachingOutline",
      stepIndex: 4,
      progress: 64,
      label: "六阶段架构",
      summary: `已完成 6 个阶段的活动设计，合计 ${totalMinutes} 分钟`,
      status: "completed",
      checks: ["六阶段顺序完整", `总时长 ${totalMinutes} 分钟`, "教师、AI 与学生任务已明确"],
      artifacts: [
        artifact("teaching-timeline", "timeline", "六阶段架构 · 时间线", `${totalMinutes} 分钟课程节奏`, "六阶段课堂时间分配", "orange", teachingOutline.map((stage) => ({
          label: `${stage.durationMin} 分钟`,
          value: stage.title,
          meta: stage.studentActivity,
        }))),
        artifact("teaching-roles", "timeline", "六阶段架构 · 教学协作", "教师资源与学生任务同步编排", "六阶段师生任务与 AI 协作", "blue", teachingOutline.map((stage) => ({
          label: stage.title,
          value: stage.teacherRole,
          meta: `AI：${stage.aiRole}`,
        }))),
      ],
    });
    await persistCanonicalContent(request.courseId, content, request, job);

    await completeCourseDesignFromTeachingOutline(
      job,
      request,
      course,
      content,
      controller,
    );
  } catch (error) {
    if (stopping && controller.signal.aborted) {
      await prisma.courseDesignGenerationJob.updateMany({
        where: { id: job.id, status: { in: ["running", "review_available"] } },
        data: {
          status: "queued",
          step: "queued",
          reviewStatus: "auto-continued",
          reviewAvailableUntil: null,
          message: "等待服务器继续生成",
          lastHeartbeatAt: new Date(),
        },
      });
      return;
    }
    const currentStatus = await prisma.courseDesignGenerationJob.findUnique({
      where: { id: job.id },
      select: { status: true },
    });
    if (
      error instanceof CourseDesignCancelledError
      || currentStatus?.status === "cancelling"
      || currentStatus?.status === "cancelled"
      || (controller.signal.aborted && !stopping)
    ) {
      await prisma.courseDesignGenerationJob.updateMany({
        where: { id: job.id, status: { in: ["running", "review_available", "paused", "cancelling"] } },
        data: {
          status: "cancelled",
          step: "cancelled",
          message: "课程生成已中断",
          error: null,
          estimatedRemainingSeconds: null,
          completedAt: new Date(),
          lastHeartbeatAt: new Date(),
        },
      });
      return;
    }
    await prisma.courseDesignGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        step: "failed",
        message: "快速课程设计未完成",
        error: error instanceof Error ? error.message : String(error),
        estimatedRemainingSeconds: null,
        completedAt: new Date(),
        lastHeartbeatAt: new Date(),
        version: { increment: 1 },
      },
    });
  } finally {
    if (activeController === controller) activeController = null;
    if (activeCourseId === request.courseId) activeCourseId = null;
  }
}

export async function cancelCourseDesignJob(courseId: string): Promise<CourseDesignGenerationJob | null> {
  const job = await prisma.courseDesignGenerationJob.findUnique({ where: { courseId } });
  if (!job) return null;
  if (job.status === "queued") {
    return prisma.courseDesignGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "cancelled",
        step: "cancelled",
        message: "课程生成已中断",
        estimatedRemainingSeconds: null,
        completedAt: new Date(),
        lastHeartbeatAt: new Date(),
        version: { increment: 1 },
      },
    });
  }
  if (["running", "review_available", "paused", "cancelling"].includes(job.status)) {
    const updated = await prisma.courseDesignGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "cancelling",
        step: "cancelling",
        message: "正在安全中断课程生成",
        lastHeartbeatAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (activeCourseId === courseId) activeController?.abort(new CourseDesignCancelledError());
    return updated;
  }
  return job;
}

async function claimNextJob(): Promise<CourseDesignGenerationJob | null> {
  const candidate = await prisma.courseDesignGenerationJob.findFirst({ where: { status: "queued" }, orderBy: { createdAt: "asc" } });
  if (!candidate) return null;
  const now = new Date();
  const claimed = await prisma.courseDesignGenerationJob.updateMany({
    where: { id: candidate.id, status: "queued" },
    data: {
      status: "running",
      step: "base",
      message: "正在分析课程信息",
      startedAt: now,
      lastHeartbeatAt: now,
      error: null,
      attempt: { increment: 1 },
      version: { increment: 1 },
    },
  });
  return claimed.count === 1 ? prisma.courseDesignGenerationJob.findUnique({ where: { id: candidate.id } }) : null;
}

async function tick(): Promise<void> {
  if (stopping) return;
  try {
    const job = await claimNextJob();
    if (job) await runCourseDesignJob(job);
  } finally {
    if (!stopping) {
      timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      timer.unref?.();
    }
  }
}

export async function startCourseDesignWorker(): Promise<void> {
  if (workerStarted) return;
  workerStarted = true;
  stopping = false;
  await prisma.courseDesignGenerationJob.updateMany({
    where: {
      status: "running",
      OR: [
        { lastHeartbeatAt: null },
        { lastHeartbeatAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
      ],
    },
    data: { status: "queued", step: "queued", message: "等待服务器继续生成" },
  });
  await prisma.courseDesignGenerationJob.updateMany({
    where: { status: "review_available" },
    data: {
      status: "queued",
      reviewStatus: "auto-continued",
      reviewAvailableUntil: null,
      step: "queued",
      message: "服务恢复后继续生成课程",
    },
  });
  void tick();
}

export async function stopCourseDesignWorker(): Promise<void> {
  stopping = true;
  if (timer) clearTimeout(timer);
  timer = null;
  activeController?.abort();
  workerStarted = false;
}
