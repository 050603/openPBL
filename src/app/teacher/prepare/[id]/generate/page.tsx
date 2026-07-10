"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Lightbulb,
  Loader2,
  RefreshCw,
  Wand2,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { WizardStepper } from "@/components/wizard-stepper";
import { Button, Card, FlowActionBar, PrimaryButton, SaveStatus, toast } from "@/components/ui";
import { useSession, useCourse, useHydrated } from "@/lib/session/store";
import { cn } from "@/lib/utils";
import type { LessonOutlineSection } from "@/lib/session/types";
import type { SceneOutline } from "@/lib/openmaic/types/generation";
import { splitClassroomScenes } from "@/lib/openmaic-bridge/post-generation-split";

const STEPS = [
  { key: "new", label: "创建项目" },
  { key: "verify", label: "课程核查" },
  { key: "generate", label: "生成课程" },
  { key: "preview", label: "预览发布" },
];

type GenStatus = "loading" | "success" | "error";

type GenResult = {
  id: string;
  url: string;
  scenesCount: number;
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
  | { type: "done"; id: string; url: string; scenesCount: number; stage: { id: string; name: string } }
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
    order: index,
  } as SceneOutline;
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
    order: index,
  };
}

export default function GenerateCoursePage() {
  const params = useParams<{ id: string }>();
  const session = useSession();
  const { user, updateCourse } = session;
  const course = useCourse(params?.id);
  const hydrated = useHydrated();

  const [status, setStatus] = useState<GenStatus>("loading");
  const [result, setResult] = useState<GenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const startedRef = useRef(false);
  // 生成选项开关（Phase 2.6-2.8：media/TTS/WebSearch 阶段）
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [enableImageGeneration, setEnableImageGeneration] = useState(false);
  const [enableVideoGeneration, setEnableVideoGeneration] = useState(false);
  const [enableTTS, setEnableTTS] = useState(true);
  // 是否已点击"开始生成"按钮（控制配置面板与生成状态的切换）
  const [started, setStarted] = useState(false);

  // 根据课程数据构建 AI 生成需求字符串
  function buildRequirement(): string {
    if (!course) return "";
    const stages = (course.stages ?? [])
      .map((s) => `${s.label}(${s.key})`)
      .filter(Boolean)
      .join("、");
    const teacherResourceActivities = (course.content.teachingOutline ?? []).filter(
      (activity) => activity.openMaicUse === "teacher-resource",
    );
    return [
      "请为以下 PBL 课程生成 AI 授知内容。生成后系统会拆分为：学生 AI 授知课堂 + 教师授课资源。",
      "",
      "【核心定位】",
      "- 学生 AI 授知课堂只保留 AI 授知阶段核心知识点内容，用于学生学习、互动和测验。",
      "- 课程引入、PBL 项目布置、项目介绍材料、教师讲稿和 PPT 等内容必须标记为教师资源，生成后只在教师授课资源区展示，不进入学生 AI 授知阶段。",
      "- 整课授课大纲中每个 openMaicUse=teacher-resource 的活动都必须生成可直接授课的资源场景；根据 resourceTypes 生成 slide/PPT、interactive 演示或 pbl 项目布置。",
      "- 教师资源标题必须同时包含用途和阶段，格式为【教师资源-用途】【阶段:stageKey】标题；stageKey 必须使用课程阶段括号中的真实 key。",
      teacherResourceActivities.length
        ? `- 必须覆盖这些教师资源活动：${JSON.stringify(teacherResourceActivities)}`
        : "- 如生成课程引入或 PBL 项目布置，仍需按教师资源格式标记。",
      "",
      "【课程信息】",
      `课程名称：${course.name}`,
      `课程摘要：${course.summary ?? ""}`,
      `驱动问题：${course.drivingQuestion ?? ""}`,
      stages ? `课程阶段：${stages}` : "",
      "",
      "【已确认知识图谱】",
      JSON.stringify({
        knowledgePoints: course.content.knowledgePoints ?? [],
        knowledgeGraph: course.content.knowledgeGraph ?? null,
      }),
      "",
      "【已确认整课授课大纲】",
      JSON.stringify(course.content.teachingOutline ?? []),
      "",
      "【已确认 AI 授知场景大纲】",
      JSON.stringify(buildConfirmedSceneOutlines().map((outline) => ({
        id: outline.id,
        type: outline.type,
        title: outline.title,
        description: outline.description,
        keyPoints: outline.keyPoints,
        order: outline.order,
      }))),
    ]
      .filter(Boolean)
      .join("\n");
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
    setStatus("loading");
    setError(null);
    setSteps([]);
    try {
      const sceneOutlines = buildConfirmedSceneOutlines();
      const res = await fetch("/api/openmaic/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement: buildRequirement(),
          courseId: course.id,
          courseTitle: course.name,
          sceneOutlines,
          enableWebSearch,
          enableImageGeneration,
          enableVideoGeneration,
          enableTTS,
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
              url: evt.url,
              scenesCount: evt.scenesCount,
              stage: evt.stage,
            };
          } else if (evt.type === "error") {
            errorEvent = evt.error || evt.details || "生成失败";
          }
        }
      }

      if (errorEvent) throw new Error(errorEvent);
      if (!doneEvent) throw new Error("未收到生成完成事件");

      setResult(doneEvent);
      setStatus("success");

      // 生成后分流：将引入+PBL场景拆分为教师授课资源，学生课堂仅保留知识点教学场景
      const classroomId = doneEvent.id;
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
        const splitResult = await splitClassroomScenes(classroomId, course?.name ?? "课程");
        if (splitResult.teacherClassroomId && course) {
          updateCourse(course.id, {
            teacherClassroomId: splitResult.teacherClassroomId,
            content: {
              ...course.content,
              teacherClassroomId: splitResult.teacherClassroomId,
              teacherResources: {
                generatedAt: new Date().toISOString(),
                scenes: splitResult.teacherResourceScenes,
              },
              _openmaicScenesCount: splitResult.studentSceneCount,
            },
          });
          setSteps((prev) => [
            ...prev,
            {
              step: "内容分流完成",
              progress: 100,
              message: `学生 ${splitResult.studentSceneCount} 场 · 教师资源 ${splitResult.teacherSceneCount} 场`,
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
        <div className="grid place-items-center py-20 text-slate-500">加载中…</div>
      </DashboardShell>
    );
  }

  if (!course) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-slate-500">
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
          <WizardStepper current={2} steps={STEPS} />
        </div>
      }
    >
      <div className="mb-5 flex items-center gap-3">
        <Link
          className="grid h-9 w-9 place-items-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          href={`/teacher/prepare/${course.id}/verify`}
        >
          <ArrowLeft size={17} />
        </Link>
        <div>
          <h1 className="text-[28px] font-bold">生成课程</h1>
          <p className="mt-1 text-sm text-slate-500">
            {course.name} · 正在生成 AI 授知内容
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {!started ? (
          <Card>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-editorial text-2xl font-semibold">将生成的课程内容</h2>
            </div>
            <p className="mb-4 text-sm leading-7 text-slate-500">
              系统将按已确认的课程结构生成学习内容，并在完成后分别整理教师资源、学生内容与评价材料。
            </p>

            <dl className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
              ["学习场景", `${buildConfirmedSceneOutlines().length || course.content.lessonOutline.length} 个`],
              ["互动活动", "按教学活动配置"], ["知识检查", "覆盖学习目标"],
              ["教师资源", `${course.content.teachingOutline?.filter((item) => item.openMaicUse === "teacher-resource").length ?? 0} 组`],
              ["学生内容", "AI 授知与项目支架"], ["评价内容", "四类评价与证据要求"],
            ].map(([label, value]) => <div className="border-t border-[var(--pbl-border)] pt-3" key={label}><dt className="text-xs text-[var(--pbl-text-muted)]">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}</dl>

            <details className="border-y border-[var(--pbl-border)] py-3">
              <summary className="cursor-pointer text-sm font-semibold">生成设置 <span className="font-normal text-[var(--pbl-text-muted)]">· 联网、配图、视频与语音</span></summary>
            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-slate-200 px-4 py-3 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={enableWebSearch}
                  onChange={(e) => setEnableWebSearch(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800">Web 搜索</div>
                  <div className="mt-1 text-xs text-slate-500">
                    生成前联网检索相关资料，丰富课件内容（需配置 Web Search Provider）
                  </div>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-slate-200 px-4 py-3 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={enableImageGeneration}
                  onChange={(e) => setEnableImageGeneration(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800">图像生成</div>
                  <div className="mt-1 text-xs text-slate-500">
                    为课件场景配图（需配置 Image Provider，如 DALL·E）
                  </div>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-slate-200 px-4 py-3 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={enableVideoGeneration}
                  onChange={(e) => setEnableVideoGeneration(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800">视频生成</div>
                  <div className="mt-1 text-xs text-slate-500">
                    为课件场景配视频（需配置 Video Provider，耗时较长）
                  </div>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-slate-200 px-4 py-3 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={enableTTS}
                  onChange={(e) => setEnableTTS(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800">TTS 语音合成</div>
                  <div className="mt-1 text-xs text-slate-500">
                    为课件文案生成语音讲解（需配置 TTS Provider，如 ElevenLabs）
                  </div>
                </div>
              </label>
            </div>
            </details>

            <div className="mt-5 flex items-center gap-3">
              <PrimaryButton onClick={beginGeneration} type="button">
                <Wand2 size={18} /> 开始生成
              </PrimaryButton>
              <Link
                className="text-sm font-semibold text-slate-500 hover:underline"
                href={`/teacher/prepare/${course.id}/verify`}
              >
                返回上一步
              </Link>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">生成状态</h2>
              {status === "loading" && steps.length > 0 ? (
                <span className="text-xs font-semibold text-slate-500">
                  已接收 {steps.length} 条进度
                </span>
              ) : null}
            </div>

            <div className="flex items-start gap-4 rounded-[8px] border border-slate-200 px-4 py-4">
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold",
                  status === "loading" && "bg-blue-600 text-white",
                  status === "success" && "bg-emerald-500 text-white",
                  status === "error" && "bg-red-500 text-white",
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
                    status === "success" && "text-emerald-700",
                    status === "error" && "text-red-700",
                  )}
                >
                  {status === "loading"
                    ? "正在生成 AI 授知课程..."
                    : status === "success"
                      ? "生成完成，等待教师确认"
                      : "生成失败"}
                </div>
                <div className="mt-1 text-sm leading-7 text-slate-500">
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
                <ol className="max-h-72 space-y-1 overflow-y-auto rounded-[6px] border border-slate-100 bg-slate-50/50 p-3 text-xs">
                  {steps.map((s, i) => (
                    <li
                      key={`${s.ts}-${i}`}
                      className="flex items-start gap-2 border-b border-slate-100 pb-1 last:border-0 last:pb-0"
                    >
                      <span className="shrink-0 font-bold text-blue-600">
                        [{String(s.progress).padStart(3, " ")}%]
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-700">{s.step}</div>
                        {s.message ? (
                          <div className="truncate text-slate-500" title={s.message}>
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

            {status === "error" ? (
              <div className="mt-5">
                <PrimaryButton
                  onClick={() => void startGeneration()}
                  type="button"
                  variant="outline"
                >
                  <RefreshCw size={18} /> 重试
                </PrimaryButton>
              </div>
            ) : null}
            {status === "success" && result ? (
              <div className="mt-5 flex flex-col gap-3 border-t border-[var(--pbl-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-[var(--pbl-text-muted)]">已保留生成结果，不会自动离开本页。请查看摘要后主动进入预览。</p>
                <Link className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] px-4 text-sm font-semibold text-white" href={`/teacher/prepare/${course.id}/preview?classroomId=${result.id}`}>进入预览与发布</Link>
              </div>
            ) : null}
          </Card>
        )}

        <aside className="space-y-5">
          <Card>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Lightbulb className="text-blue-600" size={18} /> AI 授知生成
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              系统会根据课程名称、摘要、驱动问题和阶段定义生成完整 AI 授知内容（含场景、文案、互动等）。
            </p>
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <CircleAlert className="text-amber-500" size={18} /> 提示
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              生成过程通过 SSE 实时推送进度步骤，最长可运行 5 分钟。如需切换模型或调整 baseUrl，请前往「设置」页配置。
            </p>
          </Card>
        </aside>
      </div>
      <FlowActionBar back={<Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--pbl-text-muted)]" href={`/teacher/prepare/${course.id}/verify`}>上一步</Link>} saveStatus={<SaveStatus lastSavedAt={session.lastSavedAt} onRetry={() => void session.retrySave()} state={session.saveState} />}>{status === "success" && result ? <Link className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] px-4 text-sm font-semibold text-white" href={`/teacher/prepare/${course.id}/preview?classroomId=${result.id}`}>进入预览与发布</Link> : <Button disabled={started && status === "loading"} loading={started && status === "loading"} onClick={started ? () => void startGeneration() : beginGeneration}>{started && status === "error" ? "重新生成" : "生成课程内容"}</Button>}</FlowActionBar>
    </DashboardShell>
  );
}
