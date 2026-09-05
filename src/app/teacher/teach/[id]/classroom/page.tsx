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
  ClipboardCheck,
  Clock3,
  Copy,
  Eye,
  Lightbulb,
  MessageSquareText,
  MonitorUp,
  QrCode,
  RefreshCw,
  UserRoundCheck,
  Users,
  X,
  Maximize2,
  Minimize2,
  Route,
} from "lucide-react";
import { DashboardShell, Avatar } from "@/components/dashboard-shell";
import { StageGateDialog } from "@/components/classroom/classroom-chrome";
import { TeacherStageView } from "@/components/views/teacher/stage-dispatcher";
import { ReflectionSummarySidebar } from "@/components/views/teacher/reflection-summary-sidebar";
import { deriveAiLearningClassMetrics } from "@/components/views/teacher/ai-learning";
import { StudentLearningDetail } from "@/components/views/teacher/student-learning-detail";
import { CompanionMonitor } from "@/components/views/teacher/companion-monitor";
import { TeacherStageResources } from "@/components/openmaic-bridge/teacher-stage-resources";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, Button, FlowActionBar, SaveStatus } from "@/components/ui";
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
  type ClassroomTimingState,
} from "@/lib/classroom/timing";
import { copyTextToClipboard } from "@/lib/browser/copy-text";
import { normalizeInviteCode } from "@/lib/session/invite-code";
import { isNewOpenPblSystem } from "@/lib/system-mode";
import type { Course } from "@/lib/session/types";
import { resourcesForStage } from "@/lib/classroom/stage-resources";
import { latestReflectionByStudent, normalizeReflectionSurvey } from "@/lib/reflection-survey";
import {
  ClassroomToolPopover,
  deriveMakeStageLearningMetrics,
  formatClock,
  formatAverageInteractionCount,
  shouldShowClassroomDataSidebar,
  TimerPanel,
} from "./classroom-page-parts";

type ToolPanel = "timer" | "invite" | "students" | null;

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
  const newSystem = isNewOpenPblSystem();
  const showDataSidebar = shouldShowClassroomDataSidebar(currentStage?.key, focusMode);
  const companionStageActive = !newSystem
    && (currentStage?.key === "proposal" || currentStage?.key === "make");
  const canPrev = course.currentStageIndex > 0;
  const canNext = course.currentStageIndex < course.stages.length - 1;
  const previousStage = canPrev ? course.stages[course.currentStageIndex - 1] : undefined;
  const nextStage = canNext ? course.stages[course.currentStageIndex + 1] : undefined;
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
  const aiLearningMetrics = currentStage?.key === "ai-learning"
    ? deriveAiLearningClassMetrics(course)
    : undefined;
  const aiLearningSignalRows = currentStage?.key === "ai-learning"
    ? course.students.flatMap((student) => {
        const signals = (course.learningSignals ?? []).filter((signal) =>
          signal.stageKey === "ai-learning"
          && signal.studentId === student.id
          && signal.status === "open",
        );
        return signals.length ? [{ student, signals }] : [];
      })
    : [];
  const sidebarHeaderMetrics = deriveSidebarHeaderMetrics({
    aiLearningMetrics,
    attentionCount: attentionRows.length,
    course,
    stageKey: currentStage?.key,
  });
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

  function confirmStage() {
    if (!course || targetStageIndex === null) return;
    const gate = evaluateStageGate(course);
    const gateOverridden = targetStageIndex > course.currentStageIndex && !gate.canAdvance;
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
        gateStatus: gateOverridden ? "overridden" : "passed",
        blockers: gate.blockers.map((item) => item.message),
        warnings: gate.warnings.map((item) => item.message),
        actor: user.name,
        createdAt: transitionAt,
      }],
      uiState: {
        ...(course.uiState ?? {}),
        teacherResourceProjection: null,
        resourceProjection: null,
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
      onCopy={() => course.inviteCode
        ? copyTextToClipboard(normalizeInviteCode(course.inviteCode)).then(
            () => true,
            () => false,
          )
        : Promise.resolve(false)}
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
          {!newSystem && currentStage?.key === "showcase" ? <button aria-label="进入投影展示模式" className="grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-stone-200 bg-white/80 text-stone-600" onClick={() => setPresentationMode(true)} type="button"><Maximize2 size={14} /></button> : null}
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
      <div className={cn("grid gap-3 pb-8", showDataSidebar && "xl:pr-[21.25rem]")}>
        {/* 中间：阶段控制 + 横幅 + 阶段视图 */}
        <div className="min-w-0 space-y-3">
          {course.uiState?.aiAnalysisPending ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--pbl-warning-soft)] px-3 py-1 text-xs font-semibold text-[var(--pbl-warning)] ring-1 ring-orange-100">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--pbl-warning)]" />
              学生有新更新，请刷新 AI 建议
            </div>
          ) : null}

          {!newSystem && currentStage && hasTeacherResources && currentStage.key !== "ai-learning" ? (
            <TeacherStageResources course={course} stageKey={currentStage.key} />
          ) : null}

          {currentStage ? (
            <section
              className={cn(
                "classroom-stage pbl-card rounded-[var(--radius-lg)] p-3 md:p-4",
                currentStage.key === "make" ? "overflow-visible" : "overflow-hidden",
              )}
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
        {showDataSidebar ? <div className="relative xl:fixed xl:bottom-[4.5rem] xl:right-0 xl:top-16 xl:z-20 xl:w-[21.25rem] min-[1920px]:right-[4vw]">
          <aside className="flex h-[calc(100dvh-9rem)] flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white/95 shadow-[0_18px_50px_rgba(30,64,175,0.10)] backdrop-blur xl:h-full">
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
                {sidebarHeaderMetrics.map((metric) => (
                  <div className="min-w-0 px-2 text-center" key={metric.label}>
                    <div className={cn("truncate text-lg font-black tabular-nums", metric.tone === "warning" ? "text-amber-600" : metric.tone === "success" ? "text-emerald-600" : "text-blue-700")}>{metric.value}</div>
                    <div className="truncate text-[10px] font-semibold text-stone-500">{metric.label}</div>
                  </div>
                ))}
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {currentStage?.key === "ai-learning" && aiLearningMetrics ? (
            <AiLearningDecisionSidebar
              course={course}
              metrics={aiLearningMetrics}
              onOpenStudent={(studentId) => setMonitorStudentId(studentId)}
              onSelectStage={requestStage}
              signalRows={aiLearningSignalRows}
            />
          ) : newSystem ? <>
          <SidebarCourseProgress course={course} onSelectStage={requestStage} />
          <NewSystemStageDecisionSidebar
            course={course}
            onOpenStudent={(studentId) => setMonitorStudentId(studentId)}
            stageKey={currentStage?.key ?? "launch"}
          />
          </> : <>
          <SidebarCourseProgress course={course} onSelectStage={requestStage} />
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

          </>}

            </div>
          </aside>
        </div> : null}
      </div>

      {!showDataSidebar ? (
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

      {presentationMode && currentStage?.key === "showcase" ? <div className="fixed inset-0 z-[70] overflow-y-auto bg-[var(--pbl-surface)] p-5 md:p-8"><header className="pbl-wide-container mb-6 flex items-center justify-between border-b border-[var(--pbl-border)] pb-4"><div><p className="text-sm text-[var(--pbl-text-muted)]">最终汇报展示 · {course.name}</p><p className="font-mono mt-1 text-2xl font-semibold tabular-nums">{timerText}</p></div><Button onClick={() => setPresentationMode(false)} variant="secondary"><Minimize2 size={16} />退出投影</Button></header><main className="pbl-wide-container"><TeacherStageView course={course} onSelectGroup={openProjectInMonitor} onSelectStudent={openCompanionMonitor} view={currentStage.view} /></main></div> : null}

      <FlowActionBar
        back={previousStage ? <Button onClick={() => requestStage(course.currentStageIndex - 1)} variant="text">回退到「{previousStage.label}」</Button> : null}
        persistent
        reserveSpace={false}
        saveStatus={<SaveStatus lastSavedAt={session.lastSavedAt} onRetry={() => void session.retrySave()} state={session.saveState} />}
      >
        {nextStage ? <Button onClick={() => requestStage(course.currentStageIndex + 1)}>结束「{currentStage?.label}」并进入「{nextStage.label}」</Button> : <Button onClick={() => setEndDialogOpen(true)}>{newSystem ? "结束本次课程" : "检查评价并结束本次课程"}</Button>}
      </FlowActionBar>

      {targetStageIndex !== null ? <StageGateDialog course={course} onConfirm={confirmStage} onOpenChange={(open) => { if (!open) setTargetStageIndex(null); }} open targetIndex={targetStageIndex} /> : null}

      <AlertDialog onOpenChange={setEndDialogOpen} open={endDialogOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>结束本次课堂？</AlertDialogTitle>
          <AlertDialogDescription>{newSystem ? "课堂结束后学生将进入只读回看。结束前请确认授课资源和项目实践产物已经保存；系统不会自动跳转离开当前页面。" : "课堂结束后学生将进入只读回看。结束前请确认多元评价和学生反思已经完成；系统不会自动跳转离开当前页面。"}</AlertDialogDescription>
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

      {currentStage?.key === "ai-learning" ? (
        <StudentLearningDetail
          course={course}
          key={monitorStudentId ?? "none"}
          onOpenChange={(open) => { if (!open) setMonitorStudentId(undefined); }}
          open={Boolean(monitorStudentId)}
          studentId={monitorStudentId}
        />
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

type SidebarHeaderMetric = {
  label: string;
  value: string;
  tone?: "default" | "warning" | "success";
};

function deriveSidebarHeaderMetrics({
  course,
  stageKey,
  aiLearningMetrics,
  attentionCount,
}: {
  course: Course;
  stageKey?: string;
  aiLearningMetrics?: ReturnType<typeof deriveAiLearningClassMetrics>;
  attentionCount: number;
}): SidebarHeaderMetric[] {
  if (stageKey === "launch") {
    return [
      { label: "启动资料", value: `${resourcesForStage(course.resources, "launch").length} 份` },
      { label: "课堂公告", value: `${course.announcements?.length ?? 0} 条` },
      { label: "待处理", value: `${attentionCount} 项`, tone: attentionCount ? "warning" : "success" },
    ];
  }
  if (stageKey === "ai-learning") {
    const quizStudents = aiLearningMetrics?.summaries.filter((item) => item.answeredQuestions > 0).length ?? 0;
    return [
      { label: "已完成小测", value: `${quizStudents} 人` },
      { label: "平均进度", value: `${aiLearningMetrics?.averageProgress ?? 0}%` },
      { label: "需关注", value: `${aiLearningMetrics?.summaries.filter((item) => item.signals.length > 0).length ?? 0} 人`, tone: aiLearningMetrics?.summaries.some((item) => item.signals.length > 0) ? "warning" : "success" },
    ];
  }
  if (stageKey === "make") {
    const makeMetrics = deriveMakeStageLearningMetrics(course);
    return [
      { label: "提交情况", value: `${makeMetrics.submittedStudentIds.size}/${course.students.length} 人`, tone: makeMetrics.submittedStudentIds.size < course.students.length ? "warning" : "success" },
      { label: "学情预警", value: `${makeMetrics.alertedStudentIds.size} 人`, tone: makeMetrics.alertedStudentIds.size ? "warning" : "success" },
      { label: "平均互动次数", value: `${formatAverageInteractionCount(makeMetrics.averageInteractionCount)} 次`, tone: makeMetrics.interactionEvents.length ? "default" : "warning" },
    ];
  }
  if (stageKey === "showcase") {
    const artifactStudents = new Set([
      ...(course.projectDocumentVersions ?? []).filter((item) => item.status === "submitted").map((item) => item.studentId),
      ...(course.projectPdfVersions ?? []).filter((item) => item.status === "submitted").map((item) => item.studentId),
    ]);
    const pending = (course.showcasePresentations ?? []).filter((item) => item.status === "pending").length;
    const active = (course.showcasePresentations ?? []).some((item) => item.status === "active");
    return [
      { label: "成果齐备", value: `${artifactStudents.size} 人` },
      { label: "待审批", value: `${pending} 项`, tone: pending ? "warning" : "success" },
      { label: "投屏状态", value: active ? "进行中" : "未开始", tone: active ? "success" : "default" },
    ];
  }
  if (stageKey === "reflection") {
    const latest = latestReflectionByStudent(course.reflections);
    const submitted = course.students.filter((student) => normalizeReflectionSurvey(latest.get(student.id)?.survey)).length;
    const pending = Math.max(0, course.students.length - submitted);
    return [
      { label: "已提交反思", value: `${submitted} 人` },
      { label: "完成率", value: course.students.length ? `${Math.round(submitted / course.students.length * 100)}%` : "0%" },
      { label: "待提交", value: `${pending} 人`, tone: pending ? "warning" : "success" },
    ];
  }
  const workingCount = course.students.length - attentionCount;
  return [
    { label: "正常推进", value: `${Math.max(0, workingCount)} 人` },
    { label: "已达标", value: `${course.students.filter((student) => deriveStageReadiness(course, student.id, stageKey ?? "").status === "ready").length} 人` },
    { label: "需关注", value: `${attentionCount} 人`, tone: attentionCount ? "warning" : "success" },
  ];
}

function AiLearningDecisionSidebar({
  course,
  metrics,
  signalRows,
  onOpenStudent,
  onSelectStage,
}: {
  course: Course;
  metrics: ReturnType<typeof deriveAiLearningClassMetrics>;
  signalRows: Array<{
    student: Course["students"][number];
    signals: NonNullable<Course["learningSignals"]>;
  }>;
  onOpenStudent: (studentId: string) => void;
  onSelectStage: (index: number) => void;
}) {
  return (
    <div className="divide-y divide-stone-100">
      <SidebarCourseProgress course={course} onSelectStage={onSelectStage} />

      <section className="bg-[linear-gradient(160deg,#f8fbff,#ffffff)] px-4 py-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-blue-50 text-blue-700"><Route size={14} /></span>
          <div><h3 className="text-[13px] font-black text-stone-900">关键学情</h3><p className="text-[10px] text-stone-400">随学生学习记录实时更新</p></div>
        </div>
        <div className="grid gap-2">
          <SidebarMetric
            label="班级平均进度"
            value={metrics.averageProgress === undefined ? "暂无数据" : `${metrics.averageProgress}%`}
            helper="全班当前学习页面进度的平均值"
          />
          <SidebarMetric
            label="平均答题速度"
            value={metrics.averageSpeedText}
            helper={metrics.averageSpeedHelper}
          />
          <SidebarMetric
            label="班级答题准确率"
            value={metrics.classAccuracy === undefined ? "暂无数据" : `${metrics.classAccuracy}%`}
            helper={metrics.attemptCount ? `基于 ${metrics.attemptCount} 次有效小测提交` : "等待学生完成小测"}
          />
        </div>
      </section>

      <section className="bg-white/70 px-4 py-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><h3 className="text-[13px] font-black text-stone-900">需要关注</h3><p className="mt-0.5 text-[10px] text-stone-400">点击学生查看信号依据与完整学习记录</p></div>
          <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", signalRows.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700")}>{signalRows.length} 人</span>
        </div>
        {signalRows.length ? (
          <ul className="space-y-2">
            {signalRows.map(({ student, signals }) => (
              <li key={student.id}>
                <button className="w-full rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-left transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600" onClick={() => onOpenStudent(student.id)} type="button">
                  <div className="flex items-center justify-between gap-2"><span className="font-bold text-stone-900">{student.name}</span><span className="text-[10px] font-bold text-amber-800">查看详情 →</span></div>
                  <div className="mt-2 space-y-1.5">
                    {signals.slice(0, 2).map((signal) => <div className="rounded-lg bg-white/85 px-2.5 py-2" key={signal.id}><p className="text-xs font-bold text-rose-800">{signal.title}</p><p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-stone-600">{signal.summary}</p></div>)}
                  </div>
                  {signals.length > 2 ? <p className="mt-1.5 text-[10px] font-semibold text-stone-500">另有 {signals.length - 2} 条学习信号</p> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-3 text-xs font-semibold text-emerald-800"><CheckCircle2 size={16} />当前无待处理学习信号，可继续授课</div>
        )}
      </section>
    </div>
  );
}

function SidebarCourseProgress({ course, onSelectStage }: { course: Course; onSelectStage: (index: number) => void }) {
  return (
    <section className="bg-white/70 px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-black text-stone-900">课程进度</h3>
        <span className="text-[10px] font-semibold text-stone-400">第 {course.currentStageIndex + 1}/{course.stages.length} 阶段</span>
      </div>
      <ol className="flex items-center gap-1.5" aria-label="课堂阶段进度">
        {course.stages.map((stage, index) => {
          const current = index === course.currentStageIndex;
          const done = index < course.currentStageIndex;
          return (
            <li className="min-w-0 flex-1" key={stage.key}>
              <button
                aria-current={current ? "step" : undefined}
                aria-label={`第 ${index + 1} 阶段：${stage.label}`}
                className={cn(
                  "h-2 w-full rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700",
                  current ? "bg-blue-700" : done ? "bg-emerald-500" : "bg-stone-200 hover:bg-stone-300",
                )}
                onClick={() => onSelectStage(index)}
                title={stage.label}
                type="button"
              />
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs font-bold text-blue-800">当前：{course.stages[course.currentStageIndex]?.label}</p>
    </section>
  );
}

function NewSystemStageDecisionSidebar({ course, stageKey, onOpenStudent }: { course: Course; stageKey: string; onOpenStudent: (studentId: string) => void }) {
  if (stageKey === "launch") {
    const resources = resourcesForStage(course.resources, "launch");
    const totalSeats = course.classConfig?.totalStudents ?? course.students.length;
    const projected = course.uiState?.resourceProjection?.stageKey === "launch";
    return (
      <>
        <StageSidebarSection icon={<ClipboardCheck size={14} />} title="启动准备" hint="授课前检查">
          <div className="grid gap-2">
            <SidebarMetric label="学生到课" value={`${course.students.length}/${totalSeats}`} helper={course.students.length >= totalSeats ? "学生已全部进入课堂" : `还有 ${Math.max(0, totalSeats - course.students.length)} 个席位未加入`} />
            <SidebarMetric label="启动资料" value={`${resources.length} 份`} helper={projected ? "当前有资料正在同步投屏" : "尚未开始资料投屏"} />
            <SidebarMetric label="课堂公告" value={`${course.announcements?.length ?? 0} 条`} helper={`${course.announcements?.filter((item) => item.pinned).length ?? 0} 条已置顶`} />
          </div>
        </StageSidebarSection>
        <StageSidebarSection icon={<Lightbulb size={14} />} title="当前建议" hint="下一步">
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-3 text-xs leading-5 text-blue-900">
            {resources.length ? projected ? "资料正在投屏，可结合左侧内容确认学生理解后进入知识讲授。" : "启动资料已准备，可从左侧选择核心材料并开始投屏。" : "请先在左侧上传或确认项目启动材料，再向学生说明任务。"}
          </div>
        </StageSidebarSection>
      </>
    );
  }

  if (stageKey === "make") {
    const makeMetrics = deriveMakeStageLearningMetrics(course);
    const {
      adoptedSuggestionEvents,
      initiatingStudentIds,
      openSignals,
      proactiveInterventionEvents,
      savedStudentIds,
      studentInitiatedConversationEvents,
      suggestionDecisionEvents,
    } = makeMetrics;
    const studentsWithoutOutcome = course.students.filter((student) => !savedStudentIds.has(student.id));
    return (
      <>
        <StageSidebarSection icon={<Bot size={14} />} title="AI 协作过程" hint="全班统计">
          <div className="grid gap-2">
            <SidebarMetric label="AI 主动介入" value={`${proactiveInterventionEvents.length} 次`} helper={proactiveInterventionEvents.length ? `AI 主动段落批注总数 · 人均 ${formatAverageInteractionCount(makeMetrics.averageProactiveInterventionCount)} 次` : "当前阶段 AI 尚未主动添加段落批注"} tone={proactiveInterventionEvents.length ? "active" : "default"} />
            <SidebarMetric label="学生主动对话" value={`${studentInitiatedConversationEvents.length} 次`} helper={studentInitiatedConversationEvents.length ? `${initiatingStudentIds.size} 人曾从侧边栏或选区主动发起` : "当前尚无学生主动发起对话"} tone={studentInitiatedConversationEvents.length ? "active" : "warning"} />
            <SidebarMetric label="AI 建议采纳率" value={makeMetrics.suggestionAcceptanceRate === null ? "—" : `${Math.round(makeMetrics.suggestionAcceptanceRate)}%`} helper={suggestionDecisionEvents.length ? `已决定 ${suggestionDecisionEvents.length} 条 · 采纳 ${adoptedSuggestionEvents.length} 条` : "尚无已采纳或拒绝的 AI 修改建议"} tone={makeMetrics.suggestionAcceptanceRate === null ? "default" : makeMetrics.suggestionAcceptanceRate >= 50 ? "ok" : "warning"} />
          </div>
        </StageSidebarSection>
        <StageSidebarSection icon={<AlertTriangle size={14} />} title="优先巡视" hint={`${studentsWithoutOutcome.length + new Set(openSignals.map((item) => item.studentId)).size} 项关注`} tone={studentsWithoutOutcome.length || openSignals.length ? "warning" : "ok"}>
          {studentsWithoutOutcome.length || openSignals.length ? (
            <ul className="space-y-2">
              {course.students.filter((student) => studentsWithoutOutcome.some((item) => item.id === student.id) || openSignals.some((signal) => signal.studentId === student.id)).slice(0, 6).map((student) => {
                const signals = openSignals.filter((signal) => signal.studentId === student.id);
                return <li key={student.id}><button className="w-full rounded-xl border border-amber-200 bg-amber-50/55 px-3 py-2.5 text-left transition hover:bg-amber-50" onClick={() => { onOpenStudent(student.id); window.dispatchEvent(new CustomEvent("openpbl:select-practice-student", { detail: { studentId: student.id, target: signals.length ? "signal" : "artifact" } })); }} type="button"><div className="flex items-center justify-between gap-2"><strong className="text-xs text-stone-900">{student.name}</strong><span className="text-[10px] font-bold text-amber-800">定位问题 →</span></div><p className="mt-1 text-[11px] leading-4 text-stone-600">{signals[0]?.summary ?? "尚未形成可提交成果"}</p></button></li>;
              })}
            </ul>
          ) : <SidebarOk text="全班均已形成成果，暂无待处理信号" />}
        </StageSidebarSection>
      </>
    );
  }

  if (stageKey === "showcase") {
    const artifactStudentIds = new Set([
      ...(course.projectDocumentVersions ?? []).filter((item) => item.status === "submitted").map((item) => item.studentId),
      ...(course.projectPdfVersions ?? []).filter((item) => item.status === "submitted").map((item) => item.studentId),
    ]);
    const pending = (course.showcasePresentations ?? []).filter((item) => item.status === "pending");
    const active = (course.showcasePresentations ?? []).find((item) => item.status === "active");
    return (
      <>
        <StageSidebarSection icon={<MonitorUp size={14} />} title="汇报状态" hint={active ? "投屏中" : pending.length ? "等待审批" : "等待申请"}>
          <div className="grid gap-2">
            <SidebarMetric label="已有汇报资料" value={`${artifactStudentIds.size}/${course.students.length}`} helper="已提交主文档、PDF 或额外成果" />
            <SidebarMetric label="待审批申请" value={`${pending.length} 项`} helper={pending.length ? "请在左侧确认是否开始投屏" : "当前没有待审批申请"} />
            <SidebarMetric label="当前汇报学生" value={active?.studentName ?? "尚未开始"} helper={active ? `正在展示：${active.artifactTitle}` : "批准申请后开始全班同步"} />
          </div>
        </StageSidebarSection>
        <StageSidebarSection icon={<ClipboardCheck size={14} />} title="待办队列" hint={`${pending.length} 项`} tone={pending.length ? "warning" : "ok"}>
          {pending.length ? <ul className="space-y-2">{pending.slice(0, 5).map((item) => <li className="rounded-xl border border-amber-200 bg-amber-50/55 px-3 py-2.5" key={item.id}><p className="text-xs font-bold text-stone-900">{item.studentName ?? "学生"}申请汇报</p><p className="mt-1 truncate text-[11px] text-stone-600">{item.artifactTitle}</p></li>)}</ul> : <SidebarOk text={active ? "汇报正在进行，可在左侧控制投屏" : "暂无待审批申请，可继续收集成果"} />}
        </StageSidebarSection>
      </>
    );
  }

  const latest = latestReflectionByStudent(course.reflections);
  const submittedIds = new Set(course.students.flatMap((student) => normalizeReflectionSurvey(latest.get(student.id)?.survey) ? [student.id] : []));
  const pendingStudents = course.students.filter((student) => !submittedIds.has(student.id));
  return (
    <>
      <StageSidebarSection icon={<MessageSquareText size={14} />} title="反思回收" hint={`${submittedIds.size}/${course.students.length} 已提交`}>
        <div className="grid gap-2">
          <SidebarMetric label="完成率" value={course.students.length ? `${Math.round(submittedIds.size / course.students.length * 100)}%` : "暂无学生"} helper="结构化学习反思已提交" />
        </div>
      </StageSidebarSection>
      <ReflectionSummarySidebar course={course} />
      <StageSidebarSection icon={<Users size={14} />} title="待提交学生" hint={`${pendingStudents.length} 人`} tone={pendingStudents.length ? "warning" : "ok"}>
        {pendingStudents.length ? <ul className="flex flex-wrap gap-1.5">{pendingStudents.map((student) => <li className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900" key={student.id}>{student.name}</li>)}</ul> : <SidebarOk text="全班均已提交学习反思" />}
      </StageSidebarSection>
    </>
  );
}

function StageSidebarSection({ icon, title, hint, tone = "default", children }: { icon: ReactNode; title: string; hint: string; tone?: "default" | "warning" | "ok"; children: ReactNode }) {
  return (
    <section className="border-b border-stone-100 bg-white/70 px-4 py-4 last:border-b-0">
      <header className="mb-3 flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className={cn("grid size-7 place-items-center rounded-lg", tone === "warning" ? "bg-amber-100 text-amber-700" : tone === "ok" ? "bg-emerald-100 text-emerald-700" : "bg-blue-50 text-blue-700")}>{icon}</span><h3 className="text-[13px] font-black text-stone-900">{title}</h3></div><span className="pt-1 text-[10px] font-semibold text-stone-400">{hint}</span></header>
      {children}
    </section>
  );
}

function SidebarOk({ text }: { text: string }) {
  return <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-3 text-xs font-semibold text-emerald-800"><CheckCircle2 size={16} />{text}</div>;
}

function SidebarMetric({ label, value, helper, tone = "default" }: { label: string; value: string; helper: string; tone?: "default" | "warning" | "ok" | "active" }) {
  return (
    <div className={cn("rounded-xl border bg-white px-3 py-2.5 shadow-[0_5px_16px_rgba(30,64,175,0.05)]", tone === "warning" ? "border-amber-200" : tone === "ok" ? "border-emerald-200" : "border-blue-100")}>
      <div className="flex items-baseline justify-between gap-3"><span className="text-[11px] font-semibold text-stone-500">{label}</span><strong className="text-sm text-stone-950">{value}</strong></div>
      <p className={cn("mt-1 text-[10px] leading-4", tone === "warning" ? "font-semibold text-amber-700" : tone === "ok" ? "font-semibold text-emerald-700" : tone === "active" ? "text-blue-700" : "text-stone-400")}>{helper}</p>
    </div>
  );
}

/* ============================================================
   工具弹窗面板
   ============================================================ */

function InvitePanel({
  code,
  onCopy,
  onRefresh,
}: {
  code?: string;
  onCopy: () => Promise<boolean>;
  onRefresh: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    setCopyState(await onCopy() ? "copied" : "failed");
    window.setTimeout(() => setCopyState("idle"), 1800);
  }

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
              onClick={() => void copy()}
              type="button"
            >
              {copyState === "copied" ? <CheckCircle2 size={13} /> : <Copy size={13} />}
              {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}
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
