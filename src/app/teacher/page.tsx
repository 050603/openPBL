"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CourseCard } from "@/components/course-card";
import { useSession, useHydrated } from "@/lib/session/store";
import type { Course, CourseStatus } from "@/lib/session/types";
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

export default function TeacherHomePage() {
  const { courses, user, setUser } = useSession();
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

  return (
    <DashboardShell
      role="teacher"
      userName={user.name}
      variant="bare"
    >
      <div className="mb-7 flex items-end justify-between gap-5">
        <div>
          <h1 className="text-[34px] font-black tracking-[0] text-slate-950">
            历史课程
          </h1>
          <p className="mt-2 text-base text-slate-500">
            欢迎回来，{user.name}。在这里查看与管理你的备课与授课课程。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              className="h-10 w-64 rounded-[6px] border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索课程"
              value={query}
            />
          </label>
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-blue-600 px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)] hover:bg-blue-700"
            href="/teacher/prepare/new"
          >
            <Plus size={18} /> 创建新课程
          </Link>
        </div>
      </div>

      <div className="mb-5 flex items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              className={cn(
                "relative px-4 py-3 text-sm font-semibold transition",
                active
                  ? "text-blue-700"
                  : "text-slate-500 hover:text-slate-700",
              )}
              key={t.key}
              onClick={() => setTab(t.key)}
              type="button"
            >
              {t.label}
              <span className="ml-2 text-xs text-slate-400">{counts[t.key]}</span>
              {active ? (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-blue-600" />
              ) : null}
            </button>
          );
        })}
        <div className="ml-auto text-sm text-slate-500">
          共 {filtered.length} 门课程
        </div>
      </div>

      {!hydrated ? (
        <div className="grid grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              className="h-56 animate-pulse rounded-[10px] border border-slate-200/80 bg-white"
              key={i}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <CourseCard course={c} key={c.id} />
          ))}
        </div>
      )}

      <footer className="mt-10 flex items-center justify-between border-t border-slate-200 pt-6 text-sm text-slate-500">
        <div>
          当前身份：<b className="text-slate-700">{user.name}</b>（教师）
        </div>
        <button
          className="text-blue-700 hover:underline"
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
    <div className="rounded-[12px] border border-dashed border-slate-300 bg-white py-20 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-slate-50 text-slate-400">
        <Plus size={28} />
      </div>
      <p className="mt-4 text-base text-slate-500">{message}</p>
      <Link
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-[6px] bg-blue-600 px-5 text-sm font-semibold text-white"
        href="/teacher/prepare/new"
      >
        <Plus size={16} /> 创建新课程
      </Link>
    </div>
  );
}
