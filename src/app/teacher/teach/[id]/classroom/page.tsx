"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Clock3,
  Copy,
  Eye,
  Lightbulb,
  Pause,
  Play,
  QrCode,
  RefreshCw,
  RotateCcw,
  UserRoundCheck,
  Users,
  X,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { DashboardShell, Avatar } from "@/components/dashboard-shell";
import { StageGateDialog, StageProgress } from "@/components/classroom/classroom-chrome";
import { TeacherStageView } from "@/components/views/teacher/stage-dispatcher";
import { CompanionMonitor } from "@/components/views/teacher/companion-monitor";
import { TeacherStageResources } from "@/components/openmaic-bridge/teacher-stage-resources";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, Button, FlowActionBar, ProgressBar, SaveStatus } from "@/components/ui";
import { useSession, useCourse, useHydrated } from "@/lib/session/store";
import { cn } from "@/lib/utils";
import { evaluateStageGate } from "@/lib/classroom/stage-gates";
import { makeRecordId } from "@/lib/session/actions";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { useCoursePresence } from "@/hooks/use-course-presence";
import { deriveStageReadiness } from "@/lib/learning-evidence/readiness";
import { STAGE_READINESS_LABEL } from "@/lib/learning-evidence/types";
import {
  aiAssessmentConfidenceLabel,
  aiAssessmentStatusLabel,
  uniqueEvidenceGaps,
} from "@/lib/evaluation/process-assessment";
import {
  adjustClassroomStageTiming,
  createClassroomTimingState,
  deriveClassroomTimingSnapshot,
  pauseClassroomTiming,
  resetActiveClassroomStageTiming,
  resumeClassroomTiming,
  transitionClassroomStageTiming,
  type ClassroomTimingSnapshot,
  type ClassroomTimingState,
} from "@/lib/classroom/timing";

type ToolPanel = "timer" | "invite" | "students" | null;

export function shouldShowClassroomDataSidebar(
  stageKey: string | undefined,
  focusMode: boolean,
): boolean {
  return !focusMode && stageKey !== "showcase";
}

export default function TeachClassroomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const { user, endTeaching, generateNewInviteCode, updateCourse } = session;
  const course = useCourse(params?.id);
  useRealtimeSync(params?.id);
  const presence = useCoursePresence({
    courseId: course?.id,
    role: "teacher",
    enabled: course?.status === "teaching",
  });
  const hydrated = useHydrated();
  const [nowTick, setNowTick] = useState(0);
  const [toolPanel, setToolPanel] = useState<ToolPanel>(null);
  const [targetStageIndex, setTargetStageIndex] = useState<number | null>(null);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [companionMonitorOpen, setCompanionMonitorOpen] = useState(false);
  const [monitorStudentId, setMonitorStudentId] = useState<string | undefined>();

  useEffect(() => {
    if (!hydrated) return;
    if (course && course.status !== "teaching") router.replace(`/teacher/teach/${course.id}/setup`);
  }, [course, hydrated, router]);

  useEffect(() => {
    if (!course || course.status !== "teaching") return;
    const id = window.setInterval(() => setNowTick((t) => t + 1), 1_000);
    return () => window.clearInterval(id);
  }, [course]);

  useEffect(() => {
    if (
      !course
      || course.status !== "teaching"
      || course.uiState?.classroomTiming
    ) {
      return;
    }
    const classroomTiming = createClassroomTimingState({
      stages: course.stages,
      totalMinutes:
        course.content.projectMainline?.totalMinutes
        ?? course.content.moduleTimingPlan?.totalMinutes
        ?? course.hours * 60,
      projectMainline: course.content.projectMainline,
      moduleTimingPlan: course.content.moduleTimingPlan,
      activeStageKey: course.stages[course.currentStageIndex]?.key,
    });
    updateCourse(course.id, {
      uiState: {
        ...(course.uiState ?? {}),
        classroomTiming,
      },
    });
  }, [course, updateCourse]);

  const onlineCount = course?.students.filter((student) =>
    presence.onlineStudentIds.has(student.id)
  ).length ?? 0;

  const timingSnapshot = useMemo(() => {
    void nowTick;
    const timing = course?.uiState?.classroomTiming;
    return timing
      ? deriveClassroomTimingSnapshot(timing, new Date().toISOString())
      : undefined;
  }, [course?.uiState?.classroomTiming, nowTick]);

  if (!hydrated) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-stone-500">加载中...</div>
      </DashboardShell>
    );
  }

  if (!course) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-stone-500">
          未找到课程。
          <Link className="mt-4 text-blue-700 hover:underline" href="/teacher">返回课程列表</Link>
        </div>
      </DashboardShell>
    );
  }

  const currentStage = course.stages[course.currentStageIndex];
  const showDataSidebar = shouldShowClassroomDataSidebar(currentStage?.key, focusMode);
  const companionStageActive = currentStage?.key === "proposal" || currentStage?.key === "make";
  const canPrev = course.currentStageIndex > 0;
  const canNext = course.currentStageIndex < course.stages.length - 1;
  const timerText = timingSnapshot?.activeStage
    ? timingSnapshot.activeStage.overrunSec > 0
      ? `+${formatClock(timingSnapshot.activeStage.overrunSec)}`
      : formatClock(timingSnapshot.activeStage.remainingSec)
    : "--:--";
  const stageReadinessRows = currentStage
    ? course.students.map((student) => ({
        student,
        readiness: deriveStageReadiness(course, student.id, currentStage.key),
      }))
    : [];
  const readyStudentCount = stageReadinessRows.filter(
    (item) => item.readiness.status === "ready",
  ).length;

  // 只根据真实课堂记录生成关注队列，不再用固定进度阈值推断“风险”。
  const attentionRows = currentStage
    ? stageReadinessRows.map(({ student, readiness }) => {
        const openSignals = (course.learningSignals ?? []).filter(
          (signal) =>
            signal.stageKey === currentStage.key
            && signal.studentId === student.id
            && signal.status === "open",
        );
        const failedTasks = (course.companionTasks ?? []).filter(
          (task) =>
            task.stageKey === currentStage.key
            && task.studentId === student.id
            && task.status === "failed",
        );
        const pendingDecisions = (course.companionConfirmations ?? []).filter(
          (item) =>
            item.stageKey === currentStage.key
            && item.studentId === student.id
            && item.status === "pending",
        );
        const pendingAiDecisions = (course.aiContributions ?? []).filter(
          (item) =>
            item.stageKey === currentStage.key
            && item.studentId === student.id
            && item.status === "pending-decision",
        );
        const readinessNeedsAction = ["awaiting-calibration", "needs-revision"].includes(
          readiness.status,
        );
        return {
          student,
          count:
            (readinessNeedsAction ? 1 : 0)
            + openSignals.length
            + failedTasks.length
            + pendingDecisions.length
            + pendingAiDecisions.length,
          reasons: [
            readiness.status === "awaiting-calibration" ? "学习证据待教师校准" : "",
            readiness.status === "needs-revision" ? "学习证据需修订" : "",
            openSignals.length ? `${openSignals.length} 条学习信号` : "",
            failedTasks.length ? `${failedTasks.length} 个失败任务` : "",
            pendingDecisions.length ? `${pendingDecisions.length} 项待学生决定` : "",
            pendingAiDecisions.length ? `${pendingAiDecisions.length} 项AI建议待决定` : "",
          ].filter(Boolean),
        };
      }).filter((item) => item.count > 0)
    : [];

  // 学生阶段状态只由有效证据和教师校准派生，不再显示任意百分比。
  const distribution = (() => {
    if (!currentStage || course.students.length === 0) return [];
    const buckets = [
      { status: "not-started", range: "未开始", count: 0, tone: "slate" as const },
      { status: "working", range: "进行中", count: 0, tone: "sky" as const },
      { status: "awaiting-calibration", range: "待校准", count: 0, tone: "amber" as const },
      { status: "needs-revision", range: "需修订", count: 0, tone: "rose" as const },
      { status: "ready", range: "已达标", count: 0, tone: "emerald" as const },
    ];
    stageReadinessRows.forEach(({ readiness }) => {
      const bucket = buckets.find((item) => item.status === readiness.status);
      if (bucket) bucket.count += 1;
    });
    return buckets;
  })();

  const stageAiSuggestions = currentStage
    ? (course.aiAssessmentSuggestions ?? [])
        .filter((item) => item.stageKey === currentStage.key)
        .slice(-3)
        .reverse()
    : [];
  const hasTeacherResources = Boolean(
    course.teacherClassroomId ||
      course.content.teacherClassroomId ||
      course.content.teacherResources?.scenes.length,
  );

  function endClass() {
    if (!course) return;
    endTeaching(course.id);
    setEndDialogOpen(false);
  }

  function persistClassroomTiming(classroomTiming: ClassroomTimingState) {
    if (!course) return;
    updateCourse(course.id, {
      uiState: {
        ...(course.uiState ?? {}),
        classroomTiming,
      },
    });
  }

  function toggleClassroomTimer() {
    if (!course) return;
    const timing = course.uiState?.classroomTiming;
    if (!timing) return;
    persistClassroomTiming(
      timing.status === "paused"
        ? resumeClassroomTiming(timing)
        : pauseClassroomTiming(timing),
    );
  }

  function adjustActiveStage(deltaSec: number) {
    if (!course) return;
    const timing = course.uiState?.classroomTiming;
    if (!timing?.activeStageKey) return;
    persistClassroomTiming(
      adjustClassroomStageTiming(timing, timing.activeStageKey, deltaSec),
    );
  }

  function resetActiveStageTimer() {
    if (!course) return;
    const timing = course.uiState?.classroomTiming;
    if (!timing) return;
    persistClassroomTiming(resetActiveClassroomStageTiming(timing));
  }

  function openCompanionMonitor(studentId?: string) {
    setToolPanel(null);
    setMonitorStudentId(studentId);
    setCompanionMonitorOpen(true);
  }

  function openProjectInMonitor(groupId: string) {
    if (!course) return;
    const studentId = course.groups
      ?.find((group) => group.id === groupId)
      ?.members[0]?.studentId;
    openCompanionMonitor(studentId);
  }

  function requestStage(index: number) {
    if (!course) return;
    if (index < 0 || index >= course.stages.length || index === course.currentStageIndex) return;
    setTargetStageIndex(index);
  }

  function confirmStage(overrideReason?: string) {
    if (!course || targetStageIndex === null) return;
    const gate = evaluateStageGate(course);
    const from = course.stages[course.currentStageIndex];
    const to = course.stages[targetStageIndex];
    const transitionAt = new Date().toISOString();
    const classroomTiming = course.uiState?.classroomTiming
      ? transitionClassroomStageTiming(
          course.uiState.classroomTiming,
          to.key,
          transitionAt,
        )
      : undefined;
    updateCourse(course.id, {
      currentStageIndex: targetStageIndex,
      stageTransitions: [...(course.stageTransitions ?? []), {
        id: makeRecordId("transition"),
        fromStageKey: from.key,
        toStageKey: to.key,
        gateStatus: overrideReason ? "overridden" : "passed",
        blockers: gate.blockers.map((item) => item.message),
        warnings: gate.warnings.map((item) => item.message),
        overrideReason,
        actor: user.name,
        createdAt: transitionAt,
      }],
      uiState: {
        ...(course.uiState ?? {}),
        teacherResourceProjection: null,
        ...(classroomTiming ? { classroomTiming } : {}),
      },
    });
    setTargetStageIndex(null);
  }

  const toolPanelContent = toolPanel === "timer" ? (
    <TimerPanel snapshot={timingSnapshot} onTogglePause={toggleClassroomTimer} onReset={resetActiveStageTimer} onAdjust={adjustActiveStage} />
  ) : toolPanel === "invite" ? (
    <InvitePanel
      code={course.inviteCode}
      onCopy={() => {
        if (typeof navigator !== "undefined" && navigator.clipboard && course.inviteCode) navigator.clipboard.writeText(course.inviteCode);
      }}
      onRefresh={() => generateNewInviteCode(course.id)}
    />
  ) : toolPanel === "students" ? (
    <StudentsPanel course={course} currentStageKey={currentStage?.key} onlineStudentIds={presence.onlineStudentIds} />
  ) : null;

  return (
    <DashboardShell
      role="teacher"
      userName={user.name}
      variant="bare"
      currentCourse={{ id: course.id, name: course.name, status: course.status }}
      currentStage={currentStage ? { index: course.currentStageIndex, total: course.stages.length, label: currentStage.label } : undefined}
      currentTask={currentStage ? `检查${currentStage.label}的阶段产出` : undefined}
      leadRole={currentStage?.key === "ai-learning" ? "AI" : currentStage?.key === "proposal" || currentStage?.key === "make" ? "学生" : "教师"}
      wide
      headerSlot={
        <div className="hidden items-center gap-1 md:flex">
          {/* 计时器 */}
          <div className="relative">
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-xs)] border border-stone-200 bg-white/80 px-2.5 text-[12px] font-semibold text-stone-600 transition hover:border-[var(--pbl-teacher-border)] hover:text-[var(--pbl-teacher)]"
              onClick={() => setToolPanel((value) => value === "timer" ? null : "timer")}
              type="button"
            >
              <Clock3 size={14} />
              <span className="font-mono font-bold text-[var(--pbl-teacher)]">{timerText}</span>
            </button>
            {toolPanel === "timer" ? <ClassroomToolPopover onClose={() => setToolPanel(null)}>{toolPanelContent}</ClassroomToolPopover> : null}
          </div>
          {/* 邀请码 */}
          <div className="relative">
            <button
              className="grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-stone-200 bg-white/80 text-stone-600 transition hover:border-[var(--pbl-teacher-border)] hover:text-[var(--pbl-teacher)]"
              onClick={() => setToolPanel((value) => value === "invite" ? null : "invite")}
              type="button"
              aria-label="学生邀请码"
            >
              <QrCode size={14} />
            </button>
            {toolPanel === "invite" ? <ClassroomToolPopover onClose={() => setToolPanel(null)}>{toolPanelContent}</ClassroomToolPopover> : null}
          </div>
          {/* 在线学生 */}
          <div className="relative">
            <button
              className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-xs)] border border-stone-200 bg-white/80 px-2.5 text-[12px] font-semibold text-stone-600 transition hover:border-[var(--pbl-teacher-border)] hover:text-[var(--pbl-teacher)]"
              onClick={() => setToolPanel((value) => value === "students" ? null : "students")}
              type="button"
              aria-label="在线学生"
            >
              <UserRoundCheck size={14} />
              <span>{onlineCount}/{course.students.length}</span>
              {onlineCount > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--pbl-success)]" /> : null}
            </button>
            {toolPanel === "students" ? <ClassroomToolPopover align="right" onClose={() => setToolPanel(null)}>{toolPanelContent}</ClassroomToolPopover> : null}
          </div>
          <div className="mx-0.5 h-5 w-px bg-stone-200" />
          {companionStageActive ? (
            <button
              aria-label="打开学生伴学观察"
              className="relative grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-stone-200 bg-white/80 text-stone-600 transition hover:border-[var(--pbl-teacher-border)] hover:text-[var(--pbl-teacher)]"
              onClick={() => openCompanionMonitor()}
              type="button"
            >
              <Bot size={14} />
              {attentionRows.length ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--pbl-danger)] px-1 text-[9px] font-bold text-white">{attentionRows.length}</span> : null}
            </button>
          ) : null}
          {currentStage?.key === "showcase" ? <button aria-label="进入投影展示模式" className="grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-stone-200 bg-white/80 text-stone-600" onClick={() => setPresentationMode(true)} type="button"><Maximize2 size={14} /></button> : null}
          {/* 查看课程 */}
          <Link
            className="grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-stone-200 bg-white/80 text-stone-600 transition hover:border-[var(--pbl-teacher-border)] hover:text-[var(--pbl-teacher)]"
            href={`/teacher/prepare/${course.id}/preview`}
            aria-label="查看课程"
          >
            <Eye size={14} />
          </Link>
          {/* 结束授课 */}
          <button
            className="grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-orange-200 bg-white/80 text-[var(--pbl-danger)] transition hover:bg-[var(--pbl-danger-soft)]"
            onClick={() => setEndDialogOpen(true)}
            type="button"
            aria-label="结束授课"
          >
            <CircleStop size={14} />
          </button>
        </div>
      }
    >
      {/* 移动端工具栏：小屏幕上显示精简版 */}
      <div className="mb-3 flex items-center gap-2 md:hidden">
        <button
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-stone-200 bg-white px-3 text-[13px] font-semibold text-stone-600"
          onClick={() => setToolPanel("timer")}
          type="button"
        >
          <Clock3 size={15} />
          <span className="font-mono font-bold text-[var(--pbl-teacher)]">{timerText}</span>
        </button>
        <button
          className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] border border-stone-200 bg-white text-stone-600"
          onClick={() => setToolPanel("invite")}
          type="button"
          aria-label="邀请码"
        >
          <QrCode size={15} />
        </button>
        <button
          className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-sm)] border border-stone-200 bg-white px-3 text-[13px] font-semibold text-stone-600"
          onClick={() => setToolPanel("students")}
          type="button"
          aria-label="在线学生"
        >
          <UserRoundCheck size={15} /> {onlineCount}/{course.students.length}
        </button>
        {companionStageActive ? (
          <button
            className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] border border-stone-200 bg-white text-stone-600"
            onClick={() => openCompanionMonitor()}
            type="button"
            aria-label="学生伴学观察"
          >
            <Bot size={15} />
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Link
            className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] border border-stone-200 bg-white text-stone-600"
            href={`/teacher/prepare/${course.id}/preview`}
            aria-label="查看课程"
          >
            <Eye size={15} />
          </Link>
          <button
            className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] border border-orange-200 bg-white text-[var(--pbl-danger)]"
            onClick={() => setEndDialogOpen(true)}
            type="button"
            aria-label="结束授课"
          >
            <CircleStop size={15} />
          </button>
        </div>
      </div>

      {/* 双栏布局：中主区 + 右数据面板 */}
      <div className={cn("grid gap-3 pb-8", showDataSidebar && "xl:pr-[340px]")}>
        {/* 中间：阶段控制 + 横幅 + 阶段视图 */}
        <div className="min-w-0 space-y-3">
          {course.uiState?.aiAnalysisPending ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--pbl-warning-soft)] px-3 py-1 text-xs font-semibold text-[var(--pbl-warning)] ring-1 ring-orange-100">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--pbl-warning)]" />
              学生有新更新，请刷新 AI 建议
            </div>
          ) : null}

          <StageProgress course={course} onSelect={requestStage} />

          {currentStage && hasTeacherResources && currentStage.key !== "ai-learning" ? (
            <TeacherStageResources course={course} stageKey={currentStage.key} />
          ) : null}

          {currentStage ? (
            <section
              className="pbl-card overflow-hidden rounded-[var(--radius-lg)] p-3 md:p-4"
              key={currentStage.key}
            >
              <TeacherStageView
                course={course}
                onSelectGroup={companionStageActive ? openProjectInMonitor : undefined}
                onSelectStudent={companionStageActive ? openCompanionMonitor : undefined}
                view={currentStage.view}
              />
            </section>
          ) : null}
        </div>

        {/* 右侧：数据面板（完成度分布 + 风险预警 + AI 建议） */}
        {showDataSidebar ? <div className="relative xl:fixed xl:bottom-[4.5rem] xl:right-0 xl:top-16 xl:z-20 xl:w-[340px]">
          <aside className="flex h-[calc(100dvh-9rem)] flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white/95 shadow-[0_18px_50px_rgba(30,64,175,0.10)] backdrop-blur xl:h-full xl:rounded-l-2xl xl:rounded-r-none xl:border-r-0">
            <header className="relative overflow-hidden border-b border-blue-100 bg-[linear-gradient(145deg,#eff6ff_0%,#ffffff_60%,#ecfdf5_100%)] px-4 pb-4 pt-3.5">
              <div className="absolute -right-8 -top-10 size-28 rounded-full bg-blue-100/60 blur-2xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <button
                    aria-label="收起班级概览"
                    aria-expanded="true"
                    className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-blue-200 bg-white/85 text-blue-600 shadow-sm transition hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    onClick={() => setFocusMode(true)}
                    title="收起班级概览"
                    type="button"
                  >
                    <ChevronRight size={15} strokeWidth={2.4} />
                  </button>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">课堂实时监控</div>
                    <h2 className="mt-1 truncate text-base font-black text-stone-950">{currentStage?.label ?? "当前阶段"}</h2>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white/80 px-2 py-1 text-[10px] font-bold text-emerald-700 shadow-sm">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  实时
                </span>
              </div>
              <div className="relative mt-3 grid grid-cols-3 divide-x divide-blue-100 rounded-xl border border-white/80 bg-white/75 py-2.5 shadow-sm">
                <div className="px-2 text-center">
                  <div className="text-lg font-black tabular-nums text-stone-950">{onlineCount}</div>
                  <div className="text-[10px] font-semibold text-stone-500">在线学生</div>
                </div>
                <div className="px-2 text-center">
                  <div className="text-lg font-black tabular-nums text-blue-700">{readyStudentCount}</div>
                  <div className="text-[10px] font-semibold text-stone-500">已达标</div>
                </div>
                <div className="px-2 text-center">
                  <div className={cn("text-lg font-black tabular-nums", attentionRows.length ? "text-amber-600" : "text-emerald-600")}>{attentionRows.length}</div>
                  <div className="text-[10px] font-semibold text-stone-500">需关注</div>
                </div>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <DataPanelCard
            icon={<Users size={15} />}
            title="阶段状态分布"
            hint={`本阶段 · ${course.students.length} 人`}
          >
            {course.students.length === 0 ? (
              <EmptyHint text="暂无学生数据" />
            ) : (
              <div className="space-y-2">
                {distribution.map((b) => {
                  const max = Math.max(1, ...distribution.map((d) => d.count));
                  const widthPct = (b.count / max) * 100;
                  return (
                    <div key={b.range} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[11px] font-semibold text-stone-500">
                        {b.range}
                      </span>
                      <div className="relative h-6 flex-1 overflow-hidden rounded-[var(--radius-xs)] bg-stone-100">
                        <div
                          className={cn(
                            "h-full rounded-[var(--radius-xs)] transition-all",
                            b.tone === "rose" && "bg-[var(--pbl-danger)]",
                            b.tone === "amber" && "bg-[var(--pbl-warning)]",
                            b.tone === "sky" && "bg-[var(--pbl-ai)]",
                            b.tone === "emerald" && "bg-[var(--pbl-success)]",
                            b.tone === "slate" && "bg-stone-400",
                          )}
                          style={{ width: `${Math.max(widthPct, b.count > 0 ? 8 : 0)}%` }}
                        />
                        <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-bold text-stone-700">
                          {b.count}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2.5 text-[11px] text-stone-500">
                  <span>已达标学生</span>
                  <span className="font-bold text-[var(--pbl-teacher)]">
                    {readyStudentCount}/{course.students.length}
                  </span>
                </div>
              </div>
            )}
          </DataPanelCard>

          <DataPanelCard
            icon={<AlertTriangle size={15} />}
            title="需要关注"
            hint={`本阶段 · ${attentionRows.length} 名学生`}
            tone={attentionRows.length > 0 ? "warning" : "ok"}
          >
            {attentionRows.length === 0 ? (
              <div className="flex items-center gap-2 py-3 text-[13px] text-[var(--pbl-success)]">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--pbl-success-soft)] text-[var(--pbl-success)]">
                  <CheckCircle2 size={14} />
                </span>
                暂无基于真实记录的待处理事项
              </div>
            ) : (
              <ul className="space-y-1.5">
                {attentionRows.slice(0, 5).map(({ student, count, reasons }) => (
                  <li
                    className="rounded-[var(--radius-xs)] border border-orange-200 bg-[var(--pbl-danger-soft)]/60 px-2.5 py-2"
                    key={student.id}
                  >
                    <button className="w-full text-left" onClick={() => openCompanionMonitor(student.id)} type="button">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-bold text-stone-900">{student.name}</span>
                        <span className="shrink-0 text-[11px] font-bold text-[var(--pbl-danger)]">{count} 项</span>
                      </div>
                      <div className="mt-1 truncate text-[11px] text-stone-500">{reasons.join(" · ")}</div>
                    </button>
                  </li>
                ))}
                {attentionRows.length > 5 ? (
                  <li className="pt-1 text-center text-[11px] text-stone-500">
                    另有 {attentionRows.length - 5} 名学生...
                  </li>
                ) : null}
              </ul>
            )}
          </DataPanelCard>

          <DataPanelCard
            icon={<Bot size={15} />}
            title="AI评价建议状态"
            hint={`${stageAiSuggestions.filter((item) => item.status === "pending-teacher-confirmation").length} 项待教师确认`}
            tone={stageAiSuggestions.some((item) => item.status === "pending-teacher-confirmation") ? "warning" : "default"}
          >
            {stageAiSuggestions.length === 0 ? (
              <div className="flex items-center gap-2 py-3 text-[13px] text-stone-500">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--pbl-ai-soft)] text-[var(--pbl-ai)]">
                  <Lightbulb size={14} />
                </span>
                本阶段暂无基于新流程证据的评价建议
              </div>
            ) : (
              <ul className="space-y-2">
                {stageAiSuggestions.map((suggestion) => (
                  <li
                    className="rounded-[var(--radius-xs)] border border-stone-200 bg-white/70 px-2.5 py-2"
                    key={suggestion.id}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--pbl-ai)]">
                        <Lightbulb size={11} />
                        {course.students.find((student) => student.id === suggestion.studentId)?.name ?? "学生"}
                      </span>
                      <span className="text-[10px] font-semibold text-stone-500">
                        {aiAssessmentStatusLabel(suggestion.status)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-stone-600">
                      置信度{aiAssessmentConfidenceLabel(suggestion.confidence)} · 引用 {suggestion.evidenceIds.length} 项证据
                      {uniqueEvidenceGaps(suggestion.evidenceGaps).length
                        ? ` · ${uniqueEvidenceGaps(suggestion.evidenceGaps).length} 项证据缺口`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DataPanelCard>

            </div>
          </aside>
        </div> : null}
      </div>

      {currentStage?.key !== "showcase" && !showDataSidebar ? (
        <button
          aria-label="显示班级概览"
          aria-expanded="false"
          className="fixed right-0 top-1/2 z-40 grid h-14 w-7 -translate-y-1/2 place-items-center rounded-l-xl border border-r-0 border-blue-200 bg-white/95 text-blue-500 shadow-[-6px_0_18px_rgba(30,64,175,0.12)] backdrop-blur transition hover:w-8 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          onClick={() => setFocusMode(false)}
          title="展开班级概览"
          type="button"
        >
          <ChevronLeft size={16} strokeWidth={2.4} />
        </button>
      ) : null}

      {presentationMode && currentStage?.key === "showcase" ? <div className="fixed inset-0 z-[70] overflow-y-auto bg-[var(--pbl-surface)] p-5 md:p-8"><header className="mx-auto mb-6 flex max-w-[1440px] items-center justify-between border-b border-[var(--pbl-border)] pb-4"><div><p className="text-sm text-[var(--pbl-text-muted)]">最终汇报展示 · {course.name}</p><p className="font-mono mt-1 text-2xl font-semibold tabular-nums">{timerText}</p></div><Button onClick={() => setPresentationMode(false)} variant="secondary"><Minimize2 size={16} />退出投影</Button></header><main className="mx-auto max-w-[1440px]"><TeacherStageView course={course} onSelectGroup={openProjectInMonitor} onSelectStudent={openCompanionMonitor} view={currentStage.view} /></main></div> : null}

      <FlowActionBar
        back={canPrev ? <Button onClick={() => requestStage(course.currentStageIndex - 1)} variant="text">上一步</Button> : null}
        persistent
        reserveSpace={false}
        saveStatus={<SaveStatus lastSavedAt={session.lastSavedAt} onRetry={() => void session.retrySave()} state={session.saveState} />}
      >
        {canNext ? <Button onClick={() => requestStage(course.currentStageIndex + 1)}>检查条件并进入下一阶段</Button> : <Button onClick={() => setEndDialogOpen(true)}>检查评价并结束课程</Button>}
      </FlowActionBar>

      {targetStageIndex !== null ? <StageGateDialog course={course} onConfirm={confirmStage} onOpenChange={(open) => { if (!open) setTargetStageIndex(null); }} open targetIndex={targetStageIndex} /> : null}

      <AlertDialog onOpenChange={setEndDialogOpen} open={endDialogOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>结束本次课堂？</AlertDialogTitle>
          <AlertDialogDescription>课堂结束后学生将进入只读回看。结束前请确认多元评价和学生反思已经完成；系统不会自动跳转离开当前页面。</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>继续授课</AlertDialogCancel>
            <AlertDialogAction onClick={endClass}>结束课堂</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {companionMonitorOpen && currentStage && companionStageActive ? (
        <div className="fixed inset-0 z-[80] bg-stone-950/30 backdrop-blur-[2px]">
          <button aria-label="关闭学生伴学观察" className="absolute inset-0 h-full w-full cursor-default" onClick={() => setCompanionMonitorOpen(false)} type="button" />
          <section aria-label="学生伴学观察" aria-modal="true" className="absolute inset-y-3 right-3 w-[min(1180px,calc(100vw-24px))] overflow-y-auto rounded-[20px] border border-stone-200 bg-[var(--pbl-surface)] p-4 shadow-[0_28px_100px_rgba(15,23,42,0.28)]" role="dialog">
            <header className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 border-b border-stone-200 bg-[var(--pbl-surface)]/95 pb-3 backdrop-blur">
              <div><p className="text-xs font-bold text-[var(--pbl-teacher)]">统一课堂指挥区</p><h2 className="mt-1 text-xl font-bold">学生—AI 伴学观察 · {currentStage.label}</h2></div>
              <Button onClick={() => setCompanionMonitorOpen(false)} variant="secondary"><X size={16} />关闭</Button>
            </header>
            <CompanionMonitor className="mt-0" course={course} initialStudentId={monitorStudentId} stageKey={currentStage.key} />
          </section>
        </div>
      ) : null}

      {/* 移动端工具弹窗；桌面端弹层直接锚定在对应顶栏按钮下方。 */}
      {toolPanel ? (
        <>
          <div className="fixed inset-0 z-[35] md:hidden" onClick={() => setToolPanel(null)} />
          <div className="pbl-glass fixed left-1/2 top-20 z-40 w-[min(360px,calc(100vw-32px))] -translate-x-1/2 rounded-[var(--radius-md)] p-4 md:hidden">
            <button
              className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-[var(--radius-xs)] text-stone-400 transition hover:bg-white hover:text-stone-700"
              onClick={() => setToolPanel(null)}
              type="button"
              aria-label="关闭"
            >
              <X size={15} />
            </button>
            {toolPanelContent}
          </div>
        </>
      ) : null}
    </DashboardShell>
  );
}

export function ClassroomToolPopover({
  align = "left",
  children,
  onClose,
}: {
  align?: "left" | "right";
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className={cn("pbl-glass absolute top-[calc(100%+12px)] z-50 w-[360px] rounded-[var(--radius-md)] p-4", align === "right" ? "right-0" : "left-0")}>
      <button className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-[var(--radius-xs)] text-stone-400 transition hover:bg-white hover:text-stone-700" onClick={onClose} type="button" aria-label="关闭">
        <X size={15} />
      </button>
      {children}
    </div>
  );
}

/* ============================================================
   工具弹窗面板
   ============================================================ */

function formatClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor(safeSeconds % 3_600 / 60);
  const seconds = safeSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatMinutes(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.max(0, Math.round(totalSeconds))} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
}

function formatProjectedEnd(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function TimerPanel({
  snapshot,
  onTogglePause,
  onReset,
  onAdjust,
}: {
  snapshot?: ClassroomTimingSnapshot;
  onTogglePause: () => void;
  onReset: () => void;
  onAdjust: (deltaSec: number) => void;
}) {
  if (!snapshot) {
    return (
      <div className="py-8 text-center">
        <Clock3 className="mx-auto text-stone-300" size={26} />
        <div className="mt-2 text-sm font-semibold text-stone-700">正在初始化课堂时间计划</div>
      </div>
    );
  }
  const paused = snapshot.status === "paused";
  const active = snapshot.activeStage;
  const overtime = (active?.overrunSec ?? 0) > 0;
  const timerText = active
    ? overtime
      ? `+${formatClock(active.overrunSec)}`
      : formatClock(active.remainingSec)
    : "--:--";
  const varianceText =
    snapshot.scheduleVarianceSec === 0
      ? "准点"
      : snapshot.scheduleVarianceSec > 0
        ? `超时 ${formatMinutes(snapshot.scheduleVarianceSec)}`
        : `提前 ${formatMinutes(-snapshot.scheduleVarianceSec)}`;
  return (
    <div>
      <div className="mb-2.5 pr-8">
        <div className="flex items-center gap-2">
          <div className="text-base font-bold text-stone-900">课堂时间控制</div>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold",
            paused
              ? "bg-amber-100 text-amber-700"
              : "bg-emerald-100 text-emerald-700",
          )}>
            {paused ? "已暂停" : "实时运行"}
          </span>
        </div>
      </div>
      <div className={cn(
        "rounded-[var(--radius-sm)] border px-3 py-3 text-center",
        overtime ? "border-rose-200 bg-rose-50" : "border-blue-100 bg-blue-50/60",
      )}>
        <div className="text-[11px] font-semibold text-stone-500">
          {active?.label ?? "课程已结束"} · {overtime ? "已超时" : "阶段剩余"}
        </div>
        <div className={cn(
          "mt-1 font-mono text-[38px] font-bold leading-none",
          overtime ? "text-rose-600" : "text-[var(--pbl-teacher)]",
        )}>
          {timerText}
        </div>
        {active ? (
          <div className="mt-2 text-[11px] text-stone-500">
            计划 {formatMinutes(active.plannedSec)} · 已用 {formatMinutes(active.elapsedSec)}
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <button
          className="inline-flex h-9 items-center justify-center gap-1 rounded-[var(--radius-xs)] border border-stone-200 bg-white text-xs font-semibold text-stone-600 transition hover:bg-stone-50"
          onClick={onTogglePause}
          type="button"
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
          {paused ? "继续" : "暂停"}
        </button>
        <button
          className="inline-flex h-9 items-center justify-center gap-1 rounded-[var(--radius-xs)] border border-stone-200 bg-white text-xs font-semibold text-stone-600 transition hover:bg-stone-50"
          onClick={() => onAdjust(-120)}
          type="button"
        >
          -2 分
        </button>
        <button
          className="inline-flex h-9 items-center justify-center gap-1 rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] text-xs font-semibold text-white transition hover:bg-[var(--pbl-teacher-hover)]"
          onClick={() => onAdjust(120)}
          type="button"
        >
          +2 分
        </button>
        <button
          className="inline-flex h-9 items-center justify-center gap-1 rounded-[var(--radius-xs)] border border-stone-200 bg-white text-xs font-semibold text-stone-600 transition hover:bg-stone-50"
          onClick={onReset}
          type="button"
        >
          <RotateCcw size={13} /> 重计
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-[var(--radius-xs)] bg-stone-50 px-1 py-2">
          <div className="text-[10px] text-stone-400">课程已用 / 计划</div>
          <div className="mt-0.5 text-[11px] font-bold text-stone-700">
            {formatMinutes(snapshot.courseElapsedSec)} / {formatMinutes(snapshot.coursePlannedSec)}
          </div>
        </div>
        <div className="rounded-[var(--radius-xs)] bg-stone-50 px-1 py-2">
          <div className="text-[10px] text-stone-400">预计结束</div>
          <div className="mt-0.5 text-[11px] font-bold text-stone-700">
            {formatProjectedEnd(snapshot.projectedEndAt)}
          </div>
        </div>
        <div className={cn(
          "rounded-[var(--radius-xs)] px-1 py-2",
          snapshot.scheduleVarianceSec > 0 ? "bg-rose-50" : "bg-stone-50",
        )}>
          <div className="text-[10px] text-stone-400">累计偏差</div>
          <div className={cn(
            "mt-0.5 text-[11px] font-bold",
            snapshot.scheduleVarianceSec > 0 ? "text-rose-600" : "text-stone-700",
          )}>
            {varianceText}
          </div>
        </div>
      </div>

      <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
        {snapshot.stages.map((stage) => (
          <div key={stage.stageKey}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
              <span className={cn(
                "truncate font-semibold",
                stage.status === "active" ? "text-[var(--pbl-teacher)]" : "text-stone-600",
              )}>
                {stage.status === "completed" ? "✓ " : stage.status === "active" ? "● " : ""}
                {stage.label}
              </span>
              <span className={cn(
                "shrink-0 font-mono",
                stage.overrunSec > 0 ? "text-rose-600" : "text-stone-400",
              )}>
                {formatMinutes(stage.elapsedSec)} / {formatMinutes(stage.plannedSec)}
              </span>
            </div>
            <ProgressBar
              className="h-1.5"
              tone={stage.overrunSec > 0 ? "red" : stage.status === "completed" ? "green" : "blue"}
              value={stage.progressPercent}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function InvitePanel({
  code,
  onCopy,
  onRefresh,
}: {
  code?: string;
  onCopy: () => void;
  onRefresh: () => void;
}) {
  return (
    <div>
      <div className="mb-2.5 pr-8">
        <div className="text-base font-bold text-stone-900">学生邀请码</div>
        <p className="mt-0.5 text-[13px] text-stone-500">学生输入此码加入课堂</p>
      </div>
      {code ? (
        <>
          <div className="text-center">
            <div className="font-mono text-[30px] font-bold tracking-[0.18em] text-stone-900">
              {code.slice(0, 3)} {code.slice(3, 6)}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button
              className="inline-flex h-9 items-center justify-center gap-1 rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] text-xs font-semibold text-white transition hover:bg-[var(--pbl-teacher-hover)]"
              onClick={onCopy}
              type="button"
            >
              <Copy size={13} /> 复制
            </button>
            <button
              className="inline-flex h-9 items-center justify-center gap-1 rounded-[var(--radius-xs)] border border-stone-200 bg-white text-xs font-semibold text-stone-600 transition hover:bg-stone-50"
              onClick={onRefresh}
              type="button"
            >
              <RefreshCw size={13} /> 刷新
            </button>
          </div>
        </>
      ) : (
        <div className="py-6 text-center text-sm text-stone-500">暂未生成邀请码</div>
      )}
    </div>
  );
}

function StudentsPanel({
  course,
  currentStageKey,
  onlineStudentIds,
}: {
  course: NonNullable<ReturnType<typeof useCourse>>;
  currentStageKey?: string;
  onlineStudentIds: ReadonlySet<string>;
}) {
  const total = course.students.length;
  const online = course.students.filter((student) => onlineStudentIds.has(student.id)).length;
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-2 pr-8">
        <div>
          <div className="text-base font-bold text-stone-900">在线学生</div>
          <p className="mt-0.5 text-[13px] text-stone-500">{online} 在线 / {total} 总数</p>
        </div>
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[var(--pbl-success-soft)] px-2 text-[11px] font-bold text-[var(--pbl-success)] ring-1 ring-green-200">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--pbl-success)]" />
          {online} / {total}
        </span>
      </div>
      {total === 0 ? (
        <div className="py-6 text-center text-sm text-stone-500">
          <Users className="mx-auto mb-1 text-stone-300" size={20} />
          暂无学生加入
        </div>
      ) : (
        <ul className="max-h-[300px] space-y-1.5 overflow-auto pr-1">
          {[...course.students]
            .sort((a, b) => {
              const aOnline = onlineStudentIds.has(a.id);
              const bOnline = onlineStudentIds.has(b.id);
              if (aOnline !== bOnline) return aOnline ? -1 : 1;
              return 0;
            })
            .map((s) => {
              const readiness = currentStageKey
                ? deriveStageReadiness(course, s.id, currentStageKey)
                : null;
              const sOnline = onlineStudentIds.has(s.id);
              return (
                <li
                  className="flex items-center gap-2 rounded-[var(--radius-xs)] border border-stone-200 bg-white/70 px-2.5 py-2"
                  key={s.id}
                >
                  <Avatar name={s.name} size={28} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-stone-800">
                    {s.name}
                  </span>
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      sOnline ? "bg-[var(--pbl-success)]" : "bg-stone-300",
                    )}
                    title={sOnline ? "在线" : "离线"}
                  />
                  <span className="shrink-0 text-right text-[11px] font-bold text-stone-600">
                    {readiness ? STAGE_READINESS_LABEL[readiness.status] : "未开始"}
                  </span>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

/* ============================================================
   数据面板卡
   ============================================================ */

function DataPanelCard({
  icon,
  title,
  hint,
  tone = "default",
  children,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  tone?: "default" | "warning" | "ok";
  children: ReactNode;
}) {
  return (
    <section className="border-b border-stone-100 bg-white/70 px-4 py-4 last:border-b-0">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg",
              tone === "warning"
                ? "bg-[var(--pbl-warning-soft)] text-[var(--pbl-warning)]"
                : tone === "ok"
                  ? "bg-[var(--pbl-success-soft)] text-[var(--pbl-success)]"
                  : "bg-blue-50 text-blue-700",
            )}
          >
            {icon}
          </span>
          <h3 className="pt-1 text-[13px] font-black text-stone-900">{title}</h3>
        </div>
        {hint ? <span className="pt-1 text-right text-[10px] font-semibold leading-4 text-stone-400">{hint}</span> : null}
      </header>
      {children}
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="grid place-items-center py-4 text-center text-xs text-stone-400">
      <Bot className="mb-1 text-stone-300" size={18} />
      {text}
    </div>
  );
}
