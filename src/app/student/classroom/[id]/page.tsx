"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Clock3, Hourglass, LogIn } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { StudentStageView } from "@/components/views/student/stage-dispatcher";
import { StudentLeaveButton } from "@/components/student-leave-button";
import { Card, Pill, PrimaryButton } from "@/components/ui";
import { useCourse, useHydrated, useSession } from "@/lib/session/store";
import { isStudentOnline } from "@/lib/session/actions";
import { StudentProjectedTeacherResource } from "@/components/openmaic-bridge/teacher-stage-resources";
import { StageProgress } from "@/components/classroom/classroom-chrome";

export default function StudentClassroomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const course = useCourse(params?.id);
  const hydrated = useHydrated();
  const { user, studentName, studentId, joinedCourseId } = useSession();
  const presenceRef = useRef<{ courseId?: string; studentId?: string }>({});

  useEffect(() => {
    if (!hydrated) return;
    if (joinedCourseId && joinedCourseId !== params?.id) router.replace("/student");
  }, [hydrated, joinedCourseId, params?.id, router]);

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
        // The server sweep handles missed heartbeats.
      });
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, 10_000);

    const sendOffline = () => {
      const { courseId, studentId } = presenceRef.current;
      if (!courseId || !studentId) return;
      const url = `/api/session/presence?courseId=${encodeURIComponent(courseId)}&studentId=${encodeURIComponent(studentId)}`;
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
      sendOffline();
    };
  }, [hydrated, course, studentId, joinedCourseId]);

  const displayName = studentName || (user.name && user.name !== "教师" ? user.name : "学生");

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
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rose-50 text-rose-600">
            <LogIn size={26} />
          </div>
          <h1 className="mt-4 text-2xl font-bold">未找到课堂</h1>
          <p className="mt-2 text-sm text-slate-500">该课堂不存在，或已被教师移除。</p>
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
  const onlineCount = course.students.filter((s) => isStudentOnline(s)).length;
  const progress = currentStage && studentId
    ? course.students.find((item) => item.id === studentId)?.stageProgress[currentStage.key] ?? 0
    : 0;
  const projectedResource =
    course.uiState?.teacherResourceProjection?.stageKey === currentStage?.key
      ? course.uiState.teacherResourceProjection
      : null;

  return (
    <DashboardShell
      role="student"
      userName={displayName}
      variant="bare"
      hideCourseSwitcher
      currentCourse={{ id: course.id, name: course.name, status: course.status }}
      currentStage={currentStage ? { index: course.currentStageIndex, total, label: currentStage.label } : undefined}
      currentTask={currentStage?.description}
      leadRole={currentStage?.key === "ai-learning" ? "AI" : currentStage?.key === "review" || currentStage?.key === "showcase" ? "教师" : "学生"}
      headerSlot={
        isTeaching && currentStage ? (
          <div className="hidden items-center gap-2 md:flex">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-teal-50 px-2.5 text-[12px] font-bold text-teal-700 ring-1 ring-teal-200">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              阶段 {course.currentStageIndex + 1}/{total} · {currentStage.label}
            </span>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[12px] font-bold text-teal-700">{progress}%</span>
            </div>
            <span className="text-[12px] font-semibold text-slate-400">在线 {onlineCount}</span>
            <StudentLeaveButton className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-xs)] border border-rose-200 bg-white/80 px-2.5 text-[12px] font-semibold text-rose-600 transition hover:bg-rose-50" />
          </div>
        ) : (
          <Pill tone={isTeaching ? "green" : "orange"} className="hidden md:inline-flex">
            {isTeaching ? "课堂同步中" : "等待教师开始"}
          </Pill>
        )
      }
    >
      {isTeaching ? <div className="mb-4"><StageProgress course={course} readonly /></div> : null}
      {/* 小屏幕精简课程信息条 */}
      {isTeaching && currentStage ? (
        <div className="mb-3 flex items-center gap-2 md:hidden">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-teal-50 px-2.5 text-[12px] font-bold text-teal-700 ring-1 ring-teal-200">
            阶段 {course.currentStageIndex + 1}/{total} · {currentStage.label}
          </span>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[12px] font-bold text-teal-700">{progress}%</span>
          </div>
          <StudentLeaveButton className="ml-auto inline-flex h-7 items-center gap-1 rounded-[var(--radius-xs)] border border-rose-200 bg-white px-2.5 text-[12px] font-semibold text-rose-600" />
        </div>
      ) : null}

      {course.status === "finished" ? (
        <FinishedState course={course} />
      ) : !isTeaching ? (
        <WaitingState status={course.status} />
      ) : projectedResource ? (
        <StudentProjectedTeacherResource projection={projectedResource} />
      ) : currentStage ? (
        <section
          className="pbl-card overflow-hidden rounded-[var(--radius-lg)] p-4 animate-[fadeIn_0.28s_ease-out] md:p-5"
          key={currentStage.key}
        >
          <StudentStageView course={course} view={currentStage.view} />
        </section>
      ) : null}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </DashboardShell>
  );
}

function WaitingState({ status }: { status: string }) {
  const message = status === "ready" ? "教师尚未开始授课，请稍候。" : "课堂尚未开放，请稍候。";
  return (
    <Card className="text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-50 text-amber-600">
        <Hourglass size={32} />
      </div>
      <h2 className="mt-4 text-2xl font-bold">课堂暂未开始</h2>
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
      <h2 className="mt-4 text-2xl font-bold">课堂已结束</h2>
      <p className="mt-2 text-sm text-slate-500">《{course.name}》已结束授课。你可以留在这里回看作品、评价证据和反思记录。</p>
    </Card>
  );
}
