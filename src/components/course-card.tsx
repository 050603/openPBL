"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, Clock3, Trash2, Users } from "lucide-react";
import type { Course, CourseStatus } from "@/lib/session/types";
import { COURSE_STATUS_LABEL } from "@/lib/session/types";
import { ProgressBar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session/store";
import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui";

const STATUS_TONE: Record<CourseStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  preparing: "bg-amber-50 text-amber-700",
  ready: "bg-emerald-50 text-emerald-700",
  teaching: "bg-blue-50 text-blue-700",
  finished: "bg-slate-100 text-slate-500",
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

export function CourseCard({ course }: { course: Course }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const action = STATUS_ACTION[course.status];
  const href = action.href(course);
  const isTeaching = course.status === "teaching";
  const isFinished = course.status === "finished";
  const progressPct = Math.round(
    ((course.currentStageIndex + (isFinished ? 1 : 0)) / Math.max(1, course.stages.length)) * 100,
  );
  const { deleteCourse } = useSession();

  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] transition-colors hover:border-[var(--pbl-border-strong)]",
      )}
    >
      <div className="min-h-28 border-b border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)] p-5" style={course.coverImageUrl ? { backgroundImage: `linear-gradient(rgba(31,41,51,.2),rgba(31,41,51,.35)),url(${course.coverImageUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>
        <p className={cn("text-xs font-semibold uppercase tracking-[0.12em]", course.coverImageUrl ? "text-white" : "text-[var(--pbl-text-muted)]")}>{course.subject || "项目课程"} · {course.grade || "全年级"}</p>
        <p className={cn("font-editorial mt-3 line-clamp-2 text-lg font-semibold leading-7", course.coverImageUrl ? "text-white" : "text-[var(--pbl-text)]")}>{course.drivingQuestion || "等待定义驱动问题"}</p>
      </div>
      <div className="flex flex-1 flex-col p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold leading-tight text-[var(--pbl-text-strong)]">
            {course.name}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {course.hours} 课时 · 最近修改 {formatDate(course.updatedAt)}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold",
            STATUS_TONE[course.status],
          )}
        >
          {COURSE_STATUS_LABEL[course.status]}
        </span>
      </header>

      {course.summary ? (
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
          {course.summary}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
            <span>阶段进度</span>
            <span>
              {Math.min(course.currentStageIndex + 1, course.stages.length)} / {course.stages.length}
            </span>
          </div>
          <ProgressBar
            className="h-2"
            tone={
              isFinished ? "green" : isTeaching ? "blue" : course.status === "ready" ? "blue" : "orange"
            }
            value={progressPct}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock3 size={13} /> 修改于 {formatDate(course.updatedAt)}
          </span>
          {course.status === "teaching" && course.classConfig ? (
            <span className="inline-flex items-center gap-1">
              <Users size={13} /> {course.students.length}/{course.classConfig.totalStudents} 在班
            </span>
          ) : null}
          {course.stages[course.currentStageIndex] ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={13} /> 当前：{course.stages[course.currentStageIndex].label}
            </span>
          ) : null}
        </div>
      </div>

      <footer className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--pbl-text-muted)] hover:text-[var(--pbl-teacher)]"
            href={`/teacher/prepare/${course.id}/preview`}
          >
            详情
          </Link>
          <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
            <AlertDialogTrigger asChild><button className="inline-flex min-h-11 items-center gap-1 rounded-[6px] border border-slate-200 px-2.5 text-xs font-semibold text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600" type="button"><Trash2 size={13} /> 删除</button></AlertDialogTrigger>
            <AlertDialogContent><AlertDialogTitle>删除“{course.name}”？</AlertDialogTitle><AlertDialogDescription>{course.students.length ? `已有 ${course.students.length} 名学生加入，删除后学生将无法继续访问，所有课堂数据不可恢复。` : "课程和备课数据将被永久删除，此操作不可撤销。"}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => deleteCourse(course.id)}>永久删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
          </AlertDialog>
        </div>
        <Link
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] px-4 text-sm font-semibold text-white hover:bg-[var(--pbl-teacher-hover)]"
          href={href}
        >
          {action.label} <ChevronRight size={16} />
        </Link>
      </footer>
      </div>
    </article>
  );
}
