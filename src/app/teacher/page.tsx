"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ChevronRight,
  ClipboardList,
  Clock3,
  GraduationCap,
  Layers,
  Lightbulb,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { useSession, useHydrated } from "@/lib/session/store";
import type { Course, CourseStatus } from "@/lib/session/types";
import { COURSE_STATUS_LABEL } from "@/lib/session/types";
import { cn } from "@/lib/utils";

type Tab = "all" | "preparing" | "ready" | "teaching" | "finished";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "preparing", label: "备课中" },
  { key: "ready", label: "已发布" },
  { key: "teaching", label: "授课中" },
  { key: "finished", label: "已结束" },
];

function matchesTab(course: Course, tab: Tab): boolean {
  if (tab === "all") return true;
  if (tab === "preparing") return course.status === "draft" || course.status === "preparing";
  return course.status === tab;
}

function sortCourses(list: Course[]): Course[] {
  return [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

const STATUS_TONE: Record<CourseStatus, string> = {
  draft: "bg-slate-100 text-slate-600 ring-slate-200",
  preparing: "bg-amber-50 text-amber-700 ring-amber-200",
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  teaching: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  finished: "bg-slate-100 text-slate-500 ring-slate-200",
};

const STATUS_ACTION: Record<CourseStatus, { label: string; href: (c: Course) => string }> = {
  draft: { label: "继续备课", href: (c) => `/teacher/prepare/${c.id}/verify` },
  preparing: { label: "继续备课", href: (c) => `/teacher/prepare/${c.id}/verify` },
  ready: { label: "开始授课", href: (c) => `/teacher/teach-setup/${c.id}` },
  teaching: { label: "进入教室", href: (c) => `/teacher/teach-classroom/${c.id}` },
  finished: { label: "查看报告", href: (c) => `/teacher/prepare/${c.id}/preview` },
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

export default function TeacherHomePage() {
  const { courses, user, setUser, deleteCourse } = useSession();
  const hydrated = useHydrated();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const byTab = courses.filter((c) => matchesTab(c, tab));
    if (!query.trim()) return sortCourses(byTab);
    const q = query.trim().toLowerCase();
    return sortCourses(
      byTab.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.subject.toLowerCase().includes(q) ||
          c.grade.toLowerCase().includes(q),
      ),
    );
  }, [courses, tab, query]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = {
      all: courses.length,
      preparing: 0,
      ready: 0,
      teaching: 0,
      finished: 0,
    };
    courses.forEach((course) => {
      if (course.status === "draft" || course.status === "preparing") c.preparing++;
      else if (course.status === "ready") c.ready++;
      else if (course.status === "teaching") c.teaching++;
      else if (course.status === "finished") c.finished++;
    });
    return c;
  }, [courses]);

  // 仪表盘聚合指标
  const stats = useMemo(() => {
    const teaching = courses.filter((c) => c.status === "teaching");
    const totalStudents = teaching.reduce((sum, c) => sum + c.students.length, 0);
    const pendingTodos = courses.reduce(
      (sum, c) => sum + (c.todos?.filter((t) => t.completedBy.length === 0).length ?? 0),
      0,
    );
    const riskCount = teaching.reduce((sum, c) => {
      const stage = c.stages[c.currentStageIndex];
      if (!stage) return sum;
      const groups = c.groups ?? [];
      const risky = groups.filter((g) => {
        if (!g.members.length) return true;
        const avg = g.members.reduce((s, m) => {
          const st = c.students.find((it) => it.id === m.studentId);
          return s + (st?.stageProgress[stage.key] ?? 0);
        }, 0) / g.members.length;
        return avg < 35;
      }).length;
      return sum + risky + (c.uiState?.aiAnalysisPending ? 1 : 0);
    }, 0);
    return {
      teachingCount: teaching.length,
      totalStudents,
      pendingTodos,
      riskCount,
    };
  }, [courses]);

  // 待办与 AI 建议聚合
  const todoList = useMemo(() => {
    const items: { course: Course; todo: { id: string; title: string; description: string; stageKey?: string } }[] = [];
    courses.forEach((c) => {
      (c.todos ?? []).slice(0, 4).forEach((t) => {
        if (t.completedBy.length === 0) items.push({ course: c, todo: t });
      });
    });
    return items.slice(0, 5);
  }, [courses]);

  const aiSuggestions = useMemo(() => {
    const items: { course: Course; record: { id: string; diagnosis: string; suggestions: string[]; kind: string; createdAt: string } }[] = [];
    courses.forEach((c) => {
      (c.aiSupports ?? []).slice(-2).forEach((r) => {
        items.push({ course: c, record: r });
      });
    });
    return items.slice(-4).reverse();
  }, [courses]);

  const completionRing = useMemo(() => {
    const teaching = courses.find((c) => c.status === "teaching");
    if (!teaching) return null;
    const stage = teaching.stages[teaching.currentStageIndex];
    if (!stage) return null;
    const avg = teaching.students.length
      ? Math.round(
          teaching.students.reduce((s, st) => s + (st.stageProgress[stage.key] ?? 0), 0) /
            teaching.students.length,
        )
      : 0;
    return { course: teaching, avg, stage };
  }, [courses]);

  return (
    <DashboardShell
      role="teacher"
      userName={user.name}
      variant="bare"
    >
      {/* 顶部欢迎与操作 */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-indigo-600">
            教学主控台
          </div>
          <h1 className="mt-1.5 text-[28px] font-bold leading-tight tracking-tight text-slate-900">
            欢迎回来，{user.name}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            管理你的备课与授课课程，关注课堂实时动态与 AI 教学建议。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              className="h-10 w-56 rounded-[var(--radius-sm)] border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索课程名称 / 学科"
              value={query}
            />
          </label>
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-indigo-700 px-4 text-sm font-semibold text-white transition hover:bg-indigo-800"
            href="/teacher/prepare/new"
          >
            <Plus size={17} /> 创建新课程
          </Link>
        </div>
      </div>

      {/* 仪表盘统计卡 */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Layers size={18} />}
          label="授课中课程"
          value={stats.teachingCount}
          helper={`共 ${courses.length} 门课程`}
          tone="indigo"
          href={stats.teachingCount ? undefined : "/teacher/prepare/new"}
        />
        <StatCard
          icon={<Users size={18} />}
          label="课堂学生总数"
          value={stats.totalStudents}
          helper="实时在线学生"
          tone="teal"
        />
        <StatCard
          icon={<ClipboardList size={18} />}
          label="待办事项"
          value={stats.pendingTodos}
          helper={stats.pendingTodos ? "需要尽快处理" : "暂无待办"}
          tone={stats.pendingTodos ? "amber" : "slate"}
        />
        <StatCard
          icon={<AlertTriangle size={18} />}
          label="AI 风险预警"
          value={stats.riskCount}
          helper={stats.riskCount ? "建议介入" : "暂无风险"}
          tone={stats.riskCount ? "rose" : "slate"}
        />
      </div>

      {/* 主区：课程列表 + 侧栏 */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* 课程列表区 */}
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-1 overflow-x-auto border-b border-slate-200">
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  className={cn(
                    "relative whitespace-nowrap px-3.5 py-2.5 text-[13px] font-semibold transition",
                    active ? "text-indigo-700" : "text-slate-500 hover:text-slate-700",
                  )}
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  type="button"
                >
                  {t.label}
                  <span className={cn("ml-1.5 text-xs", active ? "text-indigo-500" : "text-slate-400")}>
                    {counts[t.key]}
                  </span>
                  {active ? (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-600" />
                  ) : null}
                </button>
              );
            })}
            <div className="ml-auto whitespace-nowrap py-2.5 pr-1 text-xs text-slate-400">
              显示 {filtered.length} 门
            </div>
          </div>

          {!hydrated ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="pbl-skeleton h-44 rounded-[var(--radius-md)]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filtered.map((c) => (
                <CourseCard key={c.id} course={c} onDelete={() => {
                  const has = c.students.length > 0;
                  const msg = has
                    ? `确定删除课程「${c.name}」吗？\n该课程已有 ${c.students.length} 名学生加入，删除后学生将无法继续访问，且数据不可恢复。`
                    : `确定删除课程「${c.name}」吗？\n此操作不可撤销。`;
                  if (window.confirm(msg)) deleteCourse(c.id);
                }} />
              ))}
            </div>
          )}
        </div>

        {/* 侧栏：当前授课进度环 + 待办 + AI 建议 */}
        <aside className="space-y-4">
          {completionRing ? (
            <ActiveClassPanel
              course={completionRing.course}
              stageLabel={completionRing.stage.label}
              avg={completionRing.avg}
            />
          ) : null}

          <SidePanel
            icon={<ClipboardList size={16} />}
            title="待办事项"
            hint={todoList.length ? `${todoList.length} 项待处理` : "暂无待办"}
            empty="所有课程暂无未完成待办。"
            isEmpty={todoList.length === 0}
          >
            <div className="space-y-2">
              {todoList.map(({ course, todo }) => (
                <Link
                  key={`${course.id}-${todo.id}`}
                  href={course.status === "teaching" ? `/teacher/teach-classroom/${course.id}` : `/teacher/prepare/${course.id}/preview`}
                  className="block rounded-[var(--radius-sm)] border border-slate-200 bg-white p-3 transition hover:border-indigo-300 hover:bg-indigo-50/40"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-slate-900">{todo.title}</div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">{course.name}</div>
                    </div>
                    <ChevronRight size={14} className="shrink-0 text-slate-400" />
                  </div>
                </Link>
              ))}
            </div>
          </SidePanel>

          <SidePanel
            icon={<Lightbulb size={16} />}
            title="AI 教学建议"
            hint={aiSuggestions.length ? "最近生成" : "暂无建议"}
            empty="AI 将在授课过程中根据学生表现生成教学建议。"
            isEmpty={aiSuggestions.length === 0}
          >
            <div className="space-y-2">
              {aiSuggestions.map(({ course, record }) => (
                <div key={record.id} className="rounded-[var(--radius-sm)] border border-sky-200 bg-sky-50/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-sky-700">
                      <Lightbulb size={11} /> {record.kind}
                    </span>
                    <span className="text-[11px] text-slate-400">{formatDate(record.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-slate-700">{record.diagnosis}</p>
                  <Link
                    href={`/teacher/teach-classroom/${course.id}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900"
                  >
                    查看 <ArrowRight size={11} />
                  </Link>
                </div>
              ))}
            </div>
          </SidePanel>
        </aside>
      </div>

      <footer className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 text-[13px] text-slate-500">
        <div>
          当前身份：<b className="text-slate-700">{user.name}</b>（教师）
        </div>
        <button
          className="text-indigo-700 hover:underline"
          onClick={() => {
            const name = window.prompt("修改教师姓名", user.name);
            if (name && name.trim()) {
              setUser({ role: "teacher", name: name.trim() });
            }
          }}
          type="button"
        >
          修改姓名
        </button>
      </footer>
    </DashboardShell>
  );
}

/* —— 统计卡 —— */
function StatCard({
  icon,
  label,
  value,
  helper,
  tone,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  helper: string;
  tone: "indigo" | "teal" | "amber" | "rose" | "slate";
  href?: string;
}) {
  const toneMap = {
    indigo: { bg: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-100" },
    teal: { bg: "bg-teal-50", text: "text-teal-700", ring: "ring-teal-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-100" },
    rose: { bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-100" },
    slate: { bg: "bg-slate-100", text: "text-slate-600", ring: "ring-slate-200" },
  };
  const t = toneMap[tone];
  const content = (
    <div className="pbl-card flex items-center gap-3 rounded-[var(--radius-md)] p-4 transition hover:shadow-[var(--shadow-raised)]">
      <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-sm)] ring-1", t.bg, t.text, t.ring)}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] text-slate-500">{label}</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900">{value}</span>
          <span className="text-xs text-slate-400">{helper}</span>
        </div>
      </div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

/* —— 授课中课程进度面板 —— */
function ActiveClassPanel({
  course,
  stageLabel,
  avg,
}: {
  course: Course;
  stageLabel: string;
  avg: number;
}) {
  const ringDeg = `${avg * 3.6}deg`;
  return (
    <div className="pbl-card rounded-[var(--radius-md)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-600">授课中</div>
          <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">{course.name}</div>
        </div>
        <Link
          href={`/teacher/teach-classroom/${course.id}`}
          className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] border border-slate-200 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-700"
        >
          <ArrowRight size={15} />
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <div
          className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-[conic-gradient(#4338ca_var(--ring-deg),#e2e8f0_0)]"
          style={{ ["--ring-deg" as string]: ringDeg }}
        >
          <div className="grid h-[68px] w-[68px] place-items-center rounded-full bg-white text-center">
            <div>
              <div className="text-lg font-bold leading-none text-slate-900">{avg}%</div>
              <div className="text-[10px] text-slate-500">平均</div>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-slate-500">当前阶段</div>
          <div className="mt-0.5 truncate text-sm font-bold text-slate-900">{stageLabel}</div>
          <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Users size={12} /> {course.students.length} 学生
            </span>
            <span className="inline-flex items-center gap-1">
              <BookOpen size={12} /> {course.stages.length} 阶段
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* —— 侧栏通用面板 —— */
function SidePanel({
  icon,
  title,
  hint,
  empty,
  isEmpty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  empty: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="pbl-card rounded-[var(--radius-md)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
          <span className="text-slate-500">{icon}</span>
          {title}
        </div>
        {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
      </div>
      {isEmpty ? (
        <div className="pbl-dot-grid rounded-[var(--radius-sm)] border border-dashed border-slate-200 bg-slate-50/40 py-6 text-center text-xs text-slate-500">
          {empty}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/* —— 课程卡（增强）—— */
function CourseCard({ course, onDelete }: { course: Course; onDelete: () => void }) {
  const action = STATUS_ACTION[course.status];
  const href = action.href(course);
  const isTeaching = course.status === "teaching";
  const isFinished = course.status === "finished";
  const progressPct = Math.round(
    ((course.currentStageIndex + (isFinished ? 1 : 0)) / Math.max(1, course.stages.length)) * 100,
  );
  const currentStage = course.stages[course.currentStageIndex];
  // 学生平均完成度（仅授课中显示）
  const avgCompletion = isTeaching && currentStage && course.students.length
    ? Math.round(
        course.students.reduce((s, st) => s + (st.stageProgress[currentStage.key] ?? 0), 0) /
          course.students.length,
      )
    : null;

  return (
    <article
      className={cn(
        "pbl-card flex h-full flex-col rounded-[var(--radius-md)] p-4 transition hover:border-indigo-200 hover:shadow-[var(--shadow-raised)]",
      )}
    >
      <header className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold leading-tight text-slate-900">
            {course.name}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {course.subject} · {course.grade} · {course.hours} 课时
          </p>
        </div>
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ring-1",
            STATUS_TONE[course.status],
          )}
        >
          {COURSE_STATUS_LABEL[course.status]}
        </span>
      </header>

      {/* 阶段时间轴 mini */}
      <div className="mt-3 flex items-center gap-1">
        {course.stages.map((s, i) => {
          const done = i < course.currentStageIndex;
          const active = i === course.currentStageIndex;
          return (
            <div key={s.key} className="flex flex-1 items-center gap-1">
              <div
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  done ? "bg-indigo-600" : active ? "bg-indigo-400" : "bg-slate-200",
                )}
                title={s.label}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
        <span className="truncate">
          {currentStage ? `阶段 ${course.currentStageIndex + 1} · ${currentStage.label}` : "未开始"}
        </span>
        <span>{progressPct}%</span>
      </div>

      {/* 授课中：学生完成度迷你信息 */}
      {isTeaching && avgCompletion !== null ? (
        <div className="mt-2.5 flex items-center gap-2 rounded-[var(--radius-sm)] bg-slate-50 px-2.5 py-1.5">
          <Users size={12} className="text-slate-400" />
          <span className="text-[11px] text-slate-500">{course.students.length} 学生</span>
          <span className="text-slate-300">·</span>
          <span className="text-[11px] font-semibold text-slate-700">平均 {avgCompletion}%</span>
        </div>
      ) : null}

      <footer className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-2.5 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-0.5">
            <Clock3 size={11} /> {formatDate(course.updatedAt)}
          </span>
          {course.status === "teaching" && course.classConfig ? (
            <span className="inline-flex items-center gap-0.5">
              <Users size={11} /> {course.students.length}/{course.classConfig.totalStudents}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="grid h-7 w-7 place-items-center rounded-[var(--radius-xs)] text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            onClick={onDelete}
            type="button"
            aria-label="删除课程"
          >
            <Trash2 size={13} />
          </button>
          <Link
            className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-sm)] bg-indigo-700 px-3 text-xs font-semibold text-white transition hover:bg-indigo-800"
            href={href}
          >
            {action.label} <ChevronRight size={13} />
          </Link>
        </div>
      </footer>
    </article>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const message =
    tab === "all"
      ? "还没有任何课程。点击右上角「创建新课程」开始你的第一门 PBL 课程。"
      : tab === "preparing"
        ? "暂无备课中的课程。"
        : tab === "ready"
          ? "暂无已发布但未开始授课的课程。"
          : tab === "teaching"
            ? "当前没有进行中的授课。"
            : "暂无已结束的课程。";
  return (
    <div className="pbl-dot-grid rounded-[var(--radius-md)] border border-dashed border-slate-300 bg-slate-50/40 py-16 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-[var(--radius-md)] bg-white text-slate-400 shadow-[var(--shadow-soft)]">
        <GraduationCap size={26} />
      </div>
      <p className="mt-4 text-sm text-slate-500">{message}</p>
      {tab === "all" ? (
        <Link
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-indigo-700 px-4 text-sm font-semibold text-white transition hover:bg-indigo-800"
          href="/teacher/prepare/new"
        >
          <Plus size={15} /> 创建新课程
        </Link>
      ) : null}
    </div>
  );
}
