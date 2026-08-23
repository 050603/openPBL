"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
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
  Maximize2,
  Mic2,
  Minimize2,
  MonitorUp,
  PanelRightClose,
  Send,
  Settings,
  Sparkles,
  Square,
  UsersRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { agentRoleById, agentRoles } from "@/assets/agent/roles";
import { StudentStageHost } from "@/components/openmaic-bridge/student-stage-host";
import type { AgentId, PartnerRuntime, PartnerState } from "@/domain/studio";
import { getCompanion, type AiCompanionId } from "@/lib/ai-companions";
import { claimCompanionTaskTransition, type CompanionTaskTransitionStatus } from "@/lib/companion/task-transition";
import { applyCompanionWorkspacePatch } from "@/lib/companion/workspace-operation";
import type { AdaptiveMicroLesson, CompanionConfirmation, CompanionTask, Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { deriveStageReadiness } from "@/lib/learning-evidence/readiness";
import { STAGE_READINESS_LABEL } from "@/lib/learning-evidence/types";
import type { StudyZoneId } from "@/pixi/study-zones";
import PixiStage, { type StudyZoneCommand } from "./companion-studio-pixi-stage";
import { useCompanionRuntime, type CompanionChatMessage } from "./companion-runtime";
import { getCompanionStudioGuidance } from "./companion-studio-guidance";
import { StudioProjectWorkbench, type WorkbenchLayoutMode, type WorkbenchView } from "./studio-project-workbench";
import "./companion-studio-workspace.css";

type StudioModal = StudyZoneId | "history" | "micro-lesson" | null;
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
  "waiting-student": "等待学生继续",
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
    description: "向知知咨询概念、背景和资料线索。",
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
    description: "查看对话、伙伴任务、过程记录和阶段产物。",
    agentId: "jiji",
  },
};

export function CompanionStudioWorkspace(props: {
  course: Course;
  stageKey: string;
  contextLabel: string;
  teacherProjection?: { title: string };
  onOpenTeacherProjection?: () => void;
}) {
  const runtime = useCompanionRuntime();
  if (!runtime) return null;
  return <CompanionStudioRuntime {...props} runtime={runtime} />;
}

function CompanionStudioRuntime({
  course,
  stageKey,
  contextLabel,
  teacherProjection,
  onOpenTeacherProjection,
  runtime,
}: {
  course: Course;
  stageKey: string;
  contextLabel: string;
  teacherProjection?: { title: string };
  onOpenTeacherProjection?: () => void;
  runtime: NonNullable<ReturnType<typeof useCompanionRuntime>>;
}) {
  const session = useSession();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const claimedMicroLessonTransitionsRef = useRef(new Set<string>());
  const appliedWorkspaceRoundsRef = useRef(new Set<string>());
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null);
  const [studioModal, setStudioModal] = useState<StudioModal>(null);
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);
  const [workbenchInitialView, setWorkbenchInitialView] = useState<WorkbenchView>("editor");
  const [studyZoneCommand, setStudyZoneCommand] = useState<StudyZoneCommand | null>(null);
  const [railView, setRailView] = useState<RailView>("overview");
  const [railOpen, setRailOpen] = useState(false);
  const [openedUnreadReplyCount, setOpenedUnreadReplyCount] = useState(0);
  const [ambientMotion, setAmbientMotion] = useState(true);

  useEffect(() => {
    if (!railOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRailOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [railOpen]);

  const studentId = session.studentId ?? "";
  const stageTasks = useMemo(
    () => (course.companionTasks ?? [])
      .filter((task) => task.studentId === studentId && task.stageKey === stageKey)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 12),
    [course.companionTasks, stageKey, studentId],
  );
  const pendingConfirmations = useMemo(
    () => (course.companionConfirmations ?? [])
      .filter((item) =>
        item.studentId === studentId
        && item.stageKey === stageKey
        && item.status === "pending",
      )
      .slice(0, 8),
    [course.companionConfirmations, stageKey, studentId],
  );
  const pendingAiDecisionCount = useMemo(
    () => (course.aiContributions ?? []).filter((item) =>
      item.studentId === studentId
      && item.stageKey === stageKey
      && item.status === "pending-decision").length,
    [course.aiContributions, stageKey, studentId],
  );
  const records = useMemo(
    () => (course.companionProcessRecords ?? [])
      .filter((record) => record.studentId === studentId && record.stageKey === stageKey)
      .slice(0, 20),
    [course.companionProcessRecords, stageKey, studentId],
  );
  const activeTask = stageTasks.find((task) => ["queued", "assigned", "processing", "responding", "waiting-student", "waiting-confirmation"].includes(task.status));
  const availableIds = useMemo(() => new Set(runtime.available.map((item) => item.id)), [runtime.available]);
  const selectedCompanionId = selectedAgentId ? VISUAL_TO_COMPANION[selectedAgentId] : null;
  const readiness = useMemo(
    () => deriveStageReadiness(course, studentId, stageKey),
    [course, stageKey, studentId],
  );
  const guidance = useMemo(
    () => getCompanionStudioGuidance(stageKey, readiness),
    [readiness, stageKey],
  );

  const openStudioModal = useCallback((modal: Exclude<StudioModal, null>) => {
    if (modal === "planning" || modal === "library" || modal === "archive") {
      setWorkbenchInitialView(
        modal === "library" ? "resources" : modal === "archive" ? "archive" : "editor",
      );
      setWorkspaceExpanded(true);
      setRailOpen(false);
      setStudioModal("planning");
      return;
    }
    setStudioModal(modal);
  }, []);

  const openCurrentTask = useCallback(() => {
    setWorkbenchInitialView("editor");
    setWorkspaceExpanded(false);
    setRailOpen(false);
    setStudioModal("planning");
  }, []);

  const closeStudioModal = useCallback(() => {
    setStudioModal(null);
    setWorkspaceExpanded(false);
  }, []);
  const setAutoInterventionsPaused = runtime.setAutoInterventionsPaused;
  const fullScreenWorkbenchOpen = studioModal !== null
    && (studioModal !== "planning" || workspaceExpanded);

  useEffect(() => {
    setAutoInterventionsPaused?.(fullScreenWorkbenchOpen);
    return () => setAutoInterventionsPaused?.(false);
  }, [fullScreenWorkbenchOpen, setAutoInterventionsPaused]);

  const partnerStates = useMemo(() => {
    const latestAssistantById = new Map<AiCompanionId, string>();
    runtime.messages.forEach((message) => {
      if (message.role === "assistant" && message.companionId) latestAssistantById.set(message.companionId, message.content);
    });
    const liveTask = activeTaskId
      ? stageTasks.find((task) => task.id === activeTaskId)
      : undefined;

    return Object.fromEntries(agentRoles.map((role) => {
      const companionId = VISUAL_TO_COMPANION[role.id];
      const isAvailable = availableIds.has(companionId);
      const task = stageTasks.find((item) => item.companionId === companionId);
      const microLesson = companionId === "knowledge" ? runtime.microLessonTask : null;
      const isCurrentTTS = runtime.tts.currentTTS?.companionId === companionId;
      // Audio preparation is a transport detail, not companion work. Treating
      // a pending TTS request as `working` left one character cycling through
      // all of its desk gestures indefinitely when that request stalled.
      const isDoingAgentWork = runtime.generatingCompanionId === companionId
        || microLesson?.lesson.status === "generating";
      let state: PartnerState = "idle";
      if (runtime.error && runtime.selectedCompanionId === companionId) state = "error";
      else if (microLesson?.lesson.status === "failed") state = "error";
      else if (isCurrentTTS) state = runtime.tts.speaking ? "speaking" : "celebrating";
      else if (isDoingAgentWork) state = "working";
      else if (microLesson?.lesson.status === "ready") state = "waiting_user";
      else if (microLesson?.lesson.status === "completed") state = "completed";
      else if (task?.status === "waiting-student" || task?.status === "waiting-confirmation") state = "waiting_user";
      else if (
        liveTask?.companionId === companionId
        && ["queued", "assigned", "processing", "responding"].includes(liveTask.status)
      ) state = "working";
      // Selection already has its own outline and information layer. Keeping
      // an otherwise idle selected companion in `idle` lets it participate in
      // the same fair autonomous-activity schedule as the other companions.

      const partner: PartnerRuntime = {
        state,
        message: isCurrentTTS
          ? runtime.tts.currentTTS?.text ?? ""
          : microLesson?.lesson.status === "generating"
            ? `正在制作“${microLesson.lesson.topic}”微课`
          : microLesson?.lesson.status === "ready"
            ? "微课已完成，等你开始学习"
          : microLesson?.lesson.status === "completed"
            ? "微课学习已完成"
          : isDoingAgentWork
            ? "正在准备回应…"
          : latestAssistantById.get(companionId) ?? (isAvailable ? role.intro : "本阶段旁听，暂不参与调度"),
        task: microLesson
          ? `${
              microLesson.lesson.status === "ready"
                ? "待学习"
                : microLesson.lesson.status === "completed"
                  ? "已完成"
                  : microLesson.lesson.status === "failed"
                    ? "制作失败"
                    : "制作中"
            } · ${microLesson.lesson.topic}`
          : task?.title ?? (isAvailable ? role.stationNote : "本阶段未启用"),
        result: task?.result ?? "",
        accentNote: isAvailable ? getCompanion(companionId).description : "旁听中",
      };
      return [role.id, partner];
    })) as Record<AgentId, PartnerRuntime>;
  }, [activeTaskId, availableIds, runtime.error, runtime.generatingCompanionId, runtime.messages, runtime.microLessonTask, runtime.selectedCompanionId, runtime.tts.currentTTS, runtime.tts.speaking, stageTasks]);

  useEffect(() => {
    if (!activeTaskId) return;
    const task = stageTasks.find((item) => item.id === activeTaskId);
    if (!task) return;
    const microLessonTask =
      runtime.microLessonTask?.taskId === task.id
        ? runtime.microLessonTask
        : null;
    const claimMicroLessonTransition = (
      status: CompanionTaskTransitionStatus,
    ) => Boolean(
      microLessonTask
      && claimCompanionTaskTransition(
        claimedMicroLessonTransitionsRef.current,
        {
          taskId: task.id,
          lessonId: microLessonTask.lesson.id,
          status,
        },
      ),
    );
    if (
      microLessonTask?.lesson.status === "generating"
      && (
        task.status !== "processing"
        || task.companionId !== "knowledge"
        || task.title !== `知知正在制作：${microLessonTask.lesson.topic}`
      )
      && claimMicroLessonTransition("generating")
    ) {
      session.upsertCompanionTask({
        ...task,
        companionId: "knowledge",
        kind: "knowledge",
        title: `知知正在制作：${microLessonTask.lesson.topic}`,
        status: "processing",
      });
    } else if (
      microLessonTask?.lesson.status === "ready"
      && task.status !== "waiting-student"
      && claimMicroLessonTransition("ready")
    ) {
      session.upsertCompanionTask({
        ...task,
        companionId: "knowledge",
        kind: "knowledge",
        title: `微课已就绪：${microLessonTask.lesson.topic}`,
        status: "waiting-student",
        result: "微课已经生成，等待学生进入学习。",
      });
    } else if (
      microLessonTask?.lesson.status === "completed"
      && task.status !== "result"
      && claimMicroLessonTransition("completed")
    ) {
      session.upsertCompanionTask({
        ...task,
        companionId: "knowledge",
        kind: "knowledge",
        title: `微课已完成：${microLessonTask.lesson.topic}`,
        status: "result",
        result: "学生已完成本次即时微课学习。",
      });
      setActiveTaskId(null);
    } else if (
      microLessonTask?.lesson.status === "failed"
      && task.status !== "failed"
      && claimMicroLessonTransition("failed")
    ) {
      session.upsertCompanionTask({
        ...task,
        companionId: "knowledge",
        kind: "knowledge",
        title: `微课制作失败：${microLessonTask.lesson.topic}`,
        status: "failed",
        error: microLessonTask.message,
      });
      setActiveTaskId(null);
    } else if (runtime.phase === "director" && ["queued", "assigned"].includes(task.status)) {
      session.upsertCompanionTask({ ...task, status: "processing" });
    } else if (runtime.phase === "speaking" && task.status !== "responding") {
      session.upsertCompanionTask({ ...task, status: "responding" });
    } else if (
      runtime.phase === "idle"
      && runtime.lastCompletedRound?.taskId === task.id
      && !["waiting-student", "waiting-confirmation", "saved", "result"].includes(task.status)
    ) {
      const patches = runtime.lastCompletedRound.workspacePatches;
      if (patches.length) {
        if (appliedWorkspaceRoundsRef.current.has(task.id)) return;
        appliedWorkspaceRoundsRef.current.add(task.id);
        let workingCourse = course;
        let appliedCount = 0;
        const notices: string[] = [];
        patches.forEach((patch) => {
          const companion = getCompanion(patch.companionId);
          const result = applyCompanionWorkspacePatch({
            course: workingCourse,
            studentId,
            stageKey,
            patch,
            companionId: patch.companionId,
            taskId: task.id,
            taskCreatedAt: task.createdAt,
          });
          if (result.status !== "applied") {
            notices.push(result.reason);
            session.addCompanionProcessRecord({
              courseId: course.id,
              studentId,
              stageKey,
              title: `${companion.name}的编辑未自动应用`,
              summary: result.reason,
              source: "system",
              companionId: patch.companionId,
              taskId: task.id,
            });
            return;
          }

          session.upsertLearningEvidence(result.evidence);
          const existingEvidence = workingCourse.learningEvidence ?? [];
          workingCourse = {
            ...workingCourse,
            learningEvidence: [
              ...existingEvidence.filter((item) => item.id !== result.evidence.id),
              result.evidence,
            ],
          };
          session.upsertCompanionConfirmation({
            id: result.operation.operationId,
            courseId: course.id,
            studentId,
            stageKey,
            action: "edit-workspace",
            title: `${companion.name}编辑了“${result.operation.label}”`,
            summary: `${patch.title}。${patch.reviewInstruction}`,
            taskId: task.id,
            payload: result.operation as unknown as Record<string, unknown>,
            status: "confirmed",
            resolvedAt: result.operation.afterUpdatedAt,
          });
          session.addCompanionProcessRecord({
            courseId: course.id,
            studentId,
            stageKey,
            title: `${companion.name}已编辑“${result.operation.label}”`,
            summary: `${patch.title}；可在过程档案中撤销。${patch.reviewInstruction}`,
            source: "agent",
            companionId: patch.companionId,
            taskId: task.id,
            evidenceIds: [result.evidence.id],
          });
          appliedCount += 1;
        });
        session.upsertCompanionTask({
          ...task,
          status: "waiting-student",
          result: [
            runtime.lastCompletedRound.text,
            appliedCount ? `已直接写入 ${appliedCount} 处共享草稿，可随时撤销。` : undefined,
            ...notices,
          ].filter(Boolean).join("\n"),
        });
      } else {
        session.upsertCompanionTask({ ...task, status: "waiting-student", result: runtime.lastCompletedRound.text });
      }
      setActiveTaskId(null);
    }
  }, [activeTaskId, course, runtime.lastCompletedRound, runtime.microLessonTask, runtime.phase, session, stageKey, stageTasks, studentId]);

  const sendRequest = useCallback(async (request: string, companionIds?: AiCompanionId[]) => {
    const clean = request.trim();
    if (!clean || runtime.isActive || !studentId) return false;

    // 一次请求只交给整个小组或一位明确的伙伴，避免并发轮次只执行
    // 第一个伙伴却让学生误以为多位伙伴都已收到任务。
    const ids = (companionIds?.filter((id) => availableIds.has(id)) ?? []).slice(0, 1);
    if (companionIds && companionIds.length > 0 && ids.length === 0) return false;

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
    setActiveTaskId(task.id);
    const ok = await runtime.send(clean, { preferredCompanionId: companionId, taskId: task.id });
    if (!ok) {
      session.upsertCompanionTask({ ...task, status: "failed", error: "本轮请求没有完成" });
      setActiveTaskId(null);
    }
    return ok;
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
    openStudioModal(zoneId);
    runtime.setSelectedCompanionId(null);
    setStudyZoneCommand({ agentId: zone.agentId, zoneId, token: Date.now() });
  }, [openStudioModal, runtime]);

  const clearSelection = useCallback(() => {
    setSelectedAgentId(null);
    setRailView("overview");
    runtime.setSelectedCompanionId(null);
  }, [runtime]);

  const openActivityRail = useCallback(() => {
    setOpenedUnreadReplyCount(runtime.unreadCount);
    setRailView("activity");
    setRailOpen(true);
    runtime.markRead();
  }, [runtime]);

  const stageStatus = runtime.microLessonTask?.lesson.status === "generating"
    ? `知知正在制作微课 · ${Math.round(runtime.microLessonTask.progress)}%`
    : runtime.microLessonTask?.lesson.status === "ready"
      ? "新微课已准备好"
      : runtime.microLessonTask?.lesson.status === "completed"
        ? "即时微课已完成"
        : runtime.microLessonTask?.lesson.status === "failed"
          ? "微课制作未完成"
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

  return (
    <div
      className="companion-studio-shell"
      data-rail={railOpen ? "open" : "closed"}
      data-stage={guidance.tone}
    >
      <section className="companion-studio-scene" aria-label="AI 伴学工作室">
        <PixiStage
          ambientMotion={ambientMotion}
          agentStates={partnerStates}
          onClearSelection={clearSelection}
          onSelectAgent={selectAgent}
          onSelectStudyZone={selectZone}
          selectedAgentId={selectedAgentId}
          studyZoneCommand={studyZoneCommand}
          paused={fullScreenWorkbenchOpen}
        />

        <div className="studio-command-card">
        <aside aria-label="当前阶段指引" className="studio-stage-peek">
          <div className="studio-stage-peek__status"><i /><span>{stageStatus}</span></div>
          <div className="studio-stage-peek__heading">
            <span>{guidance.eyebrow}</span>
            <b>{STAGE_READINESS_LABEL[readiness.status]}</b>
          </div>
          <strong title={contextLabel}>{contextLabel}</strong>
          <p>{guidance.objective}</p>
          <div aria-live="polite" className="studio-stage-peek__next">
            <span>下一步</span>
            <small>{guidance.nextStep}</small>
          </div>
          <button onClick={openCurrentTask} type="button">
            <ListTodo size={14} />
            <span>{guidance.actionLabel}</span>
            <ArrowUpRight size={13} />
          </button>
          <span className="studio-stage-peek__counter">
            阶段 {course.currentStageIndex + 1}/{course.stages.length}
          </span>
        </aside>

        <nav
          aria-label="伴学场景工具"
          className="studio-scene-tools"
          data-projection={teacherProjection ? "" : undefined}
        >
          <button
            aria-label="前往当前阶段任务"
            className="studio-scene-tool studio-scene-tool--primary"
            onClick={openCurrentTask}
            type="button"
          >
            <span aria-hidden="true" className="studio-scene-tool__icon"><ListTodo size={17} /></span>
            <span className="studio-scene-tool__label"><strong>当前任务</strong><small>打开任务与证据抽屉</small></span>
            {pendingConfirmations.length + pendingAiDecisionCount ? (
              <b aria-label={`${pendingConfirmations.length + pendingAiDecisionCount} 项待处理`}>
                {pendingConfirmations.length + pendingAiDecisionCount}
              </b>
            ) : null}
          </button>
          {teacherProjection && onOpenTeacherProjection ? (
            <button
              aria-label={`打开教师演示：${teacherProjection.title}`}
              className="studio-scene-tool studio-projection-trigger"
              onClick={onOpenTeacherProjection}
              title={teacherProjection.title}
              type="button"
            >
              <span aria-hidden="true" className="studio-scene-tool__icon"><MonitorUp size={16} /></span>
              <span className="studio-scene-tool__label"><strong>演示</strong></span>
            </button>
          ) : null}
          <button
            aria-expanded={railOpen && railView === "activity"}
            aria-label={runtime.unreadCount ? `查看动态，${runtime.unreadCount} 条未读伙伴回复` : "查看动态"}
            className="studio-scene-tool studio-overview-trigger"
            data-active={railOpen && railView === "activity" ? "" : undefined}
            onClick={openActivityRail}
            title={runtime.unreadCount ? `${runtime.unreadCount} 条未读伙伴回复` : "查看伙伴回复、任务和过程记录"}
            type="button"
          >
            <span aria-hidden="true" className="studio-scene-tool__icon"><Clock3 size={16} /></span>
            <span className="studio-scene-tool__label"><strong>动态</strong></span>
            {runtime.unreadCount ? <b aria-label={`${runtime.unreadCount} 条未读伙伴回复`}>{runtime.unreadCount}</b> : null}
          </button>
          <button
            aria-expanded={railOpen && railView === "settings"}
            aria-label="打开课堂设置"
            className="studio-scene-tool studio-settings-trigger"
            data-active={railOpen && railView === "settings" ? "" : undefined}
            onClick={() => { setRailView("settings"); setRailOpen(true); }}
            type="button"
          >
            <span aria-hidden="true" className="studio-scene-tool__icon"><Settings size={16} /></span>
            <span className="studio-scene-tool__label"><strong>设置</strong></span>
          </button>
        </nav>
        </div>

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
                    : runtime.microLessonTask.lesson.status === "completed"
                      ? "知知 · 学习完成"
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
                <button className="studio-micro-task__open" onClick={() => openStudioModal("micro-lesson")} type="button">
                  开始微课 <ArrowUpRight size={12} />
                </button>
              ) : runtime.microLessonTask.lesson.status === "completed" ? (
                <button className="studio-micro-task__open" onClick={() => openStudioModal("micro-lesson")} type="button">
                  再次查看 <ArrowUpRight size={12} />
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
          error={runtime.error}
          initialSelectedIds={selectedCompanionId ? [selectedCompanionId] : []}
          isActive={runtime.isActive}
          key={`${stageKey}-${selectedCompanionId ?? "team"}`}
          onSend={(text, companionIds) => sendRequest(text, companionIds)}
          onStop={runtime.stop}
          suggestions={guidance.quickPrompts}
        />
        {activeTask?.status === "waiting-student" ? (
          <button className="studio-review-cue" onClick={() => openStudioModal("planning")} type="button">
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
          <ActivityRail
            messages={runtime.messages}
            onBack={() => setRailView("overview")}
            records={records}
            tasks={stageTasks}
            unreadReplyCount={openedUnreadReplyCount}
          />
        ) : railView === "settings" ? (
          <SettingsRail
            ambientMotion={ambientMotion}
            onBack={() => setRailView("overview")}
            onHistory={() => openStudioModal("history")}
            onToggleAmbientMotion={() => setAmbientMotion((value) => !value)}
            runtime={runtime}
          />
        ) : (
          <OverviewRail
            activeTask={activeTask}
            contextLabel={contextLabel}
            course={course}
            onOpenActivity={openActivityRail}
            onOpenModal={openStudioModal}
            onSelectAgent={selectAgent}
            pendingConfirmations={pendingConfirmations}
            readiness={readiness}
            recordsCount={records.length}
            runtime={runtime}
          />
        )}
      </aside>

      {studioModal === "planning" ? (
        <StudioWorkspacePanel
          expanded={workspaceExpanded}
          onClose={closeStudioModal}
          onToggleSize={() => setWorkspaceExpanded((value) => !value)}
        >
          <PlanningPanel
            course={course}
            initialView={workbenchInitialView}
            layoutMode={workspaceExpanded ? "fullscreen" : "sidebar"}
            onAsk={sendRequest}
            onStop={runtime.stop}
            runtime={runtime}
            stageKey={stageKey}
          />
        </StudioWorkspacePanel>
      ) : studioModal ? (
        <StudioDialog
          onClose={closeStudioModal}
          title={
            studioModal === "history"
              ? "完整对话历史"
              : studioModal === "micro-lesson"
                ? runtime.microLessonTask?.lesson.topic ?? "即时微课"
                : ZONE_COPY[studioModal].title
          }
          variant={studioModal === "micro-lesson" ? "wide" : "default"}
        >
          {studioModal === "micro-lesson" && runtime.microLessonTask?.lesson.classroomId ? (
            <MicroLessonPanel
              classroomId={runtime.microLessonTask.lesson.classroomId}
              courseId={course.id}
              lesson={runtime.microLessonTask.lesson}
              onComplete={runtime.completeMicroLesson}
              studentId={studentId}
              studentName={session.studentName ?? session.user.name}
            />
          ) : (
            <HistoryPanel messages={runtime.messages} streamingText={runtime.streamingText} />
          )}
        </StudioDialog>
      ) : null}
    </div>
  );
}

function OverviewRail({ course, contextLabel, readiness, runtime, activeTask, pendingConfirmations, recordsCount, onSelectAgent, onOpenModal, onOpenActivity }: {
  course: Course;
  contextLabel: string;
  readiness: ReturnType<typeof deriveStageReadiness>;
  runtime: NonNullable<ReturnType<typeof useCompanionRuntime>>;
  activeTask?: CompanionTask;
  pendingConfirmations: CompanionConfirmation[];
  recordsCount: number;
  onSelectAgent: (id: AgentId) => void;
  onOpenModal: (id: Exclude<StudioModal, null>) => void;
  onOpenActivity: () => void;
}) {
  return (
    <div className="studio-rail-content">
      <RailHeading eyebrow="PROJECT OVERVIEW" title={course.name} />
      <section className="studio-progress-card">
        <div><span>{contextLabel}</span><strong>{STAGE_READINESS_LABEL[readiness.status]}</strong></div>
        <p>{readiness.reason}</p>
        <p>{activeTask ? `${activeTask.title} · ${STATUS_LABEL[activeTask.status]}` : "从场景中点选伙伴，或在本页任务工作台继续形成证据。"}</p>
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

function ActivityRail({ tasks, records, messages, unreadReplyCount, onBack }: {
  tasks: CompanionTask[];
  records: Course["companionProcessRecords"];
  messages: CompanionChatMessage[];
  unreadReplyCount: number;
  onBack: () => void;
}) {
  const replies = messages
    .filter((message) => message.role === "assistant")
    .slice(-Math.max(6, Math.min(unreadReplyCount, 20)))
    .reverse();
  return (
    <div className="studio-rail-content">
      <RailHeading eyebrow="LIVE ACTIVITY" onBack={onBack} title="项目动态" />
      {unreadReplyCount ? (
        <p className="studio-activity-unread" role="status">
          已显示并标记 {unreadReplyCount} 条新伙伴回复
        </p>
      ) : null}
      <section className="studio-rail-section">
        <div className="studio-section-title"><strong>伙伴回复</strong><span>{replies.length} 条</span></div>
        {replies.length ? (
          <div className="studio-reply-list">
            {replies.map((message, index) => {
              const companion = message.companionId ? getCompanion(message.companionId) : null;
              const isUnread = index < unreadReplyCount;
              return (
                <article className={isUnread ? "is-unread" : undefined} key={`${message.ts}-${index}`}>
                  <span style={{ background: companion?.color ?? "#667a76" }}>{companion?.shortName ?? "AI"}</span>
                  <div>
                    <header><strong>{companion?.name ?? "伴学伙伴"}</strong>{isUnread ? <b>新回复</b> : null}<time>{formatTime(message.ts)}</time></header>
                    <p>{message.content}</p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <EmptyLine>当前阶段还没有伙伴回复。</EmptyLine>}
      </section>
      <section className="studio-rail-section">
        <div className="studio-section-title"><strong>伙伴任务</strong><span>{tasks.length}</span></div>
        {tasks.length ? <div className="studio-task-list">{tasks.slice(0, 7).map((task) => <TaskItem key={task.id} task={task} />)}</div> : <EmptyLine>还没有伙伴任务。</EmptyLine>}
      </section>
      <section className="studio-rail-section">
        <div className="studio-section-title"><strong>过程记录</strong><span>{records?.length ?? 0}</span></div>
        <div className="studio-record-list">{records?.slice(0, 8).map((record) => <article key={record.id}><i /><div><strong>{record.title}</strong><p>{record.summary}</p><small>{formatTime(record.createdAt)}</small></div></article>)}</div>
      </section>
    </div>
  );
}

function SettingsRail({ runtime, onBack, onHistory, ambientMotion, onToggleAmbientMotion }: {
  runtime: NonNullable<ReturnType<typeof useCompanionRuntime>>;
  onBack: () => void;
  onHistory: () => void;
  ambientMotion: boolean;
  onToggleAmbientMotion: () => void;
}) {
  return <div className="studio-rail-content"><RailHeading eyebrow="CLASSROOM SETTINGS" onBack={onBack} title="课堂设置" /><section className="studio-responsibility-note"><strong>你是项目负责人</strong><p>伙伴可以整理、建议、评审和形成可修改草稿；你负责判断、核验、修改与最终提交。</p></section><section className="studio-mode-switch"><div className="studio-section-title"><strong>学习界面</strong><span>当前阶段</span></div><button aria-current="page" className="is-active" disabled type="button"><UsersRound size={17} /><span><strong>沉浸伴学课堂</strong><small>当前任务与项目材料都从角色场景内展开</small></span></button></section><section className="studio-settings-list"><div className="studio-section-title"><strong>课堂体验</strong><span>即时生效</span></div><button aria-pressed={ambientMotion} onClick={onToggleAmbientMotion} type="button"><Sparkles size={17} /><span><strong>伙伴自主活动</strong><small>{ambientMotion ? "丰富动作与场景漫游已开启" : "已暂停漫游，保留必要状态动作"}</small></span><i aria-hidden="true" data-on={ambientMotion ? "" : undefined} /></button><button aria-pressed={runtime.tts.enabled} onClick={runtime.tts.toggle} type="button">{runtime.tts.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}<span><strong>伙伴朗读</strong><small>{runtime.tts.enabled ? "已开启，发言将同步朗读" : "已关闭，仅显示文字"}</small></span><i aria-hidden="true" data-on={runtime.tts.enabled ? "" : undefined} /></button><button onClick={onHistory} type="button"><History size={17} /><span><strong>对话历史</strong><small>查看本阶段完整讨论</small></span><ChevronRight size={14} /></button></section></div>;
}

type ComposerCompanion = { id: AiCompanionId; name: string; shortName: string; color: string };

function StudioComposer({ availableCompanions, initialSelectedIds, isActive, disabled, error, suggestions, onSend, onStop }: { availableCompanions: ComposerCompanion[]; initialSelectedIds: AiCompanionId[]; isActive: boolean; disabled: boolean; error: string | null; suggestions: readonly string[]; onSend: (text: string, companionIds: AiCompanionId[]) => Promise<boolean>; onStop: () => void }) {
  const [draft, setDraft] = useState("");
  const [selectedIds, setSelectedIds] = useState<AiCompanionId[]>(initialSelectedIds);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  function toggleId(id: AiCompanionId) {
    setSelectedIds((prev) => prev.includes(id) ? [] : [id]);
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const sent = await onSend(text, selectedIds);
    if (sent) setDraft("");
  }

  function fillSuggestion(suggestion: string) {
    setDraft(suggestion);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="studio-composer-wrap" ref={pickerRef}>
      {error ? <p className="studio-composer-error" role="alert">{error}</p> : null}
      <div aria-label="快捷提问" className="studio-composer-suggestions" role="group">
        <span>试着问</span>
        {suggestions.map((suggestion) => (
          <button
            aria-label={`填入快捷提问：${suggestion}`}
            disabled={disabled || isActive}
            key={suggestion}
            onClick={() => fillSuggestion(suggestion)}
            type="button"
          >
            {suggestion}
          </button>
        ))}
      </div>
      <form className="studio-composer" onSubmit={submit}>
        <button
          aria-expanded={pickerOpen}
          aria-haspopup="listbox"
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
          <input aria-label="给伴学伙伴的任务" disabled={disabled || isActive} onChange={(event) => setDraft(event.target.value)} placeholder="说出你现在最想解决的一个问题…" ref={inputRef} value={draft} />
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

function StudioWorkspacePanel({
  expanded,
  onClose,
  onToggleSize,
  children,
}: {
  expanded: boolean;
  onClose: () => void;
  onToggleSize: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="studio-workspace-layer"
      data-mode={expanded ? "fullscreen" : "docked"}
    >
      {expanded ? (
        <button
          aria-label="关闭项目白板"
          className="studio-workspace-layer__backdrop"
          onClick={onClose}
          type="button"
        />
      ) : null}
      <section
        aria-label="项目白板"
        aria-modal={expanded ? "true" : undefined}
        className="studio-workspace-panel"
        role={expanded ? "dialog" : "complementary"}
      >
        <header className="studio-workspace-panel__header">
          <div>
            <h2>项目白板</h2>
          </div>
          <div className="studio-workspace-panel__actions">
            <button
              aria-label={expanded ? "缩小到侧边栏" : "全屏显示项目白板"}
              onClick={onToggleSize}
              title={expanded ? "缩小到侧边栏" : "全屏显示"}
              type="button"
            >
              {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button aria-label="关闭项目白板" onClick={onClose} type="button">
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="studio-workspace-panel__body">{children}</div>
      </section>
    </div>
  );
}

function StudioDialog({
  title,
  onClose,
  children,
  variant = "default",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  variant?: "default" | "wide" | "workspace";
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const dialogClass = variant === "default"
    ? "studio-dialog"
    : `studio-dialog is-${variant}`;
  return (
    <div
      className={`studio-dialog-backdrop${variant === "workspace" ? " is-workspace" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="studio-dialog-title"
        aria-modal="true"
        className={dialogClass}
        role="dialog"
      >
        <header>
          <div><span>OPENPBL WORKSPACE</span><h2 id="studio-dialog-title">{title}</h2></div>
          <button aria-label="关闭" autoFocus onClick={onClose} type="button"><X size={18} /></button>
        </header>
        <div className="studio-dialog__body">{children}</div>
      </section>
    </div>
  );
}

function MicroLessonPanel({
  classroomId,
  courseId,
  studentId,
  studentName,
  lesson,
  onComplete,
}: {
  classroomId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  lesson: AdaptiveMicroLesson;
  onComplete: (lessonId: string) => void;
}) {
  const completionStartedRef = useRef(lesson.status === "completed");
  const [completionState, setCompletionState] = useState<"learning" | "saving" | "completed" | "error">(
    lesson.status === "completed" ? "completed" : "learning",
  );

  const handleSceneComplete = useCallback(async ({
    completedSceneCount,
    totalSceneCount,
  }: {
    completedSceneCount: number;
    totalSceneCount: number;
  }) => {
    if (completedSceneCount < totalSceneCount || completionStartedRef.current) return;
    completionStartedRef.current = true;
    setCompletionState("saving");
    try {
      const response = await fetch("/api/adaptive-learning/state", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenPBL-Role": "student" },
        body: JSON.stringify({
          action: "complete-micro-lesson",
          courseId,
          studentId,
          lessonId: lesson.id,
        }),
      });
      if (!response.ok) throw new Error(`MICRO_LESSON_COMPLETE_${response.status}`);
      onComplete(lesson.id);
      setCompletionState("completed");
    } catch {
      completionStartedRef.current = false;
      setCompletionState("error");
    }
  }, [courseId, lesson.id, onComplete, studentId]);

  return (
    <div className="studio-micro-lesson-player">
      <div aria-live="polite" className="studio-micro-lesson-player__status" data-state={completionState}>
        <BookOpenCheck size={15} />
        <span>
          {completionState === "completed"
            ? "本次微课已完成，任务状态已经同步"
            : completionState === "saving"
              ? "正在保存学习完成状态…"
              : completionState === "error"
                ? "完成状态暂未保存，请停留在最后一页重试"
                : `知知为你制作的即时微课 · ${lesson.topic}`}
        </span>
      </div>
      <StudentStageHost
        backHref={`/student/classroom/${courseId}`}
        classroomId={classroomId}
        className="!h-full !min-h-0 !max-h-none !rounded-none !border-0"
        courseId={courseId}
        onSceneComplete={handleSceneComplete}
        standalone
        studentId={studentId}
        studentName={studentName}
        variant="embedded"
      />
    </div>
  );
}

function PlanningPanel({
  course,
  stageKey,
  runtime,
  onAsk,
  onStop,
  initialView,
  layoutMode,
}: {
  course: Course;
  stageKey: string;
  runtime: NonNullable<ReturnType<typeof useCompanionRuntime>>;
  onAsk: (text: string, companionIds?: AiCompanionId[]) => Promise<boolean>;
  onStop: () => void;
  initialView: WorkbenchView;
  layoutMode: WorkbenchLayoutMode;
}) {
  return (
    <StudioProjectWorkbench
      course={course}
      initialView={initialView}
      layoutMode={layoutMode}
      onAskCompanion={onAsk}
      onStopCompanion={onStop}
      runtime={runtime}
      stageKey={stageKey}
    />
  );
}

function HistoryPanel({ messages, streamingText }: { messages: NonNullable<ReturnType<typeof useCompanionRuntime>>["messages"]; streamingText: string }) {
  return <div className="studio-history-list">{messages.length ? messages.map((message, index) => { const companion = message.companionId ? getCompanion(message.companionId) : null; return <article className={message.role === "user" ? "is-student" : ""} key={`${message.ts}-${index}`}><span>{companion?.shortName ?? "我"}</span><div><div><strong>{companion?.name ?? "我"}</strong><small>{formatTime(message.ts)}</small></div><p>{message.content}</p></div></article>; }) : <EmptyLine>当前阶段还没有对话。</EmptyLine>}{streamingText ? <article><span><Mic2 size={14} /></span><div><div><strong>正在回应</strong></div><p>{streamingText}</p></div></article> : null}</div>;
}

function RailHeading({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack?: () => void }) { return <header className="studio-rail-heading"><div><span>{eyebrow}</span><h2>{title}</h2></div>{onBack ? <button aria-label="返回总览" onClick={onBack} type="button"><X size={16} /></button> : null}</header>; }
function TaskItem({ task }: { task: CompanionTask }) { return <article className="studio-task-item"><i data-status={task.status} /><div><strong>{task.title}</strong><p>{task.result ?? task.request}</p><small>{STATUS_LABEL[task.status]} · {formatTime(task.updatedAt)}</small></div></article>; }
function EmptyLine({ children }: { children: ReactNode }) { return <div className="studio-empty"><FolderOpen size={18} /><span>{children}</span></div>; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "刚刚" : new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date); }
