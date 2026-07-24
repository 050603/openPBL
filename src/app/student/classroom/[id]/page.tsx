"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Clock3, Hourglass, LogIn, MonitorUp, UsersRound, X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { StudentStageView } from "@/components/views/student/stage-dispatcher";
import { StudentLeaveButton } from "@/components/student-leave-button";
import { Card, Pill, PrimaryButton } from "@/components/ui";
import { useCourse, useHydrated, useSession } from "@/lib/session/store";
import { isStudentOnline } from "@/lib/session/actions";
import { StudentProjectedTeacherResource } from "@/components/openmaic-bridge/teacher-stage-resources";
import { StageProgress } from "@/components/classroom/classroom-chrome";
import { CompanionRuntimeProvider } from "@/components/views/student/companion-runtime";
import { CompanionStudioWorkspace } from "@/components/views/student/companion-studio-workspace";
import { useStudentWorkspaceMode } from "@/components/views/student/workspace-mode";
import { getStageWorkspacePolicy, resolveStageWorkspaceMode } from "@/lib/classroom/stage-workspace-policy";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";

export default function StudentClassroomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const course = useCourse(params?.id);
  useRealtimeSync(params?.id);
  const hydrated = useHydrated();
  const { user, studentName, studentId, joinedCourseId } = useSession();
  const presenceRef = useRef<{ courseId?: string; studentId?: string }>({});
  const [optionalProjectionOpen, setOptionalProjectionOpen] = useState(false);
  const activeStageKey = course?.stages[course.currentStageIndex]?.key;
  const workspacePolicy = getStageWorkspacePolicy(
    course?.stageWorkspacePolicies,
    activeStageKey,
  );
  const [workspacePreference, setWorkspacePreference] = useStudentWorkspaceMode(
    params?.id ?? "classroom",
    studentId,
    activeStageKey,
    workspacePolicy.defaultMode,
  );
  const workspaceMode = resolveStageWorkspaceMode(workspacePolicy, workspacePreference);
  const canSwitchWorkspace = workspacePolicy.access === "student-choice";

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
        headers: {
          "Content-Type": "application/json",
          "X-OpenPBL-Role": "student",
        },
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
      // visibilitychange hidden / beforeunload 时浏览器会中止大部分 inflight
      // 请求，sendBeacon 是专门为这种场景设计的 API。如果它返回 false
      // （被中止或配额超限），不再降级到 fetch —— fetch keepalive 同样会被
      // 浏览器中止，只会再产生一条 net::ERR_ABORTED 网络错误。直接依赖
      // 服务器心跳超时机制（HEARTBEAT_TIMEOUT_MS）兜底标记离线即可。
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        try {
          navigator.sendBeacon(url, "");
        } catch {
          // sendBeacon 不可用或被中止 —— 静默失败，依赖心跳超时。
        }
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
      // 组件卸载时不主动调用 sendOffline —— 这通常是 React StrictMode
      // 双 mount 或路由切换产生的清理，主动上报会触发 net::ERR_ABORTED。
      // 依赖服务器心跳超时机制兜底。
    };
  }, [hydrated, course, studentId, joinedCourseId]);

  const displayName = studentName || (user.name && user.name !== "教师" ? user.name : "学生");

  if (!hydrated) {
    return (
      <DashboardShell role="student" userName={displayName} variant="bare">
        <div className="grid place-items-center py-20 text-stone-500">加载中...</div>
      </DashboardShell>
    );
  }

  if (!course) {
    return (
      <DashboardShell role="student" userName={displayName} variant="bare">
        <div className="mx-auto mt-20 max-w-md text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--pbl-danger-soft)] text-[var(--pbl-danger)]">
            <LogIn size={26} />
          </div>
          <h1 className="mt-4 text-2xl font-bold">未找到课堂</h1>
          <p className="mt-2 text-sm text-stone-500">该课堂不存在，或已被教师移除。</p>
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
  const forcedProjection = projectedResource && projectedResource.mode !== "optional" ? projectedResource : null;
  const optionalProjection = projectedResource?.mode === "optional" ? projectedResource : null;
  const workspaceSuppressed = Boolean(forcedProjection || optionalProjectionOpen);

  return (
    <DashboardShell
      role="student"
      userName={displayName}
      variant="bare"
      wide={currentStage?.key === "ai-learning"}
      immersive={isTeaching && workspaceMode === "companions" && !forcedProjection && !optionalProjectionOpen}
      hideCourseSwitcher
      currentCourse={{ id: course.id, name: course.name, status: course.status }}
      currentStage={currentStage ? { index: course.currentStageIndex, total, label: currentStage.label } : undefined}
      currentTask={currentStage?.description}
      leadRole={currentStage?.key === "ai-learning" ? "AI" : currentStage?.key === "showcase" ? "教师" : "学生"}
      headerSlot={
        isTeaching && currentStage ? (
          <div className="hidden items-center gap-2 md:flex">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--pbl-student-soft)] px-2.5 text-[12px] font-bold text-[var(--pbl-student)] ring-1 ring-[var(--pbl-student-border)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--pbl-student)]" />
              阶段 {course.currentStageIndex + 1}/{total} · {currentStage.label}
            </span>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-[var(--pbl-student)] transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[12px] font-bold text-[var(--pbl-student)]">{progress}%</span>
            </div>
            <span className="text-[12px] font-semibold text-stone-400">在线 {onlineCount}</span>
            <StudentLeaveButton className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-xs)] border border-orange-200 bg-white/80 px-2.5 text-[12px] font-semibold text-[var(--pbl-danger)] transition hover:bg-[var(--pbl-danger-soft)]" />
          </div>
        ) : (
          <Pill tone={isTeaching ? "green" : "orange"} className="hidden md:inline-flex">
            {isTeaching ? "课堂同步中" : "等待教师开始"}
          </Pill>
        )
      }
    >
      {isTeaching && workspaceMode === "task" ? <div className="mb-4"><StageProgress course={course} readonly /></div> : null}
      {/* 小屏幕精简课程信息条 */}
      {isTeaching && currentStage && workspaceMode === "task" ? (
        <div className="mb-3 flex items-center gap-2 md:hidden">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--pbl-student-soft)] px-2.5 text-[12px] font-bold text-[var(--pbl-student)] ring-1 ring-[var(--pbl-student-border)]">
            阶段 {course.currentStageIndex + 1}/{total} · {currentStage.label}
          </span>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full rounded-full bg-[var(--pbl-student)] transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[12px] font-bold text-[var(--pbl-student)]">{progress}%</span>
          </div>
          <StudentLeaveButton className="ml-auto inline-flex h-7 items-center gap-1 rounded-[var(--radius-xs)] border border-orange-200 bg-white px-2.5 text-[12px] font-semibold text-[var(--pbl-danger)]" />
        </div>
      ) : null}

      {course.status === "finished" ? (
        <FinishedState course={course} />
      ) : !isTeaching ? (
        <WaitingState status={course.status} />
      ) : currentStage ? (
        <CompanionRuntimeProvider course={course} stageKey={currentStage.key} contextLabel={currentStage.label}>
          {forcedProjection ? <StudentProjectedTeacherResource projection={forcedProjection} /> : null}
          {optionalProjection ? (
            <div className="mb-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)]/80">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--pbl-teacher)]"><MonitorUp size={18} /></span><div><p className="font-bold text-stone-900">教师正在投屏：{optionalProjection.title}</p><p className="text-xs text-[var(--pbl-teacher)]">你可以继续当前任务，也可以打开只读实时演示。</p></div></div>
                <PrimaryButton onClick={() => setOptionalProjectionOpen((value) => !value)} type="button" variant="outline">{optionalProjectionOpen ? <><X size={15} />收起投屏</> : <><MonitorUp size={15} />查看投屏</>}</PrimaryButton>
              </div>
              {optionalProjectionOpen ? <div className="border-t border-[var(--pbl-teacher-border)] bg-white p-3"><StudentProjectedTeacherResource projection={optionalProjection} /></div> : null}
            </div>
          ) : null}
          <div aria-hidden={workspaceSuppressed} hidden={workspaceSuppressed}>
              <div className={workspaceMode === "task" ? "space-y-3" : ""}>
                {workspaceMode === "task" && canSwitchWorkspace ? (
                  <div className="flex justify-end">
                    <button className="inline-flex min-h-9 items-center gap-2 rounded-full border border-amber-200 bg-[#fff8e8] px-3.5 text-xs font-bold text-amber-800 shadow-sm transition hover:bg-[#fff1cf]" onClick={() => setWorkspacePreference("companions")} type="button">
                      <UsersRound size={15} /> 返回伴学教室
                    </button>
                  </div>
                ) : null}
                <div aria-hidden={workspaceMode !== "task"} hidden={workspaceMode !== "task"} role="tabpanel" aria-label="任务视图">
                  <section
                    className={
                      currentStage.key === "ai-learning"
                        ? "overflow-hidden rounded-[var(--radius-lg)] animate-[fadeIn_0.28s_ease-out]"
                        : "pbl-card overflow-hidden rounded-[var(--radius-lg)] p-4 animate-[fadeIn_0.28s_ease-out] md:p-5"
                    }
                    key={currentStage.key}
                  >
                    <StudentStageView course={course} view={currentStage.view} />
                  </section>
                </div>
                <div aria-hidden={workspaceMode !== "companions"} hidden={workspaceMode !== "companions"} role="tabpanel" aria-label="伴学教室">
                  <CompanionStudioWorkspace
                    course={course}
                    stageKey={currentStage.key}
                    contextLabel={currentStage.label}
                    canSwitchMode={canSwitchWorkspace}
                    onSwitchToTask={() => setWorkspacePreference("task")}
                  />
                </div>
              </div>
          </div>
        </CompanionRuntimeProvider>
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
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--pbl-warning-soft)] text-[var(--pbl-warning)]">
        <Hourglass size={32} />
      </div>
      <h2 className="mt-4 text-2xl font-bold">课堂暂未开始</h2>
      <p className="mt-2 text-sm text-stone-500">{message}</p>
    </Card>
  );
}

function FinishedState({ course }: { course: { name: string } }) {
  return (
    <Card className="text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-stone-100 text-stone-500">
        <Clock3 size={32} />
      </div>
      <h2 className="mt-4 text-2xl font-bold">课堂已结束</h2>
      <p className="mt-2 text-sm text-stone-500">《{course.name}》已结束授课。你可以留在这里回看作品、评价证据和反思记录。</p>
    </Card>
  );
}
