"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Database,
  FileText,
  GraduationCap,
  LogOut,
  Settings,
  Star,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { COURSE_STATUS_LABEL } from "@/lib/session/types";
import type { CourseStatus } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { PrimaryButton, SaveStatus, TextInput } from "@/components/ui";

type Role = "student" | "teacher";

export type DashboardShellProps = {
  role: Role;
  active?: string;
  phase?: string;
  title?: string;
  subtitle?: string;
  course?: string;
  children: ReactNode;
  wide?: boolean;
  variant?: "default" | "bare";
  headerSlot?: ReactNode;
  classroomBar?: ReactNode;
  hideCourseSwitcher?: boolean;
  currentCourse?: { id: string; name: string; status: CourseStatus };
  currentStage?: { index: number; total: number; label: string };
  userName?: string;
  currentTask?: string;
  leadRole?: "AI" | "教师" | "学生";
};

type OpenPanel = "courses" | "notifications" | "profile" | null;

export function DashboardShell({
  role,
  phase = "",
  title = "AI 授知项目共创平台",
  subtitle,
  course,
  children,
  wide = false,
  headerSlot,
  classroomBar,
  hideCourseSwitcher = false,
  currentCourse,
  currentStage,
  userName,
  currentTask,
  leadRole,
}: DashboardShellProps) {
  const session = useSession();
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const isTeacher = role === "teacher";
  const [nameDraft, setNameDraft] = useState(() => {
    const name = userName ?? session.user.name;
    if (!isTeacher && name === "教师") return "";
    return name;
  });

  const displayName = isTeacher
    ? (userName ?? session.user.name ?? "教师")
    : (session.studentName || (userName && userName !== "教师" ? userName : ""));
  const homeHref = isTeacher ? "/teacher" : "/student";
  const courseName = currentCourse?.name ?? course;
  const stageLabel = currentStage
    ? `阶段 ${currentStage.index + 1}/${currentStage.total} · ${currentStage.label}`
    : phase;

  const current = useMemo(() => {
    if (currentCourse) return session.courses.find((item) => item.id === currentCourse.id);
    return session.courses[0];
  }, [currentCourse, session.courses]);

  const notifications = (current?.activityLog ?? []).slice(0, 8);
  const unreadCount = notifications.length;

  function toggle(panel: OpenPanel) {
    setOpenPanel((currentPanel) => (currentPanel === panel ? null : panel));
  }

  function saveProfile() {
    const name = nameDraft.trim() || displayName;
    session.setUser({ role, name });
    setOpenPanel(null);
  }

  return (
    <div className={cn("min-h-screen text-[var(--pbl-text)]", isTeacher ? "pbl-app-bg-role-teacher" : "pbl-app-bg-role-student")}>
      <header className="fixed inset-x-0 top-0 z-30 border-b border-[var(--pbl-border)] bg-[color-mix(in_srgb,var(--pbl-surface)_96%,transparent)] backdrop-blur-sm">
        <div className="mx-auto flex min-h-16 max-w-[1760px] items-center px-3 py-2 md:px-6">
          <Link className="flex min-h-11 min-w-0 items-center gap-2.5" href={homeHref}>
            <LogoMark role={role} />
            <div className="hidden min-w-0 sm:block">
              <div className="truncate text-sm font-bold tracking-tight text-[var(--pbl-text-strong)]">openPBL</div>
              <div className="mt-0.5 max-w-44 truncate text-xs font-medium text-[var(--pbl-text-muted)]">{courseName ?? (isTeacher ? "教师课程空间" : title)}</div>
            </div>
          </Link>

          <div className="ml-3 flex min-w-0 flex-1 items-center gap-3 md:ml-6">
            {(courseName || stageLabel) && !hideCourseSwitcher ? (
              <button
                className="hidden min-h-11 max-w-[620px] min-w-0 items-center gap-3 border-l border-[var(--pbl-border)] px-4 text-left text-sm font-semibold text-[var(--pbl-text)] transition-colors hover:bg-[var(--pbl-surface-soft)] md:inline-flex"
                onClick={() => toggle("courses")}
                type="button"
              >
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-xs)]", isTeacher ? "bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]" : "bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]")}>
                  <GraduationCap size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{stageLabel || courseName}</span>
                  <span className="block truncate text-xs font-normal text-[var(--pbl-text-muted)]">{[leadRole ? `${leadRole}主导` : null, currentTask ?? courseName].filter(Boolean).join(" · ")}</span>
                </span>
                {currentCourse ? <StatusPill status={currentCourse.status} /> : null}
                <ChevronDown size={14} className={cn("shrink-0 text-slate-400 transition", openPanel === "courses" && "rotate-180")} />
              </button>
            ) : null}
            {headerSlot}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-2">
            <div className="hidden lg:block">
              <SaveStatus lastSavedAt={session.lastSavedAt} onRetry={() => void session.retrySave()} state={session.saveState} />
            </div>
            {isTeacher ? (
              <Link
                className="hidden h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-white/80 px-3 text-[13px] font-semibold text-[var(--pbl-text-muted)] transition hover:border-[var(--pbl-teacher-border)] hover:text-[var(--pbl-teacher)] md:inline-flex"
                href="/teacher/settings"
              >
                <Settings size={14} /> AI 设置
              </Link>
            ) : null}
            <button
              className="relative grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] border border-transparent text-slate-600 transition hover:border-slate-200 hover:bg-white"
              onClick={() => toggle("notifications")}
              type="button"
              aria-label="通知中心"
            >
              <Bell size={18} strokeWidth={1.8} />
              {unreadCount ? (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--pbl-danger)] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                  {unreadCount}
                </span>
              ) : null}
            </button>
            <button
              className="flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] px-1.5 transition hover:bg-white"
              onClick={() => toggle("profile")}
              type="button"
            >
              <Avatar name={displayName || (isTeacher ? "教师" : "学生")} />
              <span className="hidden max-w-[100px] truncate text-[13px] font-semibold md:inline">
                {displayName || "未加入课堂"}
              </span>
              <ChevronDown size={14} className={cn("text-slate-400 transition", openPanel === "profile" && "rotate-180")} />
            </button>
          </div>
        </div>
        {classroomBar ? (
          <div className="mx-auto mt-2 max-w-[1760px]">
            {classroomBar}
          </div>
        ) : null}
      </header>

      {openPanel ? (
        <TopPopover onClose={() => setOpenPanel(null)}>
          {openPanel === "courses" ? (
            <CourseMenu currentId={currentCourse?.id} isTeacher={isTeacher} onClose={() => setOpenPanel(null)} />
          ) : null}
          {openPanel === "notifications" ? <NotificationMenu items={notifications} /> : null}
          {openPanel === "profile" ? (
            <div className="space-y-3.5">
              <div>
                <div className="text-base font-bold text-slate-900">个人信息</div>
                <p className="mt-0.5 text-[13px] text-slate-500">当前身份：{isTeacher ? "教师端" : "学生端"}</p>
              </div>
              <label className="block text-[13px] font-semibold text-slate-700">
                显示姓名
                <TextInput className="mt-1.5 h-10" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <PrimaryButton className="h-10 text-sm" onClick={saveProfile}>保存</PrimaryButton>
                <Link
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50"
                  href={isTeacher ? "/teacher/settings" : "/student"}
                  onClick={() => setOpenPanel(null)}
                >
                  <UserRound size={15} /> 个人中心
                </Link>
              </div>
              <Link
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-rose-200 bg-rose-50 text-[13px] font-semibold text-rose-600 transition hover:bg-rose-100"
                href={homeHref}
                onClick={() => setOpenPanel(null)}
              >
                <LogOut size={15} /> 返回首页
              </Link>
            </div>
          ) : null}
        </TopPopover>
      ) : null}

      <main className={classroomBar ? "pt-[136px] md:pt-[142px]" : "pt-[72px]"}>
        <div className={cn("mx-auto w-full px-4 pb-10 md:px-7", wide ? "max-w-[1720px]" : "max-w-[1540px]")}>
          {subtitle ? <p className="mb-2 text-sm font-medium text-slate-500">{subtitle}</p> : null}
          {children}
        </div>
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: CourseStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ring-1",
        status === "ready" && "bg-[var(--pbl-success-soft)] text-[var(--pbl-success)] ring-green-200",
        status === "teaching" && "bg-[var(--pbl-ai-soft)] text-[var(--pbl-ai)] ring-[var(--pbl-ai-border)]",
        status === "preparing" && "bg-[var(--pbl-warning-soft)] text-[var(--pbl-warning)] ring-orange-200",
        status === "draft" && "bg-stone-100 text-stone-600 ring-stone-200",
        status === "finished" && "bg-stone-100 text-stone-500 ring-stone-200",
      )}
    >
      {COURSE_STATUS_LABEL[status]}
    </span>
  );
}

function TopPopover({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="pbl-glass fixed right-4 top-[84px] z-40 w-[min(380px,calc(100vw-32px))] rounded-[var(--radius-md)] p-4 md:right-8">
      <button
        className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-[var(--radius-xs)] text-slate-400 transition hover:bg-white hover:text-slate-700"
        onClick={onClose}
        type="button"
        aria-label="关闭"
      >
        <X size={15} />
      </button>
      {children}
    </div>
  );
}

function CourseMenu({ currentId, isTeacher, onClose }: { currentId?: string; isTeacher: boolean; onClose: () => void }) {
  const { courses } = useSession();
  return (
    <div>
      <div className="mb-3 pr-8">
        <div className="text-base font-bold text-slate-900">课堂切换</div>
        <p className="mt-0.5 text-[13px] text-slate-500">选择要进入的课堂或项目页面。</p>
      </div>
      <div className="max-h-[360px] space-y-1.5 overflow-auto pr-1">
        {courses.map((item) => {
          const href = isTeacher
            ? item.status === "teaching"
              ? `/teacher/teach-classroom/${item.id}`
              : `/teacher/prepare/${item.id}/preview`
            : item.status === "teaching"
              ? `/student/classroom/${item.id}`
              : "/student";
          return (
            <Link
              className={cn(
                "block rounded-[var(--radius-sm)] border px-3 py-2.5 transition hover:border-[var(--pbl-teacher-border)] hover:bg-[var(--pbl-teacher-soft)]",
                item.id === currentId ? "border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)]" : "border-[var(--pbl-border)] bg-white/80",
              )}
              href={href}
              key={item.id}
              onClick={onClose}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-bold text-slate-900">{item.name}</span>
                <StatusPill status={item.status} />
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {item.subject} · {item.grade} · 阶段 {item.currentStageIndex + 1}/{item.stages.length}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function NotificationMenu({ items }: { items: { id: string; actor: string; action: string; detail?: string; createdAt: string }[] }) {
  return (
    <div>
      <div className="mb-3 pr-8">
        <div className="text-base font-bold text-slate-900">通知中心</div>
        <p className="mt-0.5 text-[13px] text-slate-500">课堂最近活动与反馈会显示在这里。</p>
      </div>
      {items.length ? (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div className="rounded-[var(--radius-sm)] border border-slate-200 bg-white/80 p-2.5" key={item.id}>
              <div className="text-[13px] font-semibold text-slate-900">
                {item.actor} · {item.action}
              </div>
              {item.detail ? <div className="mt-0.5 text-[13px] text-slate-500">{item.detail}</div> : null}
              <div className="mt-1.5 text-[11px] text-slate-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="pbl-dot-grid rounded-[var(--radius-sm)] border border-dashed border-slate-300 bg-slate-50/40 py-8 text-center text-[13px] text-slate-500">
          暂无通知，课堂活动会在这里出现。
        </div>
      )}
    </div>
  );
}

export function LogoMark({ role = "teacher" }: { role?: Role }) {
  const isTeacher = role === "teacher";
  return (
    <div className="relative h-9 w-9 shrink-0">
      <div className={cn("absolute left-0 top-0 h-9 w-4 skew-x-[-21deg] rounded-[var(--radius-xs)]", isTeacher ? "bg-[var(--pbl-teacher-hover)]" : "bg-[var(--pbl-student-hover)]")} />
      <div className={cn("absolute right-0 top-0 h-9 w-4 skew-x-[21deg] rounded-[var(--radius-xs)]", isTeacher ? "bg-[var(--pbl-teacher)]" : "bg-[var(--pbl-student)]")} />
      <div className="absolute bottom-0 left-[12px] h-3 w-3 rotate-45 bg-white" />
    </div>
  );
}

export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials = name.slice(0, 1);
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full bg-stone-800 text-sm font-bold text-white"
      style={{ height: size, width: size }}
      title={name}
    >
      {initials}
    </div>
  );
}

export function AvatarStack({ names }: { names: string[] }) {
  return (
    <div className="flex items-center">
      {names.slice(0, 4).map((name, index) => (
        <div className="-ml-2 first:ml-0" key={name}>
          <Avatar name={name} size={34 - index} />
        </div>
      ))}
      {names.length > 4 ? (
        <div className="-ml-1 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
          +{names.length - 4}
        </div>
      ) : null}
    </div>
  );
}

export function Toolbar() {
  const icons = [ClipboardList, FileText, CalendarDays, Database, Star];
  return (
    <div className="flex h-11 items-center gap-1 border-b border-slate-200 bg-slate-50 px-3">
      <select className="h-8 rounded-[6px] border border-slate-200 bg-white px-3 text-sm text-slate-600">
        <option>正文</option>
      </select>
      <select className="h-8 rounded-[6px] border border-slate-200 bg-white px-3 text-sm text-slate-600">
        <option>系统字体</option>
      </select>
      <select className="h-8 rounded-[6px] border border-slate-200 bg-white px-3 text-sm text-slate-600">
        <option>14</option>
      </select>
      <span className="mx-2 h-6 w-px bg-slate-200" />
      {["B", "I", "U", "S"].map((item) => (
        <button className="grid h-8 w-8 place-items-center rounded-[6px] text-base font-bold hover:bg-white" key={item} type="button">
          {item}
        </button>
      ))}
      <span className="mx-2 h-6 w-px bg-slate-200" />
      {icons.map((Icon, index) => (
        <button className="grid h-8 w-8 place-items-center rounded-[6px] text-slate-700 hover:bg-white" key={index} type="button">
          <Icon size={17} />
        </button>
      ))}
      <span className="ml-auto text-slate-400">撤销</span>
      <span className="text-slate-400">重做</span>
    </div>
  );
}
