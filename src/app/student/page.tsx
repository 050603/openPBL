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
  Users,
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
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700 ring-1 ring-teal-200">
            <Lightbulb size={12} /> 学生工作台
          </div>
          <h1 className="mt-3 text-[30px] font-bold leading-tight tracking-tight text-slate-900">
            AI 探知 · 项目共创
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
            输入教师提供的 6 位邀请码加入课堂，开启你的项目式学习之旅。加入后你将看到当前学习任务、阶段进度与 AI 学习伙伴。
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
                    <RotateCcw size={15} className="text-teal-600" />
                    <span className="text-sm font-bold text-slate-900">快速重新加入</span>
                  </div>
                  <div className="space-y-2">
                    {leftHistory.map((record) => (
                      <button
                        key={record.courseId}
                        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-slate-200 bg-white p-3 text-left transition hover:border-teal-300 hover:bg-teal-50/40 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busy}
                        onClick={() => handleRejoin(record)}
                        type="button"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-bold text-slate-900">{record.courseName}</div>
                          <div className="mt-0.5 truncate text-xs text-slate-500">
                            以 <span className="font-semibold text-slate-700">{record.studentName}</span> 身份重新加入
                          </div>
                        </div>
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-xs)] bg-teal-600 text-white">
                          <ArrowRight size={13} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-slate-100 pt-3 text-center text-xs text-slate-400">
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
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-600">学习路径预览</div>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">加入课堂后你将完成</h2>
                </div>
                <div className="grid h-10 w-10 place-items-center rounded-[var(--radius-sm)] bg-teal-50 text-teal-700">
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
                  tone="indigo"
                />
                <TaskPreviewItem
                  icon={<BookOpen size={15} />}
                  step="02"
                  title="AI 授知"
                  desc="AI 辅助知识学习，完成基础概念建构与小测"
                  tone="blue"
                />
                <TaskPreviewItem
                  icon={<Lightbulb size={15} />}
                  step="03"
                  title="方案构思与校准"
                  desc="独立形成项目方案，并与角色化 AI 伙伴讨论、质疑和完善"
                  tone="teal"
                />
                <TaskPreviewItem
                  icon={<Target size={15} />}
                  step="04"
                  title="方案汇报与制作"
                  desc="中期方案汇报、教师纠偏，迭代作品并提交过程证据"
                  tone="amber"
                />
                <TaskPreviewItem
                  icon={<Presentation size={15} />}
                  step="05"
                  title="最终展示与反思"
                  desc="成果展示、现场汇报，完成综合评价与成长反思"
                  tone="green"
                />
              </div>

              {/* 学习承诺 */}
              <div className="mt-5 rounded-[var(--radius-sm)] border border-teal-200 bg-teal-50/50 p-3.5">
                <div className="flex items-start gap-2.5">
                  <Users size={16} className="mt-0.5 shrink-0 text-teal-700" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-teal-900">协作 · 探究 · 迭代</div>
                    <p className="mt-1 text-xs leading-5 text-teal-800/80">
                      你将独立承担一个完整项目，AI 伴学伙伴提供解释、启发、质疑与反馈。每一次选择、修改和作品迭代都会成为过程评价证据。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 底部辅助链接 */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-[13px] text-slate-500">
          <Link
            className="inline-flex items-center gap-1 hover:text-teal-700"
            href="/"
          >
            <ArrowRight size={13} className="rotate-180" /> 返回首页
          </Link>
          <span className="text-slate-300">|</span>
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
  tone: "indigo" | "blue" | "teal" | "amber" | "green";
}) {
  const toneMap = {
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    teal: "bg-teal-50 text-teal-700 ring-teal-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  };
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-slate-100 bg-slate-50/50 p-3 transition hover:border-slate-200 hover:bg-white">
      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-xs)] ring-1 ${toneMap[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400">STEP {step}</span>
          <span className="text-[13px] font-bold text-slate-900">{title}</span>
        </div>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{desc}</p>
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
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-[var(--radius-md)] bg-amber-50 text-amber-600 ring-1 ring-amber-100">
        <KeyRound size={22} />
      </div>
      <h2 className="mt-3 text-xl font-bold text-slate-900">课堂已结束</h2>
      <p className="mt-1.5 text-sm leading-6 text-slate-500">
        「{course.name}」已结束授课。如需重新加入，请输入新的邀请码。
      </p>
      <div className="mt-4 flex justify-center">
        <span className="inline-flex h-6 items-center rounded-full bg-slate-100 px-2.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
          已结束
        </span>
      </div>
      <button
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-teal-600 text-sm font-semibold text-white transition hover:bg-teal-700"
        onClick={onRejoin}
        type="button"
      >
        重新输入邀请码
      </button>
    </div>
  );
}
