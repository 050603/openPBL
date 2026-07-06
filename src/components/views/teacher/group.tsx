"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Eye, Flag, LayoutPanelLeft, Plus, RefreshCw, Sparkles, Users } from "lucide-react";
import { AvatarStack } from "@/components/dashboard-shell";
import { Card, Pill, PrimaryButton, ProgressBar, TextInput } from "@/components/ui";
import { GROUP_MODE_LABEL } from "@/lib/session/types";
import type { Course, ProjectGroup } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { buildTeacherInterventionSignals, type TeacherInterventionSignal } from "@/lib/teaching-ai/client-api";
import { GroupBoardEditor } from "../student/group-board-editor";

export function GroupTeacherView({ course, onSelectGroup }: { course: Course; onSelectGroup?: (id: string) => void }) {
  const session = useSession();
  const [groupName, setGroupName] = useState("");
  const [monitoringGroupId, setMonitoringGroupId] = useState<string | null>(null);
  const groups = course.groups ?? [];
  const total = course.classConfig?.totalStudents ?? course.students.length;
  const grouped = groups.reduce((sum, g) => sum + g.members.length, 0);
  const joinedButUngrouped = course.students.filter((student) => !groups.some((group) => group.members.some((member) => member.studentId === student.id)));
  const decided = groups.filter((g) => g.topic && g.topic !== "待确定选题方向").length;
  // AI 干预信号异步加载（LLM 优先，失败回退本地规则）
  const [interventionSignals, setInterventionSignals] = useState<TeacherInterventionSignal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const aiAnalysisPending = course.uiState?.aiAnalysisPending ?? false;

  async function refreshSignals() {
    setSignalsLoading(true);
    try {
      const signals = await buildTeacherInterventionSignals(course, "group");
      setInterventionSignals(signals);
      session.setUiState(course.id, {
        aiAnalysisPending: false,
        aiAnalysisRefreshedAt: new Date().toISOString(),
      });
    } finally {
      setSignalsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadSignals() {
      setSignalsLoading(true);
      try {
        const signals = await buildTeacherInterventionSignals(course, "group");
        if (!cancelled) {
          setInterventionSignals(signals);
          session.setUiState(course.id, {
            aiAnalysisPending: false,
            aiAnalysisRefreshedAt: new Date().toISOString(),
          });
        }
      } finally {
        if (!cancelled) setSignalsLoading(false);
      }
    }
    loadSignals();
    return () => { cancelled = true; };
    // 仅在课程 ID/更新时间变化时重新加载，避免 polling 引起的频繁 LLM 调用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, course.updatedAt]);

  function createGroup() {
    if (!groupName.trim()) return;
    session.createGroup(course.id, groupName.trim());
    setGroupName("");
  }

  function renameGroup(group: ProjectGroup, name: string) {
    session.upsertGroup(course.id, { ...group, name, updatedAt: new Date().toISOString() });
  }

  function autoAssign() {
    let availableGroups = groups;
    if (!availableGroups.length) {
      const created = session.createGroup(course.id, "第 1 组");
      availableGroups = [created];
    }
    joinedButUngrouped.forEach((student, index) => {
      const target = availableGroups[index % availableGroups.length];
      session.upsertGroup(course.id, {
        ...target,
        members: [...target.members.filter((m) => m.studentId !== student.id), { studentId: student.id, name: student.name, role: "成员" }],
        updatedAt: new Date().toISOString(),
      });
    });
    session.addActivity(course.id, "自动分组", `${joinedButUngrouped.length} 名学生已分配到现有小组`, "教师");
  }

  function confirmSupport(signal: TeacherInterventionSignal) {
    const group = groups.find((item) => item.id === signal.groupId);
    session.upsertAiSupport({
      courseId: course.id,
      stageKey: "group",
      targetType: "group",
      targetId: signal.groupId,
      groupId: signal.groupId,
      kind: "teacher-intervention",
      trigger: "教师确认小组支架",
      inputSummary: `小组：${signal.groupName}；风险：${signal.reasons.join("、")}`,
      diagnosis: signal.reasons.length ? `需关注：${signal.reasons.join("、")}` : "当前无明显风险",
      suggestions: [signal.supportCard],
      evidence: signal.evidence,
      status: "teacher-confirmed",
    });
    session.addFeedback({
      courseId: course.id,
      targetType: "group",
      targetId: signal.groupId,
      stageKey: "group",
      kind: "ai-support",
      content: signal.supportCard,
    });
    session.addActivity(course.id, "确认AI小组支架", `${group?.name ?? signal.groupName}：${signal.supportCard}`, "教师");
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="分组模式" value={course.classConfig ? GROUP_MODE_LABEL[course.classConfig.groupMode] : "-"} />
        <Metric title="已分组 / 总数" value={`${grouped} / ${total}`} sub={joinedButUngrouped.length ? `${joinedButUngrouped.length} 人待分组` : "全部已入组"} tone={joinedButUngrouped.length ? "orange" : "green"} />
        <Metric title="已确定选题" value={`${decided} / ${groups.length || 0}`} tone="green" />
        <Metric title="需关注小组" value={`${interventionSignals.length}`} tone={interventionSignals.length ? "orange" : "green"} />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Sparkles className="text-amber-600" size={20} /> AI构思诊断面板
              {aiAnalysisPending ? (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                  学生有新更新
                </span>
              ) : null}
            </h2>
            <p className="mt-1 text-sm text-slate-500">基于选题、分工和学生进度生成关注线索，支架需教师确认后推送。</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 items-center gap-1 rounded-[6px] border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              disabled={signalsLoading}
              onClick={() => void refreshSignals()}
              type="button"
              aria-label="刷新 AI 干预信号"
            >
              <RefreshCw size={14} className={signalsLoading ? "animate-spin" : ""} />
              刷新
            </button>
            <Pill tone={interventionSignals.length ? "orange" : "green"}>{interventionSignals.length ? "待处理" : "暂无高风险"}</Pill>
          </div>
        </div>
        {interventionSignals.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {interventionSignals.slice(0, 4).map((signal) => (
              <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-4" key={signal.groupId}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="font-black">{signal.groupName}</div>
                  <Pill tone={signal.riskLevel === "high" ? "red" : "orange"}>{signal.riskLevel === "high" ? "高风险" : "需关注"}</Pill>
                </div>
                <p className="text-sm leading-6 text-slate-700">{signal.supportCard}</p>
                <div className="mt-2 text-xs leading-5 text-slate-500">
                  原因：{signal.reasons.join("、")}；依据：{signal.evidence.join("；")}
                </div>
                <PrimaryButton className="mt-3 h-9 px-3 text-sm" onClick={() => confirmSupport(signal)} type="button">
                  <Sparkles size={15} /> 确认并推送支架卡
                </PrimaryButton>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[8px] border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
            暂未发现明显卡点。可继续观察小组协作板和分工计划。
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Users className="text-blue-700" size={20} /> 分组管理
          </h2>
          <div className="flex gap-2">
            <TextInput className="h-10 w-56" placeholder="新小组名称" value={groupName} onChange={(event) => setGroupName(event.target.value)} />
            <PrimaryButton className="h-10 px-3 text-sm" onClick={createGroup} disabled={!groupName.trim()}>
              <Plus size={15} /> 创建小组
            </PrimaryButton>
            <PrimaryButton className="h-10 px-3 text-sm" variant="outline" onClick={autoAssign} disabled={!joinedButUngrouped.length}>
              自动分配 <ArrowRight size={15} />
            </PrimaryButton>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {groups.map((group) => {
            const progress = groupProgress(course, group);
            return (
              <div className="rounded-[10px] border border-slate-200 bg-white p-4 transition hover:border-blue-300" key={group.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-base font-black text-blue-700">{group.name.slice(-1)}</div>
                    <div className="min-w-0 flex-1">
                      <TextInput className="h-9 font-black" value={group.name} onChange={(event) => renameGroup(group, event.target.value)} />
                      <div className="mt-1 truncate text-xs text-slate-500">{group.members.length} 人 · {group.topic}</div>
                    </div>
                  </div>
                  <GroupStatusPill progress={progress} />
                </div>
                <div className="mt-3">
                  <ProgressBar className="h-2" tone={progress >= 80 ? "green" : progress < 35 ? "red" : "blue"} value={progress} />
                  <div className="mt-1 flex justify-between text-xs text-slate-500">
                    <span>构思进度</span>
                    <span className="font-semibold">{progress}%</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <AvatarStack names={group.members.map((m) => m.name)} />
                  <div className="flex items-center gap-3">
                    <button className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700" onClick={() => setMonitoringGroupId(group.id)} type="button" data-testid={`monitor-group-${group.id}`}>
                      <Eye size={14} /> 查看协作板
                    </button>
                    <button className="text-sm font-semibold text-slate-500 hover:text-blue-700" onClick={() => onSelectGroup?.(group.id)} type="button">详情</button>
                  </div>
                </div>
                {/* Per-student progress visualization */}
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <div className="mb-2 text-xs font-semibold text-slate-500">组员阶段进度</div>
                  {group.members.length ? (
                    <ul className="space-y-1.5" data-testid={`group-${group.id}-members`}>
                      {group.members.map((m) => {
                        const student = course.students.find((s) => s.id === m.studentId);
                        const prog = student?.stageProgress?.group ?? 0;
                        return (
                          <li className="flex items-center gap-2 text-xs" key={m.studentId}>
                            <span className="w-16 truncate text-slate-600">{m.name}</span>
                            <ProgressBar className="h-1.5 flex-1" tone={prog >= 80 ? "green" : prog < 35 ? "red" : "blue"} value={prog} />
                            <span className="w-9 text-right font-semibold text-slate-600">{prog}%</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400">暂无组员</p>
                  )}
                </div>
              </div>
            );
          })}
          {!groups.length ? (
            <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500">暂无小组，请创建或等待学生加入。</div>
          ) : null}
        </div>
        {joinedButUngrouped.length > 0 ? (
          <div className="mt-4 rounded-[6px] border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-700">
            还有 <strong>{joinedButUngrouped.length}</strong> 位学生未加入任何小组：{joinedButUngrouped.map((s) => s.name).join("、")}
          </div>
        ) : null}
      </Card>

      {/* Class-wide student progress overview */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
          <LayoutPanelLeft className="text-blue-700" size={20} /> 全班学生进度
        </h2>
        {course.students.length ? (
          <ul className="space-y-2" data-testid="class-progress-list">
            {course.students.map((s) => {
              const prog = s.stageProgress?.group ?? 0;
              const grp = groups.find((g) => g.members.some((m) => m.studentId === s.id));
              return (
                <li className="flex items-center gap-3 text-sm" key={s.id}>
                  <span className="w-24 truncate text-slate-700">{s.name}</span>
                  <span className="w-24 truncate text-xs text-slate-500">{grp?.name ?? "未分组"}</span>
                  <ProgressBar className="h-2 flex-1" tone={prog >= 80 ? "green" : prog < 35 ? "red" : "blue"} value={prog} />
                  <span className="w-9 text-right font-semibold text-slate-600">{prog}%</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-[6px] border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500">暂无学生加入课堂</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
          <Sparkles className="text-amber-600" size={20} /> 选题分布
        </h2>
        <ul className="space-y-2">
          {groups.map((group) => (
            <li className="flex items-center gap-3 text-sm" key={group.id}>
              <Flag className="text-slate-400" size={15} />
              <span className="w-40 truncate text-slate-600">{group.topic}</span>
              <div className="flex-1"><ProgressBar className="h-2" tone="slate" value={Math.max(12, group.members.length * 18)} /></div>
              <span className="w-12 text-right font-semibold">{group.members.length} 人</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Teacher monitoring overlay: renders the group's collaborative board
          in read-only mode so the teacher can observe live progress. */}
      {monitoringGroupId ? (
        <GroupMonitorOverlay
          course={course}
          groupId={monitoringGroupId}
          onClose={() => setMonitoringGroupId(null)}
        />
      ) : null}
    </div>
  );
}

function GroupMonitorOverlay({
  course,
  groupId,
  onClose,
}: {
  course: Course;
  groupId: string;
  onClose: () => void;
}) {
  const group = course.groups?.find((g) => g.id === groupId);
  if (!group) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-900/60" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between bg-white px-5 py-3 shadow">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-black">{group.name} · 协作板监控</h3>
          <p className="text-xs text-slate-500">只读视图 · 实时同步 · {group.members.length} 名组员</p>
        </div>
        <button
          className="inline-flex h-9 items-center gap-1 rounded-[6px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          onClick={onClose}
          type="button"
        >
          关闭监控
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-white">
        <GroupBoardEditor course={course} groupId={groupId} readOnly />
      </div>
    </div>
  );
}

function Metric({ title, value, sub, tone = "blue" }: { title: string; value: string; sub?: string; tone?: "blue" | "green" | "orange" }) {
  return (
    <Card>
      <div className="text-sm text-slate-500">{title}</div>
      <div className={`mt-2 text-2xl font-black ${tone === "green" ? "text-emerald-700" : tone === "orange" ? "text-orange-700" : "text-blue-700"}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </Card>
  );
}

function GroupStatusPill({ progress }: { progress: number }) {
  if (progress >= 80) return <Pill tone="green">已确定选题</Pill>;
  if (progress >= 50) return <Pill tone="blue">讨论中</Pill>;
  if (progress >= 25) return <Pill tone="orange">组建中</Pill>;
  return <Pill tone="red">需协助</Pill>;
}

function groupProgress(course: Course, group: ProjectGroup) {
  const hasTopic = group.topic && group.topic !== "待确定选题方向";
  const hasWork = Boolean(course.workPlan?.some((item) => item.groupId === group.id));
  const hasNodes = Boolean(course.whiteboard?.some((node) => node.groupId === group.id));
  return Math.min(100, (hasTopic ? 35 : 10) + (hasWork ? 30 : 0) + (hasNodes ? 25 : 0) + Math.min(10, group.members.length * 3));
}
