"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
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
  PanelRightClose,
} from "lucide-react";
import { DashboardShell, Avatar } from "@/components/dashboard-shell";
import { TeacherClassroomBanner } from "@/components/classroom-ux";
import { StageGateDialog, StageProgress } from "@/components/classroom/classroom-chrome";
import { TeacherStageView } from "@/components/views/teacher/stage-dispatcher";
import { CompanionMonitor } from "@/components/views/teacher/companion-monitor";
import { StageWorkspacePolicyPanel } from "@/components/views/teacher/stage-workspace-policy-panel";
import { TeacherStageResources } from "@/components/openmaic-bridge/teacher-stage-resources";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, Button, FlowActionBar, ProgressBar, SaveStatus } from "@/components/ui";
import { useSession, useCourse, useHydrated } from "@/lib/session/store";
import { isStudentOnline } from "@/lib/session/actions";
import { cn } from "@/lib/utils";
import { evaluateStageGate } from "@/lib/classroom/stage-gates";
import { makeRecordId } from "@/lib/session/actions";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import type { Course } from "@/lib/session/types";
import {
  isProjectLaunchStage,
  projectLaunchProgress,
} from "@/lib/project-launch-readiness";
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

export default function TeachClassroomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const { user, endTeaching, generateNewInviteCode, updateCourse } = session;
  const course = useCourse(params?.id);
  useRealtimeSync(params?.id);
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

  const onlineCount = useMemo(() => {
    if (!course) return 0;
    void nowTick;
    return course.students.filter((s) => isStudentOnline(s)).length;
  }, [course, nowTick]);

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
  const canPrev = course.currentStageIndex > 0;
  const canNext = course.currentStageIndex < course.stages.length - 1;
  const timerText = timingSnapshot?.activeStage
    ? timingSnapshot.activeStage.overrunSec > 0
      ? `+${formatClock(timingSnapshot.activeStage.overrunSec)}`
      : formatClock(timingSnapshot.activeStage.remainingSec)
    : "--:--";
  const progressForCurrentStage = (student: Course["students"][number]) => {
    if (!currentStage) return 0;
    if (!isProjectLaunchStage(currentStage)) {
      return student.stageProgress[currentStage.key] ?? 0;
    }
    return projectLaunchProgress(course.todos ?? [], student.id);
  };
  const stageCompletion = currentStage
    ? Math.round(
        course.students.reduce((sum, student) => sum + progressForCurrentStage(student), 0) /
          Math.max(1, course.students.length),
      )
    : 0;

  // 只根据真实课堂记录生成关注队列，不再用固定进度阈值推断“风险”。
  const attentionRows = currentStage
    ? course.students.map((student) => {
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
        return {
          student,
          count: openSignals.length + failedTasks.length + pendingDecisions.length,
          reasons: [
            openSignals.length ? `${openSignals.length} 条学习信号` : "",
            failedTasks.length ? `${failedTasks.length} 个失败任务` : "",
            pendingDecisions.length ? `${pendingDecisions.length} 项待学生决定` : "",
          ].filter(Boolean),
        };
      }).filter((item) => item.count > 0)
    : [];

  // 学生完成度分布：按 0-25 / 25-50 / 50-75 / 75-100 四档分桶
  const distribution = (() => {
    if (!currentStage || course.students.length === 0) return [];
    const buckets = [
      { range: "0-25%", min: 0, max: 25, count: 0, tone: "rose" as const },
      { range: "25-50%", min: 25, max: 50, count: 0, tone: "amber" as const },
      { range: "50-75%", min: 50, max: 75, count: 0, tone: "sky" as const },
      { range: "75-100%", min: 75, max: 101, count: 0, tone: "emerald" as const },
    ];
    course.students.forEach((s) => {
      const p = progressForCurrentStage(s);
      const bucket = buckets.find((b) => p >= b.min && p < b.max) ?? buckets[buckets.length - 1];
      bucket.count += 1;
    });
    return buckets;
  })();

  // 本阶段 AI 建议记录
  const stageAiSupports = currentStage
    ? (course.aiSupports ?? []).filter((r) => r.stageKey === currentStage.key).slice(-3).reverse()
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
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-xs)] border border-stone-200 bg-white/80 px-2.5 text-[12px] font-semibold text-stone-600 transition hover:border-[var(--pbl-teacher-border)] hover:text-[var(--pbl-teacher)]"
            onClick={() => setToolPanel("timer")}
            type="button"
          >
            <Clock3 size={14} />
            <span className="font-mono font-bold text-[var(--pbl-teacher)]">{timerText}</span>
          </button>
          {/* 邀请码 */}
          <button
            className="grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-stone-200 bg-white/80 text-stone-600 transition hover:border-[var(--pbl-teacher-border)] hover:text-[var(--pbl-teacher)]"
            onClick={() => setToolPanel("invite")}
            type="button"
            aria-label="学生邀请码"
          >
            <QrCode size={14} />
          </button>
          {/* 在线学生 */}
          <button
            className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-xs)] border border-stone-200 bg-white/80 px-2.5 text-[12px] font-semibold text-stone-600 transition hover:border-[var(--pbl-teacher-border)] hover:text-[var(--pbl-teacher)]"
            onClick={() => setToolPanel("students")}
            type="button"
            aria-label="在线学生"
          >
            <UserRoundCheck size={14} />
            <span>{onlineCount}/{course.students.length}</span>
            {onlineCount > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--pbl-success)]" /> : null}
          </button>
          <div className="mx-0.5 h-5 w-px bg-stone-200" />
          <button
            aria-label="打开学生伴学观察"
            className="relative grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-stone-200 bg-white/80 text-stone-600 transition hover:border-[var(--pbl-teacher-border)] hover:text-[var(--pbl-teacher)]"
            onClick={() => openCompanionMonitor()}
            type="button"
          >
            <Bot size={14} />
            {attentionRows.length ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--pbl-danger)] px-1 text-[9px] font-bold text-white">{attentionRows.length}</span> : null}
          </button>
          <button aria-label={focusMode ? "退出专注授课" : "进入专注授课"} className="grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-stone-200 bg-white/80 text-stone-600" onClick={() => setFocusMode((value) => !value)} type="button"><PanelRightClose size={14} /></button>
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
        <button
          className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] border border-stone-200 bg-white text-stone-600"
          onClick={() => openCompanionMonitor()}
          type="button"
          aria-label="学生伴学观察"
        >
          <Bot size={15} />
        </button>
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
      <div className={cn("grid gap-3", !focusMode && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        {/* 中间：阶段控制 + 横幅 + 阶段视图 */}
        <div className="min-w-0 space-y-3">
          {course.uiState?.aiAnalysisPending ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--pbl-warning-soft)] px-3 py-1 text-xs font-semibold text-[var(--pbl-warning)] ring-1 ring-orange-100">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--pbl-warning)]" />
              学生有新更新，请刷新 AI 建议
            </div>
          ) : null}

          <StageProgress course={course} onSelect={requestStage} />

          {currentStage ? (
            <TeacherClassroomBanner
              completion={stageCompletion}
              course={course}
              currentStage={currentStage}
              onlineCount={onlineCount}
              riskCount={attentionRows.length + (course.uiState?.aiAnalysisPending ? 1 : 0)}
              timerText={timerText}
            />
          ) : null}

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
                onSelectGroup={openProjectInMonitor}
                onSelectStudent={openCompanionMonitor}
                view={currentStage.view}
              />
            </section>
          ) : null}
        </div>

        {/* 右侧：数据面板（完成度分布 + 风险预警 + AI 建议） */}
        {!focusMode ? <aside className="space-y-3">
          <StageWorkspacePolicyPanel
            compact
            currentStageKey={currentStage?.key}
            onChange={(stageWorkspacePolicies) =>
              updateCourse(course.id, { stageWorkspacePolicies })
            }
            policies={course.stageWorkspacePolicies}
            stages={course.stages}
          />
          <DataPanelCard
            icon={<Users size={15} />}
            title="完成度分布"
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
                  <span>班级平均</span>
                  <span className="font-bold text-[var(--pbl-teacher)]">{stageCompletion}%</span>
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
            title="AI 教学建议"
            hint={course.uiState?.aiAnalysisRefreshedAt ? `已刷新 ${timeAgo(course.uiState.aiAnalysisRefreshedAt)}` : "未刷新"}
            tone={course.uiState?.aiAnalysisPending ? "warning" : "default"}
          >
            {course.uiState?.aiAnalysisPending ? (
              <div className="mb-2.5 flex items-start gap-2 rounded-[var(--radius-xs)] border border-orange-200 bg-[var(--pbl-warning-soft)] px-2.5 py-2 text-[12px] text-[var(--pbl-warning)]">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>学生有新更新，建议刷新 AI 建议。</span>
              </div>
            ) : null}

            {stageAiSupports.length === 0 ? (
              <div className="flex items-center gap-2 py-3 text-[13px] text-stone-500">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--pbl-ai-soft)] text-[var(--pbl-ai)]">
                  <Lightbulb size={14} />
                </span>
                本阶段暂无 AI 建议记录
              </div>
            ) : (
              <ul className="space-y-2">
                {stageAiSupports.map((rec) => (
                  <li
                    className="rounded-[var(--radius-xs)] border border-stone-200 bg-white/70 px-2.5 py-2"
                    key={rec.id}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--pbl-ai)]">
                        <Lightbulb size={11} />
                        {rec.trigger}
                      </span>
                      <span className="text-[10px] text-stone-400">
                        {new Date(rec.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-stone-600">
                      {rec.diagnosis}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DataPanelCard>

        </aside> : null}
      </div>

      {presentationMode && currentStage?.key === "showcase" ? <div className="fixed inset-0 z-[70] overflow-y-auto bg-[var(--pbl-surface)] p-5 md:p-8"><header className="mx-auto mb-6 flex max-w-[1440px] items-center justify-between border-b border-[var(--pbl-border)] pb-4"><div><p className="text-sm text-[var(--pbl-text-muted)]">最终汇报展示 · {course.name}</p><p className="font-mono mt-1 text-2xl font-semibold tabular-nums">{timerText}</p></div><Button onClick={() => setPresentationMode(false)} variant="secondary"><Minimize2 size={16} />退出投影</Button></header><main className="mx-auto max-w-[1440px]"><TeacherStageView course={course} onSelectGroup={openProjectInMonitor} onSelectStudent={openCompanionMonitor} view={currentStage.view} /></main></div> : null}

      <FlowActionBar
        back={canPrev ? <Button onClick={() => requestStage(course.currentStageIndex - 1)} variant="text">上一步</Button> : null}
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

      {companionMonitorOpen && currentStage ? (
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

      {/* 工具弹窗：点击顶栏工具按钮后显示 */}
      {toolPanel ? (
        <>
          <div className="fixed inset-0 z-[35]" onClick={() => setToolPanel(null)} />
          <div className="pbl-glass fixed right-4 top-[84px] z-40 w-[min(360px,calc(100vw-32px))] rounded-[var(--radius-md)] p-4 md:right-8">
            <button
              className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-[var(--radius-xs)] text-stone-400 transition hover:bg-white hover:text-stone-700"
              onClick={() => setToolPanel(null)}
              type="button"
              aria-label="关闭"
            >
              <X size={15} />
            </button>
            {toolPanel === "timer" ? (
              <TimerPanel
                snapshot={timingSnapshot}
                onTogglePause={toggleClassroomTimer}
                onReset={resetActiveStageTimer}
                onAdjust={adjustActiveStage}
              />
            ) : null}
            {toolPanel === "invite" ? (
              <InvitePanel
                code={course.inviteCode}
                onCopy={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard && course.inviteCode) {
                    navigator.clipboard.writeText(course.inviteCode);
                  }
                }}
                onRefresh={() => generateNewInviteCode(course.id)}
              />
            ) : null}
            {toolPanel === "students" ? (
              <StudentsPanel
                course={course}
                currentStageKey={currentStage?.key}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </DashboardShell>
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
        <p className="mt-1 text-xs text-stone-500">将使用备课时确认的六阶段时间大纲</p>
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
        <p className="mt-0.5 text-[13px] text-stone-500">按备课时间大纲执行，并自动保留课堂偏差</p>
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
}: {
  course: NonNullable<ReturnType<typeof useCourse>>;
  currentStageKey?: string;
}) {
  const total = course.students.length;
  const online = course.students.filter((s) => isStudentOnline(s)).length;
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
              const aOnline = isStudentOnline(a);
              const bOnline = isStudentOnline(b);
              if (aOnline !== bOnline) return aOnline ? -1 : 1;
              return 0;
            })
            .map((s) => {
              const currentStage = course.stages.find(
                (stage) => stage.key === currentStageKey,
              );
              const progress = currentStage && isProjectLaunchStage(currentStage)
                ? projectLaunchProgress(course.todos ?? [], s.id)
                : currentStageKey
                  ? s.stageProgress[currentStageKey] ?? 0
                  : 0;
              const sOnline = isStudentOnline(s);
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
                  <span className="w-9 shrink-0 text-right text-[11px] font-bold text-stone-600">
                    {progress}%
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
    <section className="pbl-card rounded-[var(--radius-md)] p-3.5 transition hover:shadow-[var(--shadow-raised)]">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-xs)]",
              tone === "warning"
                ? "bg-[var(--pbl-warning-soft)] text-[var(--pbl-warning)]"
                : tone === "ok"
                  ? "bg-[var(--pbl-success-soft)] text-[var(--pbl-success)]"
                  : "bg-stone-100 text-stone-700",
            )}
          >
            {icon}
          </span>
          <h3 className="truncate text-[13px] font-bold text-stone-900">{title}</h3>
        </div>
        {hint ? <span className="shrink-0 text-[11px] text-stone-400">{hint}</span> : null}
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
