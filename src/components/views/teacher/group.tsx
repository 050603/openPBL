"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  Flag,
  LayoutPanelLeft,
  Lightbulb,
  Plus,
  RefreshCw,
  Search,
  Send,
  Users,
} from "lucide-react";
import { AvatarStack } from "@/components/dashboard-shell";
import { Card, Pill, PrimaryButton, ProgressBar, TextInput } from "@/components/ui";
import { GROUP_MODE_LABEL } from "@/lib/session/types";
import type { Course, ProjectGroup } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { buildTeacherInterventionSignals, type TeacherInterventionSignal } from "@/lib/teaching-ai/client-api";
import { GroupBoardEditor } from "../student/group-board-editor";

export function GroupTeacherView({ course, onSelectGroup }: { course: Course; onSelectGroup?: (id: string) => void }) {
  const session = useSession();
  const groups = useMemo(() => course.groups ?? [], [course.groups]);
  const [groupName, setGroupName] = useState("");
  const [groupQuery, setGroupQuery] = useState("");
  const [activeId, setActiveId] = useState(groups[0]?.id ?? "");
  const [monitoringGroupId, setMonitoringGroupId] = useState<string | null>(null);
  const [interventionSignals, setInterventionSignals] = useState<TeacherInterventionSignal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);

  const total = course.classConfig?.totalStudents ?? course.students.length;
  const grouped = groups.reduce((sum, group) => sum + group.members.length, 0);
  const joinedButUngrouped = course.students.filter((student) => !groups.some((group) => group.members.some((member) => member.studentId === student.id)));
  const decided = groups.filter((group) => group.topic && group.topic !== "待确定选题方向").length;
  const aiAnalysisPending = course.uiState?.aiAnalysisPending ?? false;

  const filteredGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((group) =>
      `${group.name} ${group.topic ?? ""} ${group.goal ?? ""} ${group.members.map((member) => member.name).join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [groups, groupQuery]);

  const active = groups.find((group) => group.id === activeId) ?? filteredGroups[0] ?? groups[0];
  const activeSignal = interventionSignals.find((signal) => signal.groupId === active?.id);
  const signalMap = useMemo(() => new Map(interventionSignals.map((signal) => [signal.groupId, signal])), [interventionSignals]);

  async function refreshSignals() {
    if (signalsLoading) return;
    setSignalsLoading(true);
    try {
      const signals = await buildTeacherInterventionSignals(course, "group");
      setInterventionSignals(signals);
      session.setUiState(course.id, {
        aiAnalysisPending: false,
        aiAnalysisRefreshedAt: new Date().toISOString(),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI 小组观察刷新失败";
      window.alert(message);
    } finally {
      setSignalsLoading(false);
    }
  }

  function createGroup() {
    if (!groupName.trim()) return;
    const created = session.createGroup(course.id, groupName.trim());
    setActiveId(created.id);
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
      setActiveId(created.id);
    }
    joinedButUngrouped.forEach((student, index) => {
      const target = availableGroups[index % availableGroups.length];
      session.upsertGroup(course.id, {
        ...target,
        members: [...target.members.filter((member) => member.studentId !== student.id), { studentId: student.id, name: student.name, role: "成员" }],
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
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="分组模式" value={course.classConfig ? GROUP_MODE_LABEL[course.classConfig.groupMode] : "-"} />
        <Metric title="已分组 / 总数" value={`${grouped} / ${total}`} sub={joinedButUngrouped.length ? `${joinedButUngrouped.length} 人待分组` : "全部已入组"} tone={joinedButUngrouped.length ? "orange" : "green"} />
        <Metric title="已确定选题" value={`${decided} / ${groups.length || 0}`} tone="green" />
        <Metric title="需关注小组" value={`${interventionSignals.length}`} tone={interventionSignals.length ? "orange" : "green"} />
      </div>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Users className="text-blue-700" size={20} /> 课堂态势图
              </h2>
              <p className="mt-1 text-xs text-slate-500">用空间位置呈现小组成熟度、风险和协作规模，列表保留为精确管理入口。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  className="h-9 w-52 rounded-[var(--radius-sm)] border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-blue-500"
                  onChange={(event) => setGroupQuery(event.target.value)}
                  placeholder="搜索小组 / 选题 / 成员"
                  value={groupQuery}
                />
              </label>
              <TextInput className="h-9 w-40" placeholder="新小组名称" value={groupName} onChange={(event) => setGroupName(event.target.value)} />
              <PrimaryButton className="h-9 px-3 text-sm" onClick={createGroup} disabled={!groupName.trim()}>
                <Plus size={15} /> 创建
              </PrimaryButton>
              <PrimaryButton className="h-9 px-3 text-sm" variant="outline" onClick={autoAssign} disabled={!joinedButUngrouped.length}>
                自动分配 <ArrowRight size={15} />
              </PrimaryButton>
            </div>
          </div>

          <GroupConstellationMap
            activeId={active?.id}
            course={course}
            groups={filteredGroups}
            onSelect={setActiveId}
            signalMap={signalMap}
          />

          {groups.length ? (
            <div className="overflow-hidden rounded-[var(--radius-sm)] border border-slate-200">
              <div className="grid grid-cols-[minmax(150px,1.1fr)_minmax(180px,1.5fr)_80px_110px_86px] gap-3 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
                <span>小组</span>
                <span>选题 / 方向</span>
                <span>人数</span>
                <span>构思进度</span>
                <span>状态</span>
              </div>
              <div className="max-h-[520px] overflow-auto">
                {filteredGroups.map((group) => {
                  const progress = groupProgress(course, group);
                  const signal = signalMap.get(group.id);
                  const selected = active?.id === group.id;
                  return (
                    <button
                      className={`grid w-full grid-cols-[minmax(150px,1.1fr)_minmax(180px,1.5fr)_80px_110px_86px] items-center gap-3 border-t border-slate-100 px-3 py-2.5 text-left transition ${
                        selected ? "bg-blue-50/70" : "bg-white hover:bg-slate-50"
                      }`}
                      key={group.id}
                      onClick={() => setActiveId(group.id)}
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-slate-900">{group.name}</span>
                          {signal ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">{group.members.map((member) => member.name).join("、") || "暂无成员"}</span>
                      </span>
                      <span className="truncate text-[13px] text-slate-600">{group.topic || "待确定选题"}</span>
                      <span className="text-[13px] font-semibold text-slate-700">{group.members.length} 人</span>
                      <span className="flex items-center gap-2">
                        <ProgressBar className="h-1.5 flex-1" tone={progress >= 80 ? "green" : progress < 35 ? "red" : "blue"} value={progress} />
                        <span className="w-8 text-right text-[11px] font-bold text-slate-600">{progress}%</span>
                      </span>
                      <GroupStatusPill progress={progress} hasSignal={Boolean(signal)} />
                    </button>
                  );
                })}
                {!filteredGroups.length ? (
                  <div className="border-t border-slate-100 bg-white py-10 text-center text-sm text-slate-500">没有匹配的小组。</div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-[var(--radius-sm)] border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500">暂无小组，请创建或等待学生加入。</div>
          )}

          {joinedButUngrouped.length > 0 ? (
            <div className="mt-3 rounded-[var(--radius-sm)] border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-700">
              还有 <strong>{joinedButUngrouped.length}</strong> 位学生未加入任何小组：{joinedButUngrouped.map((student) => student.name).join("、")}
            </div>
          ) : null}
        </Card>

        <Card>
          {active ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-600">selected group</div>
                  <TextInput className="mt-2 h-9 font-bold" value={active.name} onChange={(event) => renameGroup(active, event.target.value)} />
                  <div className="mt-1 truncate text-xs text-slate-500">{active.topic || "待确定选题"}</div>
                </div>
                <Pill tone={activeSignal ? (activeSignal.riskLevel === "high" ? "red" : "orange") : "blue"}>
                  {activeSignal ? "需关注" : "进行中"}
                </Pill>
              </div>

              <div className="rounded-[var(--radius-sm)] bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                  <span>构思成熟度</span>
                  <span className="font-bold text-slate-700">{groupProgress(course, active)}%</span>
                </div>
                <ProgressBar value={groupProgress(course, active)} tone={groupProgress(course, active) >= 80 ? "green" : groupProgress(course, active) < 35 ? "red" : "blue"} />
              </div>

              <div>
                <div className="mb-2 text-xs font-bold text-slate-500">成员进度</div>
                {active.members.length ? (
                  <ul className="space-y-1.5">
                    {active.members.map((member) => {
                      const student = course.students.find((item) => item.id === member.studentId);
                      const progress = student?.stageProgress?.group ?? 0;
                      return (
                        <li className="flex items-center gap-2 text-xs" key={member.studentId}>
                          <span className="w-16 truncate text-slate-700">{member.name}</span>
                          <ProgressBar className="h-1.5 flex-1" tone={progress >= 80 ? "green" : progress < 35 ? "red" : "blue"} value={progress} />
                          <span className="w-9 text-right font-bold text-slate-600">{progress}%</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="rounded-[var(--radius-sm)] border border-dashed border-slate-200 py-5 text-center text-xs text-slate-500">暂无成员</div>
                )}
              </div>

              {activeSignal ? (
                <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50/70 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-800">
                    <AlertTriangle size={13} /> 风险线索
                  </div>
                  <p className="text-sm leading-6 text-slate-700">{activeSignal.supportCard}</p>
                  <div className="mt-1 text-xs leading-5 text-slate-500">依据：{activeSignal.evidence.join("；")}</div>
                  <PrimaryButton className="mt-2 h-8 px-3 text-xs" onClick={() => confirmSupport(activeSignal)} type="button">
                    <Send size={13} /> 确认并推送
                  </PrimaryButton>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <PrimaryButton className="h-9 px-3 text-sm" onClick={() => setMonitoringGroupId(active.id)} type="button" variant="outline">
                  <Eye size={15} /> 协作板
                </PrimaryButton>
                <PrimaryButton className="h-9 px-3 text-sm" onClick={() => onSelectGroup?.(active.id)} type="button" variant="outline">
                  详情
                </PrimaryButton>
              </div>
            </div>
          ) : (
            <div className="rounded-[var(--radius-sm)] border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">选择一个小组查看详情。</div>
          )}
        </Card>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Lightbulb className="text-amber-600" size={20} /> 风险队列
                {aiAnalysisPending ? (
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                    学生有新更新
                  </span>
                ) : null}
              </h2>
              <p className="mt-1 text-xs text-slate-500">按风险等级聚合，只展示需要教师介入的小组，避免逐卡查找。</p>
            </div>
            <button
              className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-sm)] border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              disabled={signalsLoading}
              onClick={() => void refreshSignals()}
              type="button"
              aria-label="刷新 AI 干预信号"
            >
              <RefreshCw size={14} className={signalsLoading ? "animate-spin" : ""} />
              刷新
            </button>
          </div>
          {interventionSignals.length ? (
            <div className="max-h-[300px] overflow-auto rounded-[var(--radius-sm)] border border-slate-200">
              {interventionSignals.map((signal) => (
                <button
                  className="grid w-full grid-cols-[120px_86px_minmax(0,1fr)_92px] items-center gap-3 border-t border-slate-100 px-3 py-2.5 text-left first:border-t-0 hover:bg-slate-50"
                  key={signal.groupId}
                  onClick={() => setActiveId(signal.groupId)}
                  type="button"
                >
                  <span className="truncate text-sm font-bold text-slate-900">{signal.groupName}</span>
                  <Pill tone={signal.riskLevel === "high" ? "red" : "orange"}>{signal.riskLevel === "high" ? "高风险" : "需关注"}</Pill>
                  <span className="truncate text-xs text-slate-500">{signal.reasons.join("、")}</span>
                  <span className="text-right text-xs font-semibold text-blue-700">查看</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[var(--radius-sm)] border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
              点击刷新获取 AI 风险观察。
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
            <LayoutPanelLeft className="text-blue-700" size={20} /> 全班学生进度
          </h2>
          {course.students.length ? (
            <ul className="max-h-[300px] space-y-2 overflow-auto pr-1">
              {course.students.map((student) => {
                const group = groups.find((item) => item.members.some((member) => member.studentId === student.id));
                const progress = student.stageProgress?.group ?? 0;
                return (
                  <li className="flex items-center gap-2 text-xs" key={student.id}>
                    <span className="w-16 truncate font-semibold text-slate-700">{student.name}</span>
                    <span className="w-16 truncate text-slate-400">{group?.name ?? "未分组"}</span>
                    <ProgressBar className="h-1.5 flex-1" tone={progress >= 80 ? "green" : progress < 35 ? "red" : "blue"} value={progress} />
                    <span className="w-9 text-right font-bold text-slate-600">{progress}%</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-[var(--radius-sm)] border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500">暂无学生加入课堂</div>
          )}
        </Card>
      </section>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
          <Flag className="text-blue-700" size={20} /> 选题分布
        </h2>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-slate-200 bg-white px-3 py-2 text-sm" key={group.id}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{group.members.length}</span>
              <span className="min-w-0 flex-1 truncate text-slate-600">{group.topic || "待确定选题"}</span>
              <AvatarStack names={group.members.map((member) => member.name)} />
            </div>
          ))}
        </div>
      </Card>

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

function GroupConstellationMap({
  course,
  groups,
  activeId,
  signalMap,
  onSelect,
}: {
  course: Course;
  groups: ProjectGroup[];
  activeId?: string;
  signalMap: Map<string, TeacherInterventionSignal>;
  onSelect: (id: string) => void;
}) {
  if (!groups.length) {
    return (
      <div className="mb-3 rounded-[var(--radius-sm)] border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-500">
        暂无可展示的小组节点
      </div>
    );
  }

  return (
    <div className="mb-3 overflow-hidden rounded-[var(--radius-sm)] border border-slate-900/10 bg-slate-950 text-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-sm font-black">Group Constellation</div>
          <div className="mt-0.5 text-xs text-slate-300">横轴：构思成熟度；纵轴：教师介入优先级；圆点大小：成员规模。</div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-rose-400" />高风险</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-300" />需关注</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-cyan-300" />推进中</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-300" />成熟</span>
        </div>
      </div>
      <div className="relative h-[360px] min-h-[320px] bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.25),transparent_28%),radial-gradient(circle_at_80%_30%,rgba(16,185,129,0.18),transparent_24%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,1))]">
        <div className="pointer-events-none absolute inset-4 rounded-[var(--radius-sm)] border border-white/10" />
        <div className="pointer-events-none absolute inset-x-8 bottom-8 h-px bg-white/20" />
        <div className="pointer-events-none absolute bottom-8 left-8 top-8 w-px bg-white/20" />
        <span className="pointer-events-none absolute bottom-3 right-7 text-[11px] text-slate-400">成熟度 →</span>
        <span className="pointer-events-none absolute left-3 top-6 text-[11px] text-slate-400 [writing-mode:vertical-rl]">介入优先级 ↑</span>
        {groups.map((group, index) => {
          const progress = groupProgress(course, group);
          const signal = signalMap.get(group.id);
          const position = groupNodePosition(progress, signal, index, groups.length);
          const selected = activeId === group.id;
          const size = Math.min(64, 34 + group.members.length * 5);
          const tone = groupNodeTone(progress, signal);
          return (
            <button
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border text-left shadow-lg transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/70 ${
                selected ? "border-white bg-white text-slate-950 ring-4 ring-white/20" : `${tone} text-white`
              }`}
              key={group.id}
              onClick={() => onSelect(group.id)}
              style={{ left: position.left, top: position.top, height: size, width: size }}
              type="button"
              title={`${group.name}：${progress}%`}
            >
              <span className="flex h-full w-full flex-col items-center justify-center px-1">
                <span className="max-w-[90%] truncate text-[11px] font-black">{group.name}</span>
                <span className="text-[10px] opacity-80">{progress}%</span>
              </span>
              {signal ? (
                <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white shadow">
                  <AlertTriangle size={11} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
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
  const group = course.groups?.find((item) => item.id === groupId);
  if (!group) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-900/60" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between bg-white px-5 py-3 shadow">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-black">{group.name} · 协作板监控</h3>
          <p className="text-xs text-slate-500">只读视图 · 实时同步 · {group.members.length} 名组员</p>
        </div>
        <button
          className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-sm)] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
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

function GroupStatusPill({ progress, hasSignal }: { progress: number; hasSignal: boolean }) {
  if (hasSignal) return <Pill tone="orange">关注</Pill>;
  if (progress >= 80) return <Pill tone="green">成熟</Pill>;
  if (progress >= 50) return <Pill tone="blue">推进</Pill>;
  if (progress >= 25) return <Pill tone="orange">早期</Pill>;
  return <Pill tone="red">滞后</Pill>;
}

function groupProgress(course: Course, group: ProjectGroup) {
  const hasTopic = group.topic && group.topic !== "待确定选题方向";
  const hasGoal = Boolean(group.goal && group.goal.length > 10);
  const hasWork = Boolean(course.workPlan?.some((item) => item.groupId === group.id));
  const hasNodes = Boolean(course.whiteboard?.some((node) => node.groupId === group.id));
  return Math.min(100, (hasTopic ? 30 : 8) + (hasGoal ? 20 : 0) + (hasWork ? 25 : 0) + (hasNodes ? 15 : 0) + Math.min(10, group.members.length * 3));
}

function groupNodePosition(
  progress: number,
  signal: TeacherInterventionSignal | undefined,
  index: number,
  total: number,
) {
  const spread = total > 1 ? index / (total - 1) : 0.5;
  const jitter = ((index % 5) - 2) * 3;
  const left = Math.max(12, Math.min(88, 12 + progress * 0.76 + jitter));
  const riskBase = signal?.riskLevel === "high" ? 18 : signal?.riskLevel === "medium" ? 30 : 82 - progress * 0.44;
  const top = Math.max(14, Math.min(86, riskBase + (spread - 0.5) * 18));
  return { left: `${left}%`, top: `${top}%` };
}

function groupNodeTone(progress: number, signal?: TeacherInterventionSignal) {
  if (signal?.riskLevel === "high") return "border-rose-200/70 bg-rose-500";
  if (signal?.riskLevel === "medium") return "border-amber-200/70 bg-amber-500";
  if (progress >= 80) return "border-emerald-200/70 bg-emerald-500";
  if (progress >= 45) return "border-cyan-200/70 bg-cyan-500";
  return "border-orange-200/70 bg-orange-500";
}
