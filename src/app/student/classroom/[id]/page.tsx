"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Clock3, Hourglass, LogIn, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { StageStepper } from "@/components/stage-stepper";
import { StudentStageView } from "@/components/views/student/stage-dispatcher";
import { StudentLeaveButton } from "@/components/student-leave-button";
import { Card, Pill, PrimaryButton, ProgressBar } from "@/components/ui";
import { useCourse, useHydrated, useSession } from "@/lib/session/store";
import { isStudentOnline } from "@/lib/session/actions";

export default function StudentClassroomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const course = useCourse(params?.id);
  const hydrated = useHydrated();
  const { user, studentName, studentId, joinedCourseId } = useSession();
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Ref so the unload handler always has the latest studentId/joinedCourseId.
  const presenceRef = useRef<{ courseId?: string; studentId?: string }>({});

  useEffect(() => {
    if (!hydrated) return;
    if (joinedCourseId && joinedCourseId !== params?.id) router.replace("/student");
  }, [hydrated, joinedCourseId, params?.id, router]);

  useEffect(() => {
    if (!hydrated || !course || course.status !== "finished") return;
    const t = setTimeout(() => router.replace("/student"), 1800);
    return () => clearTimeout(t);
  }, [hydrated, course, router]);

  // ===== Heartbeat: send presence ping every 10s while in a teaching class =====
  useEffect(() => {
    if (!hydrated || !course || course.status !== "teaching") return;
    if (!studentId || course.id !== joinedCourseId) return;

    presenceRef.current = { courseId: course.id, studentId };

    const sendHeartbeat = () => {
      fetch("/api/session/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id, studentId }),
        keepalive: true,
      }).catch(() => {
        // Heartbeat failures are non-fatal — the server's sweep will mark us
        // offline after HEARTBEAT_TIMEOUT_MS if heartbeats stop arriving.
      });
    };

    // Send immediately on mount so the student shows online right away.
    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, 10_000);

    // On page unload / visibilitychange to hidden, send a DELETE so the
    // teacher's view updates immediately rather than waiting for the sweep.
    const sendOffline = () => {
      const { courseId, studentId } = presenceRef.current;
      if (!courseId || !studentId) return;
      const url = `/api/session/presence?courseId=${encodeURIComponent(courseId)}&studentId=${encodeURIComponent(studentId)}`;
      // sendBeacon works even during page unload.
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, "");
      } else {
        fetch(url, { method: "DELETE", keepalive: true }).catch(() => {});
      }
    };

    const handleVisibilityHidden = () => {
      if (document.visibilityState === "hidden") sendOffline();
    };
    const handleBeforeUnload = () => sendOffline();

    document.addEventListener("visibilitychange", handleVisibilityHidden);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityHidden);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // When navigating away from the classroom page (but not closing the tab),
      // also mark the student offline.
      sendOffline();
    };
  }, [hydrated, course?.id, course?.status, studentId, joinedCourseId]);

  const displayName = studentName ?? user.name;

  if (!hydrated) {
    return (
      <DashboardShell role="student" userName={displayName} variant="bare">
        <div className="grid place-items-center py-20 text-slate-500">加载中...</div>
      </DashboardShell>
    );
  }

  if (!course) {
    return (
      <DashboardShell role="student" userName={displayName} variant="bare">
        <div className="mx-auto mt-20 max-w-md text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-50 text-red-600">
            <LogIn size={26} />
          </div>
          <h1 className="mt-4 text-2xl font-black">未找到课堂</h1>
          <p className="mt-2 text-sm text-slate-500">该课堂不存在或已被教师移除。</p>
          <PrimaryButton className="mt-6 h-11 px-6" onClick={() => router.replace("/student")}>
            返回学生端
          </PrimaryButton>
        </div>
      </DashboardShell>
    );
  }

  const currentStage = course.stages[course.currentStageIndex];
  const total = course.stages.length;
  const isTeaching = course.status === "teaching";
  const progress = currentStage && studentId
    ? course.students.find((item) => item.id === studentId)?.stageProgress[currentStage.key] ?? 0
    : 0;

  return (
    <DashboardShell
      role="student"
      userName={displayName}
      variant="bare"
      currentCourse={{ id: course.id, name: course.name, status: course.status }}
      currentStage={currentStage ? { index: course.currentStageIndex, total, label: currentStage.label } : undefined}
      headerSlot={
        <Pill tone={isTeaching ? "green" : "orange"} className="hidden md:inline-flex">
          {isTeaching ? "课堂同步中" : "等待教师开始"}
        </Pill>
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[26px] font-black text-slate-950">{currentStage?.label ?? "课堂"}</h1>
          <p className="mt-1 text-sm text-slate-500">{course.name} · 阶段由教师端统一控制</p>
        </div>
        <StudentLeaveButton />
      </div>

      {course.status === "finished" ? (
        <FinishedState course={course} />
      ) : !isTeaching ? (
        <WaitingState status={course.status} />
      ) : (
        <>
          <StageStepper currentIndex={course.currentStageIndex} stages={course.stages} variant="student" />
          <Card className="mt-5" compact>
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="grid min-w-0 gap-4 sm:grid-cols-4">
                <InfoCell label="课程" value={course.name} />
                <InfoCell label="学科 / 年级" value={`${course.subject || "-"} · ${course.grade || "-"}`} />
                <InfoCell label="当前阶段" value={`${course.currentStageIndex + 1}/${total} ${currentStage?.label ?? ""}`} />
                <div className="min-w-0">
                  <div className="text-sm text-slate-500">我的本阶段进度</div>
                  <div className="mt-2 flex items-center gap-2">
                    <ProgressBar value={progress} className="flex-1" />
                    <span className="text-sm font-black text-blue-700">{progress}%</span>
                  </div>
                </div>
              </div>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                onClick={() => setDetailsOpen((value) => !value)}
                type="button"
              >
                <ShieldCheck size={16} /> {detailsOpen ? "收起状态" : "查看状态"}
              </button>
            </div>
            {detailsOpen ? (
              <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
                <InfoCell label="学生" value={displayName} />
                <InfoCell label="在线学生" value={`${course.students.filter((s) => isStudentOnline(s)).length} 人`} />
                <InfoCell label="说明" value="学生端不可自行切换阶段，所有阶段由教师端同步推进。" />
              </div>
            ) : null}
          </Card>

          {currentStage ? (
            <div
              className="mt-5 rounded-[10px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.06)] animate-[fadeIn_0.3s_ease-out]"
              key={currentStage.key}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-slate-500">阶段 {course.currentStageIndex + 1} / {total}</div>
                  <h2 className="text-2xl font-black">{currentStage.label}</h2>
                  <p className="mt-1 text-sm text-slate-500">{currentStage.description}</p>
                </div>
                <Pill tone="blue">教师同步</Pill>
              </div>
              <div className="border-t border-slate-100 pt-5">
                <StudentStageView course={course} view={currentStage.view} />
              </div>
            </div>
          ) : null}
        </>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </DashboardShell>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 truncate text-base font-black text-slate-900">{value}</div>
    </div>
  );
}

function WaitingState({ status }: { status: string }) {
  const message = status === "ready" ? "教师尚未开始授课，请稍候。" : "课堂尚未开放，请稍候。";
  return (
    <Card className="text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-50 text-amber-600">
        <Hourglass size={32} />
      </div>
      <h2 className="mt-4 text-2xl font-black">课堂暂未开始</h2>
      <p className="mt-2 text-sm text-slate-500">{message}</p>
    </Card>
  );
}

function FinishedState({ course }: { course: { name: string } }) {
  return (
    <Card className="text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-500">
        <Clock3 size={32} />
      </div>
      <h2 className="mt-4 text-2xl font-black">课堂已结束</h2>
      <p className="mt-2 text-sm text-slate-500">《{course.name}》已结束授课，正在返回学生端。</p>
    </Card>
  );
}
