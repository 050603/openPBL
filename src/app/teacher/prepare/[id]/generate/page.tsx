"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
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
import type { LessonOutlineSection, TeacherResourceScene } from "@/lib/session/types";
import type { SceneOutline } from "@/lib/openmaic/types/generation";
import { buildFacilitationScaffold } from "@/lib/teacher-resources/facilitation-scaffolds";
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

type ProgressStep = {
  step: string;
  progress: number;
  message: string;
  ts: number;
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

const SCENE_OUTLINE_TYPES = new Set(["slide", "quiz", "interactive", "pbl"]);
const GENERATION_TIMELINE = [
  { label: "整理课程结构", threshold: 10 },
  { label: "生成学习场景", threshold: 30 },
  { label: "补充教学素材", threshold: 50 },
  { label: "配置互动活动", threshold: 70 },
  { label: "检查教学目标覆盖", threshold: 88 },
  { label: "准备课程预览", threshold: 100 },
];

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
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const startedRef = useRef(false);
  // 生成选项开关（Phase 2.6-2.8：media/TTS/WebSearch 阶段）
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [enableImageGeneration, setEnableImageGeneration] = useState(true);
  const [enableVideoGeneration, setEnableVideoGeneration] = useState(false);
  const [enableTTS, setEnableTTS] = useState(true);
  // 互动模式：从备课阶段读取，不在生成页面修改
  const interactiveMode = course?.content.interactiveMode ?? false;
  // 是否已点击"开始生成"按钮（控制配置面板与生成状态的切换）
  const [started, setStarted] = useState(false);
  const coverGenerationCourseRef = useRef<string | null>(null);
  const pblCoverage = checkPblStageCoverage(course ? buildConfirmedSceneOutlines() : []);
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

  async function startGeneration() {
    if (!course) return;
    if (!isPblModuleTimingPlanConfirmed(course.content.moduleTimingPlan)) {
      setStatus("error");
      setError("请返回备课阶段页，先确认六个模块的时间分配。");
      return;
    }
    setStatus("loading");
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
      const res = await fetch("/api/openmaic/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement: buildRequirement(),
          pblProfile: course.pblConfig,
          moduleTimingPlan: course.content.moduleTimingPlan,
          pblTeachingActivities: buildTeacherActivityRequirements(course.content),
          pblActivityCatalog: buildPblActivityCatalog(course.content),
          knowledgePoints: course.content.knowledgePoints,
          teachingConstraints: buildCourseTeachingConstraints(course, course.content),
          courseId: course.id,
          courseTitle: course.name,
          sceneOutlines,
          enableWebSearch,
          enableImageGeneration,
          enableVideoGeneration,
          enableTTS,
          interactiveMode,
          ttsProviderId,
          ttsModelId,
          ttsVoice: ttsVoiceId,
          ttsSpeed,
          ttsLanguage: "zh-CN",
          agentMode: "default",
        }),
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
                progress: evt.progress,
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
      setStatus("success");

      // 生成后分流：将引入+PBL场景拆分为教师授课资源，学生课堂仅保留知识点教学场景
      try {
        setSteps((prev) => [
          ...prev,
          {
            step: "内容分流",
            progress: 100,
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
            updateCourse(course.id, {
            aiLearningClassroomId: doneEvent.id,
            teacherClassroomId: splitResult.teacherClassroomId,
            dynamicFacilitationScaffolds: splitResult.teacherResourceScenes
              .filter((resource) => resource.generationMode === "dynamic-scaffold" && resource.scaffoldKind)
              .map((resource) => buildFacilitationScaffold({
                courseId: course.id,
                stageKey: resource.stageKey ?? "showcase",
                title: resource.title,
                kind: resource.scaffoldKind!,
              })),
            content: {
              ...course.content,
              _openmaicClassroomId: doneEvent.id,
              _openmaicScenesCount: splitResult.studentSceneCount,
              teacherClassroomId: splitResult.teacherClassroomId,
              teacherResources: {
                generatedAt: new Date().toISOString(),
                scenes: splitResult.teacherResourceScenes,
              },
            },
            });
          setSteps((prev) => [
            ...prev,
            {
              step: "内容分流完成",
              progress: 100,
              message: `学生 ${splitResult.studentSceneCount} 场 · 普通课堂活动 ${splitResult.teacherSceneCount} 场`,
              ts: Date.now(),
            },
            {
              step: "PBL 阶段覆盖检查",
              progress: 100,
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
            progress: 100,
            message: `分流失败：${splitMessage}`,
            ts: Date.now(),
          },
        ]);
        throw new Error(`内容分流失败：${splitMessage}`);
      }

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
      <div className="mb-5 flex items-center gap-3">
        <Link
          className="grid h-9 w-9 place-items-center rounded-[6px] border border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
          href={`/teacher/prepare/${course.id}/verify`}
        >
          <ArrowLeft size={17} />
        </Link>
        <div>
          <h1 className="text-[28px] font-bold">生成课程</h1>
          <p className="mt-1 text-sm text-stone-500">
            {course.name} · 正在依据课程大纲生成课程内容
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(400px,440px)]">
        {!started ? (
          <Card>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-editorial text-2xl font-semibold">将生成的课程内容</h2>
            </div>
            <p className="mb-4 text-sm leading-7 text-stone-500">
              系统将按已确认的课程结构生成学习内容，并在完成后分别整理普通课堂活动资源、学生内容与评价材料。
            </p>

            <GenerationCoverage coverage={pblCoverage} />

            <dl className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
              ["课程大纲资源", `${buildConfirmedSceneOutlines().length || course.content.lessonOutline.length} 个`],
              ["互动活动", "按教学活动配置"], ["知识检查", "覆盖学习目标"],
              ["普通课堂活动", `${course.content.teachingOutline?.filter((item) => item.openMaicUse !== "student-ai-learning").length ?? 0} 组`],
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

              {interactiveMode ? (
                <div className="rounded-[8px] border border-[var(--pbl-ai)]/25 bg-[var(--pbl-ai-soft)]/20 px-4 py-3 md:col-span-2">
                  <div className="text-sm font-bold text-stone-800">互动模式 · 已开启</div>
                  <div className="mt-1 text-xs leading-5 text-stone-500">
                    最终生成严格遵循已确认大纲中的 PPT、测验与互动类型，不会在此阶段再次转换。项目启动和后续教师资源仍为 PPT/讲稿。
                  </div>
                </div>
              ) : null}
            </div>
            </details>

          </Card>
        ) : (
          <Card>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">生成状态</h2>
              {status === "loading" && steps.length > 0 ? (
                <span className="text-xs font-semibold text-stone-500">
                  已接收 {steps.length} 条进度
                </span>
              ) : null}
            </div>

            <div className="flex items-start gap-4 rounded-[8px] border border-stone-200 px-4 py-4">
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold",
                  status === "loading" && "bg-blue-600 text-white",
                  status === "success" && "bg-[var(--pbl-success)] text-white",
                  status === "error" && "bg-[var(--pbl-danger)] text-white",
                )}
              >
                {status === "loading" ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : status === "success" ? (
                  <Check size={16} />
                ) : (
                  <CircleAlert size={16} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-sm font-bold",
                    status === "loading" && "text-blue-700",
                    status === "success" && "text-[var(--pbl-success)]",
                    status === "error" && "text-[var(--pbl-danger)]",
                  )}
                >
                  {status === "loading"
                    ? "正在生成课程内容..."
                    : status === "success"
                      ? "生成完成，等待教师确认"
                      : "生成失败"}
                </div>
                <div className="mt-1 text-sm leading-7 text-stone-500">
                  {status === "loading"
                    ? "AI 正在根据课程信息生成完整授课内容，预计需要 1-5 分钟，请勿关闭页面。"
                    : status === "success" && result
                      ? `已生成 ${result.scenesCount} 个场景，阶段：${result.stage.name}`
                      : error ?? "请重试或检查 LLM 配置"}
                </div>
              </div>
            </div>

            {/* 实时进度步骤列表 */}
            {steps.length > 0 ? (
              <div className="mt-5">
                <h3 className="mb-3 text-sm font-semibold text-[var(--pbl-text)]">生成任务</h3>
                <ol className="divide-y divide-[var(--pbl-border-soft)] border-y border-[var(--pbl-border)]">
                  {GENERATION_TIMELINE.map((item, index) => { const progress = Math.max(0, ...steps.map((step) => step.progress)); const complete = status === "success" || progress >= item.threshold; const active = !complete && (index === 0 || progress >= GENERATION_TIMELINE[index - 1].threshold); return <li className="flex items-center gap-3 py-3 text-sm" key={item.label}><span className={cn("grid h-6 w-6 place-items-center rounded-full border text-xs", complete ? "border-[var(--pbl-success)] bg-[var(--pbl-success)] text-white" : active ? "border-[var(--pbl-ai)] text-[var(--pbl-ai)]" : "border-[var(--pbl-border-strong)] text-[var(--pbl-text-subtle)]")}>{complete ? <Check size={13} /> : index + 1}</span><span className={complete || active ? "font-semibold" : "text-[var(--pbl-text-muted)]"}>{item.label}</span>{active && status === "loading" ? <Loader2 className="ml-auto animate-spin text-[var(--pbl-ai)]" size={15} /> : null}</li>; })}
                </ol>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--pbl-text-muted)]">查看详细生成日志</summary>
                <ol className="max-h-72 space-y-1 overflow-y-auto rounded-[6px] border border-stone-100 bg-stone-50/50 p-3 text-xs">
                  {steps.map((s, i) => (
                    <li
                      key={`${s.ts}-${i}`}
                      className="flex items-start gap-2 border-b border-stone-100 pb-1 last:border-0 last:pb-0"
                    >
                      <span className="shrink-0 font-bold text-blue-600">
                        [{String(s.progress).padStart(3, " ")}%]
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-stone-700">{s.step}</div>
                        {s.message ? (
                          <div className="truncate text-stone-500" title={s.message}>
                            {s.message}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
                </details>
              </div>
            ) : null}

            {status === "success" && result ? (
              <div className="mt-5 border-t border-[var(--pbl-border)] pt-5">
                {result.qualityReport && (result.qualityReport.corrections.length > 0 || result.qualityReport.warnings.length > 0) ? (
                  <details className="mb-4 rounded-[var(--radius-xs)] border border-[var(--pbl-warning)]/30 bg-[var(--pbl-warning)]/5 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--pbl-text)]">教学质量检查：已自动修复 {result.qualityReport.corrections.length} 项，仍有 {result.qualityReport.warnings.length} 项建议复核</summary>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-[var(--pbl-text-muted)]">
                      {result.qualityReport.corrections.map((item) => <li key={`fix-${item}`}>已修复：{item}</li>)}
                      {result.qualityReport.warnings.map((item) => <li key={`warn-${item}`}>建议：{item}</li>)}
                    </ul>
                  </details>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-[var(--pbl-text-muted)]">已保留生成结果，不会自动离开本页。请查看摘要后主动进入预览。</p>
                </div>
              </div>
            ) : null}
          </Card>
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
              生成过程会实时显示进度，最长约需 5 分钟。如需切换 AI 模型，请前往「设置」页面配置。
            </p>
          </Card>
        </aside>
      </div>
      <FlowActionBar persistent back={<Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--pbl-text-muted)]" href={`/teacher/prepare/${course.id}/verify`}>上一步</Link>} saveStatus={<SaveStatus lastSavedAt={session.lastSavedAt} onRetry={() => void session.retrySave()} state={session.saveState} />}>{status === "success" && result ? <Link className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] px-4 text-sm font-semibold text-white" href={`/teacher/prepare/${course.id}/preview?classroomId=${result.id}`}>进入预览与发布</Link> : <Button disabled={started && status === "loading"} loading={started && status === "loading"} onClick={started ? () => void startGeneration() : beginGeneration}>{started && status === "error" ? "重新生成" : "生成课程内容"}</Button>}</FlowActionBar>
    </DashboardShell>
  );
}
