"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  CircleAlert,
  Clock3,
  Image as ImageIcon,
  Lightbulb,
  Search,
  Video,
  Volume2,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ServerProvidersInit } from "@/components/openmaic/server-providers-init";
import { WizardStepper } from "@/components/wizard-stepper";
import { Button, Card, FlowActionBar, SaveStatus, toast } from "@/components/ui";
import { useSession, useCourse, useHydrated } from "@/lib/session/store";
import { cn } from "@/lib/utils";
import type {
  AdaptiveLearningPlan,
  LessonOutlineSection,
  TeacherResourceScene,
} from "@/lib/session/types";
import type { SceneOutline } from "@/lib/openmaic/types/generation";
import {
  buildFacilitationScaffold,
  normalizeFacilitationScaffolds,
} from "@/lib/teacher-resources/facilitation-scaffolds";
import {
  buildPblCourseRequirement,
  buildCourseTeachingConstraints,
  buildPblActivityCatalog,
  buildTeacherActivityRequirements,
} from "@/lib/openmaic/pbl/course-request";
import { checkPblStageCoverage } from "@/lib/openmaic/pbl/course-template";
import { isPblModuleTimingPlanConfirmed } from "@/lib/pbl-time-model";
import { requestCourseCoverImage } from "@/lib/course-cover";
import { PblModuleTimingPanel } from "@/components/teacher/pbl-module-timing-panel";
import { useSettingsStore } from "@/lib/openmaic/store/settings";
import { generateAdaptiveClassroom } from "@/lib/adaptive-learning-client";
import { buildAdaptiveResourceRequirement } from "@/lib/adaptive-learning";
import {
  adaptiveBranchGenerationSignature,
  selectAdaptiveBranchesForGeneration,
} from "@/lib/teacher/adaptive-resource-generation";
import {
  CourseGenerationStage,
  type CourseGenerationProgressStep,
} from "@/components/teacher/course-generation-stage";
import {
  estimateCourseGenerationSeconds,
  mapAdaptiveGenerationProgress,
  mapPrimaryGenerationProgress,
} from "@/lib/teacher/course-generation-progress";

const STEPS = [
  { key: "verify", label: "备课阶段" },
  { key: "generate", label: "生成课程" },
  { key: "preview", label: "预览发布" },
];

type GenStatus = "loading" | "success" | "error";

type GenResult = {
  id: string;
  scenesCount: number;
  studentSceneCount?: number;
  teacherSceneCount?: number;
  teacherClassroomId?: string;
  teacherResourceScenes?: TeacherResourceScene[];
  pblCoverage?: ReturnType<typeof checkPblStageCoverage>;
  qualityReport?: { ok: boolean; corrections: string[]; warnings: string[] };
  stage: { id: string; name: string };
};

type SseEvent =
  | { type: "progress"; step: string; progress: number; message: string }
  | {
      type: "done";
      id: string;
      scenesCount: number;
      studentSceneCount?: number;
      teacherSceneCount?: number;
      teacherClassroomId?: string;
      teacherResourceScenes?: TeacherResourceScene[];
      pblCoverage?: ReturnType<typeof checkPblStageCoverage>;
      qualityReport?: { ok: boolean; corrections: string[]; warnings: string[] };
      stage: { id: string; name: string };
    }
  | { type: "error"; error?: string; details?: string };

type BackgroundGenerationJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message: string;
  estimatedRemainingSeconds: number | null;
  events: CourseGenerationProgressStep[];
  result: GenResult | null;
  error: string | null;
  startedAt: string | null;
};

type BackgroundGenerationResponse = {
  backgroundEnabled: boolean;
  job: BackgroundGenerationJob | null;
};

const SCENE_OUTLINE_TYPES = new Set(["slide", "quiz", "interactive", "pbl"]);
function normalizeSceneOutline(outline: unknown, index: number): SceneOutline {
  const raw = outline && typeof outline === "object" ? outline as Record<string, unknown> : {};
  const type = typeof raw.type === "string" && SCENE_OUTLINE_TYPES.has(raw.type)
    ? raw.type
    : "slide";
  return {
    ...raw,
    id: typeof raw.id === "string" && raw.id ? raw.id : `scene-${index + 1}`,
    type: type as SceneOutline["type"],
    title: typeof raw.title === "string" && raw.title ? raw.title : `Scene ${index + 1}`,
    description:
      typeof raw.description === "string" && raw.description
        ? raw.description
        : typeof raw.title === "string"
          ? raw.title
          : `Scene ${index + 1}`,
    keyPoints: Array.isArray(raw.keyPoints)
      ? raw.keyPoints.filter((x): x is string => typeof x === "string")
      : [],
    estimatedDuration:
      typeof raw.estimatedDuration === "number" ? raw.estimatedDuration : 300,
    parentActivityId:
      typeof raw.parentActivityId === "string" && raw.parentActivityId.trim()
        ? raw.parentActivityId.trim()
        : undefined,
    detailKind:
      typeof raw.detailKind === "string"
        ? (raw.detailKind as SceneOutline["detailKind"])
        : undefined,
    knowledgePointIds: Array.isArray(raw.knowledgePointIds)
      ? raw.knowledgePointIds.filter(
          (x): x is string => typeof x === "string" && Boolean(x.trim()),
        )
      : [],
    resourceTypes: Array.isArray(raw.resourceTypes)
      ? raw.resourceTypes.filter(
          (x): x is NonNullable<SceneOutline["resourceTypes"]>[number] =>
            typeof x === "string" &&
            [
              "ppt",
              "interactive-demo",
              "code-interactive",
              "script",
              "worksheet",
              "rubric",
              "project-brief",
            ].includes(x),
        )
      : undefined,
    targetDurationSec:
      typeof raw.targetDurationSec === "number" && Number.isFinite(raw.targetDurationSec)
        ? Math.max(0, Math.round(raw.targetDurationSec))
        : undefined,
    segmentIndex:
      typeof raw.segmentIndex === "number" && Number.isFinite(raw.segmentIndex)
        ? Math.max(1, Math.round(raw.segmentIndex))
        : undefined,
    segmentCount:
      typeof raw.segmentCount === "number" && Number.isFinite(raw.segmentCount)
        ? Math.max(1, Math.round(raw.segmentCount))
        : undefined,
    segmentRole:
      typeof raw.segmentRole === "string" && raw.segmentRole.trim()
        ? raw.segmentRole.trim()
        : undefined,
    segmentGroupId:
      typeof raw.segmentGroupId === "string" && raw.segmentGroupId.trim()
        ? raw.segmentGroupId.trim()
        : undefined,
    ttsPolicy:
      raw.ttsPolicy === "none" || raw.ttsPolicy === "target-duration"
        ? raw.ttsPolicy
        : undefined,
    order: index,
  } as SceneOutline;
}

function GenerationCoverage({
  coverage,
}: {
  coverage: ReturnType<typeof checkPblStageCoverage>;
}) {
  const labels: Record<string, string> = {
    launch: "项目启动",
    "ai-learning": "AI 授知",
    proposal: "方案构思",
    make: "项目实践",
    showcase: "成果汇报",
    reflection: "学习反思",
  };
  return (
    <section className="mb-6 rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--pbl-ai)]">生成前覆盖检查</p><p className="mt-1 text-sm text-[var(--pbl-text-muted)]">检查六阶段是否都有支撑，不要求每阶段都生成固定课堂资源。</p></div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${coverage.ok ? "bg-[var(--pbl-success-soft)] text-[var(--pbl-success)]" : "bg-[var(--pbl-warning-soft)] text-[var(--pbl-warning)]"}`}>{coverage.ok ? "可直接生成" : "生成后请复核"}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Object.values(coverage.entries).map((entry) => <div className="flex items-center justify-between rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white px-3 py-2 text-xs" key={entry.stageKey}><span className="font-semibold">{labels[entry.stageKey] ?? entry.stageKey}</span><span className={entry.total ? "text-[var(--pbl-ai)]" : "text-[var(--pbl-danger)]"}>{entry.total ? `${entry.total} 场` : "缺少"}</span></div>)}
      </div>
      {coverage.missingStageKeys.length ? <p className="mt-3 text-xs leading-5 text-stone-500">未生成场景的阶段（不一定需要教师资源）：{coverage.missingStageKeys.map((key) => labels[key] ?? key).join("、")}。</p> : null}
      {!coverage.ok ? <p className="mt-3 text-xs leading-5 text-[var(--pbl-warning)]">{coverage.missingStageKeys.length ? `缺少阶段：${coverage.missingStageKeys.map((key) => labels[key] ?? key).join("、")}。` : ""}{coverage.missingTeacherResourceStageKeys.length ? `普通课堂活动支撑：${coverage.missingTeacherResourceStageKeys.map((key) => labels[key] ?? key).join("、")}。` : ""}{coverage.missingStudentLearningStageKeys.length ? " AI 授知需要至少一个学生学习场景。" : ""}{coverage.routingViolations.length ? ` 分流冲突：${coverage.routingViolations.join("；")}。` : ""}</p> : null}
      {coverage.metadataWarnings.length ? <p className="mt-2 text-xs leading-5 text-stone-500">元数据提醒：{coverage.metadataWarnings.join("；")}。</p> : null}
    </section>
  );
}

function lessonSectionToSceneOutline(
  section: LessonOutlineSection,
  index: number,
): SceneOutline {
  return {
    id: section.id,
    type: "slide",
    title: section.title,
    description: section.activities.join("; ") || section.title,
    keyPoints: section.objectives,
    estimatedDuration: section.durationMin * 60,
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
    order: index,
  };
}

export default function GenerateCoursePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoStartRef = useRef(searchParams.get("autostart") === "1");
  const session = useSession();
  const { user, updateCourse } = session;
  const course = useCourse(params?.id);
  const hydrated = useHydrated();
  const ttsProviderId = useSettingsStore((state) => state.ttsProviderId);
  const ttsSpeed = useSettingsStore((state) => state.ttsSpeed);
  const ttsVoice = useSettingsStore((state) => state.ttsVoice);
  const ttsProvidersConfig = useSettingsStore((state) => state.ttsProvidersConfig);
  const ttsModelId = ttsProvidersConfig[ttsProviderId]?.modelId;
  const ttsVoiceId = ttsProvidersConfig[ttsProviderId]?.defaultVoice || ttsVoice;

  const [status, setStatus] = useState<GenStatus>("loading");
  const [result, setResult] = useState<GenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<CourseGenerationProgressStep[]>([]);
  const [generationRun, setGenerationRun] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [backgroundEnabled, setBackgroundEnabled] = useState<boolean | null>(null);
  const [backgroundRemainingSeconds, setBackgroundRemainingSeconds] = useState<number | null>(null);
  const startedRef = useRef(false);
  // 生成选项开关（Phase 2.6-2.8：media/TTS/WebSearch 阶段）
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [enableImageGeneration, setEnableImageGeneration] = useState(true);
  const [enableVideoGeneration, setEnableVideoGeneration] = useState(false);
  const [enableTTS, setEnableTTS] = useState(true);
  // 是否已点击"开始生成"按钮（控制配置面板与生成状态的切换）
  const [started, setStarted] = useState(false);
  const coverGenerationCourseRef = useRef<string | null>(null);
  const pblCoverage = checkPblStageCoverage(course ? buildConfirmedSceneOutlines() : []);
  const adaptiveBranchCount =
    course?.content.adaptiveLearningPlan?.enabled &&
    course.content.adaptiveLearningPlan.status === "teacher-confirmed" &&
    course.content.adaptiveLearningPlan.prerequisiteSemanticReview?.status === "passed"
      ? course.content.adaptiveLearningPlan.branches.filter(
          (branch) => branch.enabled !== false && branch.status === "teacher-confirmed",
        ).length
      : 0;
  const estimatedTotalSeconds = estimateCourseGenerationSeconds({
    sceneCount: buildConfirmedSceneOutlines().length,
    adaptiveBranchCount,
    enableWebSearch,
    enableImageGeneration,
    enableVideoGeneration,
    enableTTS,
  });
  const applyBackgroundJob = useCallback((job: BackgroundGenerationJob) => {
    startedRef.current = true;
    setStarted(true);
    setSteps(Array.isArray(job.events) ? job.events : []);
    setBackgroundRemainingSeconds(job.estimatedRemainingSeconds);
    if (job.startedAt) {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - new Date(job.startedAt).getTime()) / 1_000)));
    }
    if (job.status === "completed" && job.result) {
      setResult(job.result);
      setStatus("success");
      router.replace(`/teacher/prepare/${course?.id}/preview?classroomId=${job.result.id}`);
    } else if (job.status === "failed") {
      setStatus("error");
      setError(job.error || "课程生成未完成，请重新尝试。");
    } else {
      setStatus("loading");
      setError(null);
    }
  }, [course?.id, router]);
  useEffect(() => {
    if (!started || status !== "loading") return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [started, status]);

  useEffect(() => {
    if (!hydrated || !course?.id) return;
    let cancelled = false;
    const syncJob = async () => {
      try {
        const response = await fetch(`/api/courses/${course.id}/generation`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as BackgroundGenerationResponse;
        if (cancelled) return;
        setBackgroundEnabled(payload.backgroundEnabled);
        if (!payload.job) return;
        // A queued request-bound job may have been prepared by quick design.
        // The quick canvas starts it explicitly; the detailed generator keeps
        // showing its normal controls until the teacher starts this mode.
        if (!payload.backgroundEnabled && payload.job.status === "queued") return;
        applyBackgroundJob(payload.job);
      } catch {
        if (!cancelled) setBackgroundEnabled(false);
      }
    };
    void syncJob();
    return () => { cancelled = true; };
  }, [applyBackgroundJob, hydrated, course?.id]);

  useEffect(() => {
    if (!backgroundEnabled || !started || status !== "loading" || !course?.id) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/courses/${course.id}/generation`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const payload = await response.json() as BackgroundGenerationResponse;
        if (!cancelled && payload.job) applyBackgroundJob(payload.job);
      } catch {
        // A temporary network interruption must not change the durable job.
      }
    };
    const timer = window.setInterval(() => void poll(), 2_000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applyBackgroundJob, backgroundEnabled, started, status, course?.id]);
  function buildRequirement(): string {
    return course
      ? buildPblCourseRequirement(course, course.content, buildConfirmedSceneOutlines())
      : "";
  }

  function buildConfirmedSceneOutlines(): SceneOutline[] {
    if (!course) return [];
    if (course.content._openmaicSceneOutlines?.length) {
      return course.content._openmaicSceneOutlines.map((outline, index) =>
        normalizeSceneOutline(outline, index),
      );
    }
    return (course.content.lessonOutline ?? []).map((section, index) =>
      lessonSectionToSceneOutline(section, index),
    );
  }

  function buildGenerationRequest() {
    if (!course) return null;
    return {
      requirement: buildRequirement(),
      pblProfile: course.pblConfig,
      moduleTimingPlan: course.content.moduleTimingPlan,
      pblTeachingActivities: buildTeacherActivityRequirements(course.content),
      pblActivityCatalog: buildPblActivityCatalog(course.content),
      knowledgePoints: course.content.knowledgePoints,
      teachingConstraints: buildCourseTeachingConstraints(course, course.content),
      courseId: course.id,
      courseTitle: course.name,
      sceneOutlines: buildConfirmedSceneOutlines(),
      adaptiveBranchCount,
      enableWebSearch,
      enableImageGeneration,
      enableVideoGeneration,
      enableTTS,
      ttsProviderId,
      ttsModelId,
      ttsVoice: ttsVoiceId,
      ttsSpeed,
      ttsLanguage: "zh-CN",
      agentMode: "default",
    };
  }

  async function prepareAdaptiveBranches(): Promise<AdaptiveLearningPlan | undefined> {
    const plan = course?.content.adaptiveLearningPlan;
    if (!course || !plan?.enabled || plan.status !== "teacher-confirmed") return plan;
    if (plan.prerequisiteSemanticReview?.status !== "passed") {
      setSteps((previous) => [
        ...previous,
        {
          step: "跳过未审校个性化路径",
          progress: 98,
          message: "先修边界尚未通过独立语义审校；本次保留完整主课，不生成或插入旧的前测与补学资源。",
          ts: Date.now(),
        },
      ]);
      return plan;
    }
    const activeCourse = course;
    const confirmedBranches = plan.branches.filter(
      (branch) => branch.enabled !== false && branch.status === "teacher-confirmed",
    );
    const branches = selectAdaptiveBranchesForGeneration(confirmedBranches);
    if (!branches.length) {
      if (confirmedBranches.length > 0) {
        setSteps((previous) => [
          ...previous,
          {
            step: "自适应资源已就绪",
            progress: 98,
            message: `已复用 ${confirmedBranches.length} 个完成生成的自适应分支，无需重复处理。`,
            ts: Date.now(),
          },
        ]);
      }
      return plan;
    }
    const reusedCount = confirmedBranches.length - branches.length;

    setSteps((previous) => [
      ...previous,
      {
        step: "自适应分支资源",
        progress: 86,
        message: reusedCount > 0
          ? `复用 ${reusedCount} 个已就绪分支，仅生成 ${branches.length} 个缺失或失效分支`
          : `开始生成 ${branches.length} 个教师已确认分支，最多同时处理 2 个`,
        ts: Date.now(),
      },
    ]);

    const resources = new Map<string, NonNullable<typeof branches[number]["preparedResource"]>>();
    const branchProgress = new Map(branches.map((branch) => [branch.id, 0]));
    const reportAdaptiveProgress = (
      branchId: string,
      progress: number,
      step: string,
      message: string,
    ) => {
      branchProgress.set(
        branchId,
        Math.max(
          branchProgress.get(branchId) ?? 0,
          Math.max(0, Math.min(100, progress)),
        ),
      );
      setSteps((previous) => [
        ...previous,
        {
          step,
          progress: mapAdaptiveGenerationProgress(branchProgress.values()),
          message,
          ts: Date.now(),
        },
      ]);
    };
    let cursor = 0;
    async function worker() {
      while (cursor < branches.length) {
        const branch = branches[cursor++];
        try {
          const generated = await generateAdaptiveClassroom({
            title: `${activeCourse.name} · ${branch.title}`,
            requirement: buildAdaptiveResourceRequirement(activeCourse.name, branch, plan),
            stageKey: "ai-learning",
            requestRole: "teacher",
            scenes: [{
              title: branch.title,
              description: branch.objective,
              keyPoints: branch.keyPoints,
              type: branch.sceneType,
              targetDurationSec: branch.targetDurationSec,
              knowledgePointIds: branch.anchorKnowledgePointIds,
            }],
            onProgress: ({ progress, message }) => {
              reportAdaptiveProgress(
                branch.id,
                progress,
                branch.kind === "prerequisite"
                  ? "生成先决知识资源"
                  : "生成额外学习资源",
                `${branch.title}：${message}`,
              );
            },
          });
          reportAdaptiveProgress(
            branch.id,
            100,
            "自适应资源已完成",
            `${branch.title} 已生成并接入主课程播放流程。`,
          );
          resources.set(branch.id, {
            status: "ready",
            classroomId: generated.classroomId,
            scenesCount: generated.scenesCount,
            generatedAt: new Date().toISOString(),
            sourceSignature: adaptiveBranchGenerationSignature(branch),
          });
        } catch (cause) {
          const error = cause instanceof Error ? cause.message : "分支生成失败";
          reportAdaptiveProgress(
            branch.id,
            100,
            "自适应资源生成失败",
            `${branch.title}：${error}`,
          );
          resources.set(branch.id, {
            status: "failed",
            generatedAt: new Date().toISOString(),
            error,
          });
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(2, branches.length) }, () => worker()),
    );
    return {
      ...plan,
      updatedAt: new Date().toISOString(),
      branches: plan.branches.map((branch) => ({
        ...branch,
        preparedResource: resources.get(branch.id) ?? branch.preparedResource,
      })),
    };
  }

  async function startGeneration() {
    if (!course) return;
    if (!isPblModuleTimingPlanConfirmed(course.content.moduleTimingPlan)) {
      setStatus("error");
      setError("请返回备课阶段页，先确认六个模块的时间分配。");
      return;
    }
    setStatus("loading");
    setElapsedSeconds(0);
    setGenerationRun((current) => current + 1);
    setResult(null);
    setError(null);
    setSteps([]);

    // Cover generation is part of the course-generation workflow. It runs in
    // parallel with scene generation and is best-effort, so a provider outage
    // never prevents the classroom itself from being created.
    if (enableImageGeneration && !course.coverImageUrl && coverGenerationCourseRef.current !== course.id) {
      coverGenerationCourseRef.current = course.id;
      void requestCourseCoverImage(course)
        .then((coverImageUrl) => {
          if (coverImageUrl) updateCourse(course.id, { coverImageUrl });
        })
        .catch((coverError) => {
          console.warn("Automatic course cover generation failed:", coverError);
        });
    }

    try {
      const sceneOutlines = buildConfirmedSceneOutlines();
      const generationRequest = buildGenerationRequest();
      if (!generationRequest) throw new Error("未找到课程生成配置");

      if (backgroundEnabled !== false) {
        const backgroundResponse = await fetch(`/api/courses/${course.id}/generation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(generationRequest),
        });
        if (backgroundResponse.ok) {
          const payload = await backgroundResponse.json() as BackgroundGenerationResponse;
          setBackgroundEnabled(payload.backgroundEnabled);
          if (payload.backgroundEnabled && payload.job) {
            applyBackgroundJob(payload.job);
            return;
          }
        }
      }

      const res = await fetch("/api/openmaic/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generationRequest),
      });

      // 参数验证失败等：HTTP 4xx + JSON 错误响应
      if (!res.ok) {
        let errBody: { error?: string; details?: string } = {};
        try {
          errBody = await res.json();
        } catch {
          // 非 JSON 错误体
        }
        throw new Error(
          errBody.error || errBody.details || `生成失败（HTTP ${res.status}）`,
        );
      }

      if (!res.body) {
        throw new Error("未收到生成流");
      }

      // 流式消费 SSE：按双换行拆分帧，每帧解析 data: 行
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneEvent: GenResult | null = null;
      let errorEvent: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const trimmed = frame.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;
          let evt: SseEvent | null = null;
          try {
            evt = JSON.parse(jsonStr) as SseEvent;
          } catch {
            // 单帧 JSON 解析失败不阻断整体流
            continue;
          }
          if (evt.type === "progress") {
            setSteps((prev) => [
              ...prev,
              {
                step: evt.step,
                progress: mapPrimaryGenerationProgress(evt.progress),
                message: evt.message,
                ts: Date.now(),
              },
            ]);
          } else if (evt.type === "done") {
            doneEvent = {
              id: evt.id,
              scenesCount: evt.scenesCount,
              studentSceneCount: evt.studentSceneCount,
              teacherSceneCount: evt.teacherSceneCount,
              teacherClassroomId: evt.teacherClassroomId,
              teacherResourceScenes: evt.teacherResourceScenes,
              pblCoverage: evt.pblCoverage,
              qualityReport: evt.qualityReport,
              stage: evt.stage,
            };
          } else if (evt.type === "error") {
            errorEvent = evt.details || evt.error || "生成失败";
          }
        }
      }

      if (errorEvent) throw new Error(errorEvent);
      if (!doneEvent) throw new Error("未收到生成完成事件");

      setResult(doneEvent);

      // 生成后分流：将引入+PBL场景拆分为教师授课资源，学生课堂仅保留知识点教学场景
      try {
        setSteps((prev) => [
          ...prev,
          {
            step: "内容分流",
            progress: 84,
            message: "正在拆分学生课堂与教师授课资源...",
            ts: Date.now(),
          },
        ]);
        const splitResult = {
          teacherClassroomId: doneEvent.teacherClassroomId ?? "",
          teacherResourceScenes: doneEvent.teacherResourceScenes ?? [],
          studentSceneCount: doneEvent.studentSceneCount ?? doneEvent.scenesCount,
          teacherSceneCount: doneEvent.teacherSceneCount ?? 0,
          pblCoverage: doneEvent.pblCoverage ?? checkPblStageCoverage(sceneOutlines),
        };
        if (course) {
          const adaptiveLearningPlan = await prepareAdaptiveBranches();
          updateCourse(course.id, {
            aiLearningClassroomId: doneEvent.id,
            teacherClassroomId: splitResult.teacherClassroomId,
            dynamicFacilitationScaffolds: normalizeFacilitationScaffolds(
              splitResult.teacherResourceScenes
                .filter((resource) => resource.generationMode === "dynamic-scaffold" && resource.scaffoldKind)
                .map((resource) => buildFacilitationScaffold({
                  courseId: course.id,
                  stageKey: resource.stageKey ?? "showcase",
                  title: resource.title,
                  kind: resource.scaffoldKind!,
                })),
            ),
            content: {
              ...course.content,
              _openmaicClassroomId: doneEvent.id,
              _openmaicScenesCount: splitResult.studentSceneCount,
              teacherClassroomId: splitResult.teacherClassroomId,
              teacherResources: {
                generatedAt: new Date().toISOString(),
                scenes: splitResult.teacherResourceScenes,
              },
              adaptiveLearningPlan,
            },
          });
          setSteps((prev) => [
            ...prev,
            {
              step: "内容分流完成",
              progress: 86,
              message: `学生 ${splitResult.studentSceneCount} 场 · 普通课堂活动 ${splitResult.teacherSceneCount} 场`,
              ts: Date.now(),
            },
            {
              step: "PBL 阶段覆盖检查",
              progress: 99,
              message: splitResult.pblCoverage.ok
                ? "六阶段覆盖与学生/教师分流符合课程契约"
                : `需要教师复核：${[
                    ...splitResult.pblCoverage.missingStageKeys,
                    ...splitResult.pblCoverage.missingStudentLearningStageKeys,
                    ...splitResult.pblCoverage.missingTeacherResourceStageKeys,
                    ...splitResult.pblCoverage.routingViolations,
                  ].join("、")}`,
              ts: Date.now(),
            },
          ]);
        }
      } catch (splitErr) {
        const splitMessage = splitErr instanceof Error ? splitErr.message : "未知错误";
        setSteps((prev) => [
          ...prev,
          {
            step: "内容分流",
            progress: 86,
            message: `分流失败：${splitMessage}`,
            ts: Date.now(),
          },
        ]);
        throw new Error(`内容分流失败：${splitMessage}`);
      }

      setSteps((previous) => [
        ...previous,
        {
          step: "课程生成完成",
          progress: 100,
          message: "课程内容、自适应资源与教师支架已保存，可以进入预览。",
          ts: Date.now(),
        },
      ]);
      setStatus("success");

    } catch (err) {
      const message = err instanceof Error ? err.message : "生成失败";
      setError(message);
      setStatus("error");
      toast.error("课程内容生成失败", { description: message });
    }
  }

  // 用户点击"开始生成"按钮触发（替代自动触发，让教师可控媒体/TTS/WebSearch 开关）
  function beginGeneration() {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    void startGeneration();
  }

  useEffect(() => {
    if (!autoStartRef.current || !hydrated || !course || backgroundEnabled === null) return;
    autoStartRef.current = false;
    beginGeneration();
    // The auto-start request is consumed once. beginGeneration intentionally
    // remains outside the dependency list so media-option changes cannot
    // trigger a second generation run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundEnabled, course, hydrated]);

  if (!hydrated) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-stone-500">加载中…</div>
      </DashboardShell>
    );
  }

  if (!course) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-stone-500">
          未找到课程。
          <Link className="mt-4 text-blue-700 hover:underline" href="/teacher">
            返回课程列表
          </Link>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      role="teacher"
      userName={user.name}
      variant="bare"
      currentCourse={{ id: course.id, name: course.name, status: course.status }}
      headerSlot={
        <div className="ml-4">
          <WizardStepper current={1} steps={STEPS} />
        </div>
      }
    >
      <ServerProvidersInit />
      <div className="relative mb-6 overflow-hidden rounded-[16px] border border-stone-200 bg-[radial-gradient(circle_at_92%_0%,rgba(254,215,170,0.38),transparent_32%),linear-gradient(120deg,#fff_0%,#fffdf8_100%)] px-4 py-4 shadow-[0_10px_32px_rgba(87,74,58,0.06)] sm:px-5">
        <div aria-hidden className="absolute bottom-0 left-16 right-0 h-px bg-gradient-to-r from-transparent via-amber-200 to-transparent" />
        <div className="flex items-center gap-3">
        <Link
          aria-label="返回备课阶段"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:-translate-x-0.5 hover:border-[var(--pbl-teacher)] hover:text-[var(--pbl-teacher)] motion-reduce:transform-none"
          href={`/teacher/prepare/${course.id}/verify`}
        >
          <ArrowLeft size={17} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pbl-accent)]">
            <BookOpenCheck size={14} />
            课程生成 · 第 2 步
          </div>
          <h1 className="mt-1 font-editorial text-[26px] font-semibold tracking-[-0.02em] text-stone-950 sm:text-[30px]">
            {!started
              ? "课程生成设置"
              : status === "success"
                ? "课程生成完成"
                : status === "error"
                  ? "课程生成需要您的处理"
                  : "课程生成中"}
          </h1>
          <p className="mt-1 truncate text-sm text-stone-500">
            {course.name} · {!started
              ? "确认资源选项后即可开始生成"
              : status === "success"
                ? "可以进入预览并做发布前检查"
                : status === "error"
                  ? "请根据下方提示处理后重新生成"
                  : "正在生成并保存课程内容"}
          </p>
        </div>
        <span className="hidden rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-stone-500 shadow-sm sm:block">
          {!started
            ? "生成前确认"
            : status === "success"
              ? "生成完成"
              : status === "error"
                ? "需要处理"
                : <span className="inline-flex items-center gap-1.5 tabular-nums"><Clock3 size={13} />已用时 {formatGenerationDuration(elapsedSeconds)}</span>}
        </span>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {!started ? (
          <Card>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-editorial text-2xl font-semibold">将生成的课程内容</h2>
            </div>
            <GenerationCoverage coverage={pblCoverage} />

            <dl className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
              ["课程大纲资源", `${buildConfirmedSceneOutlines().length || course.content.lessonOutline.length} 个`],
              ["互动活动", "按教学活动配置"], ["知识检查", "覆盖学习目标"],
              ["普通课堂活动", `${course.content.teachingOutline?.filter((item) => item.stageKey !== "ai-learning").length ?? 0} 组`],
              ["学生内容", "AI 授知与项目支架"], ["评价内容", "四类评价与证据要求"],
            ].map(([label, value]) => <div className="border-t border-[var(--pbl-border)] pt-3" key={label}><dt className="text-xs text-[var(--pbl-text-muted)]">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}</dl>

            <details className="group rounded-[12px] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)]/45 p-4" open>
              <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span>生成设置 <span className="font-normal text-[var(--pbl-text-muted)]">· 开始前可随时调整</span></span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[var(--pbl-ai)] shadow-sm">默认开启配图与语音</span>
                </span>
              </summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                { key: "web", label: "Web 搜索", description: "联网补充资料与出处，需配置搜索服务。", Icon: Search, checked: enableWebSearch, setChecked: setEnableWebSearch },
                { key: "image", label: "图像生成", description: "为适合视觉表达的课件场景生成配图。", Icon: ImageIcon, checked: enableImageGeneration, setChecked: setEnableImageGeneration },
                { key: "video", label: "视频生成", description: "生成视频素材，耗时与资源消耗更高。", Icon: Video, checked: enableVideoGeneration, setChecked: setEnableVideoGeneration },
                { key: "tts", label: "学生 AI 授知 TTS", description: "为学生 AI 授知场景生成同步语音。", Icon: Volume2, checked: enableTTS, setChecked: setEnableTTS },
              ].map(({ key, label, description, Icon, checked, setChecked }) => (
                <label className={cn("relative flex cursor-pointer items-start gap-3 rounded-[10px] border bg-white p-4 transition", checked ? "border-[var(--pbl-ai)] shadow-sm" : "border-stone-200 hover:border-stone-300")} key={key}>
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[8px]", checked ? "bg-[var(--pbl-ai-soft)] text-[var(--pbl-ai)]" : "bg-stone-100 text-stone-400")}><Icon size={17} /></span>
                  <span className="min-w-0 flex-1 pr-9"><span className="block text-sm font-bold text-stone-800">{label}</span><span className="mt-1 block text-xs leading-5 text-stone-500">{description}</span></span>
                  <input className="peer sr-only" checked={checked} onChange={(event) => setChecked(event.target.checked)} type="checkbox" />
                  <span aria-hidden className={cn("absolute right-4 top-4 h-6 w-11 rounded-full transition", checked ? "bg-[var(--pbl-ai)]" : "bg-stone-200")}><span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", checked ? "left-[22px]" : "left-0.5")} /></span>
                </label>
              ))}

              <div className="rounded-[8px] border border-[var(--pbl-ai)]/25 bg-[var(--pbl-ai-soft)]/20 px-4 py-3 md:col-span-2">
                <div className="text-sm font-bold text-stone-800">深度互动教学</div>
                <div className="mt-1 text-xs leading-5 text-stone-500">
                  课堂会先完成基础讲解，再安排非评分互动巩固，并以一次主课达标测形成按知识点记录的学习证据。
                </div>
              </div>
            </div>
            </details>

          </Card>
        ) : (
          <CourseGenerationStage
            adaptiveBranchCount={adaptiveBranchCount}
            elapsedSeconds={elapsedSeconds}
            error={error}
            estimatedRemainingSeconds={backgroundRemainingSeconds}
            estimatedTotalSeconds={estimatedTotalSeconds}
            key={generationRun}
            result={result}
            status={status}
            steps={steps}
          />
        )}

        <aside className="space-y-5">
          {course.content.moduleTimingPlan ? (
            <PblModuleTimingPanel
              compact
              moduleActivities={course.content.teachingOutline ?? []}
              totalMinutes={Math.max(0, Math.round(course.hours * 60))}
              timingPlan={course.content.moduleTimingPlan}
              readOnly
            />
          ) : null}
          <Card>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Lightbulb className="text-blue-600" size={18} /> 课程大纲生成
            </h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              系统会以六个课程模块为父级，生成课程大纲中的 PPT、讲稿、互动和课堂支架，并按资源归属分流到学生或教师侧。
            </p>
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <CircleAlert className="text-[var(--pbl-warning)]" size={18} /> 提示
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--pbl-text-muted)]">
              {started && status === "loading"
                ? backgroundEnabled
                  ? "您可以先返回其他页面处理工作，课程将在后台继续生成；完成后再次进入将自动打开课程预览。"
                  : "课程生成期间请勿离开或关闭此页面。系统会根据实际生成速度动态估算剩余时间。"
                : "开始后，系统会根据本次任务的实际生成速度动态估算剩余时间。"}
            </p>
          </Card>
        </aside>
      </div>
      <FlowActionBar
        persistent
        back={(
          <Link
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--pbl-text-muted)]"
            href={`/teacher/prepare/${course.id}/verify`}
          >
            上一步
          </Link>
        )}
        saveStatus={(
          <SaveStatus
            lastSavedAt={session.lastSavedAt}
            onRetry={() => void session.retrySave()}
            state={session.saveState}
          />
        )}
      >
        {status === "success" && result ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] px-4 text-sm font-semibold text-white"
            href={`/teacher/prepare/${course.id}/preview?classroomId=${result.id}`}
          >
            进入预览与发布
          </Link>
        ) : (
          <Button
            disabled={started && status === "loading"}
            loading={started && status === "loading"}
            onClick={started ? () => void startGeneration() : beginGeneration}
          >
            {!started
              ? "生成课程内容"
              : status === "error"
                ? "重新生成课程"
                : "课程生成中"}
          </Button>
        )}
      </FlowActionBar>
    </DashboardShell>
  );
}

function formatGenerationDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
