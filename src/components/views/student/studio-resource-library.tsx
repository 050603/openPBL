"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, Clock3, ExternalLink, Search, Send, Sparkles } from "lucide-react";
import { Streamdown } from "streamdown";
import type { AiCompanionId } from "@/lib/ai-companions";
import type { AdaptiveMicroLesson, Course } from "@/lib/session/types";
import { normalizePblCourseConfig } from "@/lib/pbl-course-config";
import { courseResourceTypeLabel } from "@/lib/user-facing-labels";

type SearchSource = {
  title: string;
  url: string;
  content: string;
  score: number;
};

type SearchResponse = {
  success: boolean;
  answer?: string;
  sources?: SearchSource[];
  query?: string;
  error?: string;
};

type ResourceHistoryEntry = {
  id: string;
  query: string;
  kind: "text" | "micro-lesson";
  answer: string;
  sources: SearchSource[];
  createdAt: string;
  lesson?: AdaptiveMicroLesson;
};

const RESOURCE_HISTORY_LIMIT = 30;

function readResourceHistory(storageKey: string): ResourceHistoryEntry[] {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return [];
    const parsed = JSON.parse(value) as ResourceHistoryEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, RESOURCE_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function StudioResourceLibrary({
  course,
  studentId,
  stageKey,
  disabled,
  onAsk,
  onRequestMicroLesson,
  microLessonTask,
  onOpenMicroLesson,
}: {
  course: Course;
  studentId: string;
  stageKey: string;
  disabled: boolean;
  onAsk: (text: string, companionIds?: AiCompanionId[]) => Promise<boolean>;
  onRequestMicroLesson?: (message: string) => Promise<boolean>;
  microLessonTask?: { lesson: AdaptiveMicroLesson } | null;
  onOpenMicroLesson?: (lesson: AdaptiveMicroLesson) => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<SearchSource[]>([]);
  const [lessonRequested, setLessonRequested] = useState(false);
  const [history, setHistory] = useState<ResourceHistoryEntry[]>([]);
  const [loadedHistoryKey, setLoadedHistoryKey] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const courseResources = useMemo(() => course.resources ?? [], [course.resources]);
  const availableMicroLessons = useMemo(() => {
    const lessons = course.aiLearningProgress?.[studentId]?.adaptiveLearning?.microLessons ?? [];
    const active = microLessonTask?.lesson;
    return active
      ? [active, ...lessons.filter((lesson) => lesson.id !== active.id)]
      : lessons;
  }, [course.aiLearningProgress, microLessonTask?.lesson, studentId]);
  const inquiryMode = normalizePblCourseConfig(course.pblConfig).resourceInquiryMode;
  const historyStorageKey = `openpbl:resource-history:v1:${course.id}:${studentId}:${stageKey}`;
  const starterPrompts = stageKey === "make"
    ? ["这个制作问题需要哪些知识？", "怎样判断我的测试方法是否可靠？", "有哪些材料或案例可以参考？"]
    : ["这个方案涉及哪些关键概念？", "怎样判断我的测试方法是否可靠？", "这个事实可以从哪些来源交叉核对？"];

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setHistory(readResourceHistory(historyStorageKey));
      setLoadedHistoryKey(historyStorageKey);
    });
    return () => { active = false; };
  }, [historyStorageKey]);

  useEffect(() => {
    if (loadedHistoryKey !== historyStorageKey) return;
    try {
      window.localStorage.setItem(historyStorageKey, JSON.stringify(history.slice(0, RESOURCE_HISTORY_LIMIT)));
    } catch {
      // Browsers can disable or exhaust local storage; the current result remains usable.
    }
  }, [history, historyStorageKey, loadedHistoryKey]);

  useEffect(() => {
    if (!availableMicroLessons.length) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setHistory((current) => {
        const lessonsById = new Map(availableMicroLessons.map((lesson) => [lesson.id, lesson]));
        const claimedLessonIds = new Set(current.flatMap((entry) => entry.lesson?.id ? [entry.lesson.id] : []));
        let changed = false;
        const next = current.map((entry) => {
          if (entry.kind !== "micro-lesson") return entry;
          let lesson = entry.lesson ? lessonsById.get(entry.lesson.id) : undefined;
          if (!lesson && !entry.lesson) {
            const entryTime = Date.parse(entry.createdAt);
            lesson = availableMicroLessons
              .filter((candidate) => candidate.stageKey === stageKey && !claimedLessonIds.has(candidate.id))
              .map((candidate) => ({ candidate, distance: Math.abs(Date.parse(candidate.createdAt) - entryTime) }))
              .filter(({ distance }) => Number.isFinite(distance) && distance <= 10 * 60 * 1000)
              .sort((a, b) => a.distance - b.distance)[0]?.candidate;
          }
          if (!lesson) return entry;
          claimedLessonIds.add(lesson.id);
          if (JSON.stringify(entry.lesson) === JSON.stringify(lesson)) return entry;
          changed = true;
          return { ...entry, lesson };
        });
        return changed ? next : current;
      });
    });
    return () => { active = false; };
  }, [availableMicroLessons, stageKey]);

  function addHistory(entry: Omit<ResourceHistoryEntry, "id" | "createdAt">) {
    setHistory((current) => [{
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    }, ...current].slice(0, RESOURCE_HISTORY_LIMIT));
  }

  async function searchResources() {
    const clean = query.trim();
    if (!clean || searching) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSearching(true);
    setError(null);
    setLessonRequested(false);
    try {
      if (!disabled && onRequestMicroLesson) {
        const launched = await onRequestMicroLesson(clean);
        if (launched) {
          setAnswer("");
          setSources([]);
          setLessonRequested(true);
          addHistory({
            query: clean,
            kind: "micro-lesson",
            answer: "知知已接收这个问题并开始制作即时微课。制作完成后，可在这条历史记录中直接打开。",
            sources: [],
          });
          return;
        }
      }

      const response = await fetch("/api/companion/resource-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id, stageKey, query: clean }),
        signal: controller.signal,
      });
      const data = await response.json() as SearchResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error || `检索失败 (${response.status})`);
      }
      const nextAnswer = data.answer?.trim() ?? "";
      const nextSources = (data.sources ?? []).filter((item) => item.title && item.url).slice(0, 8);
      setAnswer(nextAnswer);
      setSources(nextSources);
      addHistory({ query: clean, kind: "text", answer: nextAnswer, sources: nextSources });
    } catch (searchError) {
      if (searchError instanceof DOMException && searchError.name === "AbortError") return;
      setError(searchError instanceof Error ? searchError.message : "资料查询失败，请稍后重试");
    } finally {
      if (requestRef.current === controller) setSearching(false);
    }
  }

  async function askAboutSource(source: SearchSource) {
    await onAsk([
      `请核对这条资料与我当前${stageKey === "proposal" ? "方案" : "实践任务"}的关系。`,
      `资料标题：${source.title}`,
      `资料链接：${source.url}`,
      `资料摘要：${source.content.slice(0, 600)}`,
      stageKey === "proposal"
        ? "请先说明哪些信息可以作为证据、有哪些可信度或适用范围限制；确认有用后，把“标题 — 链接”追加到工作台的资料来源字段，不要改动其他字段。"
        : "请先说明哪些信息可以作为证据、有哪些可信度或适用范围限制；不要把网页摘要写成我的测试观察。",
    ].join("\n"), ["knowledge"]);
  }

  return (
    <div className="studio-library-workspace">
      <header className="studio-workspace-view-heading">
        <div>
          <p>{inquiryMode === "web-search" ? "搜索课程相关资料并查看来源。使用前请核对作者、日期、方法和适用范围。" : "查询课程相关概念与问题。涉及事实、数据和时效性信息时，请结合可靠来源核验。"}</p>
        </div>
      </header>

      <form
        className="studio-library-search"
        onSubmit={(event) => {
          event.preventDefault();
          void searchResources();
        }}
      >
        <Search size={18} />
        <input
          aria-label="检索资料"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入概念、事实问题或要验证的假设"
          value={query}
        />
        <button disabled={!query.trim() || searching} type="submit">
          {searching ? "查询中…" : "查资料"}
        </button>
      </form>

      {error ? <p className="studio-library-error" role="alert">{error}</p> : null}

      <section className="studio-library-section">
        <header><BookOpen size={16} /><strong>教师提供的课程资料</strong><span>{courseResources.length}</span></header>
        {courseResources.length ? (
          <div className="studio-library-course-list">
            {courseResources.map((resource) => (
              <article key={resource.id}>
                <div><strong>{resource.title}</strong><p>{resource.description || `${courseResourceTypeLabel(resource.type)} · ${resource.size}`}</p></div>
                {resource.url ? <a aria-label={`打开 ${resource.title}`} href={resource.url} rel="noreferrer" target="_blank"><ExternalLink size={15} /></a> : null}
              </article>
            ))}
          </div>
        ) : <p className="studio-library-empty">当前课程还没有教师资料，可以使用上方检索。</p>}
      </section>

      {lessonRequested ? (
        <section className="studio-library-section studio-library-lesson-notice" aria-live="polite">
          <Sparkles size={19} />
          <div>
            <strong>这个问题更适合用微课讲清楚</strong>
            <p>知知已经开始制作 2–3 分钟微课。你可以继续当前任务，完成后从页面右下角的微课任务卡进入学习。</p>
          </div>
        </section>
      ) : answer || sources.length ? (
        <section className="studio-library-section studio-library-results" aria-live="polite">
          <header><Search size={16} /><strong>查询结果</strong>{inquiryMode === "web-search" ? <span>{sources.length}</span> : null}</header>
          {answer ? <div className="studio-library-answer"><Streamdown>{answer}</Streamdown></div> : null}
          <div className="studio-library-result-list">
            {sources.map((source) => {
              let domain = source.url;
              try { domain = new URL(source.url).hostname.replace(/^www\./, ""); } catch { /* Keep the original URL. */ }
              return (
                <article key={source.url}>
                  <div className="studio-library-result-meta"><span>{domain}</span><small>相关度 {Math.round((source.score || 0) * 100)}%</small></div>
                  <h3>{source.title}</h3>
                  <p>{source.content}</p>
                  <footer>
                    <a href={source.url} rel="noreferrer" target="_blank">打开原文 <ArrowUpRight size={13} /></a>
                    <button disabled={disabled} onClick={() => void askAboutSource(source)} type="button">交给知知核对 <Send size={13} /></button>
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="studio-library-starters">
          {starterPrompts.map((prompt) => (
            <button key={prompt} onClick={() => setQuery(prompt)} type="button">{prompt}<ArrowUpRight size={13} /></button>
          ))}
        </div>
      )}

      {history.length ? (
        <section className="studio-library-section studio-library-history">
          <header><Clock3 size={16} /><strong>历史问答</strong><span>{history.length}</span></header>
          <div className="studio-library-history-list">
            {history.map((entry) => (
              <details
                key={entry.id}
                onToggle={(event) => {
                  if (event.currentTarget.open) setExpandedHistoryId(entry.id);
                  else if (expandedHistoryId === entry.id) setExpandedHistoryId(null);
                }}
              >
                <summary>
                  <span>{entry.kind === "micro-lesson" ? "即时微课" : "文字回答"}</span>
                  <strong>{entry.query}</strong>
                  <time>{new Date(entry.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                </summary>
                {expandedHistoryId === entry.id ? (
                  <>
                    <div className="studio-library-history-answer"><Streamdown>{entry.answer}</Streamdown></div>
                    {entry.sources.length ? (
                      <div className="studio-library-history-sources">
                        {entry.sources.map((source) => (
                          <a href={source.url} key={source.url} rel="noreferrer" target="_blank">
                            {source.title}<ExternalLink size={12} />
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {entry.kind === "micro-lesson" ? (
                      <div className="studio-library-history-lesson">
                        <span>
                          {entry.lesson?.status === "completed"
                            ? "已完成"
                            : entry.lesson?.status === "ready"
                              ? "可学习"
                              : entry.lesson?.status === "failed"
                                ? "制作失败"
                                : "制作中"}
                        </span>
                        <button
                          disabled={!onOpenMicroLesson || !entry.lesson?.classroomId || !["ready", "completed"].includes(entry.lesson.status)}
                          onClick={() => entry.lesson && onOpenMicroLesson?.(entry.lesson)}
                          type="button"
                        >
                          {entry.lesson?.status === "completed" ? "再次查看微课" : "打开这节微课"}
                          <ArrowUpRight size={13} />
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
