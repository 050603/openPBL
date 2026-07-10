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
  Send,
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
import { AiChatStageToggle } from "@/components/views/teacher/ai-chat-stage-toggle";
import { TeacherStageResources } from "@/components/openmaic-bridge/teacher-stage-resources";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, Button, FlowActionBar, ProgressBar, SaveStatus } from "@/components/ui";
import { useSession, useCourse, useHydrated } from "@/lib/session/store";
import { isStudentOnline } from "@/lib/session/actions";
import { cn } from "@/lib/utils";
import { evaluateStageGate } from "@/lib/classroom/stage-gates";
import { makeRecordId } from "@/lib/session/actions";

type ToolPanel = "timer" | "invite" | "students" | null;

export default function TeachClassroomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const { user, endTeaching, generateNewInviteCode, updateCourse } = session;
  const course = useCourse(params?.id);
  const hydrated = useHydrated();
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  const [toolPanel, setToolPanel] = useState<ToolPanel>(null);
  const [targetStageIndex, setTargetStageIndex] = useState<number | null>(null);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [paused]);

  useEffect(() => {
    if (!hydrated) return;
    if (course && course.status !== "teaching") router.replace(`/teacher/teach-setup/${course.id}`);
  }, [course, hydrated, router]);

  useEffect(() => {
    if (!course || course.status !== "teaching") return;
    const id = window.setInterval(() => setNowTick((t) => t + 1), 5_000);
    return () => window.clearInterval(id);
  }, [course]);

  const onlineCount = useMemo(() => {
    if (!course) return 0;
    void nowTick;
    return course.students.filter((s) => isStudentOnline(s)).length;
  }, [course, nowTick]);

  if (!hydrated) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-slate-500">加载中...</div>
      </DashboardShell>
    );
  }

  if (!course) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-slate-500">
          未找到课程。
          <Link className="mt-4 text-blue-700 hover:underline" href="/teacher">返回课程列表</Link>
        </div>
      </DashboardShell>
    );
  }

  const currentStage = course.stages[course.currentStageIndex];
  const canPrev = course.currentStageIndex > 0;
  const canNext = course.currentStageIndex < course.stages.length - 1;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timerText = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const stageCompletion = currentStage
    ? Math.round(
        course.students.reduce((sum, student) => sum + (student.stageProgress[currentStage.key] ?? 0), 0) /
          Math.max(1, course.students.length),
      )
    : 0;

  // 风险小组：本阶段平均进度 < 35%
  const riskGroups = currentStage
    ? (course.groups ?? [])
        .map((group) => {
          const members = group.members;
          if (!members.length) return null;
          const avg = members.reduce((sum, member) => {
            const student = course.students.find((item) => item.id === member.studentId);
            return sum + (student?.stageProgress[currentStage.key] ?? 0);
          }, 0) / members.length;
          return { group, avg };
        })
        .filter((item): item is { group: NonNullable<typeof item>["group"]; avg: number } => item !== null && item.avg < 35)
        .sort((a, b) => a.avg - b.avg)
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
      const p = s.stageProgress[currentStage.key] ?? 0;
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
        createdAt: new Date().toISOString(),
      }],
      uiState: { ...(course.uiState ?? {}), teacherResourceProjection: null },
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
      leadRole={currentStage?.key === "ai-learning" ? "AI" : currentStage?.key === "group" || currentStage?.key === "make" ? "学生" : "教师"}
      wide
      headerSlot={
        <div className="hidden items-center gap-1 md:flex">
          {/* 计时器 */}
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-xs)] border border-slate-200 bg-white/80 px-2.5 text-[12px] font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
            onClick={() => setToolPanel("timer")}
            type="button"
          >
            <Clock3 size={14} />
            <span className="font-mono font-bold text-indigo-700">{timerText}</span>
          </button>
          {/* 邀请码 */}
          <button
            className="grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-slate-200 bg-white/80 text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
            onClick={() => setToolPanel("invite")}
            type="button"
            aria-label="学生邀请码"
          >
            <QrCode size={14} />
          </button>
          {/* 在线学生 */}
          <button
            className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-xs)] border border-slate-200 bg-white/80 px-2.5 text-[12px] font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
            onClick={() => setToolPanel("students")}
            type="button"
            aria-label="在线学生"
          >
            <UserRoundCheck size={14} />
            <span>{onlineCount}/{course.students.length}</span>
            {onlineCount > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> : null}
          </button>
          <div className="mx-0.5 h-5 w-px bg-slate-200" />
          <button aria-label={focusMode ? "退出专注授课" : "进入专注授课"} className="grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-slate-200 bg-white/80 text-slate-600" onClick={() => setFocusMode((value) => !value)} type="button"><PanelRightClose size={14} /></button>
          {currentStage?.key === "showcase" ? <button aria-label="进入投影展示模式" className="grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-slate-200 bg-white/80 text-slate-600" onClick={() => setPresentationMode(true)} type="button"><Maximize2 size={14} /></button> : null}
          {/* 查看课程 */}
          <Link
            className="grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-slate-200 bg-white/80 text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
            href={`/teacher/prepare/${course.id}/preview`}
            aria-label="查看课程"
          >
            <Eye size={14} />
          </Link>
          {/* 结束授课 */}
          <button
            className="grid h-8 w-8 place-items-center rounded-[var(--radius-xs)] border border-rose-200 bg-white/80 text-rose-600 transition hover:bg-rose-50"
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
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-600"
          onClick={() => setToolPanel("timer")}
          type="button"
        >
          <Clock3 size={15} />
          <span className="font-mono font-bold text-indigo-700">{timerText}</span>
        </button>
        <button
          className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] border border-slate-200 bg-white text-slate-600"
          onClick={() => setToolPanel("invite")}
          type="button"
          aria-label="邀请码"
        >
          <QrCode size={15} />
        </button>
        <button
          className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-sm)] border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-600"
          onClick={() => setToolPanel("students")}
          type="button"
          aria-label="在线学生"
        >
          <UserRoundCheck size={15} /> {onlineCount}/{course.students.length}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <Link
            className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] border border-slate-200 bg-white text-slate-600"
            href={`/teacher/prepare/${course.id}/preview`}
            aria-label="查看课程"
          >
            <Eye size={15} />
          </Link>
          <button
            className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] border border-rose-200 bg-white text-rose-600"
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
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              学生有新更新，请刷新 AI 分析
            </div>
          ) : null}

          <StageProgress course={course} onSelect={requestStage} />

          {currentStage ? (
            <TeacherClassroomBanner
              completion={stageCompletion}
              course={course}
              currentStage={currentStage}
              onlineCount={onlineCount}
              riskCount={riskGroups.length + (course.uiState?.aiAnalysisPending ? 1 : 0)}
              timerText={timerText}
            />
          ) : null}

          {currentStage && hasTeacherResources ? (
            <TeacherStageResources course={course} stageKey={currentStage.key} />
          ) : null}

          {currentStage ? (
            <section
              className="pbl-card overflow-hidden rounded-[var(--radius-lg)] p-3 md:p-4"
              key={currentStage.key}
            >
              <TeacherStageView course={course} view={currentStage.view} />
            </section>
          ) : null}
        </div>

        {/* 右侧：数据面板（完成度分布 + 风险预警 + AI 建议） */}
        {!focusMode ? <aside className="space-y-3">
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
                      <span className="w-14 shrink-0 text-[11px] font-semibold text-slate-500">
                        {b.range}
                      </span>
                      <div className="relative h-6 flex-1 overflow-hidden rounded-[var(--radius-xs)] bg-slate-100">
                        <div
                          className={cn(
                            "h-full rounded-[var(--radius-xs)] transition-all",
                            b.tone === "rose" && "bg-rose-500",
                            b.tone === "amber" && "bg-amber-500",
                            b.tone === "sky" && "bg-sky-500",
                            b.tone === "emerald" && "bg-emerald-500",
                          )}
                          style={{ width: `${Math.max(widthPct, b.count > 0 ? 8 : 0)}%` }}
                        />
                        <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-bold text-slate-700">
                          {b.count}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                  <span>班级平均</span>
                  <span className="font-bold text-indigo-700">{stageCompletion}%</span>
                </div>
              </div>
            )}
          </DataPanelCard>

          <DataPanelCard
            icon={<AlertTriangle size={15} />}
            title="风险预警"
            hint={`本阶段 · ${riskGroups.length} 个小组`}
            tone={riskGroups.length > 0 ? "warning" : "ok"}
          >
            {riskGroups.length === 0 ? (
              <div className="flex items-center gap-2 py-3 text-[13px] text-emerald-700">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 size={14} />
                </span>
                所有小组进度健康
              </div>
            ) : (
              <ul className="space-y-1.5">
                {riskGroups.slice(0, 5).map(({ group, avg }) => (
                  <li
                    className="rounded-[var(--radius-xs)] border border-rose-200 bg-rose-50/60 px-2.5 py-2"
                    key={group.id}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-bold text-slate-900">
                        {group.name}
                      </span>
                      <span className="shrink-0 text-[11px] font-bold text-rose-600">
                        均 {Math.round(avg)}%
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-slate-500">
                      选题：{group.topic || "未设定"}
                    </div>
                    <ProgressBar className="mt-1.5 h-1" value={avg} tone="red" />
                  </li>
                ))}
                {riskGroups.length > 5 ? (
                  <li className="pt-1 text-center text-[11px] text-slate-500">
                    另有 {riskGroups.length - 5} 个小组...
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
              <div className="mb-2.5 flex items-start gap-2 rounded-[var(--radius-xs)] border border-amber-200 bg-amber-50 px-2.5 py-2 text-[12px] text-amber-800">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>学生有新更新，建议刷新 AI 分析。</span>
              </div>
            ) : null}

            {stageAiSupports.length === 0 ? (
              <div className="flex items-center gap-2 py-3 text-[13px] text-slate-500">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-sky-50 text-sky-600">
                  <Lightbulb size={14} />
                </span>
                本阶段暂无 AI 建议记录
              </div>
            ) : (
              <ul className="space-y-2">
                {stageAiSupports.map((rec) => (
                  <li
                    className="rounded-[var(--radius-xs)] border border-slate-200 bg-white/70 px-2.5 py-2"
                    key={rec.id}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700">
                        <Lightbulb size={11} />
                        {rec.trigger}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(rec.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-600">
                      {rec.diagnosis}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DataPanelCard>

          {/* AI 对话开关：保留功能，置入右栏底部 */}
          <AiChatStageToggle course={course} />
        </aside> : null}
      </div>

      {presentationMode && currentStage?.key === "showcase" ? <div className="fixed inset-0 z-[70] overflow-y-auto bg-[var(--pbl-surface)] p-5 md:p-8"><header className="mx-auto mb-6 flex max-w-[1440px] items-center justify-between border-b border-[var(--pbl-border)] pb-4"><div><p className="text-sm text-[var(--pbl-text-muted)]">最终汇报展示 · {course.name}</p><p className="font-mono mt-1 text-2xl font-semibold tabular-nums">{timerText}</p></div><Button onClick={() => setPresentationMode(false)} variant="secondary"><Minimize2 size={16} />退出投影</Button></header><main className="mx-auto max-w-[1440px]"><TeacherStageView course={course} view={currentStage.view} /></main></div> : null}

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

      {/* 工具弹窗：点击顶栏工具按钮后显示 */}
      {toolPanel ? (
        <>
          <div className="fixed inset-0 z-[35]" onClick={() => setToolPanel(null)} />
          <div className="pbl-glass fixed right-4 top-[84px] z-40 w-[min(360px,calc(100vw-32px))] rounded-[var(--radius-md)] p-4 md:right-8">
            <button
              className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-[var(--radius-xs)] text-slate-400 transition hover:bg-white hover:text-slate-700"
              onClick={() => setToolPanel(null)}
              type="button"
              aria-label="关闭"
            >
              <X size={15} />
            </button>
            {toolPanel === "timer" ? (
              <TimerPanel
                paused={paused}
                seconds={seconds}
                timerText={timerText}
                onTogglePause={() => setPaused((p) => !p)}
                onReset={() => setSeconds(0)}
                onAddTwoMin={() => setSeconds((s) => s + 120)}
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

function TimerPanel({
  paused,
  seconds,
  timerText,
  onTogglePause,
  onReset,
  onAddTwoMin,
}: {
  paused: boolean;
  seconds: number;
  timerText: string;
  onTogglePause: () => void;
  onReset: () => void;
  onAddTwoMin: () => void;
}) {
  void seconds;
  return (
    <div>
      <div className="mb-2.5 pr-8">
        <div className="text-base font-bold text-slate-900">课堂计时</div>
        <p className="mt-0.5 text-[13px] text-slate-500">记录本次授课时长</p>
      </div>
      <div className="text-center">
        <div className="font-mono text-[38px] font-bold leading-none text-indigo-700">{timerText}</div>
        <div className="mt-2 text-[12px] text-slate-500">{paused ? "已暂停" : "进行中"}</div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <button
          className="inline-flex h-9 items-center justify-center gap-1 rounded-[var(--radius-xs)] border border-slate-200 bg-white text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          onClick={onTogglePause}
          type="button"
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
          {paused ? "继续" : "暂停"}
        </button>
        <button
          className="inline-flex h-9 items-center justify-center gap-1 rounded-[var(--radius-xs)] border border-slate-200 bg-white text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          onClick={onReset}
          type="button"
        >
          <RotateCcw size={13} /> 重置
        </button>
        <button
          className="inline-flex h-9 items-center justify-center gap-1 rounded-[var(--radius-xs)] bg-indigo-700 text-xs font-semibold text-white transition hover:bg-indigo-800"
          onClick={onAddTwoMin}
          type="button"
        >
          <Send size={13} /> +2 分
        </button>
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
        <div className="text-base font-bold text-slate-900">学生邀请码</div>
        <p className="mt-0.5 text-[13px] text-slate-500">学生输入此码加入课堂</p>
      </div>
      {code ? (
        <>
          <div className="text-center">
            <div className="font-mono text-[30px] font-bold tracking-[0.18em] text-slate-900">
              {code.slice(0, 3)} {code.slice(3, 6)}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button
              className="inline-flex h-9 items-center justify-center gap-1 rounded-[var(--radius-xs)] bg-indigo-700 text-xs font-semibold text-white transition hover:bg-indigo-800"
              onClick={onCopy}
              type="button"
            >
              <Copy size={13} /> 复制
            </button>
            <button
              className="inline-flex h-9 items-center justify-center gap-1 rounded-[var(--radius-xs)] border border-slate-200 bg-white text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              onClick={onRefresh}
              type="button"
            >
              <RefreshCw size={13} /> 刷新
            </button>
          </div>
        </>
      ) : (
        <div className="py-6 text-center text-sm text-slate-500">暂未生成邀请码</div>
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
          <div className="text-base font-bold text-slate-900">在线学生</div>
          <p className="mt-0.5 text-[13px] text-slate-500">{online} 在线 / {total} 总数</p>
        </div>
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-emerald-50 px-2 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {online} / {total}
        </span>
      </div>
      {total === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500">
          <Users className="mx-auto mb-1 text-slate-300" size={20} />
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
              const progress = currentStageKey ? s.stageProgress[currentStageKey] ?? 0 : 0;
              const sOnline = isStudentOnline(s);
              return (
                <li
                  className="flex items-center gap-2 rounded-[var(--radius-xs)] border border-slate-200 bg-white/70 px-2.5 py-2"
                  key={s.id}
                >
                  <Avatar name={s.name} size={28} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">
                    {s.name}
                  </span>
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      sOnline ? "bg-emerald-500" : "bg-slate-300",
                    )}
                    title={sOnline ? "在线" : "离线"}
                  />
                  <span className="w-9 shrink-0 text-right text-[11px] font-bold text-slate-600">
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
    <section className="pbl-card rounded-[var(--radius-md)] p-3.5">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-xs)]",
              tone === "warning"
                ? "bg-amber-50 text-amber-700"
                : tone === "ok"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-700",
            )}
          >
            {icon}
          </span>
          <h3 className="truncate text-[13px] font-bold text-slate-900">{title}</h3>
        </div>
        {hint ? <span className="shrink-0 text-[11px] text-slate-400">{hint}</span> : null}
      </header>
      {children}
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="grid place-items-center py-4 text-center text-xs text-slate-400">
      <Bot className="mb-1 text-slate-300" size={18} />
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
