"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, ExternalLink, Library, Search, Send } from "lucide-react";
import type { AiCompanionId } from "@/lib/ai-companions";
import type { Course } from "@/lib/session/types";

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

export function StudioResourceLibrary({
  course,
  stageKey,
  disabled,
  onAsk,
}: {
  course: Course;
  stageKey: string;
  disabled: boolean;
  onAsk: (text: string, companionIds?: AiCompanionId[]) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<SearchSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const courseResources = useMemo(() => course.resources ?? [], [course.resources]);

  async function searchResources() {
    const clean = query.trim();
    if (!clean || searching) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSearching(true);
    setError(null);
    try {
      const response = await fetch("/api/openmaic/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: clean }),
        signal: controller.signal,
      });
      const data = await response.json() as SearchResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error || `检索失败 (${response.status})`);
      }
      setAnswer(data.answer?.trim() ?? "");
      setSources((data.sources ?? []).filter((item) => item.title && item.url).slice(0, 8));
    } catch (searchError) {
      if (searchError instanceof DOMException && searchError.name === "AbortError") return;
      setError(searchError instanceof Error ? searchError.message : "资料检索失败，请稍后重试");
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
          <span><Library size={14} /> 资料角</span>
          <h2>先找到来源，再让 AI 帮你判断</h2>
          <p>检索结果不是结论。打开原文核对作者、日期、方法和适用范围后，再用于方案或测试。</p>
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
          {searching ? "检索中…" : "查资料"}
        </button>
      </form>

      {error ? <p className="studio-library-error" role="alert">{error}</p> : null}

      <section className="studio-library-section">
        <header><BookOpen size={16} /><strong>教师提供的课程资料</strong><span>{courseResources.length}</span></header>
        {courseResources.length ? (
          <div className="studio-library-course-list">
            {courseResources.map((resource) => (
              <article key={resource.id}>
                <div><strong>{resource.title}</strong><p>{resource.description || `${resource.type} · ${resource.size}`}</p></div>
                {resource.url ? <a aria-label={`打开 ${resource.title}`} href={resource.url} rel="noreferrer" target="_blank"><ExternalLink size={15} /></a> : null}
              </article>
            ))}
          </div>
        ) : <p className="studio-library-empty">当前课程还没有教师资料，可以使用上方检索。</p>}
      </section>

      {answer || sources.length ? (
        <section className="studio-library-section studio-library-results" aria-live="polite">
          <header><Search size={16} /><strong>检索线索</strong><span>{sources.length}</span></header>
          {answer ? <p className="studio-library-answer">{answer}</p> : null}
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
          {["这个方案涉及哪些关键概念？", "怎样判断我的测试方法是否可靠？", "这个事实可以从哪些来源交叉核对？"].map((prompt) => (
            <button key={prompt} onClick={() => setQuery(prompt)} type="button">{prompt}<ArrowUpRight size={13} /></button>
          ))}
        </div>
      )}
    </div>
  );
}
