"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Clock3,
  FilePenLine,
  Hourglass,
  LogIn,
  MonitorUp,
  X,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Pill, PrimaryButton } from "@/components/ui";
import { useCourse, useHydrated, useSession } from "@/lib/session/store";
import { StudentProjectedTeacherResource } from "@/components/openmaic-bridge/teacher-stage-resources";
import { StudentStageView } from "@/components/views/student/stage-dispatcher";
import { CompanionRuntimeProvider } from "@/components/views/student/companion-runtime";
import { CompanionStudioWorkspace } from "@/components/views/student/companion-studio-workspace";
import { getStageWorkspacePolicy } from "@/lib/classroom/stage-workspace-policy";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { deriveStageReadiness } from "@/lib/learning-evidence/readiness";
import { STAGE_READINESS_LABEL } from "@/lib/learning-evidence/types";
import type { TeacherResourceProjection } from "@/lib/session/types";
import { useCoursePresence } from "@/hooks/use-course-presence";
import { StudentResourceProjection } from "@/components/classroom/simple-stage-resources";
import { StageEmptyState } from "@/components/classroom/classroom-ui";
import { StudentClassroomHeaderStatus } from "@/components/classroom/student-classroom-header-status";
import { isNewOpenPblSystem } from "@/lib/system-mode";

export default function StudentClassroomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const course = useCourse(params?.id);
  useRealtimeSync(params?.id);
  const hydrated = useHydrated();
  const { user, studentName, studentId, joinedCourseId } = useSession();
  const presence = useCoursePresence({
    courseId: course?.id,
    role: "student",
    enabled: course?.status === "teaching" && course.id === joinedCourseId,
    heartbeat: true,
  });
  const [optionalProjectionOpen, setOptionalProjectionOpen] = useState(false);
  const newSystem = isNewOpenPblSystem();
  const activeStageKey = course?.stages[course.currentStageIndex]?.key;
  const workspacePolicy = getStageWorkspacePolicy(
    course?.stageWorkspacePolicies,
    activeStageKey,
  );
  const workspaceMode = activeStageKey === "ai-learning"
    || workspacePolicy.access === "task-only"
    ? "task"
    : "companions";

  useEffect(() => {
    if (workspaceMode !== "task" || typeof window === "undefined") return;
    window.speechSynthesis?.cancel();
  }, [activeStageKey, workspaceMode]);

  useEffect(() => {
    if (!hydrated) return;
    if (joinedCourseId && joinedCourseId !== params?.id) router.replace("/student");
  }, [hydrated, joinedCourseId, params?.id, router]);

  useEffect(() => {
    if (
      !newSystem
      || !hydrated
      || course?.status !== "teaching"
      || course.stages[course.currentStageIndex]?.view !== "ai-collaboration"
    ) return;
    router.replace(`/student/ai-collaboration/${course.id}`);
  }, [course, hydrated, newSystem, router]);

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
  const onlineCount = course.students.filter((student) =>
    presence.onlineStudentIds.has(student.id)
  ).length;
  const readiness = currentStage && studentId
    ? deriveStageReadiness(course, studentId, currentStage.key)
    : null;
  const projectedResource =
    course.uiState?.teacherResourceProjection?.stageKey === currentStage?.key
      ? course.uiState.teacherResourceProjection
      : null;
  const forcedProjection = projectedResource && projectedResource.mode !== "optional" ? projectedResource : null;
  const optionalProjection = projectedResource?.mode === "optional" ? projectedResource : null;
  const uploadedProjection =
    course.uiState?.resourceProjection?.stageKey === currentStage?.key
      ? course.uiState.resourceProjection
      : null;
  const uploadedProjectionResource = uploadedProjection
    ? course.resources?.find((resource) => resource.id === uploadedProjection.resourceId)
    : undefined;

  if (newSystem && isTeaching && currentStage?.view === "ai-collaboration") {
    return (
      <DashboardShell
        role="student"
        userName={displayName}
        variant="bare"
        currentCourse={{ id: course.id, name: course.name, status: course.status }}
        currentStage={{ index: course.currentStageIndex, total, label: currentStage.label }}
        hideCourseSwitcher
      >
        <div className="grid min-h-72 place-items-center text-sm text-stone-500">
          <span className="inline-flex items-center gap-2">正在进入项目实践协作工作台…</span>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      role="student"
      userName={displayName}
      variant="bare"
      wide={currentStage?.key === "ai-learning"}
      immersive={isTeaching && workspaceMode === "companions"}
      viewportLocked={isTeaching && activeStageKey === "ai-learning"}
      hideCourseSwitcher
      currentCourse={{ id: course.id, name: course.name, status: course.status }}
      currentStage={currentStage ? { index: course.currentStageIndex, total, label: currentStage.label } : undefined}
      currentTask={currentStage?.description}
      leadRole={currentStage?.key === "ai-learning" ? "AI" : currentStage?.key === "showcase" ? "教师" : "学生"}
      headerSlot={
        isTeaching && currentStage ? (
          <StudentClassroomHeaderStatus
            currentIndex={course.currentStageIndex}
            onlineCount={onlineCount}
            readinessLabel={readiness ? STAGE_READINESS_LABEL[readiness.status] : "未开始"}
            stageLabel={currentStage.label}
            total={total}
          />
        ) : (
          <Pill tone={isTeaching ? "green" : "orange"} className="hidden md:inline-flex">
            {isTeaching ? "课堂同步中" : "等待教师开始"}
          </Pill>
        )
      }
    >
      {course.status === "finished" ? (
        <FinishedState course={course} />
      ) : !isTeaching ? (
        <WaitingState status={course.status} />
      ) : currentStage ? (
        <>
          {workspaceMode === "task" ? (
            <div className={activeStageKey === "ai-learning" ? "flex h-full min-h-0 flex-col gap-3" : "space-y-3"}>
              {forcedProjection ? <StudentProjectedTeacherResource projection={forcedProjection} /> : null}
              {optionalProjection ? (
                <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)]/80">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--pbl-teacher)]"><MonitorUp size={18} /></span><div><p className="font-bold text-stone-900">教师正在投屏：{optionalProjection.title}</p><p className="text-xs text-[var(--pbl-teacher)]">你可以继续当前任务，也可以打开只读实时演示。</p></div></div>
                    <PrimaryButton onClick={() => setOptionalProjectionOpen((value) => !value)} type="button" variant="outline">{optionalProjectionOpen ? <><X size={15} />收起投屏</> : <><MonitorUp size={15} />查看投屏</>}</PrimaryButton>
                  </div>
                  {optionalProjectionOpen ? <div className="border-t border-[var(--pbl-teacher-border)] bg-white p-3"><StudentProjectedTeacherResource projection={optionalProjection} /></div> : null}
                </div>
              ) : null}
              {activeStageKey === "proposal" || activeStageKey === "make" ? (
                <AiCollaborationExperimentEntry
                  onOpen={() => router.push(`/student/ai-collaboration/${course.id}`)}
                />
              ) : null}
              <section className={activeStageKey === "ai-learning"
                ? "min-h-0 flex-1 overflow-hidden rounded-[var(--radius-lg)]"
                : "overflow-hidden rounded-[var(--radius-lg)]"}>
                <StudentStageView
                  course={course}
                  view={currentStage.view}
                />
              </section>
            </div>
          ) : (
            <CompanionRuntimeProvider
              contextLabel={currentStage.label}
              course={course}
              stageKey={currentStage.key}
            >
              <CompanionStudioWorkspace
                contextLabel={currentStage.label}
                course={course}
                onOpenTeacherProjection={optionalProjection
                  ? () => setOptionalProjectionOpen(true)
                  : undefined}
                onOpenAiCollaboration={activeStageKey === "proposal" || activeStageKey === "make"
                  ? () => router.push(`/student/ai-collaboration/${course.id}`)
                  : undefined}
                stageKey={currentStage.key}
                teacherProjection={optionalProjection
                  ? { title: optionalProjection.title }
                  : undefined}
              />
              {forcedProjection ? (
                <ProjectedResourceOverlay projection={forcedProjection} />
              ) : optionalProjection && optionalProjectionOpen ? (
                <ProjectedResourceOverlay
                  onClose={() => setOptionalProjectionOpen(false)}
                  projection={optionalProjection}
                />
              ) : null}
            </CompanionRuntimeProvider>
          )}
        </>
      ) : null}
      {uploadedProjectionResource ? (
        <StudentResourceProjection
          projection={uploadedProjection!}
          resource={uploadedProjectionResource}
        />
      ) : null}
    </DashboardShell>
  );
}

function AiCollaborationExperimentEntry({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="classroom-stage flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--pbl-student-border)] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--pbl-ai)] text-white shadow-sm">
          <FilePenLine size={21} />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[var(--pbl-student)]">AI 小组协作实验</p>
          <h2 className="mt-1 text-base font-bold text-stone-950">边写项目文档，边和 AI 小组成员协作</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">讨论、检查和整理都围绕正在编辑的文档进行；实际修改仍由你确认。</p>
        </div>
      </div>
      <PrimaryButton className="h-11 shrink-0 px-5" onClick={onOpen} type="button">
        <FilePenLine size={16} />进入 AI 协作
      </PrimaryButton>
    </section>
  );
}

function ProjectedResourceOverlay({
  projection,
  onClose,
}: {
  projection: TeacherResourceProjection;
  onClose?: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[140] flex items-stretch justify-end bg-slate-950/25 p-2 backdrop-blur-[3px] sm:p-3"
      role="presentation"
    >
      {onClose ? (
        <button
          aria-label="关闭教师演示"
          className="absolute inset-0 cursor-default"
          onClick={onClose}
          type="button"
        />
      ) : null}
      <section
        aria-labelledby="student-projection-title"
        aria-modal="true"
        className="pbl-wide-container relative z-10 flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/80 bg-stone-50 shadow-[0_28px_90px_rgba(15,23,42,.28)] sm:rounded-[1.5rem]"
        role="dialog"
      >
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-stone-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]">
              <MonitorUp size={19} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--pbl-teacher)]">
                {onClose ? "可选课堂演示" : "教师同步演示"}
              </p>
              <h2 className="truncate text-base font-bold text-stone-950 sm:text-lg" id="student-projection-title">
                {projection.title}
              </h2>
            </div>
          </div>
          {onClose ? (
            <button
              aria-label="关闭教师演示"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:border-stone-300 hover:bg-stone-50"
              onClick={onClose}
              type="button"
            >
              <X size={18} />
            </button>
          ) : (
            <span className="rounded-full bg-[var(--pbl-teacher-soft)] px-3 py-1.5 text-xs font-bold text-[var(--pbl-teacher)]">
              课堂同步中
            </span>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
          <StudentProjectedTeacherResource projection={projection} />
        </div>
      </section>
    </div>
  );
}

function WaitingState({ status }: { status: string }) {
  const message = status === "ready" ? "教师尚未开始授课，请稍候。" : "课堂尚未开放，请稍候。";
  return <StageEmptyState description={message} icon={Hourglass} title="课堂暂未开始" tone="warning" />;
}

function FinishedState({ course }: { course: { name: string } }) {
  return <StageEmptyState description={`《${course.name}》已结束授课。你可以留在这里回看作品、评价证据和反思记录。`} icon={Clock3} title="课堂已结束" tone="neutral" />;
}
