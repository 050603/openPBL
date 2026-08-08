"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, ClipboardCheck, MapPin, Route, Users } from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import { DialogDescription, DialogTitle, Drawer, DrawerContent, PrimaryButton } from "@/components/ui";
import { useSession } from "@/lib/session/store";
import type { Course, LearningEventType, OfflineInterventionKind } from "@/lib/session/types";
import { cn } from "@/lib/utils";
import { formatLearningContentReference } from "@/lib/learning-analytics/content-reference";
import { isLearningSignalRelevant } from "@/lib/learning-analytics/analyzer";

type DetailTab = "support" | "trajectory";

const TABS: Array<{ id: DetailTab; label: string; icon: React.ReactNode }> = [
  { id: "support", label: "风险与教师指导", icon: <CircleAlert size={14} /> },
  { id: "trajectory", label: "学习轨迹", icon: <Route size={14} /> },
];

const EVENT_TYPE_LABELS: Record<LearningEventType, string> = {
  "scene-enter": "进入学习页面",
  "scene-leave": "离开学习页面",
  "scene-complete": "完成学习页面",
  heartbeat: "持续学习",
  "scene-replay": "重新播放讲解",
  "interaction-result": "完成互动操作",
  "artifact-change": "更新学习内容",
  "stage-enter": "进入学习阶段",
  "stage-goal-complete": "完成阶段目标",
};

export function formatLearningEventType(type: LearningEventType): string {
  return EVENT_TYPE_LABELS[type];
}

export function StudentLearningDetail({
  course,
  studentId,
  open,
  onOpenChange,
}: {
  course: Course;
  studentId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = useSession();
  const [tab, setTab] = useState<DetailTab>("support");
  const student = course.students.find((item) => item.id === studentId);
  const signals = (course.learningSignals ?? [])
    .filter((signal) => signal.studentId === studentId
      && signal.stageKey === "ai-learning"
      && isLearningSignalRelevant(
        signal,
        course.learningEvents ?? [],
        ["completed", "mastered"].includes(course.aiLearningProgress?.[studentId ?? ""]?.masteryLevel ?? ""),
      ))
    .sort((a, b) => Number(a.status !== "open") - Number(b.status !== "open") || Date.parse(b.lastDetectedAt) - Date.parse(a.lastDetectedAt));
  const openSignals = signals.filter((signal) => signal.status === "open");
  const events = (course.learningEvents ?? [])
    .filter((event) => event.studentId === studentId && event.stageKey === "ai-learning")
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const meaningfulEvents = events.filter((event) => event.type !== "heartbeat");
  const trajectoryEvents = (meaningfulEvents.length ? meaningfulEvents : events).slice(0, 100);
  const interventions = (course.offlineInterventions ?? []).filter((record) => record.targetStudentIds.includes(studentId ?? ""));
  const stageKey = course.stages[course.currentStageIndex]?.key ?? "ai-learning";

  function resolveSignals(signalIds: string[]) {
    if (signalIds.length) session.resolveInterventionSignals(course.id, signalIds);
  }

  function recordIntervention(kind: OfflineInterventionKind) {
    if (!studentId) return;
    const signalIds = kind === "whole-class-teaching"
      ? [...new Set([
          ...openSignals.map((signal) => signal.id),
          ...(course.classCommonIssues ?? []).filter((issue) => issue.status === "open").flatMap((issue) => issue.signalIds),
        ])]
      : openSignals.map((signal) => signal.id);
    session.addOfflineIntervention({
      courseId: course.id,
      stageKey,
      kind,
      targetStudentIds: kind === "whole-class-teaching" ? course.students.map((item) => item.id) : [studentId],
      signalIds,
    });
    resolveSignals(signalIds);
  }

  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent className="w-[min(800px,100vw)]">
        <DialogTitle className="flex items-center gap-3">
          {student ? <Avatar name={student.name} size={38} /> : null}
          <span>{student?.name ?? "学生详情"}</span>
        </DialogTitle>
        <DialogDescription>处理学习风险，记录教师指导，或查看学生的学习轨迹。</DialogDescription>
        <nav className="mt-5 flex gap-1 border-b border-stone-200">
          {TABS.map((item) => (
            <button
              className={cn(
                "inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold",
                tab === item.id ? "border-blue-700 text-blue-700" : "border-transparent text-stone-500",
              )}
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              {item.icon}{item.label}
            </button>
          ))}
        </nav>

        {tab === "support" ? (
          <div className="mt-4 space-y-5">
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-bold text-stone-900">风险信号</h3>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", openSignals.length ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>
                  {openSignals.length ? `${openSignals.length} 条待处理` : "当前无待处理风险"}
                </span>
              </div>
              {signals.length ? (
                <ul className="space-y-3">
                  {signals.map((signal) => (
                    <li className={cn("rounded-lg border p-3", signal.status === "open" ? "border-rose-200 bg-rose-50/60" : "border-emerald-200 bg-emerald-50/40")} key={signal.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <strong className={signal.status === "open" ? "text-rose-800" : "text-emerald-800"}>{signal.title}</strong>
                          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-stone-500"><MapPin size={12} />{formatLearningContentReference(signal.content, "当前学习内容")}</p>
                        </div>
                        {signal.status === "open" ? (
                          <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100" onClick={() => resolveSignals([signal.id])} type="button">
                            <CheckCircle2 size={14} />标记已处理
                          </button>
                        ) : <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} />已处理</span>}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-stone-600">{signal.summary}</p>
                      <p className="mt-2 text-xs text-stone-400">证据 {signal.evidenceEventIds.length} 条 · 最近发现于 {new Date(signal.lastDetectedAt).toLocaleString("zh-CN")}</p>
                    </li>
                  ))}
                </ul>
              ) : <Empty text="暂无风险信号" />}
            </section>

            <section className="rounded-xl border border-blue-100 bg-blue-50/45 p-4">
              <h3 className="font-bold text-stone-900">教师处理</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <PrimaryButton onClick={() => recordIntervention("patrol")} type="button" variant="outline"><ClipboardCheck size={15} />已巡视</PrimaryButton>
                <PrimaryButton onClick={() => recordIntervention("individual-guidance")} type="button" variant="outline"><ClipboardCheck size={15} />已个别辅导</PrimaryButton>
                <PrimaryButton onClick={() => recordIntervention("whole-class-teaching")} type="button" variant="outline"><Users size={15} />已全班讲解</PrimaryButton>
              </div>
              {openSignals.length ? <p className="mt-2 text-xs text-stone-500">记录处理后，将同步解除对应风险。</p> : null}
            </section>

            <section>
              <h3 className="mb-2 font-bold text-stone-900">处理记录</h3>
              {interventions.length ? (
                <ul className="divide-y divide-stone-100 border-y border-stone-100">
                  {interventions.map((record) => (
                    <li className="py-3 text-sm" key={record.id}>
                      <div className="flex justify-between gap-3"><strong>{record.kind === "patrol" ? "课堂巡视" : record.kind === "individual-guidance" ? "个别辅导" : "全班讲解"}</strong><time className="text-xs text-stone-400">{new Date(record.createdAt).toLocaleString("zh-CN")}</time></div>
                      <p className="mt-1 text-stone-500">记录人：{record.teacherName}</p>
                    </li>
                  ))}
                </ul>
              ) : <Empty text="暂无教师处理记录" />}
            </section>
          </div>
        ) : (
          <div className="mt-4">
            {trajectoryEvents.length ? (
              <ol className="overflow-hidden rounded-lg border border-stone-200">
                <li className="grid grid-cols-[150px_130px_minmax(0,1fr)] gap-3 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-500"><span>时间</span><span>学习动作</span><span>学习位置</span></li>
                {trajectoryEvents.map((event) => (
                  <li className="grid grid-cols-[150px_130px_minmax(0,1fr)] gap-3 border-t border-stone-100 px-3 py-3 text-sm" key={event.id}>
                    <time className="text-xs text-stone-400">{new Date(event.occurredAt).toLocaleString("zh-CN")}</time>
                    <span className="font-semibold text-stone-700">{formatLearningEventType(event.type)}</span>
                    <span className="text-stone-500">{formatLearningContentReference(event.content, event.metadata?.sceneTitle?.toString() ?? "当前学习内容")}</span>
                  </li>
                ))}
              </ol>
            ) : <Empty text="暂无学习轨迹" />}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-stone-200 py-8 text-center text-sm text-stone-500">{text}</div>;
}
