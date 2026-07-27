"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleAlert,
  Clock3,
  FileStack,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { currentGenerationProgress } from "@/lib/teacher/course-generation-progress";

export type CourseGenerationProgressStep = {
  step: string;
  progress: number;
  message: string;
  ts: number;
};

type GenerationStatus = "loading" | "success" | "error";

type GenerationResultSummary = {
  scenesCount: number;
  studentSceneCount?: number;
  teacherSceneCount?: number;
  stage: { name: string };
  qualityReport?: {
    corrections: string[];
    warnings: string[];
  };
};

type Props = {
  status: GenerationStatus;
  steps: CourseGenerationProgressStep[];
  error: string | null;
  result: GenerationResultSummary | null;
  adaptiveBranchCount: number;
};

const BASE_PHASES = [
  { label: "解析课程蓝图", detail: "读取六阶段目标与教学约束", threshold: 8 },
  { label: "编排学习场景", detail: "建立知识、活动与评价的顺序", threshold: 28 },
  { label: "生成课件与互动", detail: "制作场景、讲稿和互动内容", threshold: 54 },
  { label: "合成媒体素材", detail: "处理配图、语音与可选媒体", threshold: 82 },
  { label: "整理课堂资源", detail: "分流学生内容与教师支架", threshold: 86 },
] as const;

export function CourseGenerationStage({
  status,
  steps,
  error,
  result,
  adaptiveBranchCount,
}: Props) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [status]);

  const phases = useMemo(
    () => [
      ...BASE_PHASES,
      ...(adaptiveBranchCount > 0
        ? [{
            label: "生成自适应资源",
            detail: `${adaptiveBranchCount} 个教师确认分支随主课预生成`,
            threshold: 98,
          }]
        : []),
      {
        label: "校验并保存",
        detail: "检查覆盖关系并写入课程",
        threshold: 100,
      },
    ],
    [adaptiveBranchCount],
  );

  const latest = steps.at(-1);
  const failedSteps = steps.filter((step) => step.step.includes("失败"));
  const progress = currentGenerationProgress(
    steps.map((step) => step.progress),
    status === "success",
  );
  const isQuiet = status === "loading" &&
    latest !== undefined &&
    elapsedSeconds > 45;
  const circumference = 2 * Math.PI * 52;
  const offset = circumference * (1 - progress / 100);

  return (
    <section
      aria-live="polite"
      className="overflow-hidden rounded-[20px] border border-[#23443c] bg-[#10231f] text-[#f6f0df] shadow-[0_28px_80px_rgba(16,35,31,0.2)]"
    >
      <div className="generation-atmosphere relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7">
        <div aria-hidden className="generation-grid absolute inset-0 opacity-25" />
        <div aria-hidden className="generation-glow generation-glow-a" />
        <div aria-hidden className="generation-glow generation-glow-b" />

        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#d8b66b]">
              <Sparkles size={14} />
              OpenPBL 课程编排台
            </div>
            <h2 className="mt-2 font-editorial text-2xl font-semibold tracking-[-0.02em] sm:text-[30px]">
              {status === "success"
                ? "课程已完成编排"
                : status === "error"
                  ? "生成暂时中断"
                  : "正在把课程蓝图变成课堂"}
            </h2>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1.5 text-xs tabular-nums text-[#d8ded5]">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                status === "loading" && "generation-heartbeat bg-[#7fd7b5]",
                status === "success" && "bg-[#7fd7b5]",
                status === "error" && "bg-[#f29a83]",
              )}
            />
            <Clock3 size={13} />
            {formatDuration(elapsedSeconds)}
          </div>
        </div>

        <div className="relative z-10 mt-7 grid items-center gap-7 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="generation-orbit relative mx-auto grid h-[205px] w-[205px] place-items-center">
            <span aria-hidden className="generation-orbit-ring generation-orbit-ring-a" />
            <span aria-hidden className="generation-orbit-ring generation-orbit-ring-b" />
            <span aria-hidden className="generation-node generation-node-a" />
            <span aria-hidden className="generation-node generation-node-b" />
            <span aria-hidden className="generation-node generation-node-c" />
            <svg
              aria-label={`生成进度 ${progress}%`}
              className="-rotate-90"
              height="152"
              role="img"
              viewBox="0 0 120 120"
              width="152"
            >
              <circle
                cx="60"
                cy="60"
                fill="rgba(246,240,223,0.035)"
                r="52"
                stroke="rgba(246,240,223,0.11)"
                strokeWidth="5"
              />
              <circle
                className="generation-progress-ring"
                cx="60"
                cy="60"
                fill="none"
                r="52"
                stroke={status === "error" ? "#f29a83" : "#d8b66b"}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                strokeWidth="5"
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              {status === "success" ? (
                <Check className="text-[#7fd7b5]" size={34} strokeWidth={1.8} />
              ) : status === "error" ? (
                <CircleAlert className="text-[#f29a83]" size={32} strokeWidth={1.8} />
              ) : (
                <div>
                  <span className="font-editorial text-[42px] font-semibold leading-none tabular-nums">
                    {progress}
                  </span>
                  <span className="ml-0.5 text-sm text-[#aebbb4]">%</span>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#d8b66b]">
                    真实进度
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#93a69d]">
              <FileStack size={15} />
              当前任务
            </div>
            <div className="mt-2 min-h-9 font-editorial text-xl font-semibold text-[#fffaf0] sm:text-2xl">
              {status === "success"
                ? "全部内容已校验并保存"
                : status === "error"
                  ? "等待重新生成"
                  : latest?.step ?? "正在建立生成任务"}
            </div>
            <p className="mt-2 min-h-12 max-w-2xl text-sm leading-6 text-[#b8c5bf]">
              {status === "success" && result
                ? `已完成 ${result.scenesCount} 个场景，学生与教师资源已经整理完毕。`
                : status === "error"
                  ? error ?? "请检查模型配置后重试。"
                  : latest?.message ?? "正在连接生成服务，收到首个阶段结果后会在这里持续更新。"}
            </p>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-[#91a39a]">
                <span>{isQuiet ? "当前步骤计算量较大，仍在等待模型返回" : "进度会随服务端结果更新"}</span>
                <span className="tabular-nums">{steps.length} 条事件</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/25 ring-1 ring-white/5">
                <div
                  className={cn(
                    "generation-progress-bar h-full rounded-full",
                    status === "error" && "generation-progress-bar-error",
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/8 bg-[#f6f0df] px-5 py-5 text-[#1d2b27] sm:px-7">
        <ol className="grid gap-x-5 gap-y-3 md:grid-cols-2">
          {phases.map((phase, index) => {
            const previousThreshold = index === 0 ? 0 : phases[index - 1].threshold;
            const complete = status === "success" || progress >= phase.threshold;
            const active = status === "loading" &&
              progress >= previousThreshold &&
              progress < phase.threshold;
            return (
              <li
                className={cn(
                  "grid grid-cols-[30px_minmax(0,1fr)] gap-3 rounded-[12px] border px-3 py-3 transition",
                  complete && "border-[#9dcbb9] bg-[#e5f0e9]",
                  active && "border-[#d8b66b] bg-[#fffaf0] shadow-[0_8px_24px_rgba(48,58,48,0.08)]",
                  !complete && !active && "border-transparent text-[#8b948f]",
                )}
                key={phase.label}
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-[26px] w-[26px] place-items-center rounded-full border text-[11px] font-bold",
                    complete && "border-[#3e8069] bg-[#3e8069] text-white",
                    active && "generation-active-step border-[#b18a3d] bg-[#f3e1b7] text-[#76591f]",
                    !complete && !active && "border-[#c8cdc9] text-[#89928d]",
                  )}
                >
                  {complete ? <Check size={13} /> : index + 1}
                </span>
                <span>
                  <span className="block text-sm font-bold">{phase.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 opacity-75">
                    {phase.detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        {steps.length > 0 ? (
          <details className="mt-4 border-t border-[#d9d5c9] pt-4">
            <summary className="cursor-pointer text-xs font-bold text-[#64716b]">
              查看详细生成日志
            </summary>
            <ol className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-2 text-xs">
              {steps.map((step, index) => (
                <li
                  className="grid grid-cols-[42px_minmax(0,1fr)] gap-3 border-b border-[#dfdbcf] pb-2 last:border-0"
                  key={`${step.ts}-${index}`}
                >
                  <span className="font-bold tabular-nums text-[#3e8069]">
                    {step.progress}%
                  </span>
                  <span>
                    <span className="font-bold">{step.step}</span>
                    <span className="ml-2 text-[#6f7974]">{step.message}</span>
                  </span>
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        {status === "success" && result?.qualityReport &&
        (result.qualityReport.corrections.length > 0 ||
          result.qualityReport.warnings.length > 0) ? (
          <details className="mt-4 rounded-[12px] border border-[#d8b66b]/50 bg-[#fff8e8] px-4 py-3">
            <summary className="cursor-pointer text-sm font-bold">
              质量检查：自动修复 {result.qualityReport.corrections.length} 项，
              仍有 {result.qualityReport.warnings.length} 项建议复核
            </summary>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-[#65716b]">
              {result.qualityReport.corrections.map((item) => (
                <li key={`fix-${item}`}>已修复：{item}</li>
              ))}
              {result.qualityReport.warnings.map((item) => (
                <li key={`warn-${item}`}>建议：{item}</li>
              ))}
            </ul>
          </details>
        ) : null}

        {failedSteps.length > 0 ? (
          <div className="mt-4 rounded-[12px] border border-[#d38b73]/45 bg-[#fff0eb] px-4 py-3 text-sm text-[#744438]">
            <div className="font-bold">
              {failedSteps.length} 项自适应资源需要在发布前复核
            </div>
            <p className="mt-1 text-xs leading-5 opacity-80">
              主课程已保留；失败的分支不会在学生课堂中临时生成。请展开详细日志查看原因并重新生成。
            </p>
          </div>
        ) : null}
      </div>

      <style>{`
        .generation-atmosphere {
          background:
            radial-gradient(circle at 72% 18%, rgba(127, 215, 181, 0.12), transparent 30%),
            linear-gradient(135deg, #10231f 0%, #17342d 58%, #10231f 100%);
        }
        .generation-grid {
          background-image:
            linear-gradient(rgba(246, 240, 223, 0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(246, 240, 223, 0.055) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: linear-gradient(to right, black, transparent 85%);
        }
        .generation-glow {
          position: absolute;
          width: 220px;
          height: 220px;
          border-radius: 999px;
          filter: blur(70px);
          opacity: 0.16;
        }
        .generation-glow-a {
          right: -50px;
          top: -90px;
          background: #7fd7b5;
        }
        .generation-glow-b {
          bottom: -130px;
          left: 30%;
          background: #d8b66b;
        }
        .generation-orbit-ring {
          position: absolute;
          inset: 10px;
          border: 1px dashed rgba(216, 182, 107, 0.28);
          border-radius: 999px;
        }
        .generation-orbit-ring-a {
          animation: generation-spin 18s linear infinite;
        }
        .generation-orbit-ring-b {
          inset: 25px;
          border-style: solid;
          border-color: rgba(127, 215, 181, 0.14);
          animation: generation-spin 13s linear infinite reverse;
        }
        .generation-node {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #d8b66b;
          box-shadow: 0 0 18px rgba(216, 182, 107, 0.7);
        }
        .generation-node-a { left: 18px; top: 83px; }
        .generation-node-b { right: 33px; top: 37px; background: #7fd7b5; }
        .generation-node-c { bottom: 27px; right: 48px; width: 5px; height: 5px; }
        .generation-progress-ring,
        .generation-progress-bar {
          transition: stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1),
            width 700ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .generation-progress-bar {
          position: relative;
          overflow: hidden;
          background: linear-gradient(90deg, #b38b3d, #e5cb88 56%, #7fd7b5);
        }
        .generation-progress-bar::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent);
          animation: generation-sheen 2.4s ease-in-out infinite;
        }
        .generation-progress-bar-error {
          background: #f29a83;
        }
        .generation-heartbeat,
        .generation-active-step {
          animation: generation-pulse 1.8s ease-in-out infinite;
        }
        @keyframes generation-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes generation-sheen {
          60%, 100% { transform: translateX(120%); }
        }
        @keyframes generation-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(127, 215, 181, .25); }
          50% { box-shadow: 0 0 0 7px rgba(127, 215, 181, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .generation-orbit-ring,
          .generation-progress-bar::after,
          .generation-heartbeat,
          .generation-active-step {
            animation: none;
          }
          .generation-progress-ring,
          .generation-progress-bar {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
