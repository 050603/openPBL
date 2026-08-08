"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  Bot,
  ClipboardCheck,
  Flag,
  Gauge,
  HelpCircle,
  Lightbulb,
  LogOut,
  MessageCircle,
  Presentation,
  ShieldCheck,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import type { Course, Stage } from "@/lib/session/types";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/ui";

type Tone = "blue" | "green" | "orange" | "red";

const STAGE_HELP: Record<string, { goal: string; deliverable: string; ai: string; icon: ReactNode; tone: Tone }> = {
  launch: {
    goal: "理解真实问题、明确个人成果要求与评价标准。",
    deliverable: "项目说明、个人成果要求、问题意识",
    ai: "生成背景案例与驱动问题参考",
    icon: <Flag size={22} />,
    tone: "blue",
  },
  "ai-learning": {
    goal: "完成项目所需基础知识学习，确认关键概念达标。",
    deliverable: "学习进度、概念记录、小测结果",
    ai: "讲解知识、展示案例、组织互动小测",
    icon: <Bot size={22} />,
    tone: "blue",
  },
  proposal: {
    goal: "独立形成项目方案，并在 AI 伴学与教师指导下校准方向。",
    deliverable: "个人方案、关键选择、校准与修订记录",
    ai: "多角色启发、质疑、比较方案并记录选择理由",
    icon: <ClipboardCheck size={22} />,
    tone: "orange",
  },
  make: {
    goal: "独立完成核心作品，持续保存过程证据并迭代。",
    deliverable: "作品草稿、上传材料、AI 采纳记录",
    ai: "检查实施步骤、证据缺口和伦理风险",
    icon: <Target size={22} />,
    tone: "blue",
  },
  showcase: {
    goal: "完成个人成果提交、演示准备和公开汇报。",
    deliverable: "核心作品、个人汇报、教师评价",
    ai: "检查汇报结构、证据表达和问答准备",
    icon: <Presentation size={22} />,
    tone: "orange",
  },
  reflection: {
    goal: "回顾个人项目与 AI 使用，完成自我反思和迁移计划。",
    deliverable: "过程评价、教师评价、自我反思、改进计划",
    ai: "提取过程证据并生成成长建议",
    icon: <Lightbulb size={22} />,
    tone: "green",
  },
};

export function getStageHelp(stage?: Stage) {
  return (stage && STAGE_HELP[stage.key]) || {
    goal: stage?.description ?? "按教师节奏完成当前阶段任务。",
    deliverable: "阶段任务与过程记录",
    ai: "按需提供学习支架",
    icon: <ShieldCheck size={22} />,
    tone: "blue" as const,
  };
}

export function StudentClassroomBar({
  course,
  currentStage,
  currentIndex,
  progress,
  studentName,
  onlineCount,
  notificationCount = 0,
  statusText = "课堂同步中",
  actionSlot,
}: {
  course: Course;
  currentStage: Stage;
  currentIndex: number;
  progress: number;
  studentName?: string;
  onlineCount?: number;
  notificationCount?: number;
  statusText?: string;
  actionSlot?: ReactNode;
}) {
  const help = getStageHelp(currentStage);
  return (
    <section className={cn("relative overflow-hidden rounded-[var(--radius-lg)] text-white", stageHeroBg(help.tone))}>
      <div className="pbl-hero-grid absolute inset-0 opacity-50" aria-hidden="true" />
      <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/14 blur-3xl" aria-hidden="true" />
      <div className="relative grid min-h-[76px] gap-3 px-3 py-3 md:px-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white/15 ring-1 ring-white/20">
            {help.icon}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-white/70">
              <span className="rounded-full bg-white/14 px-2.5 py-1 ring-1 ring-white/16">阶段 {currentIndex + 1}/{course.stages.length}</span>
              <span className="rounded-full bg-white/12 px-2.5 py-1">{statusText}</span>
              <span className="truncate rounded-full bg-white/12 px-2.5 py-1">{course.subject || "课程"} · {course.grade || "班级"}</span>
              <button
                className="grid h-6 w-6 place-items-center rounded-full bg-white/12 text-white/80 ring-1 ring-white/16 transition hover:bg-white/18"
                title={`${help.goal}｜产出：${help.deliverable}｜AI：${help.ai}`}
                type="button"
                aria-label="查看阶段说明"
              >
                <HelpCircle size={14} />
              </button>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="truncate text-[22px] font-bold leading-tight md:text-[26px]">{currentStage.label}</h1>
              <span className="min-w-0 truncate text-sm font-semibold text-white/72">{course.name}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(180px,230px)_auto] sm:items-center">
          <div className="rounded-[12px] bg-white/12 px-3 py-2 ring-1 ring-white/14">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/58">progress</span>
              <span className="text-sm font-bold">{progress}%</span>
            </div>
            <ProgressBar className="mt-1.5 h-1.5 bg-white/18" value={progress} tone={progress >= 100 ? "green" : "blue"} />
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-white/68">
              <span className="truncate">{studentName || "学生"}</span>
              <span>{typeof onlineCount === "number" ? `在线 ${onlineCount}` : statusText}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <CompactStatus icon={<Bell size={14} />} label={`${notificationCount}`} title="消息" />
            <CompactStatus icon={<UserRound size={14} />} label={studentName || "我"} title="账号" />
            {actionSlot}
          </div>
        </div>
      </div>
    </section>
  );
}

export function StageGoalBar({
  course,
  currentStage,
  currentIndex,
  progress,
  studentName,
  onlineCount,
  notificationCount = 0,
  statusText = "课堂同步中",
  actionSlot,
}: {
  course: Course;
  currentStage: Stage;
  currentIndex: number;
  progress: number;
  studentName?: string;
  onlineCount?: number;
  notificationCount?: number;
  statusText?: string;
  actionSlot?: ReactNode;
}) {
  const help = getStageHelp(currentStage);
  return (
    <section className={cn("relative overflow-hidden rounded-[var(--radius-lg)] text-white", stageHeroBg(help.tone))}>
      <div className="pbl-hero-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/14 blur-3xl" aria-hidden="true" />
      <div className="relative grid gap-0 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[15px] bg-white/15 text-white ring-1 ring-white/20">
              {help.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className="rounded-full bg-white/16 px-3 py-1 ring-1 ring-white/18">
                  阶段 {currentIndex + 1}/{course.stages.length}
                </span>
                <span className="rounded-full bg-white/12 px-3 py-1 text-white/82">{statusText}</span>
              </div>
              <div className="truncate text-sm font-semibold text-white/68">{course.name}</div>
              <h1 className="mt-1 text-3xl font-bold leading-tight md:text-4xl">{currentStage.label}</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-white/82">{help.goal}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/14 bg-white/10 p-4 backdrop-blur xl:border-l xl:border-t-0">
          <div className="grid grid-cols-2 gap-2">
            <HeroChip icon={<UserRound size={15} />} label="我" value={studentName || "学生"} />
            <HeroChip icon={<Bell size={15} />} label="消息" value={`${notificationCount} 条`} />
            <HeroChip icon={<Users size={15} />} label="在线" value={typeof onlineCount === "number" ? `${onlineCount} 人` : "-"} />
            <HeroChip icon={<ShieldCheck size={15} />} label="状态" value={statusText} />
          </div>
          <div className="mt-3 rounded-[12px] bg-white/10 p-3 ring-1 ring-white/12">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/58">progress</span>
              <span className="text-xl font-bold">{progress}%</span>
            </div>
            <ProgressBar className="h-2 bg-white/18" value={progress} tone={progress >= 100 ? "green" : "blue"} />
          </div>
          {actionSlot ? <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{actionSlot}</div> : null}
        </div>
      </div>
    </section>
  );
}

export function TeacherClassroomBanner({
  course,
  currentStage,
  timerText,
  onlineCount,
  readyCount,
  riskCount,
}: {
  course: Course;
  currentStage: Stage;
  timerText: string;
  onlineCount: number;
  readyCount: number;
  riskCount: number;
}) {
  const help = getStageHelp(currentStage);
  const projectCount = course.groups?.length ?? 0;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--pbl-teacher-border)] bg-white px-3 py-2.5 shadow-[0_8px_24px_rgba(30,64,175,0.06)] md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)] ring-1 ring-[var(--pbl-teacher-border)]">
            {help.icon}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-[var(--pbl-text-muted)]">
              <span>阶段 {course.currentStageIndex + 1}/{course.stages.length}</span>
              <span>·</span>
              <span className="truncate">{course.name}</span>
              <button
                className="grid h-5 w-5 place-items-center rounded-full text-[var(--pbl-teacher)] ring-1 ring-[var(--pbl-teacher-border)] transition hover:bg-[var(--pbl-teacher-soft)]"
                title={`${help.goal}｜产出：${help.deliverable}｜AI：${help.ai}`}
                type="button"
                aria-label="查看阶段说明"
              >
                <HelpCircle size={13} />
              </button>
            </div>
            <h1 className="mt-0.5 truncate text-xl font-bold leading-tight text-[var(--pbl-text-strong)] md:text-2xl">{currentStage.label}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TeacherMetric icon={<Presentation size={15} />} label="计时" value={timerText} tone="blue" />
          <TeacherMetric
            icon={<Gauge size={16} />}
            label="达标"
            value={`${readyCount}/${course.students.length}`}
            tone={readyCount === course.students.length ? "green" : "blue"}
          />
          <TeacherMetric icon={<AlertTriangle size={16} />} label="介入" value={`${riskCount}`} tone={riskCount ? "orange" : "green"} />
          <TeacherMetric icon={<Users size={16} />} label="在线" value={`${onlineCount}/${course.students.length}`} tone="blue" />
          <TeacherMetric icon={<ClipboardCheck size={16} />} label="项目" value={`${projectCount}`} tone="green" />
        </div>
    </section>
  );
}

function CompactStatus({ icon, label, title }: { icon: ReactNode; label: string; title: string }) {
  return (
    <span className="inline-flex h-9 min-w-9 max-w-[110px] items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-white/12 px-2.5 text-xs font-bold text-white ring-1 ring-white/14" title={title}>
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

function HeroChip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[12px] bg-white/10 px-3 py-2 ring-1 ring-white/12">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-white/58">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function TeacherMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "blue" | "green" | "orange";
}) {
  return (
    <div className={cn("inline-flex h-9 items-center gap-2 rounded-[10px] border px-2.5", tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : tone === "orange" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-blue-100 bg-blue-50 text-blue-700")}>
      <div className="flex items-center gap-1 text-[11px] font-semibold">
        {icon}
        {label}
      </div>
      <div className="font-mono text-sm font-black tabular-nums">{value}</div>
    </div>
  );
}

function stageHeroBg(tone: Tone) {
  return {
    blue: "bg-[var(--pbl-ai)]",
    green: "bg-[var(--pbl-student)]",
    orange: "bg-[var(--pbl-warning)]",
    red: "bg-[var(--pbl-danger)]",
  }[tone];
}

export function LeaveIcon() {
  return <LogOut size={15} />;
}

export function MessageIcon() {
  return <MessageCircle size={15} />;
}
