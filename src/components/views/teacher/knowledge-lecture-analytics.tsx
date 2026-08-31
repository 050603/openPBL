"use client";

import { BarChart3, BookOpenCheck, CircleAlert, Users } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import { aggregateKnowledgePointMastery, latestKnowledgeLectureAttempts } from "@/lib/knowledge-lecture";
import type { Course, StudentAiProgress } from "@/lib/session/types";
import { cn } from "@/lib/utils";

export function KnowledgeLectureAnalytics({
  course,
  progressOverride,
  studentCountOverride,
  title = "节末小测实时学情",
}: {
  course: Course;
  progressOverride?: Record<string, StudentAiProgress>;
  studentCountOverride?: number;
  title?: string;
}) {
  const progress = progressOverride ?? course.aiLearningProgress ?? {};
  const studentCount = studentCountOverride ?? course.students.length;
  const sections = course.content.knowledgeLectureSections ?? [];
  const rows = aggregateKnowledgePointMastery(course, progress);
  const answeredStudentIds = Object.entries(progress).flatMap(([studentId, entry]) =>
    latestKnowledgeLectureAttempts(entry).length ? [studentId] : [],
  );
  const attempts = Object.values(progress).flatMap(latestKnowledgeLectureAttempts);
  const averageScore = attempts.length
    ? Math.round(attempts.reduce((sum, attempt) =>
        sum + (attempt.maxScore > 0 ? attempt.score / attempt.maxScore : 0), 0,
      ) / attempts.length * 100)
    : 0;

  return (
    <Card className="overflow-hidden p-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 bg-[linear-gradient(120deg,#effcff,#fff_48%,#f5f3ff)] px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-[10px] bg-cyan-950 text-white"><BarChart3 size={17} /></span>
            <div><h3 className="text-base font-black text-stone-950">{title}</h3><p className="mt-0.5 text-xs text-stone-500">按 AI 逐题得分归集到对应知识点，学生提交后实时更新</p></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-stone-700 ring-1 ring-stone-200"><Users size={13} />已作答 {new Set(answeredStudentIds).size}/{studentCount}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-cyan-800 ring-1 ring-cyan-100"><BookOpenCheck size={13} />班级均分 {attempts.length ? `${averageScore}分` : "—"}</span>
        </div>
      </header>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
        <section className="border-b border-stone-100 p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between gap-3"><h4 className="text-sm font-black text-stone-900">知识点错误率排名</h4><Pill tone={rows.some((row) => row.answeredStudents) ? "orange" : "gray"}>{rows.filter((row) => row.answeredStudents).length} 个有作答</Pill></div>
          <div className="space-y-3">
            {rows.filter((row) => row.answeredStudents).map((row, index) => (
              <article className="grid grid-cols-[28px_minmax(0,1fr)_52px] items-center gap-2" key={row.knowledgePointId}>
                <span className={cn("grid size-7 place-items-center rounded-full text-xs font-black", index < 3 && row.errorRate > 0 ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-500")}>{index + 1}</span>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2"><strong className="truncate text-xs text-stone-800">{row.name}</strong><span className="shrink-0 text-[10px] text-stone-400">{row.incorrectStudents}/{row.answeredStudents} 人未达 80%</span></div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100"><div className={cn("h-full rounded-full", row.errorRate >= 50 ? "bg-rose-500" : row.errorRate >= 25 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${row.errorRate}%` }} /></div>
                </div>
                <strong className={cn("text-right text-sm tabular-nums", row.errorRate >= 50 ? "text-rose-700" : row.errorRate >= 25 ? "text-amber-700" : "text-emerald-700")}>{row.errorRate}%</strong>
              </article>
            ))}
            {!rows.some((row) => row.answeredStudents) ? <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-stone-200 bg-stone-50 text-center text-sm text-stone-500"><span><CircleAlert className="mx-auto mb-2 text-stone-300" size={23} />等待学生完成第一节小测</span></div> : null}
          </div>
        </section>

        <section className="p-4">
          <h4 className="mb-3 text-sm font-black text-stone-900">各小节作答进度</h4>
          <div className="space-y-2.5">
            {sections.map((section) => {
              const sectionAttempts = Object.values(progress).flatMap((entry) =>
                latestKnowledgeLectureAttempts(entry).filter((attempt) => attempt.sectionId === section.id),
              );
              const average = sectionAttempts.length
                ? Math.round(sectionAttempts.reduce((sum, attempt) => sum + (attempt.maxScore > 0 ? attempt.score / attempt.maxScore : 0), 0) / sectionAttempts.length * 100)
                : undefined;
              return (
                <article className="rounded-xl border border-stone-200 bg-stone-50/60 p-3" key={section.id}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-black text-stone-800">{section.title}</p><p className="mt-1 truncate text-[10px] text-stone-500">{section.knowledgePointIds.map((id) => course.content.knowledgePoints.find((point) => point.id === id)?.name ?? id).join(" · ")}</p></div><span className="shrink-0 text-xs font-black text-cyan-800">{average === undefined ? "待作答" : `${average}分`}</span></div>
                  <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-stone-500"><span>{sectionAttempts.length}/{studentCount} 人完成</span><span>2–3 题 · 约 2–5 分钟</span></div>
                </article>
              );
            })}
            {!sections.length ? <p className="rounded-xl border border-dashed border-stone-200 p-6 text-center text-xs text-stone-500">该课程仍使用旧版单次测验结构，重新生成知识讲授内容后可按小节查看。</p> : null}
          </div>
        </section>
      </div>
    </Card>
  );
}
