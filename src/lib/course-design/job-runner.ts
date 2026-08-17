import { Prisma, type CourseDesignGenerationJob } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import {
  callLLM,
  generateCourseContent,
  normalizeEvaluationPlanOutput,
  parseLLMJson,
} from "@/lib/llm/client";
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
  confirmAdaptiveLearningPlan,
  evaluateAdaptiveLearningPlanQuality,
} from "@/lib/adaptive-learning";
import { generateCourseEntryPackage } from "@/lib/course-entry-generation";
import { generateReviewedKnowledgeStructure } from "@/lib/knowledge-structure-generation";
import { assessKnowledgeGraphQuality } from "@/lib/knowledge-graph-quality";
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
import {
  generateSceneOutlinesFromRequirements,
  normalizeSceneOutlinesForDuration,
} from "@/lib/openmaic/generation/outline-generator";
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
  canResumeAfterValidatedStage,
  canResumeAfterValidatedLessonOutline,
  canResumeAfterValidatedPositioning,
  canResumeAfterValidatedTeachingOutline,
} from "@/lib/course-design/resume-policy";
import {
  createManagedRecoveryRequest,
  formatFatalCourseDesignError,
} from "@/lib/course-design/failure-policy";
import { editCourseDesignStage } from "@/lib/course-design/stage-editor";
import { createLogger } from "@openmaic/lib/logger";

const POLL_INTERVAL_MS = 1_500;
const STALE_AFTER_MS = 30 * 60 * 1_000;
const MAX_TRACE_ENTRIES = 24;
const MAX_AGENT_REVIEW_ROUNDS = 4;
// Deep-reasoning providers can spend several minutes on graph construction,
// independent review, and page planning. Estimates are deliberately
// conservative so the quick-generation UI does not imply that a healthy job
// is stuck while a long inference is still within policy.
const STEP_ESTIMATES = [180, 720, 180, 240, 360, 600, 180, 120];
const OUTLINE_REVIEW_WINDOW_MS = 10_000;
const log = createLogger("CourseDesign");

export type QuickDesignRequest = {
  courseId: string;
  teacherBrief: string;
  options?: {
    enableImageGeneration: boolean;
    enableTTS: boolean;
    enableVideoGeneration: boolean;
  };
  resumeFromOutlineReview?: boolean;
  /** Internal Agent recovery state. Never supplied by the teacher-facing UI. */
  managedRecoveryCount?: number;
  /** Last correctable quality failure, fed back into the next Agent run. */
  managedRecoveryFeedback?: string;
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
    + 45;
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
    narrationMode: section.narrationMode,
    teachingToolPlan: section.teachingToolPlan,
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
    narrationMode: scene.narrationMode,
    teachingToolPlan: scene.teachingToolPlan,
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
        content: `你是课程设计流程代理，不掌握教师未提供的真实学情或学校条件。你只检查当前数据中可以直接观察到的常见明显问题：字段遗漏、前后矛盾、目标与成果错配、时间明显不可执行、引用对象不存在，以及常见的课程设计错误。
不得凭空推断学生真实能力、学校设备、教师偏好或唯一正确的教学取舍；这类不确定判断不要列为问题。不要改写内容，只返回 JSON。`,
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
    return { passed: true, summary: "Agent 建议检查暂不可用；确定性硬规则已通过", issues: [] };
  }
}

function stageSummaryInput(course: Course, request: QuickDesignRequest) {
  return buildCourseGenerationInput({
    ...course,
    summary: [
      course.summary,
      `教师补充要求：${request.teacherBrief.trim()}`,
      "默认采用深度互动教学：先完整讲清基础知识，再通过非评分操作与反馈巩固，最后只进行一次主课达标测。",
    ].filter(Boolean).join("\n"),
  });
}

export async function inferCourseSeed(
  course: Course,
  request: QuickDesignRequest,
  signal: AbortSignal,
): Promise<Pick<Course, "name" | "subject" | "grade" | "hours">> {
  const response = await callLLM([
    {
      role: "system",
      content: "你是课程定位分析助手。根据教师输入提取课程名称、学科、年级和合理课时。课时只能是 1 至 5 的整数。grade 不得为空：若教师未明确写出年级，应结合课程主题、学科和任务难度给出最合适的宽口径学段假设（如小学高段、初中、高中、大学通识），供教师后续确认。不要生成课程内容，只返回 JSON。",
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
  let grade = typeof parsed.grade === "string" && parsed.grade.trim()
    ? parsed.grade.trim().slice(0, 30)
    : course.grade.trim().slice(0, 30);
  if (!grade) {
    const repairResponse = await callLLM([
      {
        role: "system",
        content: "你是课程受众定位审核员。当前课程缺少学段，必须根据课程主题、学科和教师描述给出一个最合适的宽口径学段假设。只返回 JSON；grade 必须是非空字符串。",
      },
      {
        role: "user",
        content: JSON.stringify({
          courseName: typeof parsed.name === "string" ? parsed.name : course.name,
          subject: typeof parsed.subject === "string" ? parsed.subject : course.subject,
          teacherBrief: request.teacherBrief,
          output: { grade: "小学高段|初中|高中|大学通识|职业教育|成人教育" },
        }),
      },
    ], { jsonMode: true, abortSignal: signal, maxTransientRetries: 1 });
    const repaired = parseLLMJson<Record<string, unknown>>(repairResponse);
    grade = typeof repaired.grade === "string" && repaired.grade.trim()
      ? repaired.grade.trim().slice(0, 30)
      : "学段未指定（教师待确认）";
  }
  return {
    name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 40) : course.name,
    subject: typeof parsed.subject === "string" && parsed.subject.trim() ? parsed.subject.trim().slice(0, 40) : course.subject,
    grade,
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
      content: "你是 PBL 课程定位设计师。补齐一份可直接采用的课程底稿，不要返回候选列表。目标必须可观察、可评价；课程说明包含真实情境、范围、学生任务和预期判断。drivingQuestion 是统领整门课程和最终项目的唯一核心驱动问题：只能包含一个问句和一个问号，必须包含真实对象或情境、学生要完成的项目行动、预期成果或改变及证据边界。不得列举知识点问题、技术步骤问题或方法优缺点问题，也不得把多个子问题拼接在一起。只能返回 JSON。",
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
  return editCourseDesignStage({
    label: "课程定位",
    current: {
      summary: current.summary,
      learningObjectives: current.learningObjectives,
      learnerProfile: current.learnerProfile,
      drivingQuestion: current.drivingQuestion,
    },
    preserveValueOnMalformedEdit: current,
    issues,
    fixedConstraints: {
      teacherBrief: request.teacherBrief,
      name: current.name,
      subject: current.subject,
      grade: current.grade,
      hours: current.hours,
      totalMinutes: Math.round(current.hours * 60),
      drivingQuestionRule: "唯一核心挑战，只含一个问句；包含真实情境、项目行动、成果或改变及证据边界",
    },
    outputSchema: {
      summary: "完整课程说明",
      learningObjectives: ["3-4 个服务同一驱动问题的可观察目标"],
      learnerProfile: {
        priorKnowledge: "string",
        learningNeeds: "string",
        familiarContexts: "string",
      },
      drivingQuestion: "一个统领整门课程和最终项目的问句？",
    },
    abortSignal: signal,
    parse: (value) => {
      const parsed = value && typeof value === "object" ? value as Record<string, unknown> : {};
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
    },
  });
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
      candidate = await revisePositioningCandidate(candidate, request, latestIssues, signal);
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

function applyProjectDesignPayload(course: Course, value: unknown): Course {
  const parsed = value && typeof value === "object" ? value as Record<string, unknown> : {};
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
  return {
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
      inquiryQuestions: [course.drivingQuestion],
    }),
  };
}

export async function generateProjectDesign(
  course: Course,
  request: QuickDesignRequest,
  signal: AbortSignal,
): Promise<Course> {
  const response = await callLLM([
    {
      role: "system",
      content: "你是 PBL 项目成果设计师。生成个人项目的作品、表达、反思和过程证据要求。成果必须在课程课时内可完成，且能证明课程目标达成。只返回 JSON。",
    },
    {
      role: "user",
      content: JSON.stringify({
        course: stageSummaryInput(course, request),
        knowledgePoints: course.content.knowledgePoints,
        requiredEvidenceKinds: DEFAULT_PBL_EVIDENCE_REQUIREMENTS.map((item) => ({ kind: item.kind, label: item.label })),
        output: {
          difficultyLevel: "introductory|standard|advanced",
          artifact: "string",
          presentation: "string",
          reflection: "string",
          evidenceKinds: ["idea-draft"],
        },
      }),
    },
  ], { jsonMode: true, abortSignal: signal, maxTransientRetries: 1 });
  let candidate = applyProjectDesignPayload(course, parseLLMJson<unknown>(response));
  let latestQuality = evaluateProjectDesign(candidate);
  let latestAuditIssues: string[] = [];
  for (let attempt = 0; attempt < MAX_AGENT_REVIEW_ROUNDS; attempt += 1) {
    const quality = evaluateProjectDesign(candidate);
    latestQuality = quality;
    const audit = await auditStage("项目成果", {
      outcome: candidate.pblConfig?.outcome,
      evidenceRequirements: candidate.pblConfig?.evidenceRequirements,
    }, quality, signal);
    if (audit.passed) return candidate;
    latestAuditIssues = audit.issues.length ? audit.issues : [audit.summary];
    if (attempt < MAX_AGENT_REVIEW_ROUNDS - 1) {
      candidate = await editCourseDesignStage({
        label: "项目成果",
        current: {
          difficultyLevel: candidate.pblConfig?.difficultyLevel,
          ...candidate.pblConfig?.outcome,
          evidenceKinds: candidate.pblConfig?.evidenceRequirements?.map((item) => item.kind),
        },
        issues: audit.issues.length ? audit.issues : [audit.summary],
        fixedConstraints: {
          teacherBrief: request.teacherBrief,
          hours: course.hours,
          drivingQuestion: course.drivingQuestion,
          learningObjectives: course.learningObjectives,
          knowledgePoints: course.content.knowledgePoints,
        },
        outputSchema: {
          difficultyLevel: "introductory|standard|advanced",
          artifact: "string",
          presentation: "string",
          reflection: "string",
          evidenceKinds: ["idea-draft"],
        },
        abortSignal: signal,
        preserveValueOnMalformedEdit: candidate,
        parse: (value) => applyProjectDesignPayload(course, value),
      });
    }
  }
  if (latestQuality.passed) return candidate;
  throw new Error(`项目成果编辑 Agent 无法修复硬规则问题：${latestQuality.issues.join("；") || latestAuditIssues.join("；")}`);
}

async function generateTeachingStructure(
  course: Course,
  content: CourseContent,
  request: QuickDesignRequest,
  signal: AbortSignal,
) {
  const totalMinutes = Math.max(1, Math.round(course.hours * 60));
  const timing = await generateCourseContent({
    action: "moduleTimingPlan",
    input: stageSummaryInput(course, request),
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
    input: stageSummaryInput(course, request),
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

function normalizeEditedTeachingStructure(
  course: Course,
  content: CourseContent,
  value: unknown,
) {
  const totalMinutes = Math.max(1, Math.round(course.hours * 60));
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawOutline = Array.isArray(value) ? value : raw.teachingOutline;
  const normalized = normalizePblTeachingOutline(Array.isArray(rawOutline) ? rawOutline : [], {
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
  });
  const normalizedPlan = buildPblModuleTimingPlan(totalMinutes, normalized, undefined, {
    status: "confirmed",
    preserveCurrentDurations: true,
  });
  const teachingOutline = normalized.map((activity) => ({
    ...activity,
    durationMin: normalizedPlan.allocations.find((item) => item.id === activity.id)?.durationMin ?? activity.durationMin,
  }));
  const moduleTimingPlan = buildPblModuleTimingPlan(totalMinutes, teachingOutline, undefined, {
    status: "confirmed",
    preserveCurrentDurations: true,
  });
  if (teachingOutline.length !== 6 || !isPblModuleTimingPlanConfirmed(moduleTimingPlan)) {
    throw new Error("六阶段编辑稿未通过阶段数量或总时长校验");
  }
  return {
    totalMinutes,
    teachingOutline,
    moduleTimingPlan,
    projectMainline: buildPblProjectMainline(totalMinutes, teachingOutline),
  };
}

async function generateMainCourseOutlines(
  course: Course,
  content: CourseContent,
  request: QuickDesignRequest,
  signal: AbortSignal,
): Promise<Array<SceneOutline & OpenMaicSceneOutlineSnapshot>> {
  const requirements: UserRequirements = {
    requirement: [
      buildPblCourseRequirement(course, content, []),
    ].filter(Boolean).join("\n\n"),
    pblProfile: course.pblConfig,
    pblTeachingActivities: buildTeacherActivityRequirements(content),
    pblActivityCatalog: buildPblActivityCatalog(content),
    knowledgePoints: content.knowledgePoints.map((point) => ({ id: point.id, name: point.name })),
    teachingConstraints: buildCourseTeachingConstraints(course, content),
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

function normalizeEditedSceneOutlines(
  value: unknown,
  current: Array<SceneOutline & OpenMaicSceneOutlineSnapshot>,
): Array<SceneOutline & OpenMaicSceneOutlineSnapshot> {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const items = Array.isArray(value) ? value : raw.outlines;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("主课脚本编辑 Agent 未返回完整页面数组");
  }
  const currentById = new Map(current.map((outline) => [outline.id, outline]));
  const merged = items.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`主课脚本第 ${index + 1} 页结构无效`);
    const edited = item as Partial<SceneOutline & OpenMaicSceneOutlineSnapshot>;
    const stableId = typeof edited.id === "string" && edited.id.trim()
      ? edited.id.trim()
      : current[index]?.id;
    if (!stableId) throw new Error(`主课脚本第 ${index + 1} 页缺少稳定 ID`);
    const original = currentById.get(stableId) ?? current[index];
    return { ...original, ...edited, id: stableId } as SceneOutline & OpenMaicSceneOutlineSnapshot;
  });
  return normalizeSceneOutlinesForDuration(merged) as Array<SceneOutline & OpenMaicSceneOutlineSnapshot>;
}

function evaluateQuality(course: Course): { score: number; summary: string; checks: string[] } {
  const content = course.content;
  const positioning = evaluatePositioning(course);
  const project = evaluateProjectDesign(course);
  const evaluation = evaluateEvaluationPlan(content.evaluationPlan);
  const mainScenes = sceneOutlinesFromContent(content);
  const lesson = evaluateLessonOutlines(
    mainScenes,
    buildPblActivityCatalog(content),
  );
  const adaptiveQuality = content.adaptiveLearningPlan
    ? evaluateAdaptiveLearningPlanQuality(content.adaptiveLearningPlan, {
        knowledgePoints: content.knowledgePoints,
        knowledgeGraph: content.knowledgeGraph,
        mainScenes,
      })
    : null;
  const checks = [
    positioning.passed ? "课程定位字段完整并通过审校" : positioning.issues.join("；"),
    content.knowledgePoints.length > 0 ? `知识图谱包含 ${content.knowledgePoints.length} 个知识点` : "知识图谱缺少知识点",
    project.passed ? "项目成果包含作品、表达、反思和过程证据" : project.issues.join("；"),
    evaluation.passed ? "AI 与教师评价职责完整" : evaluation.issues.join("；"),
    content.teachingOutline?.length === 6 ? "六阶段课程架构完整" : `课程架构包含 ${content.teachingOutline?.length ?? 0} 个阶段`,
    isPblModuleTimingPlanConfirmed(content.moduleTimingPlan) ? "课程总时长与六阶段分配一致" : "课程时间尚未通过校验",
    lesson.passed ? `主课脚本包含 ${content.lessonOutline.length} 个合格课堂资源` : lesson.issues.join("；"),
    adaptiveQuality?.passed
      ? `个性化学习已通过闭环校验（${content.adaptiveLearningPlan?.branches.length ?? 0} 条候选路径）`
      : adaptiveQuality?.issues.join("；") || "缺少个性化学习方案",
  ];
  const passed = [
    positioning.passed,
    content.knowledgePoints.length > 0,
    project.passed,
    evaluation.passed,
    content.teachingOutline?.length === 6,
    isPblModuleTimingPlanConfirmed(content.moduleTimingPlan),
    lesson.passed,
    adaptiveQuality?.passed === true,
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
        content: `你是课程设计流程代理，不掌握教师未提供的真实学情或学校条件。请汇总可以从当前数据直接观察到的常见明显问题，例如字段遗漏、引用失效、前后矛盾、目标与成果明显错配；不得把无法证实的学生能力、设备条件、教师偏好或教学取舍当成事实。
确定性检查是硬规则，你的结果只用于给后续流程提供补充建议，不得虚构新的硬门槛。只能返回 JSON。`,
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
  try {
    const result = await generateCourseEntryPackage({
      course: {
        name: course.name,
        subject: course.subject,
        grade: course.grade,
        summary: course.summary,
        learningObjectives: course.learningObjectives,
        learnerProfile: course.learnerProfile,
      },
      knowledgePoints: content.knowledgePoints,
      knowledgeGraph: content.knowledgeGraph,
      mainScenes,
    }, { abortSignal: signal });
    return {
      plan: confirmAdaptiveLearningPlan(result.plan),
      knowledgeGraph: result.knowledgeGraph,
    };
  } catch (error) {
    if (signal.aborted) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`个性化学习路径生成失败，未写入空白降级方案：${detail}`, { cause: error });
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
  await beginStep(job, "lessonOutline", 5, 66, "正在逐页编写学生页面、互动与教师资源");
  let sceneOutlines = await generateMainCourseOutlines(
    course,
    content,
    request,
    controller.signal,
  );
  for (let attempt = 0; attempt < MAX_AGENT_REVIEW_ROUNDS; attempt += 1) {
    const quality = evaluateLessonOutlines(
      sceneOutlines,
      buildPblActivityCatalog(content),
    );
    const audit = await auditStage("主课脚本", {
      courseOutline: teachingOutline,
      pages: sceneOutlines.map((scene) => ({
        id: scene.id,
        title: scene.title,
        type: scene.type,
        audience: scene.audience,
        stageKey: scene.stageKey,
        duration: scene.targetDurationSec ?? scene.estimatedDuration,
      })),
    }, quality, controller.signal);
    if (audit.passed || (attempt === MAX_AGENT_REVIEW_ROUNDS - 1 && quality.passed)) break;
    if (attempt === MAX_AGENT_REVIEW_ROUNDS - 1) {
      throw new Error(`主课脚本编辑 Agent 无法修复硬规则问题：${quality.issues.join("；") || audit.summary}`);
    }
    sceneOutlines = await editCourseDesignStage({
      label: "主课脚本",
      current: { outlines: sceneOutlines },
      issues: audit.issues.length ? audit.issues : [audit.summary],
      fixedConstraints: {
        teacherBrief: request.teacherBrief,
        teachingOutline,
        knowledgePoints: content.knowledgePoints,
        knowledgeGraph: content.knowledgeGraph,
        projectOutcome: course.pblConfig?.outcome,
        evaluationPlan: content.evaluationPlan,
      },
      outputSchema: {
        outlines: "完整页面数组；保留所有已正确页面及稳定 ID，只编辑问题页面和必要关联",
      },
      abortSignal: controller.signal,
      preserveValueOnMalformedEdit: sceneOutlines,
      parse: (value) => normalizeEditedSceneOutlines(value, sceneOutlines),
    });
  }
  content = {
    ...content,
    lessonOutline: sceneOutlines.map(sceneOutlineToLessonSection),
    _openmaicSceneOutlines: sceneOutlines,
  };
  course = { ...course, content };
  course = await saveGeneratedCourse(request.courseId, course);
  const lessonQuality = evaluateLessonOutlines(
    sceneOutlines,
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
  const adaptiveResult = await generateAdaptivePlan(
    course,
    content,
    initialSceneOutlines,
    controller.signal,
  );
  const adaptivePlan = adaptiveResult.plan;
  content = { ...content, knowledgeGraph: adaptiveResult.knowledgeGraph };
  const adaptiveQuality = evaluateAdaptiveLearningPlanQuality(adaptivePlan, {
    knowledgePoints: content.knowledgePoints,
    knowledgeGraph: content.knowledgeGraph,
    mainScenes: initialSceneOutlines,
  });
  const adaptiveIssues = [...adaptiveQuality.issues];
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

function scheduleManagedCourseDesignRetry(jobId: string): void {
  const retryTimer = setTimeout(() => {
    void (async () => {
      const now = new Date();
      const claimed = await prisma.courseDesignGenerationJob.updateMany({
        where: { id: jobId, status: "queued" },
        data: {
          status: "running",
          step: "managed_recovery",
          message: "托管生成 Agent 正在根据质量审校结果自动修订课程",
          lastHeartbeatAt: now,
          error: null,
          attempt: { increment: 1 },
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) return;
      const retryJob = await prisma.courseDesignGenerationJob.findUnique({ where: { id: jobId } });
      if (retryJob) await runCourseDesignJob(retryJob);
    })().catch((error) => log.error("Failed to schedule managed course-design recovery", error));
  }, 150);
  retryTimer.unref?.();
}

export async function runCourseDesignJob(job: CourseDesignGenerationJob): Promise<void> {
  return runWithCourseGenerationLlmContext(() => runCourseDesignJobWithGenerationContext(job));
}

/**
 * Upgrades a previously failed, but structurally recoverable, durable task to
 * the managed Agent loop. This lets deployments resume jobs that failed under
 * the old fail-fast policy without asking the teacher to resubmit the brief.
 */
export async function resumeRecoverableCourseDesignJob(
  courseId: string,
): Promise<CourseDesignGenerationJob | null> {
  const job = await prisma.courseDesignGenerationJob.findUnique({ where: { courseId } });
  if (!job || job.status !== "failed" || !job.error) return job;
  const request = job.request as unknown as QuickDesignRequest;
  const managedRecoveryRequest = createManagedRecoveryRequest(request, new Error(job.error));
  if (!managedRecoveryRequest) return job;
  const recoveryCount = managedRecoveryRequest.managedRecoveryCount ?? 1;
  const updated = await prisma.courseDesignGenerationJob.updateMany({
    where: { id: job.id, status: "failed" },
    data: {
      status: "queued",
      step: "managed_recovery",
      message: `检测到可修复的生成问题，托管生成 Agent 正在自动恢复（第 ${recoveryCount} 次）`,
      request: managedRecoveryRequest as unknown as Prisma.InputJsonValue,
      error: null,
      completedAt: null,
      estimatedRemainingSeconds: remainingSeconds(
        Math.max(0, Math.min(job.stepIndex, STEP_ESTIMATES.length - 1)),
        request.options,
      ),
      lastHeartbeatAt: new Date(),
      version: { increment: 1 },
    },
  });
  if (updated.count === 1) scheduleManagedCourseDesignRetry(job.id);
  return prisma.courseDesignGenerationJob.findUnique({ where: { id: job.id } });
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
    const reusePositioning = canResumeAfterValidatedPositioning({
      trace: job.trace,
      positioningPassed: evaluatePositioning(initialCourse).passed,
    });
    const positioning = reusePositioning
      ? { value: initialCourse, review: { revisionCount: 0, advisoryIssues: [] as string[] } }
      : await generatePositioning(initialCourse, request, controller.signal);
    let course = positioning.value;
    course = reusePositioning ? course : await saveGeneratedCourse(request.courseId, course);
    const positioningQuality = evaluatePositioning(course);
    if (!reusePositioning) await recordStep(job, {
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
    const savedGraphQuality = assessKnowledgeGraphQuality(
      content.knowledgeGraph,
      content.knowledgePoints,
      content.teacherRequiredKnowledgePoints,
      {
        objectiveCount: course.learningObjectives?.length ?? 0,
        requireSemanticReview: true,
        minimumPrerequisites: 1,
      },
    );
    const reuseKnowledgeStructure = canResumeAfterValidatedStage({
      trace: job.trace,
      step: "knowledgePoints",
      qualityPassed: content.knowledgePoints.length >= 3 && savedGraphQuality.ok,
    });
    if (!reuseKnowledgeStructure) {
    await beginStep(job, "knowledgePoints", 1, 12, "正在建立课程目标与知识图谱");
    const generated = await generateReviewedKnowledgeStructure(
      stageSummaryInput(course, request),
      { teacherRequiredKnowledgePoints: content.teacherRequiredKnowledgePoints },
      { abortSignal: controller.signal, maxAttempts: MAX_AGENT_REVIEW_ROUNDS },
    );
    const knowledgeGraph = generated.knowledgeGraph ?? { nodes: [], edges: [] };
    const candidate = {
      ...content,
      knowledgePoints: generated.knowledgePoints,
      knowledgeGraph,
    };
    const graphQuality = assessKnowledgeGraphQuality(
      candidate.knowledgeGraph,
      candidate.knowledgePoints,
      content.teacherRequiredKnowledgePoints,
      {
        objectiveCount: course.learningObjectives?.length ?? 0,
        requireSemanticReview: true,
        minimumPrerequisites: 1,
      },
    );
    const issues = [
      candidate.knowledgePoints.length >= 3 ? "" : "本课知识点数量不足",
      ...graphQuality.issues,
    ].filter(Boolean);
    if (issues.length > 0) {
      throw new Error(`目标与知识图谱代理无法生成结构完整的数据：${issues.join("；")}`);
    }
    content = candidate;
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
    }
    await persistCanonicalContent(request.courseId, content, request, job);

    let projectQuality = evaluateProjectDesign(course);
    const reuseProjectDesign = canResumeAfterValidatedStage({
      trace: job.trace,
      step: "projectDesign",
      qualityPassed: projectQuality.passed,
    });
    if (!reuseProjectDesign) {
    await beginStep(job, "projectDesign", 2, 25, "正在把驱动问题转化为项目成果与过程证据");
    course = await generateProjectDesign(course, request, controller.signal);
    content = course.content;
    course = await saveGeneratedCourse(request.courseId, course);
    projectQuality = evaluateProjectDesign(course);
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
    }
    await persistCanonicalContent(request.courseId, content, request, job);

    const reuseEvaluationPlan = canResumeAfterValidatedStage({
      trace: job.trace,
      step: "evaluationPlan",
      qualityPassed: evaluateEvaluationPlan(content.evaluationPlan).passed,
    });
    if (!reuseEvaluationPlan) {
    await beginStep(job, "evaluationPlan", 3, 38, "正在设计 AI、教师与学生共同参与的评价方案");
    const evaluationOutputSchema = {
      dimensions: [{ id: "稳定 ID", name: "string", weight: 20, description: "string", responsibleRole: "ai|teacher" }],
      overallRubric: "string",
      flows: "保留现有 AI、教师和学生反思流程",
    };
    let evaluationPlan = content.evaluationPlan;
    try {
      const generatedEvaluation = await generateCourseContent({
        action: "evaluationPlan",
        input: stageSummaryInput(course, request),
        context: {
          knowledgePoints: content.knowledgePoints,
          knowledgeGraph: content.knowledgeGraph,
          pblOutline: JSON.stringify(course.pblConfig?.outcome ?? {}),
        },
      }, { signal: controller.signal });
      evaluationPlan = ensureEvaluationResponsibility(generatedEvaluation.content.evaluationPlan);
    } catch (error) {
      const issue = error instanceof Error ? error.message : "评价方案首稿结构不完整";
      evaluationPlan = await editCourseDesignStage({
        label: "成功标准",
        current: content.evaluationPlan,
        issues: [`首稿无法发布，必须依据完整课程上下文重新生成正式评价方案：${issue}`],
        fixedConstraints: {
          teacherBrief: request.teacherBrief,
          hours: course.hours,
          learningObjectives: course.learningObjectives,
          projectOutcome: course.pblConfig?.outcome,
          evidenceRequirements: course.pblConfig?.evidenceRequirements,
        },
        outputSchema: evaluationOutputSchema,
        abortSignal: controller.signal,
        maxAttempts: 5,
        parse: (value) => ensureEvaluationResponsibility(normalizeEvaluationPlanOutput(value)),
      });
    }
    for (let attempt = 0; attempt < MAX_AGENT_REVIEW_ROUNDS; attempt += 1) {
      const quality = evaluateEvaluationPlan(evaluationPlan);
      const audit = await auditStage("成功标准", {
        outcome: course.pblConfig?.outcome,
        evaluationPlan,
      }, quality, controller.signal);
      if (audit.passed || (attempt === MAX_AGENT_REVIEW_ROUNDS - 1 && quality.passed)) {
        content = { ...content, evaluationPlan };
        break;
      }
      if (attempt === MAX_AGENT_REVIEW_ROUNDS - 1) {
        throw new Error(`成功标准编辑 Agent 无法修复硬规则问题：${quality.issues.join("；") || audit.summary}`);
      }
      evaluationPlan = await editCourseDesignStage({
        label: "成功标准",
        current: evaluationPlan,
        issues: audit.issues.length ? audit.issues : [audit.summary],
        fixedConstraints: {
          teacherBrief: request.teacherBrief,
          hours: course.hours,
          learningObjectives: course.learningObjectives,
          projectOutcome: course.pblConfig?.outcome,
          evidenceRequirements: course.pblConfig?.evidenceRequirements,
        },
        outputSchema: evaluationOutputSchema,
        abortSignal: controller.signal,
        preserveValueOnMalformedEdit: evaluationPlan,
        parse: (value) => ensureEvaluationResponsibility(normalizeEvaluationPlanOutput(value, evaluationPlan)),
      });
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
    }
    await persistCanonicalContent(request.courseId, content, request, job);

    await beginStep(job, "teachingOutline", 4, 51, "正在编排六阶段任务、角色与课程时间");
    let teachingStructure: Awaited<ReturnType<typeof generateTeachingStructure>> | undefined;
    teachingStructure = await generateTeachingStructure(course, content, request, controller.signal);
    for (let attempt = 0; attempt < MAX_AGENT_REVIEW_ROUNDS; attempt += 1) {
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
      teachingStructure = await editCourseDesignStage({
        label: "六阶段架构",
        current: { teachingOutline: teachingStructure.teachingOutline },
        issues: teachingAudit.issues.length ? teachingAudit.issues : [teachingAudit.summary],
        fixedConstraints: {
          teacherBrief: request.teacherBrief,
          totalMinutes: teachingStructure.totalMinutes,
          drivingQuestion: course.drivingQuestion,
          learningObjectives: course.learningObjectives,
          projectOutcome: course.pblConfig?.outcome,
          evaluationPlan: content.evaluationPlan,
        },
        outputSchema: {
          teachingOutline: "完整六阶段数组；保留各阶段稳定 ID，并让 durationMin 合计等于总时长",
        },
        abortSignal: controller.signal,
        preserveValueOnMalformedEdit: teachingStructure,
        parse: (value) => normalizeEditedTeachingStructure(course, content, value),
      });
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
    const managedRecoveryRequest = createManagedRecoveryRequest(request, error);
    if (managedRecoveryRequest) {
      const recoveryCount = managedRecoveryRequest.managedRecoveryCount ?? 1;
      log.warn(
        `Managed course-design recovery ${recoveryCount} queued for ${request.courseId}`,
        error,
      );
      await prisma.courseDesignGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "queued",
          step: "managed_recovery",
          message: `质量审校发现可修复问题，托管生成 Agent 正在自动调整（第 ${recoveryCount} 次）`,
          request: managedRecoveryRequest as unknown as Prisma.InputJsonValue,
          error: null,
          estimatedRemainingSeconds: remainingSeconds(
            Math.max(0, Math.min(job.stepIndex, STEP_ESTIMATES.length - 1)),
            request.options,
          ),
          completedAt: null,
          lastHeartbeatAt: new Date(),
          version: { increment: 1 },
        },
      });
      scheduleManagedCourseDesignRetry(job.id);
      return;
    }
    log.error(`Course design failed for ${request.courseId}`, error);
    await prisma.courseDesignGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        step: "failed",
        message: "快速课程设计未完成",
        error: formatFatalCourseDesignError(error),
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
