"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CircleStop,
  Clock3,
  Pause,
  Play,
  QrCode,
  RotateCcw,
  Send,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { DashboardShell, Avatar } from "@/components/dashboard-shell";
import { StageStepper } from "@/components/stage-stepper";
import { TeacherStageView } from "@/components/views/teacher/stage-dispatcher";
import { AiChatStageToggle } from "@/components/views/teacher/ai-chat-stage-toggle";
import { Card, Pill, ProgressBar } from "@/components/ui";
import { InviteCodeCard } from "@/components/invite-code-card";
import { useSession, useCourse, useHydrated } from "@/lib/session/store";
import { isStudentOnline } from "@/lib/session/actions";

type Panel = "timer" | "invite" | "students" | null;

export default function TeachClassroomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, advanceStage, setStage, endTeaching, generateNewInviteCode } = useSession();
  const course = useCourse(params?.id);
  const hydrated = useHydrated();
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [paused]);

  useEffect(() => {
    if (!hydrated) return;
    if (course && course.status !== "teaching") router.replace(`/teacher/teach-setup/${course.id}`);
  }, [course, hydrated, router]);

  // ===== Online status: recompute every 5s by re-rendering =====
  // isStudentOnline compares lastSeenAt against the current time, so we
  // need to re-render periodically to reflect students going offline.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    if (!course || course.status !== "teaching") return;
    const id = window.setInterval(() => setNowTick((t) => t + 1), 5_000);
    return () => window.clearInterval(id);
  }, [course?.id, course?.status]);

  // Compute online student count based on lastSeenAt. `nowTick` is in the
  // dependency list so the count refreshes as time passes.
  const onlineCount = useMemo(() => {
    if (!course) return 0;
    void nowTick; // touch so this recomputes when the timer ticks
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

  function endClass() {
    if (!course) return;
    if (!window.confirm("确定结束本次授课？结束后将无法继续推进阶段。")) return;
    endTeaching(course.id);
    router.push("/teacher");
  }

  return (
    <DashboardShell
      role="teacher"
      userName={user.name}
      variant="bare"
      currentCourse={{ id: course.id, name: course.name, status: course.status }}
      currentStage={currentStage ? { index: course.currentStageIndex, total: course.stages.length, label: currentStage.label } : undefined}
    >
      <div className="mb-4 flex items-center gap-3">
        <Link className="grid h-9 w-9 place-items-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" href={`/teacher/teach-setup/${course.id}`}>
          <ArrowLeft size={17} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-[26px] font-black">教师课堂主控</h1>
          <p className="mt-1 text-sm text-slate-500">{course.name} · 推进阶段后，所有学生端会自动同步。</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ToolButton active={panel === "timer"} icon={<Clock3 size={16} />} label={timerText} onClick={() => setPanel(panel === "timer" ? null : "timer")} />
          <ToolButton active={panel === "invite"} icon={<QrCode size={16} />} label={course.inviteCode ?? "邀请码"} onClick={() => setPanel(panel === "invite" ? null : "invite")} />
          <ToolButton active={panel === "students"} icon={<UserRoundCheck size={16} />} label={`${onlineCount} 在线`} onClick={() => setPanel(panel === "students" ? null : "students")} />
          <Link className="inline-flex h-10 items-center gap-1.5 rounded-[6px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50" href={`/teacher/prepare/${course.id}/preview`}>
            查看课程
          </Link>
          <button className="inline-flex h-10 items-center gap-1.5 rounded-[6px] border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50" onClick={endClass} type="button">
            <CircleStop size={15} /> 结束授课
          </button>
        </div>
      </div>

      {panel ? (
        <FloatingPanel title={panelTitle(panel)} onClose={() => setPanel(null)}>
          {panel === "timer" ? (
            <TimerPanel
              paused={paused}
              seconds={seconds}
              setPaused={setPaused}
              setSeconds={setSeconds}
            />
          ) : null}
          {panel === "invite" && course.inviteCode ? (
            <InviteCodeCard code={course.inviteCode} size="md" onRefresh={() => generateNewInviteCode(course.id)} />
          ) : null}
          {panel === "students" ? <StudentsPanel course={course} stageKey={currentStage?.key} onlineCount={onlineCount} /> : null}
        </FloatingPanel>
      ) : null}

      {course.uiState?.aiAnalysisPending ? (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          学生有新更新，请刷新 AI 分析
        </div>
      ) : null}

      <div className="mb-4">
        <AiChatStageToggle course={course} />
      </div>

      <StageStepper
        canNext={canNext}
        canPrev={canPrev}
        currentIndex={course.currentStageIndex}
        stages={course.stages}
        variant="teacher"
        onAdvance={(d) => advanceStage(course.id, d)}
        onSelect={(i) => setStage(course.id, i)}
      />

      {currentStage ? (
        <div className="mt-5 rounded-[10px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.06)]" key={currentStage.key}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-slate-500">阶段 {course.currentStageIndex + 1} / {course.stages.length}</div>
              <h2 className="text-2xl font-black">{currentStage.label}</h2>
              <p className="mt-1 text-sm text-slate-500">{currentStage.description}</p>
            </div>
            <Pill tone="blue">学生端同步中</Pill>
          </div>
          <div className="border-t border-slate-100 pt-5">
            <TeacherStageView course={course} view={currentStage.view} />
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}

function ToolButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={`inline-flex h-10 items-center gap-2 rounded-[6px] border px-3 text-sm font-semibold transition ${active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function FloatingPanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed right-10 top-[118px] z-30 w-[360px] rounded-[8px] border border-slate-200 bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-black">{title}</h2>
        <button className="grid h-8 w-8 place-items-center rounded-[6px] text-slate-400 hover:bg-slate-100" onClick={onClose} type="button">
          <X size={16} />
        </button>
      </div>
      {children}
    </div>
  );
}

function panelTitle(panel: Exclude<Panel, null>) {
  return panel === "timer" ? "课堂计时" : panel === "invite" ? "学生邀请码" : "在线学生";
}

function TimerPanel({ seconds, paused, setPaused, setSeconds }: { seconds: number; paused: boolean; setPaused: (next: boolean | ((value: boolean) => boolean)) => void; setSeconds: (next: number | ((value: number) => number)) => void }) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return (
    <Card compact className="shadow-none">
      <div className="rounded-[8px] border border-slate-200 bg-slate-50 py-5 text-center">
        <div className="text-sm text-slate-500">已用时</div>
        <div className="mt-2 text-[44px] font-black leading-none text-blue-700">{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button className="inline-flex h-10 items-center justify-center gap-1 rounded-[6px] border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setPaused((p) => !p)} type="button">
          {paused ? <Play size={15} /> : <Pause size={15} />}
          {paused ? "继续" : "暂停"}
        </button>
        <button className="inline-flex h-10 items-center justify-center gap-1 rounded-[6px] border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setSeconds(0)} type="button">
          <RotateCcw size={15} /> 重置
        </button>
        <button className="inline-flex h-10 items-center justify-center gap-1 rounded-[6px] border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setSeconds((s) => s + 120)} type="button">
          <Send size={15} /> +2分
        </button>
      </div>
    </Card>
  );
}

function StudentsPanel({ course, stageKey, onlineCount }: { course: { students: { id: string; name: string; stageProgress: Record<string, number>; lastSeenAt?: string }[]; classConfig?: { totalStudents: number } }; stageKey?: string; onlineCount: number }) {
  if (course.students.length === 0) {
    return (
      <div className="rounded-[6px] border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
        <Users className="mx-auto mb-2 text-slate-300" size={20} />
        暂无学生加入
      </div>
    );
  }
  // Show online students first, then offline. Within each group, preserve join order.
  const sorted = [...course.students].sort((a, b) => {
    const aOnline = isStudentOnline(a);
    const bOnline = isStudentOnline(b);
    if (aOnline !== bOnline) return aOnline ? -1 : 1;
    return 0;
  });
  return (
    <>
      <div className="mb-3 text-sm text-slate-500">
        <span className="font-semibold text-green-600">{onlineCount}</span> / {course.students.length} 人在线
      </div>
      <ul className="max-h-80 space-y-2 overflow-auto pr-1">
        {sorted.map((s) => {
          const progress = stageKey ? s.stageProgress[stageKey] ?? 0 : 0;
          const online = isStudentOnline(s);
          return (
            <li className="rounded-[6px] border border-slate-200 bg-white px-3 py-2" key={s.id}>
              <div className="flex items-center gap-3">
                <span className="relative">
                  <Avatar name={s.name} size={32} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${online ? "bg-green-500" : "bg-slate-300"}`}
                    aria-hidden="true"
                  />
                </span>
                <span className="flex-1 text-sm font-semibold">{s.name}</span>
                {online ? (
                  <Pill tone="green">在线</Pill>
                ) : (
                  <Pill tone="gray">离线</Pill>
                )}
                <span className="text-xs font-bold text-slate-500">{progress}%</span>
              </div>
              <ProgressBar value={progress} className="mt-2 h-2" />
            </li>
          );
        })}
      </ul>
    </>
  );
}
