"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, Sparkles, RotateCcw } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { JoinClassForm } from "@/components/join-class-form";
import { Card, Pill, PrimaryButton } from "@/components/ui";
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
      <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-3xl flex-col items-stretch justify-center py-10">
        <div className="mb-7 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
            <Sparkles size={26} />
          </div>
          <h1 className="mt-4 text-[34px] font-black tracking-tight text-slate-950">
            学生端
          </h1>
          <p className="mt-2 text-base text-slate-500">
            AI 探知 · 项目共创平台 — 输入教师提供的 6 位邀请码加入课堂
          </p>
        </div>

        {!hydrated ? (
          <div className="mx-auto w-full max-w-md rounded-[12px] border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
            加载中…
          </div>
        ) : joinedCourse && joinedCourse.status !== "teaching" ? (
          <FinishedState course={joinedCourse} onRejoin={handleRejoinWithCode} />
        ) : (
          <>
            {/* Show rejoin cards for previously left courses */}
            {leftHistory.length > 0 && (
              <div className="mb-5 space-y-3">
                <div className="text-center text-sm font-semibold text-slate-500">快速重新加入</div>
                {leftHistory.map((record) => (
                  <Card key={record.courseId} className="mx-auto w-full max-w-md">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-black">{record.courseName}</div>
                        <div className="mt-1 text-sm text-slate-500">
                          以 <span className="font-semibold">{record.studentName}</span> 身份重新加入
                        </div>
                      </div>
                      <PrimaryButton
                        className="h-9 px-4 text-sm"
                        disabled={busy}
                        onClick={() => handleRejoin(record)}
                        type="button"
                      >
                        <RotateCcw size={15} /> 重新加入
                      </PrimaryButton>
                    </div>
                  </Card>
                ))}
                <div className="text-center text-xs text-slate-400">或使用邀请码加入新课堂</div>
              </div>
            )}
            <JoinClassForm
              busy={busy}
              errorMessage={error}
              onSubmit={handleJoin}
            />
          </>
        )}

        <div className="mt-6 flex items-center justify-center gap-4 text-sm text-slate-500">
          <Link
            className="inline-flex items-center gap-1 hover:text-blue-700"
            href="/"
          >
            <ArrowRight size={14} className="rotate-180" /> 返回首页
          </Link>
          <span className="text-slate-300">|</span>
          <span className="inline-flex items-center gap-1">
            <KeyRound size={14} /> 没有邀请码？请向任课教师索取
          </span>
        </div>
      </div>
    </DashboardShell>
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
    <Card className="mx-auto w-full max-w-md text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-50 text-amber-600">
        <KeyRound size={26} />
      </div>
      <h2 className="mt-4 text-[24px] font-black">课堂已结束</h2>
      <p className="mt-2 text-sm text-slate-500">
        「{course.name}」已结束授课。如需重新加入，请输入新的邀请码。
      </p>
      <div className="mt-4 flex justify-center">
        <Pill tone="orange">已结束</Pill>
      </div>
      <div className="mt-6">
        <PrimaryButton className="h-11 w-full justify-center" onClick={onRejoin} type="button">
          重新输入邀请码
        </PrimaryButton>
      </div>
    </Card>
  );
}
