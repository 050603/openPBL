"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Flag,
  KeyRound,
  Lightbulb,
  Presentation,
  RotateCcw,
  Target,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { JoinClassForm } from "@/components/join-class-form";
import { useSession, useHydrated } from "@/lib/session/store";

export default function StudentEntryPage() {
  const router = useRouter();
  const { joinClass, rejoinClass, user, studentName, joinedCourseId, courses, leaveClass, getLeftClassHistory } = useSession();
  const hydrated = useHydrated();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const joinedCourse = joinedCourseId
    ? courses.find((c) => c.id === joinedCourseId)
    : undefined;

  const leftHistory = hydrated ? getLeftClassHistory() : [];

  // Auto-redirect when student has joined a teaching course
  useEffect(() => {
    if (!hydrated) return;
    if (joinedCourse && joinedCourse.status === "teaching") {
      router.replace(`/student/classroom/${joinedCourse.id}`);
    }
  }, [hydrated, joinedCourse, router]);

  function handleJoin(code: string, name: string) {
    setError(undefined);
    setBusy(true);
    const result = joinClass(code, name);
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    router.replace(`/student/classroom/${result.course.id}`);
  }

  function handleRejoin(record: { courseId: string; courseName: string; studentId: string; studentName: string; leftAt: string }) {
    setError(undefined);
    setBusy(true);
    const result = rejoinClass(record);
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    router.replace(`/student/classroom/${result.course.id}`);
  }

  function handleRejoinWithCode() {
    leaveClass();
  }

  return (
    <DashboardShell
      role="student"
      userName={joinedCourse ? (studentName ?? user.name) : undefined}
      variant="bare"
    >
      <div className="mx-auto max-w-[1180px] py-6 md:py-10">
        {/* 品牌引导区 */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--pbl-student-soft)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--pbl-student)] ring-1 ring-[var(--pbl-student-border)]">
            <Lightbulb size={12} /> 学生工作台
          </div>
          <h1 className="mt-3 text-[30px] font-bold leading-tight tracking-tight text-stone-900">
            项目式学习课堂
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-stone-500">
            输入教师提供的 6 位邀请码加入课堂，在 AI 伴学小组支持下完成独立项目。
          </p>
        </div>

        {!hydrated ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <div className="pbl-skeleton h-96 rounded-[var(--radius-lg)]" />
            <div className="pbl-skeleton h-96 rounded-[var(--radius-lg)]" />
          </div>
        ) : joinedCourse && joinedCourse.status !== "teaching" ? (
          <FinishedState course={joinedCourse} onRejoin={handleRejoinWithCode} />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            {/* 左：邀请码加入 / 重新加入 */}
            <div className="space-y-4">
              {leftHistory.length > 0 ? (
                <div className="pbl-card rounded-[var(--radius-lg)] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <RotateCcw size={15} className="text-[var(--pbl-student)]" />
                    <span className="text-sm font-bold text-stone-900">快速重新加入</span>
                  </div>
                  <div className="space-y-2">
                    {leftHistory.map((record) => (
                      <button
                        key={record.courseId}
                        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-stone-200 bg-white p-3 text-left transition hover:border-[var(--pbl-student)] hover:bg-[var(--pbl-student-soft)]/40 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busy}
                        onClick={() => handleRejoin(record)}
                        type="button"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-bold text-stone-900">{record.courseName}</div>
                          <div className="mt-0.5 truncate text-xs text-stone-500">
                            以 <span className="font-semibold text-stone-700">{record.studentName}</span> 身份重新加入
                          </div>
                        </div>
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-xs)] bg-[var(--pbl-student)] text-white">
                          <ArrowRight size={13} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-stone-100 pt-3 text-center text-xs text-stone-400">
                    或使用邀请码加入新课堂
                  </div>
                </div>
              ) : null}

              <JoinClassForm
                busy={busy}
                errorMessage={error}
                onSubmit={handleJoin}
              />
            </div>

            {/* 右：加入后你将看到 —— 任务结构预览 */}
            <div className="pbl-card rounded-[var(--radius-lg)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--pbl-student)]">学习路径预览</div>
                  <h2 className="mt-1 text-lg font-bold text-stone-900">加入课堂后你将完成</h2>
                </div>
                <div className="grid h-10 w-10 place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]">
                  <ClipboardList size={18} />
                </div>
              </div>

              {/* 阶段任务预览 */}
              <div className="space-y-2.5">
                <TaskPreviewItem
                  icon={<Flag size={15} />}
                  step="01"
                  title="项目启动"
                  desc="理解真实问题、明确成果要求，完成入组准备"
                  tone="teacher"
                />
                <TaskPreviewItem
                  icon={<BookOpen size={15} />}
                  step="02"
                  title="AI 授知"
                  desc="AI 多角色讲解核心知识，完成基础概念建构"
                  tone="ai"
                />
                <TaskPreviewItem
                  icon={<Lightbulb size={15} />}
                  step="03"
                  title="方案构思"
                  desc="独立形成项目方案，与 AI 伴学小组讨论、质疑和完善"
                  tone="student"
                />
                <TaskPreviewItem
                  icon={<Target size={15} />}
                  step="04"
                  title="项目实践"
                  desc="制作项目作品，提交过程证据，教师按需介入"
                  tone="warning"
                />
                <TaskPreviewItem
                  icon={<Presentation size={15} />}
                  step="05"
                  title="成果汇报"
                  desc="展示项目成果，接受教师与 AI 协同评价"
                  tone="success"
                />
                <TaskPreviewItem
                  icon={<RotateCcw size={15} />}
                  step="06"
                  title="学习反思"
                  desc="回顾学习过程，形成可迁移的方法与证据"
                  tone="student"
                />
              </div>
            </div>
          </div>
        )}

        {/* 底部辅助链接 */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-[13px] text-stone-500">
          <Link
            className="inline-flex items-center gap-1 hover:text-[var(--pbl-student)]"
            href="/"
          >
            <ArrowRight size={13} className="rotate-180" /> 返回首页
          </Link>
          <span className="text-stone-300">|</span>
          <span className="inline-flex items-center gap-1">
            <KeyRound size={13} /> 没有邀请码？请向任课教师索取
          </span>
        </div>
      </div>
    </DashboardShell>
  );
}

/* —— 任务预览项 —— */
function TaskPreviewItem({
  icon,
  step,
  title,
  desc,
  tone,
}: {
  icon: React.ReactNode;
  step: string;
  title: string;
  desc: string;
  tone: "teacher" | "student" | "ai" | "warning" | "success";
}) {
  const toneMap = {
    teacher: "bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)] ring-[var(--pbl-teacher-border)]",
    student: "bg-[var(--pbl-student-soft)] text-[var(--pbl-student)] ring-[var(--pbl-student-border)]",
    ai: "bg-[var(--pbl-ai-soft)] text-[var(--pbl-ai)] ring-[var(--pbl-ai-border)]",
    warning: "bg-[var(--pbl-warning-soft)] text-[var(--pbl-warning)] ring-[var(--pbl-warning-soft)]",
    success: "bg-[var(--pbl-success-soft)] text-[var(--pbl-success)] ring-[var(--pbl-student-border)]",
  };
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-stone-100 bg-stone-50/50 p-3 transition hover:border-stone-200 hover:bg-white">
      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-xs)] ring-1 ${toneMap[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-stone-400">STEP {step}</span>
          <span className="text-[13px] font-bold text-stone-900">{title}</span>
        </div>
        <p className="mt-0.5 text-xs leading-5 text-stone-500">{desc}</p>
      </div>
    </div>
  );
}

function FinishedState({
  course,
  onRejoin,
}: {
  course: { id: string; name: string; status: string };
  onRejoin: () => void;
}) {
  return (
    <div className="pbl-card mx-auto max-w-md rounded-[var(--radius-lg)] p-6 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-[var(--radius-md)] bg-[var(--pbl-warning-soft)] text-[var(--pbl-warning)] ring-1 ring-[var(--pbl-warning-soft)]">
        <KeyRound size={22} />
      </div>
      <h2 className="mt-3 text-xl font-bold text-stone-900">课堂已结束</h2>
      <p className="mt-1.5 text-sm leading-6 text-stone-500">
        「{course.name}」已结束授课。如需重新加入，请输入新的邀请码。
      </p>
      <div className="mt-4 flex justify-center">
        <span className="inline-flex h-6 items-center rounded-full bg-stone-100 px-2.5 text-xs font-semibold text-stone-500 ring-1 ring-stone-200">
          已结束
        </span>
      </div>
      <button
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--pbl-student)] text-sm font-semibold text-white transition hover:bg-[var(--pbl-student-hover)]"
        onClick={onRejoin}
        type="button"
      >
        重新输入邀请码
      </button>
    </div>
  );
}
