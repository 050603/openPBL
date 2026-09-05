"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, RefreshCw, Sparkles } from "lucide-react";
import { buildReflectionClassSummary } from "@/lib/teaching-ai/client-api";
import type { AiSupportRecord, Course } from "@/lib/session/types";
import {
  normalizeReflectionClassSummary,
  reflectionClassSummaryIsStale,
  reflectionSummaryAutoTrigger,
  reflectionSummaryCoverage,
  reflectionSummaryMinimumSampleSize,
  type ReflectionSummaryTrigger,
} from "@/lib/reflection-summary";
import { cn } from "@/lib/utils";

type Props = { course: Course };

function latestSummarySupport(course: Course): AiSupportRecord | undefined {
  return (course.aiSupports ?? [])
    .filter((support) => support.kind === "reflection-class-summary" && support.targetType === "course")
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}

export function ReflectionSummarySidebar({ course }: Props) {
  const storedSupport = useMemo(() => latestSummarySupport(course), [course]);
  const [localSupport, setLocalSupport] = useState<AiSupportRecord>();
  const [status, setStatus] = useState<"idle" | "generating" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>();
  const attemptedKey = useRef<string | undefined>(undefined);
  const support = useMemo(
    () => [localSupport, storedSupport]
      .filter((item): item is AiSupportRecord => Boolean(item))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0],
    [localSupport, storedSupport],
  );
  const summary = useMemo(
    () => normalizeReflectionClassSummary(support?.structuredPayload, new Set(course.students.map((student) => student.id))),
    [course.students, support?.structuredPayload],
  );
  const coverage = useMemo(() => reflectionSummaryCoverage(course), [course]);
  const minimumSampleSize = reflectionSummaryMinimumSampleSize(course.students.length);
  const stale = reflectionClassSummaryIsStale(summary, course);

  const refresh = useCallback(async (trigger: ReflectionSummaryTrigger) => {
    setStatus("generating");
    setErrorMessage(undefined);
    try {
      const nextSupport = await buildReflectionClassSummary(course.id, trigger);
      setLocalSupport(nextSupport);
      window.dispatchEvent(new CustomEvent("openpbl:reflection-summary-updated", { detail: { courseId: course.id, support: nextSupport } }));
      setStatus("idle");
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
      if (code === "INSUFFICIENT_REFLECTIONS") {
        setErrorMessage(undefined);
        setStatus("idle");
      } else {
        setErrorMessage(error instanceof Error ? error.message : "AI 课程总结生成失败，请稍后重试。");
        setStatus("error");
      }
    }
  }, [course.id]);

  useEffect(() => {
    if (coverage.responseCount < minimumSampleSize) return;
    const trigger = reflectionSummaryAutoTrigger(course, summary);
    if (!trigger) return;
    const key = `${course.id}:${trigger}:${coverage.coverageBucket}:${summary?.coverageBucket ?? 0}`;
    if (attemptedKey.current === key) return;
    attemptedKey.current = key;
    void refresh(trigger);
  }, [course, course.id, course.status, coverage.coverageBucket, coverage.responseCount, minimumSampleSize, refresh, stale, summary]);

  const statusText = status === "generating"
    ? "AI 课程总结生成中…"
    : errorMessage
      ? "生成失败，上一版内容仍保留"
      : !summary && coverage.responseCount < minimumSampleSize
        ? `达到 ${minimumSampleSize} 份有效反思后自动生成`
        : !summary
          ? "达到 20% 提交后自动生成"
          : stale
            ? "有新反思待更新，可手动刷新"
            : `基于 ${summary.responseCount} 份反思 · 第 ${summary.coverageBucket}% 档`;

  return (
    <section className="border-b border-stone-100 bg-white/70 px-4 py-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={cn("grid size-7 place-items-center rounded-lg", status === "error" ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700")}><Bot size={14} /></span>
          <div>
            <h3 className="text-[13px] font-black text-stone-900">AI 课程总结</h3>
            <p className="mt-0.5 text-[10px] font-semibold text-stone-400">{statusText}</p>
          </div>
        </div>
        <button
          aria-label="刷新 AI 课程总结"
          className="grid size-7 place-items-center rounded-lg border border-stone-200 text-stone-500 transition hover:border-violet-300 hover:text-violet-700 disabled:cursor-wait disabled:opacity-50"
          disabled={status === "generating" || coverage.responseCount < minimumSampleSize}
          onClick={() => void refresh(course.status === "finished" ? "course-finished" : "manual")}
          title="手动刷新"
          type="button"
        >
          <RefreshCw className={status === "generating" ? "animate-spin" : undefined} size={13} />
        </button>
      </header>

      {summary ? (
        <>
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-3 text-xs leading-5 text-violet-950">
            <div className="mb-1 flex items-center gap-1.5 font-bold"><Sparkles size={13} />{summary.courseSummary}</div>
            <p className="text-[10px] text-violet-700/80">覆盖 {summary.responseCount}/{summary.totalStudentCount} 人 · {new Date(summary.generatedAt).toLocaleString("zh-CN")}</p>
          </div>
          <div className="mt-3 space-y-2">
            {summary.teachingRecommendations.slice(0, 3).map((recommendation, index) => (
              <div className="flex gap-2 text-[11px] leading-5 text-stone-600" key={`${recommendation}-${index}`}>
                <span className="grid size-4 shrink-0 place-items-center rounded-full bg-violet-100 text-[9px] font-bold text-violet-700">{index + 1}</span>
                <span>{recommendation}</span>
              </div>
            ))}
          </div>
          {errorMessage ? <p className="mt-3 text-[11px] leading-5 text-amber-700">{errorMessage}</p> : null}
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/60 px-3 py-3 text-xs leading-5 text-stone-500">
          {errorMessage ?? "提交率达到档位并满足样本要求后，这里会自动生成全班课程总结与教学改进建议。"}
        </div>
      )}
    </section>
  );
}
