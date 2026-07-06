"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { WizardStepper } from "@/components/wizard-stepper";
import { Card, PrimaryButton } from "@/components/ui";
import { useSession, useCourse, useHydrated } from "@/lib/session/store";
import { cn } from "@/lib/utils";
import type { LessonOutlineSection } from "@/lib/session/types";
import type { SceneOutline } from "@/lib/openmaic/types/generation";

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
  const router = useRouter();
  const { user } = useSession();
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

  // 根据课程数据构建 OpenMAIC 生成需求字符串
  function buildRequirement(): string {
    if (!course) return "";
    const stages = (course.stages ?? [])
      .map((s) => s.label)
      .filter(Boolean)
      .join("、");
    return [
      "请为以下PBL课程生成AI授知内容：",
      `课程名称：${course.name}`,
      `课程摘要：${course.summary ?? ""}`,
      `驱动问题：${course.drivingQuestion ?? ""}`,
      stages ? `课程阶段：${stages}` : "",
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
      // 短暂展示成功后跳转预览
      const classroomId = doneEvent.id;
      setTimeout(() => {
        router.push(`/teacher/prepare/${course.id}/preview?classroomId=${classroomId}`);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
      setStatus("error");
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
          <h1 className="text-[28px] font-black">生成课程</h1>
          <p className="mt-1 text-sm text-slate-500">
            {course.name} · 正在调用 OpenMAIC 生成 AI 授知内容
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-5">
        {!started ? (
          <Card>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-black">生成选项</h2>
            </div>
            <p className="mb-4 text-sm leading-7 text-slate-500">
              请选择要启用的 AI 生成阶段（可全部关闭，仅生成基础场景内容）。配置完成后点击「开始生成」按钮。媒体/TTS/Web Search 阶段需在「设置」页配置对应 Provider。
            </p>

            <div className="space-y-3">
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

            <div className="mt-5 flex items-center gap-3">
              <PrimaryButton onClick={beginGeneration} type="button">
                <Sparkles size={18} /> 开始生成
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
              <h2 className="text-xl font-black">生成状态</h2>
              {status === "loading" && steps.length > 0 ? (
                <span className="text-xs font-semibold text-slate-500">
                  已接收 {steps.length} 条进度
                </span>
              ) : null}
            </div>

            <div className="flex items-start gap-4 rounded-[8px] border border-slate-200 px-4 py-4">
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black",
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
                      ? "生成完成，正在跳转预览..."
                      : "生成失败"}
                </div>
                <div className="mt-1 text-sm leading-7 text-slate-500">
                  {status === "loading"
                    ? "OpenMAIC 正在根据课程信息生成完整 AI 授知内容，预计需要 1-5 分钟，请勿关闭页面。"
                    : status === "success" && result
                      ? `已生成 ${result.scenesCount} 个场景，阶段：${result.stage.name}`
                      : error ?? "请重试或检查 LLM 配置"}
                </div>
              </div>
            </div>

            {/* 实时进度步骤列表 */}
            {steps.length > 0 ? (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-bold text-slate-700">实时进度</h3>
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
          </Card>
        )}

        <aside className="space-y-5">
          <Card>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Sparkles className="text-blue-600" size={18} /> OpenMAIC 接入
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              本页已接入 OpenMAIC 真实生成链路。系统会根据课程名称、摘要、驱动问题和阶段定义生成完整 AI 授知内容（含场景、文案、互动等）。
            </p>
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <CircleAlert className="text-amber-500" size={18} /> 提示
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              生成过程通过 SSE 实时推送进度步骤，最长可运行 5 分钟。如需切换模型或调整 baseUrl，请前往「设置」页配置。
            </p>
          </Card>
        </aside>
      </div>
    </DashboardShell>
  );
}
