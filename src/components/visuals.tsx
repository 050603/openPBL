"use client";

import {
  BarChart3,
  Bot,
  Check,
  FileText,
  Image as ImageIcon,
  Leaf,
  LineChart,
  Loader2,
  Play,
  Presentation,
  RefreshCw,
  Sprout,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";

/**
 * ProjectCoverImage — 基于课程信息调用系统图片生成 API 生成项目封面图。
 * - 优先使用 course.coverImageUrl（已生成的缓存）
 * - 若无缓存则自动调用 /api/generate/image 生成
 * - 生成失败时显示渐变占位，可点击刷新重试
 */
export function ProjectCoverImage({
  course,
  className,
}: {
  course: Course;
  className?: string;
}) {
  const session = useSession();
  const [imageUrl, setImageUrl] = useState<string | null>(course.coverImageUrl ?? null);
  const [loading, setLoading] = useState(!course.coverImageUrl);
  const [error, setError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const buildPrompt = useCallback(() => {
    const parts = [
      "A professional project illustration for an educational PBL course",
    ];
    if (course.name) parts.push(`titled "${course.name}"`);
    if (course.subject) parts.push(`subject: ${course.subject}`);
    if (course.drivingQuestion) parts.push(`theme: ${course.drivingQuestion.slice(0, 80)}`);
    parts.push("clean modern style, vibrant colors, educational atmosphere, 16:9 aspect ratio");
    return parts.join(", ");
  }, [course.name, course.subject, course.drivingQuestion]);

  const generate = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(false);

    try {
      const res = await fetch("/api/generate/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildPrompt(),
          aspectRatio: "16:9",
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        throw new Error(`Image generation failed: ${res.status}`);
      }

      const data = await res.json();
      const url = data?.result?.url ?? data?.result?.imageUrl ?? null;

      if (url) {
        setImageUrl(url);
        // 缓存到 session
        session.updateCourse(course.id, { coverImageUrl: url });
      } else {
        setError(true);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      console.warn("Cover image generation failed:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [buildPrompt, course.id, session]);

  useEffect(() => {
    if (!course.coverImageUrl && !error) {
      // The cover request is an external synchronization keyed by course id.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void generate();
    }
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id]);

  // 已有图片
  if (imageUrl) {
    return (
      <div className={cn("relative overflow-hidden rounded-[8px]", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={course.name || "项目封面"}
          className="h-full w-full object-cover"
        />
        <button
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/40 text-white opacity-0 transition hover:bg-black/60 group-hover:opacity-100"
          onClick={() => { setImageUrl(null); void generate(); }}
          title="重新生成封面"
          type="button"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    );
  }

  // 加载中
  if (loading) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-[8px] bg-gradient-to-br from-blue-50 via-slate-50 to-emerald-50",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <Loader2 size={28} className="animate-spin" />
          <span className="text-xs font-medium">正在生成项目封面…</span>
        </div>
      </div>
    );
  }

  // 失败：显示占位
  return (
    <div
      className={cn(
        "group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-[8px] bg-gradient-to-br from-blue-50 via-slate-50 to-emerald-50",
        className,
      )}
      onClick={() => void generate()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") void generate(); }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(110deg,#a7f3d0_0%,#dcfce7_32%,#bfdbfe_33%,#e0f2fe_54%,#86efac_55%,#bbf7d0_100%)] opacity-40" />
      <div className="relative flex flex-col items-center gap-2 text-slate-500">
        <RefreshCw size={24} />
        <span className="text-xs font-medium">点击生成项目封面</span>
      </div>
    </div>
  );
}

/** @deprecated 使用 ProjectCoverImage 替代 */
export function CampusPhoto({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[8px] bg-emerald-100",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(110deg,#a7f3d0_0%,#dcfce7_32%,#bfdbfe_33%,#e0f2fe_54%,#86efac_55%,#bbf7d0_100%)]" />
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-emerald-900/25 to-transparent" />
      <div className="absolute left-10 top-7 h-24 w-44 rounded-t-[5px] bg-white/70 shadow-lg">
        <div className="grid h-full grid-cols-5 gap-1 p-3">
          {Array.from({ length: 15 }).map((_, index) => (
            <span className="rounded-sm bg-sky-200/80" key={index} />
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-[linear-gradient(12deg,#d9f99d_0_34%,#f8fafc_35%_48%,#86efac_49%_100%)]" />
      <div className="absolute bottom-6 right-16 flex gap-2">
        {["#2563eb", "#16a34a", "#64748b", "#ef4444"].map((color) => (
          <span
            className="grid h-16 w-12 place-items-center rounded-t-[4px] text-white shadow-md"
            key={color}
            style={{ backgroundColor: color }}
          >
            <Leaf size={18} />
          </span>
        ))}
      </div>
      <div className="absolute left-6 top-0 h-full w-10 bg-[linear-gradient(90deg,transparent_0_45%,#14532d_46%_54%,transparent_55%)]">
        <span className="absolute -left-10 top-3 h-16 w-24 rounded-full bg-emerald-700/55" />
        <span className="absolute -left-7 top-20 h-14 w-20 rounded-full bg-emerald-600/50" />
      </div>
    </div>
  );
}

export function AnalysisThumbnail({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-[8px] bg-slate-900", className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,#38bdf8_0_16%,transparent_17%),linear-gradient(140deg,#0f172a,#075985)]" />
      <div className="absolute bottom-5 left-6 h-16 w-24 rounded-[5px] border border-cyan-300/50 bg-slate-800/80 shadow-xl" />
      <div className="absolute right-5 top-7 h-28 w-36 rounded-[5px] border border-cyan-300/60 bg-cyan-950/80 p-3">
        <div className="mb-3 h-4 w-20 rounded bg-cyan-300/60" />
        <div className="flex h-16 items-end gap-2">
          {[28, 54, 40, 74, 62].map((height) => (
            <span className="w-4 rounded-t bg-cyan-300" key={height} style={{ height }} />
          ))}
        </div>
      </div>
      <LineChart className="absolute left-7 top-7 text-cyan-200" size={42} />
    </div>
  );
}

export function SlidePreview({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[8px] border border-dashed border-slate-300 bg-slate-50 text-center",
        className,
      )}
    >
      <CampusPhoto className="h-[60%] w-[80%] rounded-[6px] opacity-50" />
      <div className="px-6 pb-4">
        <p className="text-base font-bold text-slate-600">演示预览占位</p>
        <p className="mt-1 text-sm text-slate-500">
          上传 PPT 或视频后，将在此处显示真实预览。
        </p>
      </div>
    </div>
  );
}

export function EvidenceStrip() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_1fr_6rem]">
      <CampusPhoto className="h-32" />
      <div className="rounded-[8px] bg-[linear-gradient(135deg,#fef3c7,#fdba74)] p-4">
        <div className="grid h-full place-items-center rounded-[6px] border-2 border-dashed border-orange-200 bg-white/40">
          <ImageIcon className="text-orange-700" size={34} />
        </div>
      </div>
      <div className="rounded-[8px] bg-[linear-gradient(135deg,#dbeafe,#e0e7ff)] p-4">
        <div className="flex h-full items-center justify-center gap-2 rounded-[6px] bg-white/60">
          <Presentation className="text-blue-700" size={30} />
          <BarChart3 className="text-blue-700" size={30} />
        </div>
      </div>
      <div className="grid h-32 place-items-center rounded-[8px] border border-slate-200 bg-slate-50 text-2xl font-semibold text-slate-600">
        +3
      </div>
    </div>
  );
}

export function MindMap() {
  const nodes = [
    ["问题洞察", "left-[31%] top-[28%]", "border-blue-300 bg-blue-50 text-blue-700"],
    ["执行路径", "right-[19%] top-[31%]", "border-violet-300 bg-violet-50 text-violet-700"],
    ["核心策略", "left-[22%] bottom-[19%]", "border-amber-300 bg-amber-50 text-amber-700"],
    ["评估与优化", "right-[20%] bottom-[20%]", "border-emerald-300 bg-emerald-50 text-emerald-700"],
  ];

  return (
    <div className="relative h-[20rem] overflow-hidden rounded-[8px] border border-slate-200 bg-[radial-gradient(#dbeafe_1px,transparent_1px)] bg-[length:18px_18px]">
      <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-[8px] border border-emerald-300 bg-emerald-50 px-7 py-3 text-xl font-bold text-emerald-700 shadow-sm">
        校园低碳生活推广方案
      </div>
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <path d="M500 165 C410 110 360 100 290 95" fill="none" stroke="#60a5fa" strokeWidth="2" />
        <path d="M530 160 C610 105 660 105 725 112" fill="none" stroke="#a78bfa" strokeWidth="2" />
        <path d="M500 182 C390 240 330 244 255 255" fill="none" stroke="#f59e0b" strokeWidth="2" />
        <path d="M535 185 C620 248 670 244 745 255" fill="none" stroke="#34d399" strokeWidth="2" />
      </svg>
      {nodes.map(([label, position, classes]) => (
        <div
          className={cn("absolute rounded-[6px] border px-4 py-2 text-base font-bold shadow-sm", position, classes)}
          key={label}
        >
          {label}
        </div>
      ))}
      <MapLeaves labels={["能源浪费", "一次性用品多", "低碳意识不足"]} side="left" top="top-[16%]" />
      <MapLeaves labels={["线上宣传", "线下活动", "合作联动"]} side="right" top="top-[15%]" />
      <MapLeaves labels={["宣传教育", "行为激励", "数据可视化"]} side="left" top="bottom-[6%]" />
      <MapLeaves labels={["数据监测", "效果评估", "持续迭代"]} side="right" top="bottom-[6%]" />
      <ToolRail />
    </div>
  );
}

function MapLeaves({
  labels,
  side,
  top,
}: {
  labels: string[];
  side: "left" | "right";
  top: string;
}) {
  return (
    <div
      className={cn(
        "absolute flex flex-col gap-2",
        side === "left" ? "left-[13%]" : "right-[7%]",
        top,
      )}
    >
      {labels.map((label) => (
        <span className="rounded-[5px] border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm" key={label}>
          {label}
        </span>
      ))}
    </div>
  );
}

function ToolRail() {
  const icons = [Check, FileText, Play, Bot, Sprout];
  return (
    <div className="absolute left-4 top-16 grid gap-2 rounded-[8px] border border-slate-200 bg-white p-2 shadow-sm">
      {icons.map((Icon, index) => (
        <button className="grid h-8 w-8 place-items-center rounded-[5px] text-slate-700 hover:bg-blue-50" key={index} type="button">
          <Icon size={17} />
        </button>
      ))}
    </div>
  );
}
