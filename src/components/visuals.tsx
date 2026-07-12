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
  Sparkles,
  Sprout,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";

/**
 * ProjectCoverImage — 课程封面图显示与生成。
 *
 * 行为：
 * - 若 course.coverImageUrl 已存在（教师备课阶段生成），直接显示，不重复生成。
 * - 若无缓存图，显示渐变占位。教师端可通过 `allowGenerate` 开启生成按钮；
 *   学生端默认不生成（依赖教师备课阶段产出的封面图）。
 * - 生成调用 /api/openmaic/generate/image，结果写入 course.coverImageUrl。
 */
export function ProjectCoverImage({
  course,
  className,
  allowGenerate = false,
}: {
  course: Course;
  className?: string;
  /** 教师端设为 true 可显示生成/重新生成按钮 */
  allowGenerate?: boolean;
}) {
  const session = useSession();
  const [imageUrl, setImageUrl] = useState<string | null>(course.coverImageUrl ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const buildPrompt = useCallback(() => {
    const parts: string[] = [
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
      const res = await fetch("/api/openmaic/generate/image", {
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
      const result = data?.result;
      const url: string | null = result?.url ?? null;
      const base64: string | null = result?.base64 ?? null;
      const format: string = result?.format ?? "png";
      const finalUrl = url ?? (base64 ? `data:image/${format};base64,${base64}` : null);

      if (finalUrl) {
        setImageUrl(finalUrl);
        session.updateCourse(course.id, { coverImageUrl: finalUrl });
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

  // 已有图片：直接显示
  if (imageUrl) {
    return (
      <div className={cn("group relative overflow-hidden rounded-[8px]", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={course.name || "项目封面"}
          className="h-full w-full object-cover"
        />
        {allowGenerate ? (
          <button
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white opacity-0 transition hover:bg-black/60 group-hover:opacity-100"
            onClick={() => void generate()}
            title="重新生成封面"
            type="button"
          >
            <RefreshCw size={15} />
          </button>
        ) : null}
      </div>
    );
  }

  // 教师端加载中
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
          <span className="text-xs font-medium">正在生成课程封面…</span>
        </div>
      </div>
    );
  }

  // 教师端：未生成或生成失败，显示生成按钮
  if (allowGenerate) {
    return (
      <div
        className={cn(
          "group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-[8px] bg-gradient-to-br from-blue-50 via-slate-50 to-emerald-50",
          className,
        )}
        onClick={() => error ? void generate() : void generate()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") void generate(); }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(110deg,#a7f3d0_0%,#dcfce7_32%,#bfdbfe_33%,#e0f2fe_54%,#86efac_55%,#bbf7d0_100%)] opacity-40" />
        <div className="relative flex flex-col items-center gap-2 text-slate-600">
          {error ? <RefreshCw size={24} /> : <Sparkles size={24} />}
          <span className="text-xs font-semibold">
            {error ? "点击重新生成" : "生成课程封面图"}
          </span>
        </div>
      </div>
    );
  }

  // 学生端：无封面图时显示渐变占位（不自动生成，依赖教师备课阶段产出）
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[8px] bg-gradient-to-br from-blue-50 via-slate-50 to-emerald-50",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(110deg,#a7f3d0_0%,#dcfce7_32%,#bfdbfe_33%,#e0f2fe_54%,#86efac_55%,#bbf7d0_100%)] opacity-30" />
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
