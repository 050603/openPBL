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
import { PrimaryButton, TextInput } from "@/components/ui";

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
  currentCourse?: { id: string; name: string; status: CourseStatus };
  currentStage?: { index: number; total: number; label: string };
  userName?: string;
};

type OpenPanel = "courses" | "notifications" | "profile" | null;

export function DashboardShell({
  role,
  phase = "",
  title = "AI探知—项目共创平台",
  subtitle,
  course,
  children,
  wide = false,
  headerSlot,
  currentCourse,
  currentStage,
  userName,
}: DashboardShellProps) {
  const session = useSession();
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const isTeacher = role === "teacher";
  const [nameDraft, setNameDraft] = useState(() => {
    const name = userName ?? session.user.name;
    // 学生端：不使用默认"教师"身份初始化
    if (!isTeacher && name === "教师") return "";
    return name;
  });
  // 学生端：未加入课堂时不显示默认"教师"身份，仅显示已确认的学生身份
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
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center border-b border-slate-200/80 bg-white/95 px-7 backdrop-blur">
        <Link className="flex min-w-0 items-center gap-3" href={homeHref}>
          <LogoMark />
          <span className="truncate text-xl font-black tracking-[0] text-slate-950">
            {isTeacher ? "AI探知—教师端" : title}
          </span>
        </Link>

        <div className="ml-6 flex items-center gap-3">
          {(courseName || stageLabel) ? (
            <button
              className="hidden h-10 max-w-[430px] items-center gap-3 rounded-[6px] border border-slate-200 bg-white px-4 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-300 hover:text-blue-700 md:inline-flex"
              onClick={() => toggle("courses")}
              type="button"
            >
              {isTeacher ? (
                <span className="inline-flex items-center gap-2 text-blue-700">
                  <GraduationCap size={17} /> {stageLabel || courseName}
                </span>
              ) : (
                <>
                  <span className="truncate">{courseName}</span>
                  {currentCourse ? <StatusPill status={currentCourse.status} /> : null}
                </>
              )}
              <ChevronDown size={16} className={cn("transition", openPanel === "courses" && "rotate-180")} />
            </button>
          ) : null}
          {headerSlot}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {isTeacher ? (
            <Link
              className="hidden h-10 items-center gap-2 rounded-[6px] border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-700 md:inline-flex"
              href="/teacher/settings"
            >
              <Settings size={16} /> AI 设置
            </Link>
          ) : null}
          <button
            className="relative grid h-10 w-10 place-items-center rounded-full border border-transparent text-slate-700 transition hover:border-slate-200 hover:bg-white"
            onClick={() => toggle("notifications")}
            type="button"
            aria-label="通知中心"
          >
            <Bell size={22} strokeWidth={1.8} />
            <span className="absolute right-1 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-xs font-black leading-none text-white">
              {unreadCount}
            </span>
          </button>
          <button
            className="flex h-11 items-center gap-3 rounded-[6px] px-2 transition hover:bg-slate-50"
            onClick={() => toggle("profile")}
            type="button"
          >
            <Avatar name={displayName || (isTeacher ? "教师" : "学生")} />
            {displayName ? (
              <span className="hidden max-w-[96px] truncate text-base font-semibold md:inline">
                {displayName}
              </span>
            ) : (
              <span className="hidden text-sm text-slate-400 md:inline">
                未加入课堂
              </span>
            )}
            <ChevronDown size={16} className={cn("text-slate-500 transition", openPanel === "profile" && "rotate-180")} />
          </button>
        </div>
      </header>

      {openPanel ? (
        <TopPopover onClose={() => setOpenPanel(null)}>
          {openPanel === "courses" ? (
            <CourseMenu
              currentId={currentCourse?.id}
              isTeacher={isTeacher}
              onClose={() => setOpenPanel(null)}
            />
          ) : null}
          {openPanel === "notifications" ? (
            <NotificationMenu items={notifications} />
          ) : null}
          {openPanel === "profile" ? (
            <div className="space-y-4">
              <div>
                <div className="text-lg font-black text-slate-950">个人信息</div>
                <p className="mt-1 text-sm text-slate-500">当前身份：{isTeacher ? "教师端" : "学生端"}</p>
              </div>
              <label className="block text-sm font-semibold text-slate-700">
                显示姓名
                <TextInput className="mt-2" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <PrimaryButton className="h-10 text-sm" onClick={saveProfile}>保存</PrimaryButton>
                <Link
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  href={isTeacher ? "/teacher/settings" : "/student/reflection"}
                  onClick={() => setOpenPanel(null)}
                >
                  <UserRound size={16} /> 个人中心
                </Link>
              </div>
              <Link
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[6px] border border-red-200 bg-red-50 text-sm font-semibold text-red-600 hover:bg-red-100"
                href={homeHref}
                onClick={() => setOpenPanel(null)}
              >
                <LogOut size={16} /> 返回首页
              </Link>
            </div>
          ) : null}
        </TopPopover>
      ) : null}

      <main className={cn("pt-16", wide ? "min-w-[1260px]" : "min-w-[1060px]")}>
        <div className="mx-auto max-w-[1510px] px-10 py-7">
          {subtitle ? <p className="mb-1 text-base font-medium text-slate-500">{subtitle}</p> : null}
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
        "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-semibold",
        status === "ready" && "bg-emerald-50 text-emerald-700",
        status === "teaching" && "bg-blue-50 text-blue-700",
        status === "preparing" && "bg-amber-50 text-amber-700",
        status === "draft" && "bg-slate-100 text-slate-600",
        status === "finished" && "bg-slate-100 text-slate-500",
      )}
    >
      {COURSE_STATUS_LABEL[status]}
    </span>
  );
}

function TopPopover({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed right-6 top-[70px] z-40 w-[360px] rounded-[8px] border border-slate-200 bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
      <button
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-[6px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        onClick={onClose}
        type="button"
        aria-label="关闭"
      >
        <X size={16} />
      </button>
      {children}
    </div>
  );
}

function CourseMenu({ currentId, isTeacher, onClose }: { currentId?: string; isTeacher: boolean; onClose: () => void }) {
  const { courses } = useSession();
  return (
    <div>
      <div className="mb-3 pr-9">
        <div className="text-lg font-black text-slate-950">课程切换</div>
        <p className="mt-1 text-sm text-slate-500">选择要进入的课堂或项目页。</p>
      </div>
      <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
        {courses.map((item) => {
          const href = isTeacher
            ? item.status === "teaching"
              ? `/teacher/teach-classroom/${item.id}`
              : `/teacher/prepare/${item.id}/preview`
            : item.status === "teaching"
              ? `/student/classroom/${item.id}`
              : "/student/project";
          return (
            <Link
              className={cn(
                "block rounded-[8px] border px-3 py-3 transition hover:border-blue-300 hover:bg-blue-50/50",
                item.id === currentId ? "border-blue-300 bg-blue-50/70" : "border-slate-200 bg-white",
              )}
              href={href}
              key={item.id}
              onClick={onClose}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-black text-slate-900">{item.name}</span>
                <StatusPill status={item.status} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
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
      <div className="mb-3 pr-9">
        <div className="text-lg font-black text-slate-950">通知中心</div>
        <p className="mt-1 text-sm text-slate-500">展示课堂最近活动与反馈。</p>
      </div>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div className="rounded-[8px] border border-slate-200 bg-slate-50/60 p-3" key={item.id}>
              <div className="text-sm font-bold text-slate-900">
                {item.actor} · {item.action}
              </div>
              {item.detail ? <div className="mt-1 text-sm text-slate-500">{item.detail}</div> : null}
              <div className="mt-2 text-xs text-slate-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[8px] border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-500">
          暂无通知，课堂活动会在这里出现。
        </div>
      )}
    </div>
  );
}

export function LogoMark() {
  return (
    <div className="relative h-9 w-9 shrink-0">
      <div className="absolute left-0 top-0 h-9 w-4 skew-x-[-21deg] rounded-[4px] bg-blue-600" />
      <div className="absolute right-0 top-0 h-9 w-4 skew-x-[21deg] rounded-[4px] bg-sky-400" />
      <div className="absolute bottom-0 left-[12px] h-3 w-3 rotate-45 bg-white" />
    </div>
  );
}

export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  const initials = name.slice(0, 1);
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full border border-white bg-gradient-to-br from-slate-900 via-slate-700 to-slate-300 text-sm font-black text-white shadow-sm"
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
      <select className="h-8 rounded-[5px] border border-slate-200 bg-white px-3 text-sm text-slate-600">
        <option>正文</option>
      </select>
      <select className="h-8 rounded-[5px] border border-slate-200 bg-white px-3 text-sm text-slate-600">
        <option>系统字体</option>
      </select>
      <select className="h-8 rounded-[5px] border border-slate-200 bg-white px-3 text-sm text-slate-600">
        <option>14</option>
      </select>
      <span className="mx-2 h-6 w-px bg-slate-200" />
      {["B", "I", "U", "S"].map((item) => (
        <button className="grid h-8 w-8 place-items-center rounded-[5px] text-base font-bold hover:bg-white" key={item} type="button">
          {item}
        </button>
      ))}
      <span className="mx-2 h-6 w-px bg-slate-200" />
      {icons.map((Icon, index) => (
        <button className="grid h-8 w-8 place-items-center rounded-[5px] text-slate-700 hover:bg-white" key={index} type="button">
          <Icon size={17} />
        </button>
      ))}
      <span className="ml-auto text-slate-400">↶</span>
      <span className="text-slate-400">↷</span>
    </div>
  );
}
