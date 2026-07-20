"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  RotateCcw,
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

  // 已加入授课中的课程 → 自动跳转
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
      <div className="mx-auto max-w-[1100px] px-4 pb-12 pt-6 md:px-6 md:pt-10">
        {/* 页面标题 */}
        <header className="mb-6 text-center">
          <h1 className="text-[clamp(26px,3.4vw,36px)] font-extrabold leading-tight tracking-tight text-[var(--pbl-text-strong)]">
            <span className="pbl-display-gradient">加入项目式课堂</span>
          </h1>
          <p className="mt-2 text-[14px] text-[var(--pbl-text-muted)]">
            输入教师提供的邀请码，开始你的项目学习
          </p>
        </header>

        {!hydrated ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
            <div className="pbl-skeleton h-[460px] rounded-[var(--radius-xl)]" />
            <div className="pbl-skeleton h-[460px] rounded-[var(--radius-xl)]" />
          </div>
        ) : joinedCourse && joinedCourse.status !== "teaching" ? (
          <FinishedState course={joinedCourse} onRejoin={handleRejoinWithCode} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-8">
            {/* 左：邀请码加入卡片 */}
            <section className="space-y-4">
              {/* 快速重新加入 */}
              {leftHistory.length > 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] p-4 shadow-[var(--shadow-soft)]">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-[var(--radius-xs)] bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]">
                      <RotateCcw size={12} />
                    </span>
                    <span className="text-[13px] font-bold text-[var(--pbl-text-strong)]">快速重新加入</span>
                  </div>
                  <div className="space-y-1.5">
                    {leftHistory.map((record) => (
                      <button
                        key={record.courseId}
                        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--pbl-student-border)] hover:bg-[var(--pbl-student-soft)]/40 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busy}
                        onClick={() => handleRejoin(record)}
                        type="button"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-bold text-[var(--pbl-text-strong)]">{record.courseName}</div>
                          <div className="mt-0.5 truncate text-[11px] text-[var(--pbl-text-muted)]">
                            以 <span className="font-semibold text-[var(--pbl-text)]">{record.studentName}</span> 身份重新加入
                          </div>
                        </div>
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--pbl-student)] text-white">
                          <ArrowRight size={13} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-[var(--pbl-border)] pt-2.5 text-center text-[11px] text-[var(--pbl-text-subtle)]">
                    或使用邀请码加入新课堂 ↓
                  </div>
                </div>
              ) : null}

              {/* 邀请码表单 */}
              <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] shadow-[var(--shadow-floating)]">
                {/* 顶部装饰条 */}
                <div className="h-1 w-full bg-gradient-to-r from-[var(--pbl-teacher)] via-[var(--pbl-ai)] to-[var(--pbl-student)]" />
                <div className="p-5 md:p-7">
                  <JoinClassForm
                    busy={busy}
                    errorMessage={error}
                    onSubmit={handleJoin}
                    variant="bare"
                  />
                </div>
              </div>

              {/* 底部辅助链接 */}
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] text-[var(--pbl-text-muted)]">
                <Link
                  className="inline-flex items-center gap-1 transition hover:text-[var(--pbl-student)]"
                  href="/"
                >
                  <ArrowLeft size={12} /> 返回首页
                </Link>
                <span className="text-[var(--pbl-border-strong)]">|</span>
                <span className="inline-flex items-center gap-1">
                  <KeyRound size={12} /> 没有邀请码？请向任课教师索取
                </span>
              </div>
            </section>

            {/* 右：使用说明（粉色信息条） */}
            <aside>
              <div className="rounded-[var(--radius-lg)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] p-5 shadow-[var(--shadow-soft)] md:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <span className="h-3 w-0.5 rounded-full bg-[var(--pbl-student)]" />
                  <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--pbl-text-strong)]">
                    使用说明
                  </h2>
                </div>
                <p className="mb-4 text-[12px] leading-5 text-[var(--pbl-text-muted)]">
                  第一次使用本系统？按下面 4 步即可开始你的项目学习之旅。
                </p>

                <ol className="space-y-2.5">
                  <InstructionStep
                    step={1}
                    title="向教师索取邀请码"
                    desc="任课教师会提供 6 位字母数字组合的邀请码，例如 A2K9QP。"
                  />
                  <InstructionStep
                    step={2}
                    title="填写邀请码和姓名"
                    desc="在左侧表单中输入邀请码（不区分大小写）和你自己的姓名。"
                  />
                  <InstructionStep
                    step={3}
                    title="点击进入课堂"
                    desc="提交后即加入教师正在授课的项目课堂，开始本轮学习。"
                  />
                  <InstructionStep
                    step={4}
                    title="跟随 AI 老师完成项目"
                    desc="AI 老师会带你完成项目启动、知识学习、方案构思、实践、汇报与反思六个阶段。"
                  />
                </ol>

                <div className="mt-5 rounded-[var(--radius-sm)] border border-dashed border-[var(--pbl-border-strong)] bg-[var(--pbl-surface-soft)]/60 p-3.5">
                  <p className="text-[11px] font-semibold text-[var(--pbl-text-strong)]">提示</p>
                  <p className="mt-1 text-[11px] leading-5 text-[var(--pbl-text-muted)]">
                    课堂进行中如意外退出，可使用"快速重新加入"功能回到上次离开的课堂，无需重新输入邀请码。
                  </p>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

/* ===== 子组件 ===== */

function InstructionStep({
  step,
  title,
  desc,
}: {
  step: number;
  title: string;
  desc: string;
}) {
  return (
    <li
      className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[#fce7f3] bg-[#fdf2f8] p-3 transition hover:border-[#f9a8d4] hover:bg-[#fce7f3]"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ec4899] text-[12px] font-extrabold text-white">
        {step}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-[var(--pbl-text-strong)]">{title}</p>
        <p className="mt-0.5 text-[11px] leading-5 text-[var(--pbl-text-muted)]">{desc}</p>
      </div>
    </li>
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
    <div className="pbl-aurora-light relative mx-auto max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] p-6 text-center shadow-[var(--shadow-floating)]">
      <div className="pbl-aurora" />
      <div className="relative z-10">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-[var(--radius-md)] bg-[var(--pbl-warning-soft)] text-[var(--pbl-warning)] ring-1 ring-[var(--pbl-warning-border)]">
          <KeyRound size={22} />
        </div>
        <h2 className="mt-3 text-xl font-bold text-[var(--pbl-text-strong)]">课堂已结束</h2>
        <p className="mt-1.5 text-sm leading-6 text-[var(--pbl-text-muted)]">
          「{course.name}」已结束授课。如需重新加入，请输入新的邀请码。
        </p>
        <div className="mt-4 flex justify-center">
          <span className="inline-flex h-6 items-center rounded-full bg-[var(--pbl-surface-soft)] px-2.5 text-xs font-semibold text-[var(--pbl-text-muted)] ring-1 ring-[var(--pbl-border)]">
            已结束
          </span>
        </div>
        <button
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--pbl-student)] text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[var(--pbl-student-hover)] hover:shadow-md"
          onClick={onRejoin}
          type="button"
        >
          重新输入邀请码
        </button>
      </div>
    </div>
  );
}
