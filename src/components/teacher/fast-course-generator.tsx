"use client";

import {
  Image as ImageIcon,
  Mic2,
  Send,
  Settings2,
  Video,
  Volume2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OpenPblLogo } from "@/components/brand/open-pbl-logo";
import { CourseGenerationGlyph } from "@/components/course-workshop-animation";
import { QuickOutlineReviewDialog } from "@/components/teacher/quick-outline-review-dialog";
import { QuickGenerationStage } from "@/components/teacher/quick-generation-stage";
import {
  buildQuickClassroomArtifacts,
  combineQuickGenerationProgress,
  resolveQuickClassroomActiveArtifactId,
  type QuickClassroomGenerationSnapshot,
} from "@/lib/course-generation/quick-artifacts";
import { resolveLatestCompletedArtifactId } from "@/lib/course-design/active-artifact";
import { readJsonResponse } from "@/lib/http/read-json-response";
import type { Course, CourseDesignGenerationArtifact, CourseDesignGenerationTraceEntry } from "@/lib/session/types";
import type { SceneOutline } from "@/lib/openmaic/types/generation";
import { cn } from "@/lib/utils";

type JobStatus = "queued" | "running" | "review_available" | "paused" | "cancelling" | "cancelled" | "completed" | "failed";

type DesignJob = {
  id: string;
  status: JobStatus;
  step: string;
  reviewStatus: "unavailable" | "available" | "paused" | "approved" | "auto-continued";
  reviewAvailableUntil?: string | null;
  stepIndex: number;
  progress: number;
  message: string;
  estimatedRemainingSeconds: number | null;
  trace: Array<CourseDesignGenerationTraceEntry & { progress?: number; stepIndex?: number }>;
  qualityReport?: { score?: number; summary?: string; checks?: string[] } | null;
  error?: string | null;
  startedAt?: string | null;
  requestPreview?: {
    teacherBrief?: string;
    options?: GenerationOptions | null;
  };
};

type ResponsePayload = {
  backgroundEnabled: boolean;
  job: DesignJob | null;
  outlinePreview?: SceneOutline[];
  error?: string;
  detail?: string;
};

type ClassroomGenerationResponse = {
  backgroundEnabled: boolean;
  job: (QuickClassroomGenerationSnapshot & {
    id: string;
    estimatedRemainingSeconds: number | null;
    error?: string | null;
    startedAt?: string | null;
  }) | null;
  error?: string;
};

type GenerationOptions = {
  enableImageGeneration: boolean;
  enableTTS: boolean;
  enableVideoGeneration: boolean;
};

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "正在完成最后检查";
  return `预计还需约 ${Math.max(1, Math.ceil(seconds / 60))} 分钟`;
}

export function FastCourseGenerator({
  course,
  onOpenDetailed,
}: {
  course: Course;
  onOpenDetailed: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [job, setJob] = useState<DesignJob | null>(null);
  const [classroomJob, setClassroomJob] = useState<ClassroomGenerationResponse["job"]>(null);
  const [backgroundEnabled, setBackgroundEnabled] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [classroomRetrying, setClassroomRetrying] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [outlinePreview, setOutlinePreview] = useState<SceneOutline[]>([]);
  const [outlineReviewOpen, setOutlineReviewOpen] = useState(false);
  const autoOpenedClassroomId = useRef<string | null>(null);
  const [options, setOptions] = useState<GenerationOptions>({
    enableImageGeneration: true,
    enableTTS: true,
    enableVideoGeneration: false,
  });
  const running = job?.status === "queued"
    || job?.status === "running"
    || job?.status === "review_available"
    || job?.status === "paused"
    || job?.status === "cancelling";

  const applyPayload = useCallback((payload: ResponsePayload) => {
    setBackgroundEnabled(payload.backgroundEnabled);
    setJob(payload.job);
    const savedBrief = payload.job?.requestPreview?.teacherBrief;
    if (savedBrief) setBrief(savedBrief);
    const savedOptions = payload.job?.requestPreview?.options;
    if (savedOptions) {
      setOptions({
        enableImageGeneration: savedOptions.enableImageGeneration !== false,
        enableTTS: savedOptions.enableTTS !== false,
        enableVideoGeneration: savedOptions.enableVideoGeneration === true,
      });
    }
    if (payload.outlinePreview?.length) setOutlinePreview(payload.outlinePreview);
    if (payload.job?.status === "failed") {
      setError(`${payload.job.error || "快速生成遇到系统或网络错误，请稍后重试。"} 教师要求和已完成内容均已保存，可直接重试或修改要求后继续。`);
    } else if (payload.job && ["queued", "running", "review_available", "paused", "completed"].includes(payload.job.status)) {
      // Correctable quality issues remain inside the managed Agent loop. Clear
      // stale transport errors as soon as the durable task resumes.
      setError(undefined);
    }
    if (payload.job?.status === "cancelled") setError("本次快速生成已中断，可以修改要求后重新开始。");
  }, []);

  const fetchJob = useCallback(async () => {
    const response = await fetch(`/api/courses/${course.id}/design-generation`, { cache: "no-store" });
    const payload = await readJsonResponse<ResponsePayload>(response, "快速生成服务没有返回内容，请刷新页面后重试。");
    if (!response.ok) throw new Error(payload.detail || payload.error || "无法读取快速生成状态");
    applyPayload(payload);
    return payload;
  }, [applyPayload, course.id]);

  const fetchClassroomJob = useCallback(async (startPersistedJob = false) => {
    const response = await fetch(`/api/courses/${course.id}/generation`, startPersistedJob
      ? {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start-persisted-job" }),
        }
      : { cache: "no-store" });
    const payload = await readJsonResponse<ClassroomGenerationResponse>(response, "无法读取最终课程生成进度，请稍后重试。");
    if (!response.ok) throw new Error(payload.error || "无法读取最终课程生成进度");
    setBackgroundEnabled(payload.backgroundEnabled);
    setClassroomJob(payload.job);
    if (payload.job?.status === "failed") setError(payload.job.error || "最终课程内容生成未完成，请重试。");
    else if (payload.job?.status === "cancelled") setError("本次最终课程内容生成已中断，可以返回后重新生成。");
    else if (payload.job) setError(undefined);
    return payload;
  }, [course.id]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchJob().catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "无法读取快速生成状态");
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fetchJob]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void fetchJob().catch(() => undefined), 2_000);
    return () => window.clearInterval(timer);
  }, [fetchJob, running]);

  useEffect(() => {
    if (job?.status !== "completed") return;
    let cancelled = false;
    const continueGeneration = async () => {
      try {
        let payload = await fetchClassroomJob(false);
        if (!cancelled && payload.job?.status === "queued" && !payload.backgroundEnabled) {
          payload = await fetchClassroomJob(true);
        }
        if (!cancelled && !payload.job) setError("课程设计已经完成，但没有找到后续课堂生成任务。");
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "无法继续生成最终课程内容");
      }
    };
    void continueGeneration();
    return () => { cancelled = true; };
  }, [fetchClassroomJob, job?.status]);

  const classroomRunning = classroomJob?.status === "queued"
    || classroomJob?.status === "running"
    || classroomJob?.status === "cancelling";
  useEffect(() => {
    if (!classroomRunning) return;
    const timer = window.setInterval(() => void fetchClassroomJob(false).catch(() => undefined), 2_000);
    return () => window.clearInterval(timer);
  }, [classroomRunning, fetchClassroomJob]);

  useEffect(() => {
    if (!confirmCancel) return;
    const timer = window.setTimeout(() => setConfirmCancel(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [confirmCancel]);

  async function start() {
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/courses/${course.id}/design-generation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherBrief: brief, options }),
      });
      const payload = await readJsonResponse<ResponsePayload>(
        response,
        "快速生成服务没有返回内容。请确认数据库迁移已完成，然后重试。",
      );
      if (!response.ok) throw new Error(payload.detail || payload.error || "无法启动快速生成");
      applyPayload(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法启动快速生成");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelGeneration() {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setConfirmCancel(false);
    try {
      if (job?.status === "completed" && classroomJob && classroomJob.status !== "completed") {
        const response = await fetch(`/api/courses/${course.id}/generation`, { method: "DELETE" });
        const payload = await readJsonResponse<ClassroomGenerationResponse>(response, "中断请求没有得到响应，请稍后重试。");
        if (!response.ok) throw new Error(payload.error || "无法中断最终课程生成");
        setClassroomJob(payload.job);
      } else {
        const response = await fetch(`/api/courses/${course.id}/design-generation`, { method: "DELETE" });
        const payload = await readJsonResponse<ResponsePayload>(response, "中断请求没有得到响应，请稍后重试。");
        if (!response.ok) throw new Error(payload.detail || payload.error || "无法中断生成");
        applyPayload(payload);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法中断生成");
    }
  }

  async function resumeClassroomGeneration() {
    setClassroomRetrying(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/courses/${course.id}/generation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume-from-checkpoints" }),
      });
      const payload = await readJsonResponse<ClassroomGenerationResponse>(response, "续生成请求没有得到响应，请稍后重试。");
      if (!response.ok) throw new Error(payload.error || "无法从已完成页面继续生成");
      setBackgroundEnabled(payload.backgroundEnabled);
      setClassroomJob(payload.job);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法从已完成页面继续生成");
    } finally {
      setClassroomRetrying(false);
    }
  }

  async function reviewOutline() {
    try {
      if (job?.status === "review_available") {
        const response = await fetch(`/api/courses/${course.id}/design-generation`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pause" }),
        });
        const payload = await readJsonResponse<ResponsePayload>(response, "暂停请求没有得到响应，请稍后重试。");
        if (!response.ok) throw new Error(payload.detail || payload.error || "无法暂停生成");
        applyPayload(payload);
      }
      const latest = await fetchJob();
      setOutlinePreview(latest.outlinePreview ?? []);
      setOutlineReviewOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法打开页面大纲");
    }
  }

  async function resumeAfterOutlineReview(outlines: SceneOutline[]) {
    setError(undefined);
    const response = await fetch(`/api/courses/${course.id}/design-generation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume", sceneOutlines: outlines }),
    });
    const payload = await readJsonResponse<ResponsePayload>(response, "保存大纲后未收到响应，请稍后重试。");
    if (!response.ok) throw new Error(payload.detail || payload.error || "无法保存大纲并继续生成");
    setOutlinePreview(outlines);
    setOutlineReviewOpen(false);
    applyPayload(payload);
  }

  const artifacts = useMemo<CourseDesignGenerationArtifact[]>(() => {
    const seen = new Set<string>();
    return (job?.trace ?? []).flatMap((entry) => entry.artifacts ?? []).filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [job?.trace]);

  const combinedArtifacts = useMemo(
    () => [...artifacts, ...buildQuickClassroomArtifacts(classroomJob)],
    [artifacts, classroomJob],
  );

  const classroomCompleted = classroomJob?.status === "completed" && Boolean(classroomJob.result?.id);
  const classroomFailed = classroomJob?.status === "failed";
  const overallProgress = job?.status === "completed"
    ? combineQuickGenerationProgress(100, classroomJob?.progress ?? 0, classroomCompleted)
    : combineQuickGenerationProgress(job?.progress ?? 0, 0, false);
  const activeArtifactId = job?.status === "completed"
    ? resolveQuickClassroomActiveArtifactId(classroomJob)
    : resolveLatestCompletedArtifactId(artifacts);
  const activeMessage = job?.status === "completed"
    ? classroomJob?.message || "课程设计已完成，正在衔接课堂内容生成"
    : job?.message || "正在分析课程信息";
  const activeRemaining = job?.status === "completed"
    ? classroomJob?.estimatedRemainingSeconds
    : job?.estimatedRemainingSeconds;
  const activeStartedAt = job?.status === "completed"
    ? classroomJob?.startedAt ?? job.startedAt ?? null
    : job?.startedAt ?? null;
  const showGenerationCanvas = running || job?.status === "completed" || classroomRunning || classroomCompleted;

  useEffect(() => {
    const classroomId = classroomJob?.result?.id;
    if (!classroomCompleted || !classroomId || autoOpenedClassroomId.current === classroomId) return;
    const timer = window.setTimeout(() => {
      autoOpenedClassroomId.current = classroomId;
      router.push(`/teacher/prepare/${course.id}/preview?classroomId=${classroomId}`);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [classroomCompleted, classroomJob?.result?.id, course.id, router]);

  if (showGenerationCanvas) {
    return (
      <LayoutGroup id={`quick-generation-${course.id}`}>
      <QuickGenerationStage
        activeArtifactId={activeArtifactId}
        artifacts={combinedArtifacts}
        backgroundEnabled={backgroundEnabled}
        brief={job?.requestPreview?.teacherBrief || brief}
        cancelling={job?.status === "cancelling" || classroomJob?.status === "cancelling"}
        confirmCancel={confirmCancel}
        completed={classroomCompleted}
        failed={classroomFailed}
        failureMessage={classroomJob?.error || error}
        message={activeMessage}
        onCancel={() => void cancelGeneration()}
        onOpenCourse={() => {
          if (classroomJob?.result?.id) router.push(`/teacher/prepare/${course.id}/preview?classroomId=${classroomJob.result.id}`);
        }}
        onRetry={() => void resumeClassroomGeneration()}
        onReview={() => void reviewOutline()}
        paused={job?.status === "paused"}
        progress={overallProgress}
        remainingLabel={classroomCompleted ? "全部内容已经生成并自动保存" : classroomFailed ? "已完成页面均已保存，可从断点继续" : formatDuration(activeRemaining)}
        retrying={classroomRetrying}
        reviewAvailable={job?.status === "review_available" || job?.status === "paused"}
        startedAt={activeStartedAt}
      />
      <AnimatePresence>
        {outlineReviewOpen ? (
          <QuickOutlineReviewDialog
            initialOutlines={outlinePreview}
            onClose={() => setOutlineReviewOpen(false)}
            onConfirm={resumeAfterOutlineReview}
          />
        ) : null}
      </AnimatePresence>
      </LayoutGroup>
    );
  }

  return (
    <section className="relative flex min-h-[calc(100vh-150px)] items-center justify-center px-4 py-14">
      <button
        className="absolute right-1 top-1 inline-flex h-10 items-center gap-2 rounded-[9px] border border-stone-200 bg-white px-3.5 text-xs font-bold text-stone-600 shadow-sm transition hover:border-stone-400 hover:text-stone-900"
        onClick={() => void onOpenDetailed()}
        type="button"
      >
        <Settings2 className="size-4" />进入高级分步设计
      </button>

      <div className="w-full max-w-[820px]">
        <div className="mb-10 flex justify-center">
          <OpenPblLogo height={82} variant="horizontal" />
        </div>

        <div className="overflow-visible rounded-[22px] border border-stone-300 bg-white shadow-[0_22px_70px_rgba(28,25,23,.11)] transition-shadow focus-within:shadow-[0_24px_75px_rgba(28,25,23,.13)]">
          <textarea
            aria-label="描述课程生成要求"
            className="quick-course-brief min-h-[190px] w-full resize-none rounded-t-[22px] border-0 bg-transparent px-6 pb-3 pt-5 text-[15px] leading-7 text-stone-900 [outline:none!important] focus-visible:!outline-none focus-visible:ring-0 placeholder:text-stone-400"
            maxLength={4000}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="描述课程主题、学生情况、需要重点讲清的内容，或希望学生完成的成果……"
            value={brief}
          />

          <div className="flex flex-wrap items-end justify-between gap-3 px-3 pb-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <OptionToggle active={options.enableImageGeneration} description="为适合的课堂页面生成配图" icon={ImageIcon} label="图片" onClick={() => setOptions((current) => ({ ...current, enableImageGeneration: !current.enableImageGeneration }))} />
              <OptionToggle active={options.enableTTS} description="为授课内容生成中文语音" icon={Volume2} label="语音" onClick={() => setOptions((current) => ({ ...current, enableTTS: !current.enableTTS }))} />
              <OptionToggle active={options.enableVideoGeneration} description="在适合的页面尝试生成视频资源" icon={Video} label="视频" onClick={() => setOptions((current) => ({ ...current, enableVideoGeneration: !current.enableVideoGeneration }))} />
            </div>

            <button
              aria-label={job?.status === "failed" ? "从已保存内容继续生成" : "开始生成课程"}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-stone-950 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-wait disabled:opacity-45 motion-reduce:transform-none"
              disabled={submitting || !brief.trim()}
              onClick={() => void start()}
              type="button"
              title={job?.status === "failed" ? "从已保存内容继续生成" : "开始生成课程"}
            >
              {submitting ? <CourseGenerationGlyph className="size-5" /> : <Send className="size-4.5" />}
            </button>
          </div>
        </div>

        {error ? <p className="mx-auto mt-4 max-w-[760px] rounded-[10px] bg-red-50 px-4 py-3 text-center text-xs font-semibold leading-5 text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}

function OptionToggle({
  active,
  description,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  description: string;
  icon: typeof Mic2;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      aria-label={`${label}：${description}`}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition",
        active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-stone-200 bg-white text-stone-400 hover:bg-stone-50",
      )}
      onClick={onClick}
      title={description}
      type="button"
    >
      <Icon className="size-3.5" />{label}
    </button>
  );
}
