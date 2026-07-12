"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Clock3,
  Library,
  Plus,
  Search,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CourseCard } from "@/components/course-card";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  PageState,
} from "@/components/ui";
import { detectInterventionSignals } from "@/lib/classroom/stage-gates";
import { useHydrated, useSession } from "@/lib/session/store";
import type { Course } from "@/lib/session/types";

type Filter = "all" | "preparing" | "ready" | "teaching" | "finished";
type Tab = "courses" | "todo";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "全部课程" },
  { key: "preparing", label: "备课中" },
  { key: "ready", label: "待开课" },
  { key: "teaching", label: "授课中" },
  { key: "finished", label: "已结束" },
];

function isPreparing(course: Course) {
  return course.status === "draft" || course.status === "preparing";
}
function matches(course: Course, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "preparing") return isPreparing(course);
  return course.status === filter;
}

export default function TeacherHomePage() {
  const session = useSession();
  const hydrated = useHydrated();
  const [tab, setTab] = useState<Tab>("courses");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [nameOpen, setNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(session.user.name);

  const sorted = useMemo(
    () => [...session.courses].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [session.courses],
  );
  const courses = useMemo(
    () =>
      sorted.filter(
        (course) =>
          matches(course, filter) &&
          (!query.trim() ||
            `${course.name}${course.subject}${course.grade}`
              .toLowerCase()
              .includes(query.trim().toLowerCase())),
      ),
    [sorted, filter, query],
  );

  // 待办事项数据
  const active = sorted.filter((course) => course.status === "teaching");
  const unfinished = sorted.filter(isPreparing);
  const attention = active
    .flatMap((course) =>
      detectInterventionSignals(course).map((signal) => ({ course, signal })),
    )
    .slice(0, 8);
  const todoCount = unfinished.length + active.length + attention.length;

  return (
    <DashboardShell
      currentTask="处理当前课堂与备课任务"
      leadRole="教师"
      role="teacher"
      userName={session.user.name}
      variant="bare"
    >
      <div className="py-7">
        {/* 精简头部 */}
        <header className="flex flex-col gap-5 border-b border-[var(--pbl-border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-editorial text-3xl font-semibold md:text-4xl">
              {session.user.name}
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--pbl-text-muted)]">
              管理课程、备课与课堂
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pbl-text-muted)]"
                size={16}
              />
              <Input
                aria-label="搜索课程"
                className="pl-9 sm:w-60"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索课程、学科或年级"
                value={query}
              />
            </label>
            <Link
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--pbl-teacher-hover)]"
              href="/teacher/prepare/new"
            >
              <Plus size={17} />创建项目
            </Link>
          </div>
        </header>

        {/* 标签页导航 */}
        <nav className="mt-6 flex gap-1 border-b border-[var(--pbl-border)]">
          <TabButton active={tab === "courses"} onClick={() => setTab("courses")}>
            我的课程
          </TabButton>
          <TabButton active={tab === "todo"} onClick={() => setTab("todo")}>
            待办
            {todoCount > 0 ? (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--pbl-danger-soft)] px-1.5 text-xs font-bold text-[var(--pbl-danger)]">
                {todoCount}
              </span>
            ) : null}
          </TabButton>
          <Link
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 px-3 text-sm font-semibold text-[var(--pbl-text-muted)] transition hover:text-[var(--pbl-teacher)]"
            href="/teacher/prepare/new"
          >
            <Library size={16} /> 课程库
          </Link>
        </nav>

        {/* 我的课程标签页 */}
        {tab === "courses" ? (
          <div className="pt-6">
            <nav aria-label="课程筛选" className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--pbl-border)]">
              {FILTERS.map((item) => (
                <button
                  aria-current={filter === item.key ? "page" : undefined}
                  className={`min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition ${
                    filter === item.key
                      ? "border-[var(--pbl-teacher)] text-[var(--pbl-teacher)]"
                      : "border-transparent text-[var(--pbl-text-muted)] hover:text-[var(--pbl-text)]"
                  }`}
                  key={item.key}
                  onClick={() => setFilter(item.key)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </nav>
            {!hydrated ? (
              <PageState description="正在读取课程档案。" title="加载课程" />
            ) : courses.length ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {courses.map((course) => (
                  <CourseCard course={course} key={course.id} />
                ))}
              </div>
            ) : (
              <PageState
                action={
                  <Link
                    className="inline-flex min-h-11 items-center rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--pbl-teacher-hover)]"
                    href="/teacher/prepare/new"
                  >
                    创建第一个项目
                  </Link>
                }
                description="可以调整筛选条件，或从一个真实问题开始创建课程。"
                title="这里还没有匹配的课程"
              />
            )}
          </div>
        ) : null}

        {/* 待办标签页 */}
        {tab === "todo" ? (
          <div className="space-y-8 pt-6">
            {/* 正在进行的课堂 */}
            {active.length ? (
              <section>
                <SectionHeader
                  title="正在进行的课堂"
                  description="优先返回当前阶段，继续课堂组织与介入。"
                  count={active.length}
                />
                <div className="grid gap-4 lg:grid-cols-2">
                  {active.map((course) => (
                    <CurrentClass course={course} key={course.id} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* 未完成的备课 */}
            {unfinished.length ? (
              <section>
                <SectionHeader
                  title="未完成的备课"
                  description="从上次确认的位置继续，不需要重新开始。"
                  count={unfinished.length}
                />
                <div className="divide-y divide-[var(--pbl-border)] rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] shadow-[var(--shadow-soft)]">
                  {unfinished.map((course) => (
                    <WorkRow course={course} key={course.id} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* 需要教师关注 */}
            {attention.length ? (
              <section>
                <SectionHeader
                  title="需要教师关注"
                  description="出现需要教师决策或价值判断的问题时，AI 建议会在这里突出。"
                  count={attention.length}
                />
                <div className="divide-y divide-[var(--pbl-border)] rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] shadow-[var(--shadow-soft)]">
                  {attention.map(({ course, signal }) => (
                    <Link
                      className="block p-4 transition hover:bg-[var(--pbl-surface-soft)]"
                      href={`/teacher/teach/${course.id}/classroom`}
                      key={`${course.id}-${signal.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <AlertCircle size={16} className="shrink-0 text-[var(--pbl-warning)]" />
                            <p className="font-semibold">{signal.title}</p>
                          </div>
                          <p className="mt-1 text-sm leading-6 text-[var(--pbl-text-muted)]">
                            {signal.whatHappened}
                          </p>
                          <p className="mt-2 text-sm">
                            <strong className="font-semibold">建议：</strong>
                            {signal.suggestedAction}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-[var(--pbl-warning)]">
                          {course.name}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {/* 空状态 */}
            {!active.length && !unfinished.length && !attention.length ? (
              <PageState
                description="当前没有待处理的课堂、备课或介入任务。"
                title="待办清单已清空"
              />
            ) : null}
          </div>
        ) : null}

        <footer className="mt-10 flex items-center justify-between border-t border-[var(--pbl-border)] pt-5 text-sm text-[var(--pbl-text-muted)]">
          <span>当前身份：{session.user.name}（教师）</span>
          <button
            className="min-h-11 font-semibold text-[var(--pbl-teacher)]"
            onClick={() => {
              setNameDraft(session.user.name);
              setNameOpen(true);
            }}
            type="button"
          >
            修改姓名
          </button>
        </footer>
      </div>
      <Dialog onOpenChange={setNameOpen} open={nameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改教师姓名</DialogTitle>
            <DialogDescription>姓名将显示在导学、介入和评价确认记录中。</DialogDescription>
          </DialogHeader>
          <FormField label="显示姓名">
            {({ id }) => (
              <Input autoFocus id={id} onChange={(event) => setNameDraft(event.target.value)} value={nameDraft} />
            )}
          </FormField>
          <DialogFooter>
            <Button onClick={() => setNameOpen(false)} variant="secondary">取消</Button>
            <Button
              disabled={!nameDraft.trim()}
              onClick={() => {
                session.setUser({ role: "teacher", name: nameDraft.trim() });
                setNameOpen(false);
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-1.5 border-b-2 px-5 text-sm font-semibold transition ${
        active
          ? "border-[var(--pbl-teacher)] text-[var(--pbl-teacher)]"
          : "border-transparent text-[var(--pbl-text-muted)] hover:text-[var(--pbl-text)]"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function SectionHeader({
  description,
  title,
  count,
}: {
  description: string;
  title: string;
  count?: number;
}) {
  return (
    <header className="mb-4">
      <div className="flex items-center gap-2">
        <h2 className="font-editorial text-2xl font-semibold">{title}</h2>
        {count !== undefined ? (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--pbl-teacher-soft)] px-2 text-xs font-bold text-[var(--pbl-teacher)]">
            {count}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm leading-6 text-[var(--pbl-text-muted)]">{description}</p>
    </header>
  );
}

function CurrentClass({ course }: { course: Course }) {
  const stage = course.stages[course.currentStageIndex];
  return (
    <Link
      className="group flex min-h-36 flex-col justify-between border-l-2 border-[var(--pbl-teacher)] bg-[var(--pbl-surface)] p-5 shadow-[var(--shadow-soft)] transition hover:bg-[var(--pbl-surface-soft)] hover:shadow-[var(--shadow-raised)]"
      href={`/teacher/teach/${course.id}/classroom`}
    >
      <div>
        <p className="text-xs font-semibold text-[var(--pbl-teacher)]">
          {stage?.label ?? "课堂进行中"} · {course.students.length} 名学生
        </p>
        <h3 className="font-editorial mt-2 text-xl font-semibold">{course.name}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--pbl-text-muted)]">
          {course.drivingQuestion}
        </p>
      </div>
      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold">
        进入当前课堂 <ArrowRight className="transition-transform group-hover:translate-x-1" size={15} />
      </span>
    </Link>
  );
}

function WorkRow({ course }: { course: Course }) {
  return (
    <Link
      className="flex min-h-16 items-center gap-3 p-4 transition hover:bg-[var(--pbl-surface-soft)]"
      href={`/teacher/prepare/${course.id}/verify`}
    >
      <Clock3 className="shrink-0 text-[var(--pbl-text-muted)]" size={16} />
      <span className="min-w-0 flex-1">
        <strong className="block truncate font-semibold">{course.name}</strong>
        <span className="mt-1 block text-xs text-[var(--pbl-text-muted)]">
          {course.subject} · {course.grade} · 修改于 {new Date(course.updatedAt).toLocaleDateString("zh-CN")}
        </span>
      </span>
      <span className="text-sm font-semibold text-[var(--pbl-teacher)]">继续备课</span>
    </Link>
  );
}
