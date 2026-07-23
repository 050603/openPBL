"use client";

import { useEffect, useState } from "react";

/* ============================================================
   AiGenerationOverlay — AI 生成全屏加载动画
   ------------------------------------------------------------
   当教师在备课界面触发 AI 生成（知识图谱、课程模块、教学大纲等）
   长时间任务时，展示全屏遮罩 + 摆锤加载动画 + 阶段提示，
   让教师直观感知 AI 正在思考什么。

   动画：摆锤左右摆动 + 渐变拖尾，简洁优雅。
   ============================================================ */

export type AiTaskKind =
  | "knowledgeGraph"
  | "teachingOutline"
  | "lessonOutline"
  | "evaluationPlan"
  | "sceneOutlines"
  | "generic";

type Stage = {
  label: string;
  /** 该阶段大致持续秒数（用于滚动节奏，非精确计时） */
  weight: number;
};

const TASK_STAGES: Record<AiTaskKind, { title: string; stages: Stage[] }> = {
  knowledgeGraph: {
    title: "生成知识图谱",
    stages: [
      { label: "解析课程主题与学习目标", weight: 3 },
      { label: "提取核心知识点与关联关系", weight: 4 },
      { label: "构建知识图谱节点与边", weight: 3 },
      { label: "校验知识层级与覆盖度", weight: 2 },
    ],
  },
  teachingOutline: {
    title: "生成 PBL 项目主线与课程模块",
    stages: [
      { label: "解析时间分配与阶段约束", weight: 3 },
      { label: "构建 PBL 项目主线", weight: 4 },
      { label: "生成六个课程模块", weight: 5 },
      { label: "校验模块结构与时间一致性", weight: 3 },
    ],
  },
  lessonOutline: {
    title: "生成课程资源大纲",
    stages: [
      { label: "解析课程模块与知识点对齐", weight: 3 },
      { label: "生成 AI 授知与教师授课资源", weight: 5 },
      { label: "关联知识点与课程模块", weight: 3 },
      { label: "校验资源覆盖度", weight: 2 },
    ],
  },
  evaluationPlan: {
    title: "生成评价方案",
    stages: [
      { label: "解析课程目标与 PBL 阶段", weight: 3 },
      { label: "生成评价维度与权重", weight: 4 },
      { label: "分配 AI 与教师评价职责", weight: 2 },
      { label: "校验权重合计", weight: 1 },
    ],
  },
  sceneOutlines: {
    title: "生成授课场景大纲",
    stages: [
      { label: "解析课程模块与教师人设", weight: 3 },
      { label: "生成场景互动与 Agent 对话", weight: 5 },
      { label: "关联知识点与互动组件", weight: 3 },
      { label: "校验场景覆盖度", weight: 2 },
    ],
  },
  generic: {
    title: "AI 思考中",
    stages: [
      { label: "解析输入上下文", weight: 3 },
      { label: "调用大语言模型", weight: 5 },
      { label: "校验输出结构", weight: 2 },
    ],
  },
};

type Props = {
  /** 当前任务类型；传 null/false 时关闭遮罩 */
  kind: AiTaskKind | null;
  /** 可选的自定义提示语，覆盖默认的阶段滚动 */
  hint?: string;
};

export function AiGenerationOverlay({ kind, hint }: Props) {
  const visible = kind !== null;
  const config = kind ? TASK_STAGES[kind] : TASK_STAGES.generic;
  const [elapsed, setElapsed] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);

  // 计时器：每 100ms 更新已用时间
  useEffect(() => {
    if (!visible) {
      setElapsed(0);
      setStageIndex(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Date.now() - start);
    }, 100);
    return () => clearInterval(timer);
  }, [visible]);

  // 阶段滚动：根据已用时间占总权重时间的比例推进
  const totalWeight = config.stages.reduce((sum, s) => sum + s.weight, 0);
  useEffect(() => {
    if (!visible) return;
    // 假设每个 weight 单位 ≈ 4 秒，总时长 ≈ totalWeight * 4 秒
    const totalSeconds = totalWeight * 4;
    const elapsedSeconds = elapsed / 1000;
    const ratio = Math.min(0.95, elapsedSeconds / totalSeconds);
    const targetIndex = Math.min(
      config.stages.length - 1,
      Math.floor(ratio * config.stages.length),
    );
    setStageIndex(targetIndex);
  }, [elapsed, visible, totalWeight, config.stages.length]);

  if (!visible) return null;

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min > 0 ? `${min}:${sec.toString().padStart(2, "0")}` : `${sec}s`;
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`AI 正在${config.title}`}
    >
      {/* 毛玻璃遮罩 */}
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-md" />

      {/* 中央卡片 */}
      <div className="ai-card relative z-10 w-[420px] max-w-[90vw] overflow-hidden rounded-[var(--radius-xl)] border border-white/20 bg-white/95 shadow-[0_24px_64px_rgba(0,0,0,0.25)]">
        {/* 顶部渐变光带 */}
        <div className="ai-overlay-glow h-1 w-full" />

        <div className="px-8 py-7">
          {/* 摆锤加载动画 */}
          <div className="mb-5 flex justify-center">
            <PendulumLoader />
          </div>

          {/* 标题 */}
          <div className="mb-1 text-center">
            <h3 className="text-[17px] font-bold text-[var(--pbl-ink)]">
              AI 正在{config.title}
            </h3>
          </div>

          {/* 已用时间 */}
          <div className="mb-5 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-[12px] font-medium tabular-nums text-stone-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--pbl-teacher)]" />
              已用 {formatTime(elapsed)}
            </span>
          </div>

          {/* 阶段进度 */}
          <div className="space-y-2">
            {config.stages.map((stage, i) => {
              const done = i < stageIndex;
              const active = i === stageIndex;
              const pending = i > stageIndex;
              return (
                <div
                  key={i}
                  className={[
                    "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] transition-all duration-300",
                    done && "bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]",
                    active && "bg-stone-50 text-[var(--pbl-ink)]",
                    pending && "text-stone-400",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {done ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M2 7L5.5 10.5L12 3.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : active ? (
                      <span className="ai-stage-dot h-2 w-2 rounded-full bg-[var(--pbl-accent)]" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-stone-300" />
                    )}
                  </span>
                  <span className={done ? "font-medium" : active ? "font-semibold" : ""}>
                    {stage.label}
                  </span>
                  {active && (
                    <span className="ml-auto flex gap-0.5">
                      <span className="ai-bar-bounce h-3 w-0.5 rounded-full bg-[var(--pbl-teacher)] opacity-40" style={{ animationDelay: "0ms" }} />
                      <span className="ai-bar-bounce h-3 w-0.5 rounded-full bg-[var(--pbl-teacher)] opacity-40" style={{ animationDelay: "150ms" }} />
                      <span className="ai-bar-bounce h-3 w-0.5 rounded-full bg-[var(--pbl-teacher)] opacity-40" style={{ animationDelay: "300ms" }} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 自定义提示语 */}
          {hint && (
            <p className="mt-4 border-t border-stone-100 pt-3 text-center text-[12px] leading-relaxed text-stone-500">
              {hint}
            </p>
          )}

          {/* 底部进度条 */}
          <div className="mt-5">
            <div className="h-1 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className="ai-progress-fill h-full rounded-full"
                style={{
                  width: `${((stageIndex + 1) / config.stages.length) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 内联样式：卡片级动画与渐变 */}
      <style jsx>{`
        .ai-overlay-glow {
          background: linear-gradient(
            90deg,
            transparent 0%,
            var(--pbl-teacher) 25%,
            var(--pbl-ai) 50%,
            var(--pbl-teacher) 75%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: ai-glow-sweep 2.4s linear infinite;
        }
        @keyframes ai-glow-sweep {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .ai-card::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 100%;
          pointer-events: none;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(109, 40, 217, 0.06) 45%,
            rgba(29, 78, 216, 0.10) 50%,
            rgba(109, 40, 217, 0.06) 55%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: ai-card-sweep 3.6s linear infinite;
        }
        @keyframes ai-card-sweep {
          0% { background-position: -100% 0; }
          100% { background-position: 200% 0; }
        }
        .ai-stage-dot {
          animation: ai-stage-pulse 1.2s ease-in-out infinite;
        }
        @keyframes ai-stage-pulse {
          0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(194, 65, 12, 0.45); }
          50% { transform: scale(1.4); opacity: 0.7; box-shadow: 0 0 0 4px rgba(194, 65, 12, 0); }
        }
        .ai-bar-bounce {
          animation: ai-bar-bounce 0.9s ease-in-out infinite;
        }
        @keyframes ai-bar-bounce {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1); }
        }
        .ai-progress-fill {
          background: linear-gradient(90deg, var(--pbl-teacher), var(--pbl-ai));
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          animation: ai-progress-shimmer 1.8s linear infinite;
          background-size: 200% 100%;
          position: relative;
        }
        .ai-progress-fill::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.55) 50%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: ai-progress-shimmer 1.8s linear infinite;
        }
        @keyframes ai-progress-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

/* ============================================================
   PendulumLoader — 摆锤加载动画
   ------------------------------------------------------------
   摆杆从顶部固定点向下垂，末端圆球左右摆动，
   带有渐变拖尾和柔和阴影，简洁优雅。
   摆动使用 cubic-bezier 缓动模拟真实物理钟摆。
   ============================================================ */

function PendulumLoader() {
  return (
    <div className="pendulum-stage">
      {/* 顶部固定支点 */}
      <div className="pendulum-pivot" />

      {/* 摆杆 + 摆球 */}
      <div className="pendulum-arm">
        <div className="pendulum-rod" />
        <div className="pendulum-ball" />
      </div>

      {/* 摆球运动轨迹（淡弧线） */}
      <svg className="pendulum-trail" width="120" height="80" viewBox="0 0 120 80" fill="none">
        <path
          d="M 20 10 Q 60 70 100 10"
          stroke="var(--pbl-teacher)"
          strokeWidth="1"
          strokeDasharray="3 4"
          strokeLinecap="round"
          opacity="0.2"
        />
      </svg>

      <style jsx>{`
        .pendulum-stage {
          position: relative;
          width: 120px;
          height: 90px;
          display: flex;
          justify-content: center;
        }
        .pendulum-pivot {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--pbl-ink);
          z-index: 3;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }
        .pendulum-arm {
          position: absolute;
          top: 5px;
          left: 50%;
          transform-origin: top center;
          animation: pendulum-swing 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite alternate;
          z-index: 2;
        }
        .pendulum-rod {
          width: 2px;
          height: 60px;
          margin-left: -1px;
          background: linear-gradient(
            to bottom,
            var(--pbl-ink) 0%,
            var(--pbl-teacher) 100%
          );
          border-radius: 1px;
        }
        .pendulum-ball {
          position: absolute;
          bottom: -14px;
          left: 50%;
          transform: translateX(-50%);
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--pbl-teacher) 0%, var(--pbl-ai) 100%);
          box-shadow:
            0 2px 8px rgba(29, 78, 216, 0.35),
            0 0 12px rgba(109, 40, 217, 0.25),
            inset 0 1px 2px rgba(255, 255, 255, 0.4);
        }
        .pendulum-trail {
          position: absolute;
          top: 5px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1;
          opacity: 0.6;
        }
        @keyframes pendulum-swing {
          0% {
            transform: rotate(-32deg);
          }
          100% {
            transform: rotate(32deg);
          }
        }
      `}</style>
    </div>
  );
}
