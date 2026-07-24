"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FolderOpen,
  History,
  LayoutDashboard,
  Library,
  ListTodo,
  Mic2,
  PanelRightClose,
  Search,
  Send,
  Settings,
  Square,
  UsersRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { agentRoleById, agentRoles } from "@/assets/agent/roles";
import type { AgentId, PartnerRuntime, PartnerState } from "@/domain/studio";
import { getCompanion, type AiCompanionId } from "@/lib/ai-companions";
import { emitStudentArtifactEvent } from "@/lib/companion/events";
import { appendCompanionContribution } from "@/lib/companion/workspace-operation";
import type { CompanionConfirmation, CompanionTask, Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import type { StudyZoneId } from "@/pixi/study-zones";
import PixiStage, { type StudyZoneCommand } from "./companion-studio-pixi-stage";
import { useCompanionRuntime } from "./companion-runtime";
import { StudioProjectWorkbench } from "./studio-project-workbench";
import "./companion-studio-workspace.css";

type StudioModal = StudyZoneId | "history" | null;
type RailView = "overview" | "agent" | "activity" | "settings";

const VISUAL_TO_COMPANION: Record<AgentId, AiCompanionId> = {
  zhizhi: "knowledge",
  wenwen: "critic",
  lingling: "ideation",
  cece: "planner",
  pingping: "reviewer",
  jiji: "recorder",
};

const STATUS_LABEL: Record<CompanionTask["status"], string> = {
  queued: "等待调度",
  assigned: "已分配",
  processing: "正在处理",
  responding: "正在回应",
  "waiting-student": "等待学生审核",
  "waiting-confirmation": "等待确认",
  result: "已形成结果",
  saved: "已保存",
  failed: "执行失败",
};

const TASK_KIND: Record<AiCompanionId, CompanionTask["kind"]> = {
  knowledge: "knowledge",
  ideation: "ideation",
  critic: "critique",
  planner: "planning",
  reviewer: "review",
  recorder: "record",
};

const ZONE_COPY: Record<StudyZoneId, { eyebrow: string; title: string; description: string; agentId: AgentId }> = {
  library: {
    eyebrow: "REFERENCE CORNER",
    title: "资料角",
    description: "向知知咨询概念、背景和资料线索。这里发出的请求会进入真实伴学对话，并保留在本阶段历史中。",
    agentId: "zhizhi",
  },
  planning: {
    eyebrow: "PROJECT BOARD",
    title: "项目白板",
    description: "查看当前目标、最近产物和待确认事项，再进入任务视图继续编辑或提交。",
    agentId: "cece",
  },
  archive: {
    eyebrow: "PROCESS ARCHIVE",
    title: "过程档案",
    description: "查看真实对话、伙伴任务、过程记录和阶段产物，不额外生成演示数据。",
    agentId: "jiji",
  },
};

export function CompanionStudioWorkspace(props: {
  course: Course;
  stageKey: string;
  contextLabel: string;
  canSwitchMode?: boolean;
  onSwitchToTask: () => void;
}) {
  const runtime = useCompanionRuntime();
  if (!runtime) return null;
  return <CompanionStudioRuntime {...props} runtime={runtime} />;
}

function CompanionStudioRuntime({
  course,
  stageKey,
  contextLabel,
  canSwitchMode = true,
  onSwitchToTask,
  runtime,
}: {
  course: Course;
  stageKey: string;
  contextLabel: string;
  canSwitchMode?: boolean;
  onSwitchToTask: () => void;
  runtime: NonNullable<ReturnType<typeof useCompanionRuntime>>;
}) {
  const session = useSession();
  const router = useRouter();
  const activeTaskIdRef = useRef<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null);
  const [studioModal, setStudioModal] = useState<StudioModal>(null);
  const [studyZoneCommand, setStudyZoneCommand] = useState<StudyZoneCommand | null>(null);
  const [railView, setRailView] = useState<RailView>("overview");
  const [railOpen, setRailOpen] = useState(false);

  useEffect(() => {
    if (!railOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRailOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [railOpen]);

  const studentId = session.studentId ?? "";
  const studentGroup = useMemo(
    () => course.groups?.find((group) => group.members.some((member) => member.studentId === studentId)),
    [course.groups, studentId],
  );
  const stageTasks = useMemo(
    () => (course.companionTasks ?? [])
      .filter((task) => task.studentId === studentId && task.stageKey === stageKey)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 12),
    [course.companionTasks, stageKey, studentId],
  );
  const pendingConfirmations = useMemo(
    () => (course.companionConfirmations ?? [])
      .filter((item) => item.studentId === studentId && item.status === "pending")
      .slice(0, 8),
    [course.companionConfirmations, studentId],
  );
  const records = useMemo(
    () => (course.companionProcessRecords ?? [])
      .filter((record) => record.studentId === studentId && record.stageKey === stageKey)
      .slice(0, 20),
    [course.companionProcessRecords, stageKey, studentId],
  );
  const recentProducts = useMemo(() => {
    const submissions = (course.submissions ?? [])
      .filter((submission) => submission.studentId === studentId && submission.stageKey === stageKey)
      .map((submission) => ({ id: submission.id, title: submission.title, kind: "项目内容", time: submission.updatedAt }));
    const uploads = (course.uploads ?? [])
      .filter((upload) => upload.studentId === studentId && upload.stageKey === stageKey)
      .map((upload) => ({ id: upload.id, title: upload.fileName, kind: "上传材料", time: upload.createdAt }));
    return [...submissions, ...uploads].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 8);
  }, [course.submissions, course.uploads, stageKey, studentId]);

  const activeTask = stageTasks.find((task) => ["queued", "assigned", "processing", "responding", "waiting-student", "waiting-confirmation"].includes(task.status));
  const availableIds = useMemo(() => new Set(runtime.available.map((item) => item.id)), [runtime.available]);
  const selectedCompanionId = selectedAgentId ? VISUAL_TO_COMPANION[selectedAgentId] : null;
  const projectProgress = Math.round(((course.currentStageIndex + 1) / Math.max(1, course.stages.length)) * 100);

  const partnerStates = useMemo(() => {
    const latestAssistantById = new Map<AiCompanionId, string>();
    runtime.messages.forEach((message) => {
      if (message.role === "assistant" && message.companionId) latestAssistantById.set(message.companionId, message.content);
    });

    return Object.fromEntries(agentRoles.map((role) => {
      const companionId = VISUAL_TO_COMPANION[role.id];
      const isAvailable = availableIds.has(companionId);
      const task = stageTasks.find((item) => item.companionId === companionId);
      const microLesson = companionId === "knowledge" ? runtime.microLessonTask : null;
      const isCurrentTTS = runtime.tts.currentTTS?.companionId === companionId;
      const isPreparing = runtime.generatingCompanionId === companionId
        || runtime.tts.preparingCompanionId === companionId
        || microLesson?.lesson.status === "generating";
      let state: PartnerState = "idle";
      if (runtime.error && runtime.selectedCompanionId === companionId) state = "error";
      else if (microLesson?.lesson.status === "failed") state = "error";
      else if (isCurrentTTS) state = runtime.tts.speaking ? "speaking" : "celebrating";
      else if (isPreparing) state = "working";
      else if (microLesson?.lesson.status === "ready") state = "waiting_user";
      else if (task?.status === "waiting-student" || task?.status === "waiting-confirmation") state = "waiting_user";
      else if (task && ["queued", "assigned", "processing", "responding"].includes(task.status)) state = "working";
      else if (selectedAgentId === role.id) state = "selected";

      const partner: PartnerRuntime = {
        state,
        message: isCurrentTTS
          ? runtime.tts.currentTTS?.text ?? ""
          : microLesson?.lesson.status === "generating"
            ? `正在制作“${microLesson.lesson.topic}”微课`
          : microLesson?.lesson.status === "ready"
            ? "微课已完成，等你开始学习"
          : isPreparing
            ? "正在准备回应…"
          : latestAssistantById.get(companionId) ?? (isAvailable ? role.intro : "本阶段旁听，暂不参与调度"),
        task: microLesson
          ? `${microLesson.lesson.status === "ready" ? "待学习" : "制作中"} · ${microLesson.lesson.topic}`
          : task?.title ?? (isAvailable ? role.stationNote : "本阶段未启用"),
        result: task?.result ?? "",
        accentNote: isAvailable ? getCompanion(companionId).description : "旁听中",
      };
      return [role.id, partner];
    })) as Record<AgentId, PartnerRuntime>;
  }, [availableIds, runtime.error, runtime.generatingCompanionId, runtime.messages, runtime.microLessonTask, runtime.selectedCompanionId, runtime.tts.currentTTS, runtime.tts.preparingCompanionId, runtime.tts.speaking, selectedAgentId, stageTasks]);

  useEffect(() => {
    if (!activeTaskIdRef.current) return;
    const task = stageTasks.find((item) => item.id === activeTaskIdRef.current);
    if (!task) return;
    if (runtime.phase === "director" && ["queued", "assigned"].includes(task.status)) {
      session.upsertCompanionTask({ ...task, status: "processing" });
    } else if (runtime.phase === "speaking" && task.status !== "responding") {
      session.upsertCompanionTask({ ...task, status: "responding" });
    } else if (runtime.phase === "idle" && runtime.lastCompletedRound?.taskId === task.id && task.status !== "waiting-student") {
      const patches = runtime.lastCompletedRound.workspacePatches;
      if (patches.length) {
        let document = (course.submissions ?? []).find((submission) =>
          submission.stageKey === stageKey
          && submission.type === "document"
          && (submission.studentId === studentId || (studentGroup && submission.groupId === studentGroup.id)),
        );
        let content = document?.content ?? "";
        patches.forEach((patch) => {
          const companion = getCompanion(patch.companionId);
          content = appendCompanionContribution({
            existingContent: content,
            patch,
            companionId: patch.companionId,
            companionName: companion.name,
            taskId: task.id,
          });
          session.addCompanionProcessRecord({
            courseId: course.id,
            studentId,
            stageKey,
            title: `${companion.name}补充了“${patch.title}”`,
            summary: `已追加到项目工作台的协作文档。${patch.reviewInstruction}`,
            source: "agent",
            companionId: patch.companionId,
            taskId: task.id,
          });
        });
        document = session.upsertSubmission({
          id: document?.id ?? `studio-document-${studentId}-${stageKey}`,
          courseId: course.id,
          studentId,
          studentName: session.studentName ?? session.user.name,
          groupId: studentGroup?.id,
          stageKey,
          type: "document",
          title: "项目协作文档",
          content,
        });
        session.addActivity(course.id, "智能体补充项目文档", patches.map((patch) => patch.title).join("、"), session.studentName ?? "学生");
        emitStudentArtifactEvent({
          courseId: course.id,
          studentId,
          stageKey,
          kind: "document-saved",
          artifactId: document?.id,
          summary: `智能体已补充项目协作文档：${patches.map((patch) => patch.title).join("、")}`,
          content,
        });
        session.upsertCompanionTask({
          ...task,
          status: "saved",
          result: `${runtime.lastCompletedRound.text}\n已写入：项目工作台 → 协作文档`,
        });
      } else {
        session.upsertCompanionTask({ ...task, status: "waiting-student", result: runtime.lastCompletedRound.text });
      }
      activeTaskIdRef.current = null;
    }
  }, [course.id, course.submissions, runtime.lastCompletedRound, runtime.phase, session, stageKey, stageTasks, studentGroup, studentId]);

  const sendRequest = useCallback(async (request: string, companionIds?: AiCompanionId[]) => {
    const clean = request.trim();
    if (!clean || runtime.isActive || !studentId) return false;

    // 选 0 人：全体发送（单次 group conversation）
    // 选 1 人：发给那个人
    // 选多人：依次发给每个人。runtime.isActive 会在每轮回复期间阻止
    // 下一次发送，所以多选时只有第一个能立即发出，后续需要等当前回复
    // 完成后再由用户手动重发。这是当前架构的限制（runtime.send 只
    // 支持单个 preferredCompanionId 且 phase 必须为 idle）。
    const ids = companionIds?.filter((id) => availableIds.has(id)) ?? [];
    if (companionIds && companionIds.length > 0 && ids.length === 0) return false;

    if (ids.length <= 1) {
      const companionId = ids[0];
      const companion = companionId ? getCompanion(companionId) : null;
      const task = session.upsertCompanionTask({
        courseId: course.id,
        studentId,
        stageKey,
        companionId,
        kind: companionId ? TASK_KIND[companionId] : "conversation",
        title: companion ? `请${companion.name}处理` : "请伴学小组一起讨论",
        request: clean,
        status: "assigned",
      });
      activeTaskIdRef.current = task.id;
      const ok = await runtime.send(clean, { preferredCompanionId: companionId, taskId: task.id });
      if (!ok) {
        session.upsertCompanionTask({ ...task, status: "failed", error: "本轮请求没有完成" });
        activeTaskIdRef.current = null;
      }
      return ok;
    }

    // 多人：依次发送，第一个失败则整体失败。后续发送可能被 isActive
    // 阻止（返回 false），此处直接跳过不视为整体失败。
    let lastOk = true;
    for (const companionId of ids) {
      const companion = getCompanion(companionId);
      const task = session.upsertCompanionTask({
        courseId: course.id,
        studentId,
        stageKey,
        companionId,
        kind: TASK_KIND[companionId],
        title: `请${companion.name}处理`,
        request: clean,
        status: "assigned",
      });
      activeTaskIdRef.current = task.id;
      const ok = await runtime.send(clean, { preferredCompanionId: companionId, taskId: task.id });
      if (!ok) {
        session.upsertCompanionTask({ ...task, status: "failed", error: "本轮请求没有完成" });
        activeTaskIdRef.current = null;
      }
      lastOk = lastOk && ok;
    }
    return lastOk;
  }, [availableIds, course.id, runtime, session, stageKey, studentId]);

  const selectAgent = useCallback((agentId: AgentId) => {
    setSelectedAgentId(agentId);
    setRailView("agent");
    setRailOpen(true);
    const companionId = VISUAL_TO_COMPANION[agentId];
    runtime.setSelectedCompanionId(availableIds.has(companionId) ? companionId : null);
  }, [availableIds, runtime]);

  const selectZone = useCallback((zoneId: StudyZoneId) => {
    const zone = ZONE_COPY[zoneId];
    setSelectedAgentId(null);
    setStudioModal(zoneId);
    runtime.setSelectedCompanionId(null);
    setStudyZoneCommand({ agentId: zone.agentId, zoneId, token: Date.now() });
  }, [runtime]);

  const clearSelection = useCallback(() => {
    setSelectedAgentId(null);
    setRailView("overview");
    runtime.setSelectedCompanionId(null);
  }, [runtime]);

  const stageStatus = runtime.microLessonTask?.lesson.status === "generating"
    ? `知知正在制作微课 · ${Math.round(runtime.microLessonTask.progress)}%`
    : runtime.microLessonTask?.lesson.status === "ready"
      ? "新微课已准备好"
    : runtime.tts.speaking && runtime.tts.currentTTS
    ? `${getCompanion(runtime.tts.currentTTS.companionId).name}正在发言`
    : runtime.tts.preparingCompanionId
      ? `${getCompanion(runtime.tts.preparingCompanionId).name}正在准备语音`
      : runtime.generatingCompanionId
        ? `${getCompanion(runtime.generatingCompanionId).name}正在思考`
        : runtime.phase === "director"
          ? "正在安排伙伴"
    : runtime.currentSpeaker
      ? `${getCompanion(runtime.currentSpeaker).name}正在回应`
      : activeTask
        ? STATUS_LABEL[activeTask.status]
        : "伙伴们已就位";

  const openMicroLesson = useCallback(() => {
    const task = runtime.microLessonTask;
    if (!task?.lesson.classroomId || task.lesson.status !== "ready") return;
    const query = new URLSearchParams({
      courseId: course.id,
      lessonId: task.lesson.id,
      topic: task.lesson.topic,
      returnTo: `/student/classroom/${course.id}`,
    });
    router.push(`/student/micro-lesson/${task.lesson.classroomId}?${query.toString()}`);
  }, [course.id, router, runtime.microLessonTask]);

  return (
    <div className="companion-studio-shell" data-rail={railOpen ? "open" : "closed"}>
      <section className="companion-studio-scene" aria-label="AI 伴学工作室">
        <PixiStage
          agentStates={partnerStates}
          onClearSelection={clearSelection}
          onSelectAgent={selectAgent}
          onSelectStudyZone={selectZone}
          selectedAgentId={selectedAgentId}
          studyZoneCommand={studyZoneCommand}
        />

        <div className="studio-stage-peek">
          <span><i />{stageStatus}</span>
          <strong>{contextLabel}</strong>
          <small>阶段 {course.currentStageIndex + 1}/{course.stages.length} · {projectProgress}%</small>
        </div>

        <button aria-label="课堂设置" className="studio-settings-trigger" onClick={() => { setRailView("settings"); setRailOpen(true); }} type="button">
          <Settings size={17} /><span>设置</span>
        </button>

        <button className="studio-overview-trigger" onClick={() => { setRailView("overview"); setRailOpen(true); }} type="button">
          <LayoutDashboard size={16} /> 小组动态
          {runtime.unreadCount ? <span>{runtime.unreadCount}</span> : null}
        </button>

        {runtime.microLessonTask ? (
          <aside
            aria-live="polite"
            className="studio-micro-task"
            data-status={runtime.microLessonTask.lesson.status}
          >
            <div className="studio-micro-task__head">
              <span className="studio-micro-task__agent" aria-hidden="true">
                <BookOpenCheck size={17} />
                {runtime.microLessonTask.lesson.status === "generating" ? <i /> : null}
              </span>
              <div>
                <small>
                  {runtime.microLessonTask.lesson.status === "ready"
                    ? "知知 · 制作完成"
                    : runtime.microLessonTask.lesson.status === "failed"
                      ? "知知 · 制作中断"
                      : "知知 · 正在制作微课"}
                </small>
                <strong>{runtime.microLessonTask.lesson.topic}</strong>
              </div>
              {runtime.microLessonTask.lesson.status !== "generating" ? (
                <button aria-label="关闭微课任务卡" onClick={runtime.dismissMicroLessonTask} type="button">
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <p>{runtime.microLessonTask.message}</p>
            <div
              aria-label={`微课制作进度 ${Math.round(runtime.microLessonTask.progress)}%`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(runtime.microLessonTask.progress)}
              className="studio-micro-task__progress"
              role="progressbar"
            >
              <i style={{ width: `${Math.max(5, runtime.microLessonTask.progress)}%` }} />
            </div>
            <div className="studio-micro-task__foot">
              <span>{Math.round(runtime.microLessonTask.progress)}%</span>
              {runtime.microLessonTask.lesson.status === "ready" ? (
                <button className="studio-micro-task__open" onClick={openMicroLesson} type="button">
                  进入学习 <ArrowUpRight size={13} />
                </button>
              ) : runtime.microLessonTask.lesson.status === "failed" ? (
                <button className="studio-micro-task__dismiss" onClick={runtime.dismissMicroLessonTask} type="button">
                  知道了
                </button>
              ) : (
                <small>你可以继续完成当前任务</small>
              )}
            </div>
          </aside>
        ) : null}

        <StudioComposer
          availableCompanions={runtime.available.map((item) => ({ id: item.id, name: getCompanion(item.id).name, shortName: getCompanion(item.id).shortName, color: getCompanion(item.id).color }))}
          disabled={!runtime.stageEnabled}
          initialSelectedIds={selectedCompanionId ? [selectedCompanionId] : []}
          isActive={runtime.isActive}
          onSend={(text, companionIds) => sendRequest(text, companionIds)}
          onStop={runtime.stop}
        />
        {activeTask?.status === "waiting-student" ? (
          <button className="studio-review-cue" onClick={() => setStudioModal("planning")} type="button">
            <CheckCircle2 size={16} />
            <span><strong>伙伴贡献已返回</strong><small>请由你审核、修改并完成最终提交</small></span>
            <ArrowUpRight size={15} />
          </button>
        ) : null}
      </section>

      {railOpen ? <button aria-label="关闭信息栏" className="studio-rail-scrim" onClick={() => setRailOpen(false)} type="button" /> : null}
      <aside aria-hidden={!railOpen} className="companion-studio-rail" aria-label="伴学信息侧栏" inert={!railOpen}>
        <div className="studio-rail__mobile-head">
          <strong>伴学信息</strong>
          <button aria-label="关闭信息栏" onClick={() => setRailOpen(false)} type="button"><PanelRightClose size={18} /></button>
        </div>
        {railView === "agent" && selectedAgentId ? (
          <AgentRail
            agentId={selectedAgentId}
            available={availableIds.has(VISUAL_TO_COMPANION[selectedAgentId])}
            onBack={clearSelection}
            onSend={(text) => sendRequest(text, [VISUAL_TO_COMPANION[selectedAgentId]])}
            runtime={runtime}
            state={partnerStates[selectedAgentId]}
            tasks={stageTasks.filter((task) => task.companionId === VISUAL_TO_COMPANION[selectedAgentId])}
          />
        ) : railView === "activity" ? (
          <ActivityRail onBack={() => setRailView("overview")} records={records} tasks={stageTasks} />
        ) : railView === "settings" ? (
          <SettingsRail canSwitchMode={canSwitchMode} onBack={() => setRailView("overview")} onHistory={() => setStudioModal("history")} onSwitchToTask={onSwitchToTask} runtime={runtime} />
        ) : (
          <OverviewRail
            activeTask={activeTask}
            contextLabel={contextLabel}
            course={course}
            onOpenActivity={() => setRailView("activity")}
            onOpenModal={setStudioModal}
            onSelectAgent={selectAgent}
            pendingConfirmations={pendingConfirmations}
            projectProgress={projectProgress}
            recordsCount={records.length}
            runtime={runtime}
          />
        )}
      </aside>

      {studioModal ? (
        <StudioDialog onClose={() => setStudioModal(null)} title={studioModal === "history" ? "完整对话历史" : ZONE_COPY[studioModal].title} wide={studioModal === "planning"}>
          {studioModal === "library" ? (
            <LibraryPanel disabled={!availableIds.has("knowledge")} onAsk={(text) => sendRequest(text, ["knowledge"])} />
          ) : studioModal === "planning" ? (
            <PlanningPanel course={course} stageKey={stageKey} />
          ) : studioModal === "archive" ? (
            <ArchivePanel messages={runtime.messages} products={recentProducts} records={records} tasks={stageTasks} />
          ) : (
            <HistoryPanel messages={runtime.messages} streamingText={runtime.streamingText} />
          )}
        </StudioDialog>
      ) : null}
    </div>
  );
}

function OverviewRail({ course, contextLabel, projectProgress, runtime, activeTask, pendingConfirmations, recordsCount, onSelectAgent, onOpenModal, onOpenActivity }: {
  course: Course;
  contextLabel: string;
  projectProgress: number;
  runtime: NonNullable<ReturnType<typeof useCompanionRuntime>>;
  activeTask?: CompanionTask;
  pendingConfirmations: CompanionConfirmation[];
  recordsCount: number;
  onSelectAgent: (id: AgentId) => void;
  onOpenModal: (id: StudioModal) => void;
  onOpenActivity: () => void;
}) {
  return (
    <div className="studio-rail-content">
      <RailHeading eyebrow="PROJECT OVERVIEW" title={course.name} />
      <section className="studio-progress-card">
        <div><span>{contextLabel}</span><strong>{projectProgress}%</strong></div>
        <div className="studio-progress-track"><i style={{ width: `${projectProgress}%` }} /></div>
        <p>{activeTask ? `${activeTask.title} · ${STATUS_LABEL[activeTask.status]}` : "从场景中点选伙伴，或把问题交给整个小组。"}</p>
      </section>

      <section className="studio-rail-section">
        <div className="studio-section-title"><strong>小组成员</strong><span>{runtime.available.length}/6 可调度</span></div>
        <div className="studio-agent-grid">
          {agentRoles.map((role) => {
            const companionId = VISUAL_TO_COMPANION[role.id];
            const enabled = runtime.available.some((item) => item.id === companionId);
            return <button key={role.id} onClick={() => onSelectAgent(role.id)} type="button"><i style={{ background: `${role.accent}18`, color: role.accent }}>{role.name[0]}</i><span><strong>{role.name}</strong><small>{enabled ? role.title : "本阶段旁听"}</small></span><ChevronRight size={14} /></button>;
          })}
        </div>
      </section>

      <section className="studio-rail-section">
        <div className="studio-section-title"><strong>空间入口</strong><span>点击场景也可打开</span></div>
        <div className="studio-zone-links">
          <button onClick={() => onOpenModal("planning")} type="button"><LayoutDashboard size={16} /><span><strong>项目白板</strong><small>阶段目标与最近产物</small></span></button>
          <button onClick={() => onOpenModal("archive")} type="button"><Archive size={16} /><span><strong>过程档案</strong><small>{recordsCount} 条过程记录</small></span></button>
          <button onClick={() => onOpenModal("library")} type="button"><Library size={16} /><span><strong>资料角</strong><small>请知知解释或检索线索</small></span></button>
        </div>
      </section>

      <section className="studio-rail-summary">
        <button onClick={onOpenActivity} type="button"><span><Clock3 size={15} />当前动态</span><strong>{activeTask ? STATUS_LABEL[activeTask.status] : "暂无进行中任务"}</strong><ChevronRight size={14} /></button>
        <button className={pendingConfirmations.length ? "has-alert" : ""} onClick={() => onOpenModal("planning")} type="button"><span><CheckCircle2 size={15} />待你确认</span><strong>{pendingConfirmations.length} 项</strong><ChevronRight size={14} /></button>
      </section>
    </div>
  );
}

function AgentRail({ agentId, state, tasks, available, runtime, onBack, onSend }: {
  agentId: AgentId;
  state: PartnerRuntime;
  tasks: CompanionTask[];
  available: boolean;
  runtime: NonNullable<ReturnType<typeof useCompanionRuntime>>;
  onBack: () => void;
  onSend: (text: string) => Promise<boolean>;
}) {
  const role = agentRoleById[agentId];
  const [draft, setDraft] = useState("");
  return (
    <div className="studio-rail-content">
      <RailHeading eyebrow="TEAM MEMBER" onBack={onBack} title={role.name} />
      <section className="studio-agent-profile" style={{ "--agent-accent": role.accent } as CSSProperties}>
        <div className="studio-agent-profile__badge">{role.name[0]}</div>
        <div><span>{role.title}</span><p>{role.intro}</p></div>
      </section>
      <div className="studio-agent-state"><i data-state={state.state} /><span><small>当前状态</small><strong>{state.task}</strong></span></div>
      <div className="studio-responsibility-note"><strong>协作边界</strong><p>{role.name}会提供一份供你审核的贡献，不会替你作决定或完成最终提交。</p></div>
      <section className="studio-rail-section"><div className="studio-section-title"><strong>擅长处理</strong></div><div className="studio-skill-list">{role.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></section>
      <form className="studio-agent-form" onSubmit={(event) => { event.preventDefault(); const text = draft.trim(); if (!text) return; setDraft(""); void onSend(text); }}>
        <label htmlFor={`agent-task-${agentId}`}>安排一项辅助工作</label>
        <textarea disabled={!available || runtime.isActive} id={`agent-task-${agentId}`} onChange={(event) => setDraft(event.target.value)} placeholder={available ? `把任务交给${role.name}…` : "该伙伴本阶段暂不参与调度"} value={draft} />
        <button disabled={!available || !draft.trim() || runtime.isActive} type="submit"><Send size={14} />交给{role.name}</button>
      </form>
      <section className="studio-rail-section"><div className="studio-section-title"><strong>最近任务</strong><span>{tasks.length} 条</span></div>{tasks.length ? <div className="studio-task-list">{tasks.slice(0, 4).map((task) => <TaskItem key={task.id} task={task} />)}</div> : <EmptyLine>还没有分配给{role.name}的任务。</EmptyLine>}</section>
    </div>
  );
}

function ActivityRail({ tasks, records, onBack }: { tasks: CompanionTask[]; records: Course["companionProcessRecords"]; onBack: () => void }) {
  return <div className="studio-rail-content"><RailHeading eyebrow="LIVE ACTIVITY" onBack={onBack} title="项目动态" /><section className="studio-rail-section"><div className="studio-section-title"><strong>伙伴任务</strong><span>{tasks.length}</span></div>{tasks.length ? <div className="studio-task-list">{tasks.slice(0, 7).map((task) => <TaskItem key={task.id} task={task} />)}</div> : <EmptyLine>还没有伙伴任务。</EmptyLine>}</section><section className="studio-rail-section"><div className="studio-section-title"><strong>过程记录</strong><span>{records?.length ?? 0}</span></div><div className="studio-record-list">{records?.slice(0, 8).map((record) => <article key={record.id}><i /><div><strong>{record.title}</strong><p>{record.summary}</p><small>{formatTime(record.createdAt)}</small></div></article>)}</div></section></div>;
}

function SettingsRail({ runtime, onBack, onHistory, onSwitchToTask, canSwitchMode }: {
  runtime: NonNullable<ReturnType<typeof useCompanionRuntime>>;
  onBack: () => void;
  onHistory: () => void;
  onSwitchToTask: () => void;
  canSwitchMode: boolean;
}) {
  return <div className="studio-rail-content"><RailHeading eyebrow="CLASSROOM SETTINGS" onBack={onBack} title="课堂设置" /><section className="studio-responsibility-note"><strong>你是项目负责人</strong><p>伙伴可以整理、建议、评审和形成可修改草稿；你负责判断、核验、修改与最终提交。</p></section><section className="studio-mode-switch"><div className="studio-section-title"><strong>学习界面</strong><span>{canSwitchMode ? "随时切换" : "教师已指定"}</span></div><button aria-current="page" className="is-active" disabled type="button"><UsersRound size={17} /><span><strong>沉浸伴学模式</strong><small>以智能体小组与课堂场景为中心</small></span></button>{canSwitchMode ? <button onClick={onSwitchToTask} type="button"><ListTodo size={17} /><span><strong>普通课堂模式</strong><small>使用传统任务页面编辑与提交</small></span></button> : null}</section><section className="studio-settings-list"><button onClick={runtime.tts.toggle} type="button">{runtime.tts.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}<span><strong>伙伴朗读</strong><small>{runtime.tts.enabled ? "已开启" : "已关闭"}</small></span></button><button onClick={onHistory} type="button"><History size={17} /><span><strong>对话历史</strong><small>查看本阶段完整讨论</small></span></button></section></div>;
}

type ComposerCompanion = { id: AiCompanionId; name: string; shortName: string; color: string };

function StudioComposer({ availableCompanions, initialSelectedIds, isActive, disabled, onSend, onStop }: { availableCompanions: ComposerCompanion[]; initialSelectedIds: AiCompanionId[]; isActive: boolean; disabled: boolean; onSend: (text: string, companionIds: AiCompanionId[]) => Promise<boolean>; onStop: () => void }) {
  const [draft, setDraft] = useState("");
  const [selectedIds, setSelectedIds] = useState<AiCompanionId[]>(initialSelectedIds);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  // selectedIds 与外部 initialSelectedIds 同步：当 initialSelectedIds 变化
  // 时（用户在场景里选了别的 agent），重置内部选择
  useEffect(() => {
    setSelectedIds(initialSelectedIds);
  }, [initialSelectedIds]);

  function toggleId(id: AiCompanionId) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function clearAll() {
    setSelectedIds([]);
  }

  const targetLabel = selectedIds.length === 0
    ? <UsersRound size={16} />
    : selectedIds.length === 1
      ? availableCompanions.find((c) => c.id === selectedIds[0])?.shortName ?? <UsersRound size={16} />
      : `${selectedIds.length}人`;

  const targetHint = selectedIds.length === 0
    ? "交给伴学小组"
    : selectedIds.length === 1
      ? `对${availableCompanions.find((c) => c.id === selectedIds[0])?.name ?? ""}说`
      : `对${selectedIds.length}位伙伴说`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void onSend(text, selectedIds);
  }

  return (
    <div className="studio-composer-wrap" ref={pickerRef}>
      <form className="studio-composer" onSubmit={submit}>
        <button
          aria-label="选择发送对象"
          className="studio-composer__target"
          onClick={() => setPickerOpen((v) => !v)}
          type="button"
          data-active={pickerOpen ? "" : undefined}
        >
          {targetLabel}
        </button>
        <div>
          <span>{targetHint}</span>
          <input aria-label="给伴学伙伴的任务" disabled={disabled || isActive} onChange={(event) => setDraft(event.target.value)} placeholder="说出你现在最想解决的一个问题…" value={draft} />
        </div>
        {isActive ? <button aria-label="停止本轮回应" className="is-stop" onClick={onStop} type="button"><Square fill="currentColor" size={13} />停止</button> : <button aria-label="发送" disabled={disabled || !draft.trim()} type="submit"><Send size={16} /></button>}
      </form>
      {pickerOpen ? (
        <div className="studio-composer-picker" role="listbox" aria-label="选择发送对象">
          <button
            className="studio-composer-picker__item"
            data-selected={selectedIds.length === 0 ? "" : undefined}
            onClick={clearAll}
            type="button"
            role="option"
            aria-selected={selectedIds.length === 0}
          >
            <UsersRound size={15} />
            <span><strong>全体伙伴</strong><small>交给伴学小组一起讨论</small></span>
          </button>
          {availableCompanions.map((c) => (
            <button
              key={c.id}
              className="studio-composer-picker__item"
              data-selected={selectedIds.includes(c.id) ? "" : undefined}
              onClick={() => toggleId(c.id)}
              type="button"
              role="option"
              aria-selected={selectedIds.includes(c.id)}
            >
              <span className="studio-composer-picker__badge" style={{ background: c.color }}>{c.shortName}</span>
              <span><strong>{c.name}</strong><small>仅发给TA</small></span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StudioDialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  return <div className="studio-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="presentation"><section aria-labelledby="studio-dialog-title" aria-modal="true" className={`studio-dialog${wide ? " is-wide" : ""}`} role="dialog"><header><div><span>OPENPBL WORKSPACE</span><h2 id="studio-dialog-title">{title}</h2></div><button aria-label="关闭" onClick={onClose} type="button"><X size={18} /></button></header><div className="studio-dialog__body">{children}</div></section></div>;
}

function LibraryPanel({ disabled, onAsk }: { disabled: boolean; onAsk: (text: string) => Promise<boolean> }) {
  const [query, setQuery] = useState("");
  return <div className="studio-modal-panel"><div className="studio-modal-intro"><span><Library size={20} /></span><div><strong>让知知帮你找到可用的知识线索</strong><p>结果来自当前课程配置的真实大模型与学习上下文；系统不会把未发生的检索伪装成已完成。</p></div></div><form className="studio-search-form" onSubmit={(event) => { event.preventDefault(); const text = query.trim(); if (!text) return; setQuery(""); void onAsk(`请围绕这个问题解释概念、补充背景，并给出可继续查证的资料线索：${text}`); }}><Search size={18} /><input disabled={disabled} onChange={(event) => setQuery(event.target.value)} placeholder={disabled ? "知知在本阶段未启用" : "输入要咨询的概念或资料问题"} value={query} /><button disabled={disabled || !query.trim()} type="submit">交给知知</button></form><div className="studio-prompt-grid">{["解释当前阶段最关键的概念", "帮我判断一条证据是否可信", "给我三个继续查证的关键词"].map((prompt) => <button disabled={disabled} key={prompt} onClick={() => setQuery(prompt)} type="button">{prompt}<ArrowUpRight size={14} /></button>)}</div></div>;
}

function PlanningPanel({ course, stageKey }: { course: Course; stageKey: string }) {
  return <StudioProjectWorkbench course={course} stageKey={stageKey} />;
}

function ArchivePanel({ messages, tasks, records, products }: { messages: NonNullable<ReturnType<typeof useCompanionRuntime>>["messages"]; tasks: CompanionTask[]; records: Course["companionProcessRecords"]; products: Array<{ id: string; title: string; kind: string; time: string }> }) {
  return <div className="studio-modal-panel"><div className="studio-archive-stats"><span><strong>{messages.length}</strong>条对话</span><span><strong>{tasks.length}</strong>个伙伴任务</span><span><strong>{records?.length ?? 0}</strong>条过程记录</span><span><strong>{products.length}</strong>项阶段产物</span></div><div className="studio-modal-columns"><section><div className="studio-section-title"><strong>过程记录</strong></div><div className="studio-record-list">{records?.slice(0, 12).map((record) => <article key={record.id}><i /><div><strong>{record.title}</strong><p>{record.summary}</p><small>{formatTime(record.createdAt)}</small></div></article>)}</div></section><section><div className="studio-section-title"><strong>伙伴任务</strong></div><div className="studio-task-list">{tasks.slice(0, 10).map((task) => <TaskItem key={task.id} task={task} />)}</div></section></div></div>;
}

function HistoryPanel({ messages, streamingText }: { messages: NonNullable<ReturnType<typeof useCompanionRuntime>>["messages"]; streamingText: string }) {
  return <div className="studio-history-list">{messages.length ? messages.map((message, index) => { const companion = message.companionId ? getCompanion(message.companionId) : null; return <article className={message.role === "user" ? "is-student" : ""} key={`${message.ts}-${index}`}><span>{companion?.shortName ?? "我"}</span><div><div><strong>{companion?.name ?? "我"}</strong><small>{formatTime(message.ts)}</small></div><p>{message.content}</p></div></article>; }) : <EmptyLine>当前阶段还没有对话。</EmptyLine>}{streamingText ? <article><span><Mic2 size={14} /></span><div><div><strong>正在回应</strong></div><p>{streamingText}</p></div></article> : null}</div>;
}

function RailHeading({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack?: () => void }) { return <header className="studio-rail-heading"><div><span>{eyebrow}</span><h2>{title}</h2></div>{onBack ? <button aria-label="返回总览" onClick={onBack} type="button"><X size={16} /></button> : null}</header>; }
function TaskItem({ task }: { task: CompanionTask }) { return <article className="studio-task-item"><i data-status={task.status} /><div><strong>{task.title}</strong><p>{task.result ?? task.request}</p><small>{STATUS_LABEL[task.status]} · {formatTime(task.updatedAt)}</small></div></article>; }
function EmptyLine({ children }: { children: ReactNode }) { return <div className="studio-empty"><FolderOpen size={18} /><span>{children}</span></div>; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "刚刚" : new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date); }
