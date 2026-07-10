"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Clock3, Plus, Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CourseCard } from "@/components/course-card";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FormField, Input, PageState } from "@/components/ui";
import { detectInterventionSignals } from "@/lib/classroom/stage-gates";
import { useHydrated, useSession } from "@/lib/session/store";
import type { Course } from "@/lib/session/types";

type Filter = "all" | "preparing" | "ready" | "teaching" | "finished";
const FILTERS: Array<{ key: Filter; label: string }> = [{ key: "all", label: "全部课程" }, { key: "preparing", label: "备课中" }, { key: "ready", label: "待开课" }, { key: "teaching", label: "授课中" }, { key: "finished", label: "已结束" }];

function isPreparing(course: Course) { return course.status === "draft" || course.status === "preparing"; }
function matches(course: Course, filter: Filter) { return filter === "all" || filter === "preparing" ? filter === "all" || isPreparing(course) : course.status === filter; }

export default function TeacherHomePage() {
  const session = useSession();
  const hydrated = useHydrated();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [nameOpen, setNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(session.user.name);
  const sorted = useMemo(() => [...session.courses].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [session.courses]);
  const courses = useMemo(() => sorted.filter((course) => matches(course, filter) && (!query.trim() || `${course.name}${course.subject}${course.grade}`.toLowerCase().includes(query.trim().toLowerCase()))), [sorted, filter, query]);
  const active = sorted.filter((course) => course.status === "teaching");
  const unfinished = sorted.filter(isPreparing).slice(0, 3);
  const attention = active.flatMap((course) => detectInterventionSignals(course).map((signal) => ({ course, signal }))).slice(0, 6);

  return (
    <DashboardShell currentTask="处理当前课堂与备课任务" leadRole="教师" role="teacher" userName={session.user.name} variant="bare">
      <div className="py-7">
        <header className="flex flex-col gap-5 border-b border-[var(--pbl-border)] pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-sm font-semibold text-[var(--pbl-teacher)]">教师当前工作入口</p><h1 className="font-editorial mt-2 text-3xl font-semibold md:text-4xl">欢迎回来，{session.user.name}</h1><p className="mt-3 text-sm leading-6 text-[var(--pbl-text-muted)]">继续课堂、完成备课，或处理需要教师作出判断的问题。</p></div>
          <div className="flex flex-col gap-3 sm:flex-row"><label className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pbl-text-muted)]" size={16} /><Input aria-label="搜索课程" className="pl-9 sm:w-60" onChange={(event) => setQuery(event.target.value)} placeholder="搜索课程、学科或年级" value={query} /></label><Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] px-4 text-sm font-semibold text-white" href="/teacher/prepare/new"><Plus size={17} />创建项目</Link></div>
        </header>

        {active.length ? <section className="py-8"><SectionHeader title="正在进行的课堂" description="优先返回当前阶段，继续课堂组织与介入。" /><div className="grid gap-4 lg:grid-cols-2">{active.slice(0, 2).map((course) => <CurrentClass course={course} key={course.id} />)}</div></section> : null}

        <div className="grid gap-10 border-y border-[var(--pbl-border)] py-8 lg:grid-cols-2">
          <section><SectionHeader title="最近未完成的备课" description="从上次确认的位置继续，不需要重新开始。" />{unfinished.length ? <div className="divide-y divide-[var(--pbl-border)]">{unfinished.map((course) => <WorkRow course={course} key={course.id} />)}</div> : <p className="py-6 text-sm text-[var(--pbl-text-muted)]">当前没有未完成的备课任务。</p>}</section>
          <section><SectionHeader title="需要教师关注" description="只有出现需要教师决策或价值判断的问题时，AI 建议才会在这里突出。" />{attention.length ? <div className="divide-y divide-[var(--pbl-border)]">{attention.map(({ course, signal }) => <Link className="block py-4 hover:bg-[var(--pbl-surface-soft)]" href={`/teacher/teach/${course.id}/classroom`} key={`${course.id}-${signal.id}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{signal.title}</p><p className="mt-1 text-sm leading-6 text-[var(--pbl-text-muted)]">{signal.whatHappened}</p><p className="mt-2 text-sm"><strong className="font-semibold">建议：</strong>{signal.suggestedAction}</p></div><span className="shrink-0 text-xs text-[var(--pbl-warning)]">{course.name}</span></div></Link>)}</div> : <p className="py-6 text-sm text-[var(--pbl-text-muted)]">当前没有需要教师介入的问题。AI 将继续承担常规讲解、支架和过程记录。</p>}</section>
        </div>

        <section className="pt-9"><SectionHeader title="我的课程" description="课程作品集按最近修改时间排列。每门课程只显示一个明确的下一步动作。" /><nav aria-label="课程筛选" className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--pbl-border)]">{FILTERS.map((item) => <button aria-current={filter === item.key ? "page" : undefined} className={`min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-semibold ${filter === item.key ? "border-[var(--pbl-teacher)] text-[var(--pbl-teacher)]" : "border-transparent text-[var(--pbl-text-muted)]"}`} key={item.key} onClick={() => setFilter(item.key)} type="button">{item.label}</button>)}</nav>{!hydrated ? <PageState description="正在读取课程档案。" title="加载课程" /> : courses.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{courses.map((course) => <CourseCard course={course} key={course.id} />)}</div> : <PageState action={<Link className="inline-flex min-h-11 items-center rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] px-4 text-sm font-semibold text-white" href="/teacher/prepare/new">创建第一个项目</Link>} description="可以调整筛选条件，或从一个真实问题开始创建课程。" title="这里还没有匹配的课程" />}</section>

        <footer className="mt-10 flex items-center justify-between border-t border-[var(--pbl-border)] pt-5 text-sm text-[var(--pbl-text-muted)]"><span>当前身份：{session.user.name}（教师）</span><button className="min-h-11 font-semibold text-[var(--pbl-teacher)]" onClick={() => { setNameDraft(session.user.name); setNameOpen(true); }} type="button">修改姓名</button></footer>
      </div>
      <Dialog onOpenChange={setNameOpen} open={nameOpen}><DialogContent><DialogHeader><DialogTitle>修改教师姓名</DialogTitle><DialogDescription>姓名将显示在导学、介入和评价确认记录中。</DialogDescription></DialogHeader><FormField label="显示姓名">{({ id }) => <Input autoFocus id={id} onChange={(event) => setNameDraft(event.target.value)} value={nameDraft} />}</FormField><DialogFooter><Button onClick={() => setNameOpen(false)} variant="secondary">取消</Button><Button disabled={!nameDraft.trim()} onClick={() => { session.setUser({ role: "teacher", name: nameDraft.trim() }); setNameOpen(false); }}>保存</Button></DialogFooter></DialogContent></Dialog>
    </DashboardShell>
  );
}

function SectionHeader({ description, title }: { description: string; title: string }) { return <header className="mb-4"><h2 className="font-editorial text-2xl font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-[var(--pbl-text-muted)]">{description}</p></header>; }
function CurrentClass({ course }: { course: Course }) { const stage = course.stages[course.currentStageIndex]; return <Link className="group flex min-h-36 flex-col justify-between border-l-2 border-[var(--pbl-teacher)] bg-[var(--pbl-surface)] p-5" href={`/teacher/teach/${course.id}/classroom`}><div><p className="text-xs font-semibold text-[var(--pbl-teacher)]">{stage?.label ?? "课堂进行中"} · {course.students.length} 名学生</p><h3 className="font-editorial mt-2 text-xl font-semibold">{course.name}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--pbl-text-muted)]">{course.drivingQuestion}</p></div><span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold">进入当前课堂 <ArrowRight className="transition-transform group-hover:translate-x-1" size={15} /></span></Link>; }
function WorkRow({ course }: { course: Course }) { return <Link className="flex min-h-16 items-center gap-3 py-3 hover:bg-[var(--pbl-surface-soft)]" href={`/teacher/prepare/${course.id}/verify`}><Clock3 className="shrink-0 text-[var(--pbl-text-muted)]" size={16} /><span className="min-w-0 flex-1"><strong className="block truncate font-semibold">{course.name}</strong><span className="mt-1 block text-xs text-[var(--pbl-text-muted)]">{course.subject} · {course.grade} · 修改于 {new Date(course.updatedAt).toLocaleDateString("zh-CN")}</span></span><span className="text-sm font-semibold text-[var(--pbl-teacher)]">继续备课</span></Link>; }
