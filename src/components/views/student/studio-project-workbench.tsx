"use client";

import { useState } from "react";
import {
  Archive,
  Bot,
  CheckCircle2,
  Circle,
  Clipboard,
  FilePenLine,
  HandHelping,
  Inbox,
  Library,
  MessageCircleQuestion,
  PanelRightClose,
  PenLine,
  Send,
  ShieldCheck,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { getCompanion, type AiCompanionId } from "@/lib/ai-companions";
import {
  emitMakeWorkResultAdoptEvent,
  emitProposalWorkResultAdoptEvent,
  type ProposalWorkResultTarget,
} from "@/lib/companion/events";
import {
  getWorkspaceTargetDefinition,
  parseWorkspaceOperation,
  revertCompanionWorkspaceOperation,
  workspaceTargetsForStage,
  type CompanionWorkspaceTarget,
  type CompanionWorkspaceOperation,
} from "@/lib/companion/workspace-operation";
import {
  getStageMissionDefinition,
  resolveCourseLearningPreset,
} from "@/lib/learning-evidence/missions";
import { deriveStageReadiness } from "@/lib/learning-evidence/readiness";
import { STAGE_READINESS_LABEL } from "@/lib/learning-evidence/types";
import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { cn } from "@/lib/utils";
import type { CompanionRuntimeContextValue } from "./companion-runtime";
import { AiDecisionInbox } from "./evidence-task/ai-decision-inbox";
import { EvidenceStageWorkspace } from "./evidence-task/stage-workspace";
import { StudioProcessArchive } from "./studio-process-archive";
import { StudioResourceLibrary } from "./studio-resource-library";

const STAGE_NUMBER_LABEL = ["一", "二", "三", "四", "五", "六"];
export type WorkbenchView = "editor" | "resources" | "archive" | "suggestions";
export type WorkbenchLayoutMode = "fullscreen" | "sidebar";
type AiCollaborationMode = "discuss" | "edit";
type WorkspaceEditMode = "append" | "replace";

export function StudioProjectWorkbench({
  course,
  stageKey,
  runtime,
  onAskCompanion,
  onStopCompanion,
  initialView = "editor",
  layoutMode = "fullscreen",
}: {
  course: Course;
  stageKey: string;
  runtime?: CompanionRuntimeContextValue;
  onAskCompanion?: (text: string, companionIds?: AiCompanionId[]) => Promise<boolean>;
  onStopCompanion?: () => void;
  initialView?: WorkbenchView;
  layoutMode?: WorkbenchLayoutMode;
}) {
  const session = useSession();
  const studentId = session.studentId ?? "";
  const readiness = deriveStageReadiness(course, studentId, stageKey);
  const preset = resolveCourseLearningPreset(course);
  const mission = getStageMissionDefinition(stageKey, preset, readiness.missingEvidenceKinds);
  const pendingAiDecisions = (course.aiContributions ?? []).filter(
    (item) =>
      item.studentId === studentId
      && item.stageKey === stageKey
      && item.status === "pending-decision"
      && (item.impact === "high" || Boolean(item.proposedChange)),
  );
  const appliedEditCount = (course.companionConfirmations ?? []).filter((item) =>
    item.studentId === studentId
    && item.stageKey === stageKey
    && item.status === "confirmed"
    && Boolean(parseWorkspaceOperation(item.payload))).length;
  const latestAppliedEdit = (course.companionConfirmations ?? [])
    .filter((item) =>
      item.studentId === studentId
      && item.stageKey === stageKey
      && item.status === "confirmed"
      && Boolean(parseWorkspaceOperation(item.payload)))
    .sort((a, b) => Date.parse(b.resolvedAt ?? b.createdAt) - Date.parse(a.resolvedAt ?? a.createdAt))[0];
  const stageIndex = course.stages.findIndex((stage) => stage.key === stageKey);
  const stageTitle = course.stages[stageIndex]?.label ?? "当前阶段";
  const pageTitle = stageIndex >= 0
    ? `阶段${STAGE_NUMBER_LABEL[stageIndex] ?? stageIndex + 1} · ${stageTitle}`
    : stageTitle;
  const helpRequested = (course.learningSignals ?? []).some((item) =>
    item.studentId === studentId
    && item.stageKey === stageKey
    && item.kind === "student-help-request"
    && item.status === "open");
  const [view, setView] = useState<WorkbenchView>(initialView);
  const visibleView = stageKey === "make" && view === "suggestions"
    ? "editor"
    : view;
  const [assistantOpenByMode, setAssistantOpenByMode] = useState<Record<WorkbenchLayoutMode, boolean>>({
    fullscreen: true,
    sidebar: false,
  });
  const assistantOpen = assistantOpenByMode[layoutMode];
  const setAssistantOpen = (next: boolean | ((current: boolean) => boolean)) => {
    setAssistantOpenByMode((current) => ({
      ...current,
      [layoutMode]: typeof next === "function" ? next(current[layoutMode]) : next,
    }));
  };
  const [assistantDraft, setAssistantDraft] = useState("");
  const [collaborationMode, setCollaborationMode] = useState<AiCollaborationMode>("discuss");
  const [workspaceEditMode, setWorkspaceEditMode] = useState<WorkspaceEditMode>("append");
  const editableWorkspaceTargets = workspaceTargetsForStage(stageKey).filter((target) =>
    mission.currentAction.evidenceKinds.includes(
      getWorkspaceTargetDefinition(target).evidenceKind,
    ));
  const [workspaceTarget, setWorkspaceTarget] = useState<CompanionWorkspaceTarget | null>(
    editableWorkspaceTargets[0] ?? null,
  );
  const resolvedWorkspaceTarget = workspaceTarget
    && editableWorkspaceTargets.includes(workspaceTarget)
    ? workspaceTarget
    : editableWorkspaceTargets[0] ?? null;
  const eligibleCompanions = (runtime?.available ?? []).filter((companion) =>
    mission.allowedCompanionIds.includes(companion.id));
  const [assistantTargetId, setAssistantTargetId] = useState<AiCompanionId | null>(
    mission.leadCompanionId ?? eligibleCompanions[0]?.id ?? null,
  );
  const resolvedAssistantTargetId = eligibleCompanions.some(
    (companion) => companion.id === assistantTargetId,
  )
    ? assistantTargetId
    : eligibleCompanions[0]?.id ?? null;

  async function askCompanion() {
    const question = assistantDraft.trim();
    if (!question || !resolvedAssistantTargetId || !onAskCompanion) return;
    const workspaceInstruction = stageKey === "make"
      ? [
          `工作任务：${question}`,
          "请依据学生的作品工作稿和课程要求，输出一份可以直接阅读、复制或继续修改的纯文本工作结果。",
          "只输出纯文本工作结果，不生成工作台补丁；不得声称查看过学生本地制作或仅有元数据的最终作品。",
          "缺少真实事实时，在末尾用“需要你确认”列出，不要猜测，不要替学生提交。",
        ].join("\n")
      : stageKey === "proposal"
        ? [
            `工作任务：${question}`,
            "请依据学生当前填写的项目方案和课程要求，输出一份可以直接阅读、复制或加入方案的纯文本工作结果。",
            "只输出纯文本工作结果，不生成工作台补丁；不要增加学生没有提供的事实、数据或项目经历。",
            "缺少关键信息时，在末尾用“需要你确认”列出，不要猜测，不要替学生提交方案。",
          ].join("\n")
      : collaborationMode === "edit" && resolvedWorkspaceTarget
      ? [
          `协作编辑任务：请${workspaceEditMode === "append" ? "补充" : "改写"}工作台字段 ${resolvedWorkspaceTarget}（${getWorkspaceTargetDefinition(resolvedWorkspaceTarget).label}）。`,
          `只能依据我提供的内容和工作台现有草稿进行编辑：${question}`,
          "只修改这个字段；信息不足时先指出缺少的事实，不要猜测，不要提交。",
        ].join("\n")
      : `讨论任务：${question}\n只提供一个当前最有用的反馈或下一步，不要直接改动工作台。`;
    const ok = await onAskCompanion(
      [
        `我正在完成“${mission.currentAction.label}”。`,
        workspaceInstruction,
        stageKey === "make" || stageKey === "proposal"
          ? "操作约束：结果只有在我主动采纳后才能加入工作台，不要替我提交。"
          : "操作约束：讨论与编辑模式必须严格区分；任何模式都不要替我提交。",
      ].join("\n"),
      [resolvedAssistantTargetId],
    );
    if (ok) setAssistantDraft("");
  }

  function undoWorkspaceEdit(
    confirmationId: string,
    operation: CompanionWorkspaceOperation,
  ): { ok: boolean; message: string } {
    const result = revertCompanionWorkspaceOperation({ course, operation });
    if (result.status !== "applied") return { ok: false, message: result.reason };
    session.upsertLearningEvidence(result.evidence);
    session.resolveCompanionConfirmation(course.id, confirmationId, "rejected");
    session.addCompanionProcessRecord({
      courseId: course.id,
      studentId,
      stageKey,
      title: `撤销了 AI 对“${operation.label}”的编辑`,
      summary: "只恢复了这一个字段的编辑前内容，其他草稿和版本未改变。",
      source: "student",
      companionId: operation.companionId,
      taskId: operation.taskId,
      evidenceIds: [operation.evidenceId],
    });
    return { ok: true, message: `已撤销“${operation.label}”的 AI 编辑。` };
  }

  const viewCopy: Record<WorkbenchView, { title: string; description: string }> = {
    editor: {
      title: pageTitle,
      description: stageKey === "make" || stageKey === "proposal" ? "" : mission.currentAction.description,
    },
    resources: { title: "资料角", description: "" },
    archive: {
      title: "过程档案",
      description: "",
    },
    suggestions: { title: "待确认建议", description: "" },
  };

  return (
    <div className="studio-workbench studio-workbench--single" data-layout={layoutMode} data-stage={stageKey}>
      <header className="studio-workbench__single-header">
        <div className="studio-workbench__single-title">
          <span className="studio-workbench__mark" aria-hidden="true"><FilePenLine size={19} /></span>
          <div>
            <h1>{viewCopy[visibleView].title}</h1>
            {viewCopy[visibleView].description ? <p>{viewCopy[visibleView].description}</p> : null}
          </div>
        </div>
        <div className="studio-workbench__single-actions">
          <span className="studio-workbench__readiness" data-status={readiness.status}>
            {STAGE_READINESS_LABEL[readiness.status]}
          </span>
          {runtime && onAskCompanion && eligibleCompanions.length ? (
            <button
              aria-expanded={assistantOpen}
              aria-label={stageKey === "make" || stageKey === "proposal"
                ? assistantOpen ? "关闭AI工作结果" : "打开AI工作结果"
                : assistantOpen ? "关闭AI协作" : "打开AI协作"}
              className={cn("studio-workbench__assistant-toggle", assistantOpen && "is-active")}
              onClick={() => setAssistantOpen((value) => !value)}
              type="button"
            >
              {assistantOpen ? <PanelRightClose size={15} /> : <Bot size={15} />}
              <span>{stageKey === "make" || stageKey === "proposal" ? "AI 工作结果" : "AI 协作"}</span>
              {runtime.isActive ? <i aria-label="AI正在回应" /> : null}
            </button>
          ) : null}
          <button
            className={cn("studio-workbench__help", helpRequested && "is-requested")}
            disabled={helpRequested}
            onClick={() => session.requestTeacherHelp(course.id, stageKey)}
            type="button"
          >
            <HandHelping size={16} />
            <span>{helpRequested ? "已请求帮助" : "请求教师帮助"}</span>
          </button>
        </div>
      </header>

      <main aria-live="polite" className="studio-workbench__single-canvas">
        <div className={cn("studio-workbench__desktop-grid", !assistantOpen && "is-ai-closed")}>
          <aside aria-label="工作台导航" className="studio-workbench__context-rail">
            {stageKey === "make" || stageKey === "proposal" ? null : (
              <section>
                <span>当前任务</span>
                <strong>{mission.currentAction.label}</strong>
                <p>{mission.currentAction.doneWhen}</p>
              </section>
            )}
            <nav>
              <button aria-pressed={visibleView === "editor"} onClick={() => setView("editor")} type="button"><FilePenLine size={16} /><span>{stageKey === "make" ? "作品工作台" : stageKey === "proposal" ? "项目方案" : "共享编辑"}</span></button>
              <button aria-pressed={visibleView === "resources"} onClick={() => setView("resources")} type="button"><Library size={16} /><span>资料角</span></button>
              <button aria-pressed={visibleView === "archive"} onClick={() => setView("archive")} type="button"><Archive size={16} /><span>过程档案</span>{appliedEditCount ? <b>{appliedEditCount}</b> : null}</button>
              {stageKey !== "make" && pendingAiDecisions.length ? <button aria-pressed={visibleView === "suggestions"} onClick={() => setView("suggestions")} type="button"><Inbox size={16} /><span>待确认建议</span><b>{pendingAiDecisions.length}</b></button> : null}
            </nav>
            <section className="studio-workbench__checks">
              <span>完成条件</span>
              {readiness.checks.map((check) => (
                <div key={check.id}>{check.satisfied ? <CheckCircle2 size={14} /> : <Circle size={14} />}<p>{check.label}{check.detail ? <small>{check.detail}</small> : null}</p></div>
              ))}
            </section>
            <section className="studio-workbench__responsibility">
              <span><ShieldCheck size={13} /> 协作边界</span>
              <p>{stageKey === "make"
                ? "AI 依据工作稿提供纯文本结果；只有你点击采纳后才会加入工作稿，最终作品仍由你完成和提交。"
                : stageKey === "proposal"
                  ? "AI 只提供纯文本工作结果；由你选择加入构想、步骤或验证方式，并负责核验和提交。"
                : "AI 可直接改草稿；你负责核验事实和最终提交。每次 AI 编辑都能在档案中查看与撤销。"}</p>
            </section>
          </aside>

          <div className="studio-workbench__canvas-body">
            <section hidden={visibleView !== "editor"}>
              <EvidenceStageWorkspace
                course={course}
                embedded
                focusActionId={mission.currentAction.id}
                showAiInbox={false}
                showMission={false}
                stageKey={stageKey}
              />
            </section>
            {onAskCompanion ? (
              <section hidden={visibleView !== "resources"}>
                <StudioResourceLibrary
                  course={course}
                  disabled={!eligibleCompanions.some((item) => item.id === "knowledge")}
                  onAsk={onAskCompanion}
                  onRequestMicroLesson={runtime?.requestMicroLesson}
                  stageKey={stageKey}
                />
              </section>
            ) : null}
            <section hidden={visibleView !== "archive"}>
              <StudioProcessArchive
                course={course}
                messages={runtime?.messages ?? []}
                onUndo={undoWorkspaceEdit}
                stageKey={stageKey}
                studentId={studentId}
              />
            </section>
            {pendingAiDecisions.length ? (
              <section hidden={visibleView !== "suggestions"}>
                <AiDecisionInbox course={course} stageKey={stageKey} studentId={studentId} />
              </section>
            ) : null}
          </div>

          {assistantOpen && runtime && onAskCompanion ? (
            <WorkbenchAiPanel
              draft={assistantDraft}
              onChangeDraft={setAssistantDraft}
              onClose={() => setAssistantOpen(false)}
              onCollaborationModeChange={setCollaborationMode}
              onEditModeChange={setWorkspaceEditMode}
              onAdoptResult={(content, proposalTarget) => {
                if (stageKey === "proposal") {
                  emitProposalWorkResultAdoptEvent({
                    courseId: course.id,
                    studentId,
                    content,
                    target: proposalTarget ?? "concept",
                  });
                } else {
                  emitMakeWorkResultAdoptEvent({ courseId: course.id, studentId, content });
                }
                session.addCompanionProcessRecord({
                  courseId: course.id,
                  studentId,
                  stageKey,
                  title: stageKey === "proposal"
                    ? "将 AI 工作结果加入项目方案"
                    : "将 AI 工作结果加入作品工作稿",
                  summary: content.slice(0, 260),
                  source: "student",
                });
              }}
              onSend={() => void askCompanion()}
              onShowArchive={() => {
                setView("archive");
                setAssistantOpen(false);
              }}
              onStop={onStopCompanion}
              onTargetChange={setAssistantTargetId}
              onWorkspaceTargetChange={setWorkspaceTarget}
              runtime={runtime}
              collaborationMode={collaborationMode}
              editMode={workspaceEditMode}
              latestAppliedEdit={latestAppliedEdit}
              selectedTargetId={resolvedAssistantTargetId}
              stageKey={stageKey}
              targets={eligibleCompanions.map((companion) => companion.id)}
              workspaceTarget={resolvedWorkspaceTarget}
              workspaceTargets={editableWorkspaceTargets}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function WorkbenchAiPanel({
  runtime,
  targets,
  selectedTargetId,
  stageKey,
  draft,
  onTargetChange,
  onWorkspaceTargetChange,
  onChangeDraft,
  onCollaborationModeChange,
  onEditModeChange,
  onAdoptResult,
  onSend,
  onShowArchive,
  onStop,
  onClose,
  collaborationMode,
  editMode,
  workspaceTarget,
  workspaceTargets,
  latestAppliedEdit,
}: {
  runtime: CompanionRuntimeContextValue;
  targets: AiCompanionId[];
  selectedTargetId: AiCompanionId | null;
  stageKey: string;
  draft: string;
  onTargetChange: (id: AiCompanionId) => void;
  onWorkspaceTargetChange: (target: CompanionWorkspaceTarget) => void;
  onChangeDraft: (value: string) => void;
  onCollaborationModeChange: (mode: AiCollaborationMode) => void;
  onEditModeChange: (mode: WorkspaceEditMode) => void;
  onAdoptResult: (content: string, proposalTarget?: ProposalWorkResultTarget) => void;
  onSend: () => void;
  onShowArchive: () => void;
  onStop?: () => void;
  onClose: () => void;
  collaborationMode: AiCollaborationMode;
  editMode: WorkspaceEditMode;
  workspaceTarget: CompanionWorkspaceTarget | null;
  workspaceTargets: CompanionWorkspaceTarget[];
  latestAppliedEdit?: NonNullable<Course["companionConfirmations"]>[number];
}) {
  const recentReplies = runtime.messages.filter((message) => message.role === "assistant").slice(-2);
  const latestReply = recentReplies.at(-1);
  const [resultNotice, setResultNotice] = useState<string | null>(null);
  const [proposalTarget, setProposalTarget] = useState<ProposalWorkResultTarget>("concept");

  if (stageKey === "make" || stageKey === "proposal") {
    const taskStarters: Array<{
      label: string;
      prompt: string;
      target?: ProposalWorkResultTarget;
    }> = stageKey === "proposal"
      ? [
          { label: "完善构想", prompt: "根据我已有的内容，帮我完善方案构想，但不要增加未提供的事实。", target: "concept" },
          { label: "整理步骤", prompt: "把我的实施思路整理成简洁、可执行的步骤。", target: "actions" },
          { label: "检查验证", prompt: "检查验证方式能否判断方案有效，并给出一版更清楚的表述。", target: "validation" },
        ]
      : [
          { label: "帮我梳理", prompt: "帮我梳理" },
          { label: "检查问题", prompt: "检查问题" },
          { label: "生成可用文本", prompt: "生成可用文本" },
        ];
    const resultText = runtime.streamingText || latestReply?.content || "";
    return (
      <aside aria-label="AI工作结果" className="studio-workbench__ai-panel studio-workbench__ai-panel--result">
        <header>
          <div>
            <span><Bot size={14} /> AI 工作结果</span>
            {runtime.generatingCompanionId || runtime.currentSpeaker ? <strong>正在生成</strong> : null}
          </div>
          <button aria-label="关闭AI工作结果" onClick={onClose} type="button"><X size={16} /></button>
        </header>

        <div className="studio-workbench__result-starters" aria-label="快捷任务" role="group">
          {taskStarters.map((starter) => (
            <button key={starter.label} onClick={() => {
              onChangeDraft(starter.prompt);
              if (starter.target) setProposalTarget(starter.target);
            }} type="button">{starter.label}</button>
          ))}
        </div>

        <section className="studio-workbench__result-output" aria-live="polite">
          {resultText ? (
            <article className={runtime.streamingText ? "is-streaming" : undefined}>
              <span>{runtime.streamingText ? "正在生成" : "最新结果"}</span>
              <p>{resultText}</p>
              {!runtime.streamingText ? (
                <footer className={stageKey === "proposal" ? "has-destination" : undefined}>
                  {stageKey === "proposal" ? (
                    <div className="studio-workbench__result-destination">
                      <span>加入到</span>
                      <div aria-label="选择加入方案的位置" role="group">
                        {([
                          ["concept", "构想"],
                          ["actions", "步骤"],
                          ["validation", "验证"],
                        ] as Array<[ProposalWorkResultTarget, string]>).map(([target, label]) => (
                          <button
                            aria-pressed={proposalTarget === target}
                            key={target}
                            onClick={() => setProposalTarget(target)}
                            type="button"
                          >{label}</button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <button onClick={() => {
                    onAdoptResult(resultText, proposalTarget);
                    setResultNotice(stageKey === "proposal" ? "已加入项目方案" : "已加入作品工作稿");
                  }} type="button"><CheckCircle2 size={13} /> {stageKey === "proposal" ? "加入方案" : "加入工作稿"}</button>
                  <button onClick={() => {
                    void navigator.clipboard?.writeText(resultText);
                    setResultNotice("已复制工作结果");
                  }} type="button"><Clipboard size={13} /> 复制</button>
                </footer>
              ) : null}
            </article>
          ) : (
            <div className="studio-workbench__result-empty">
              <FilePenLine size={22} />
              <strong>还没有工作结果</strong>
              <p>{stageKey === "proposal"
                ? "说明希望 AI 帮你完善构想、整理步骤或检查验证方式。"
                : "说明希望 AI 帮你整理、检查或生成什么，不需要选择角色和编辑目标。"}</p>
            </div>
          )}
          {resultNotice ? <p className="studio-workbench__result-notice" role="status">{resultNotice}</p> : null}
          {runtime.error ? <p className="studio-workbench__ai-error" role="alert">{runtime.error}</p> : null}
        </section>

        <form className="studio-workbench__ai-composer studio-workbench__result-composer" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
          <label htmlFor={`${stageKey}-ai-task`}>希望 AI 帮你做什么？</label>
          <textarea
            aria-label="希望AI帮你做什么"
            disabled={runtime.isActive}
            id={`${stageKey}-ai-task`}
            onChange={(event) => onChangeDraft(event.target.value)}
            placeholder={stageKey === "proposal"
              ? "例如：把我的想法整理成三个可执行步骤"
              : "例如：把这段进展整理成三页 PPT 大纲"}
            rows={3}
            value={draft}
          />
          {runtime.isActive ? (
            <button aria-label="停止AI回应" className="is-stop" onClick={onStop} type="button"><Square fill="currentColor" size={12} /></button>
          ) : (
            <button aria-label="发送工作任务" disabled={!draft.trim() || !selectedTargetId} type="submit"><Send size={15} /></button>
          )}
        </form>
      </aside>
    );
  }

  const targetLabel = workspaceTarget
    ? getWorkspaceTargetDefinition(workspaceTarget).label
    : "当前内容";
  const taskStarters = collaborationMode === "edit"
    ? [
        `整理我刚才提供的内容，写入“${targetLabel}”`,
        `检查“${targetLabel}”现有草稿，只补充一处有依据的遗漏`,
      ]
    : stageKey === "make"
      ? ["帮我判断这条观察是否混入了结论", "检查我的下一步是否真的依据测试结果"]
      : ["帮我找出方案中最需要验证的一处", "检查我的方案是否足够具体可执行"];

  return (
    <aside aria-label="AI伴学协作" className="studio-workbench__ai-panel">
      <header>
        <div>
          <span><Bot size={14} /> AI 组员</span>
          <strong>{runtime.generatingCompanionId ? `${getCompanion(runtime.generatingCompanionId).name}正在思考` : runtime.currentSpeaker ? `${getCompanion(runtime.currentSpeaker).name}正在回应` : "可以对话，也可以直接编辑"}</strong>
        </div>
        <button aria-label="关闭AI协作" onClick={onClose} type="button"><X size={16} /></button>
      </header>

      <div className="studio-workbench__collaboration-mode" aria-label="选择协作方式" role="group">
        <button aria-pressed={collaborationMode === "discuss"} onClick={() => onCollaborationModeChange("discuss")} type="button">
          <MessageCircleQuestion size={13} /> 讨论建议
        </button>
        {workspaceTargets.length ? <button aria-pressed={collaborationMode === "edit"} onClick={() => onCollaborationModeChange("edit")} type="button">
          <PenLine size={13} /> 协作编辑
        </button> : null}
      </div>

      {collaborationMode === "edit" && workspaceTarget ? (
        <div className="studio-workbench__edit-scope">
          <label>
            <span>只编辑</span>
            <select
              aria-label="选择要编辑的内容块"
              onChange={(event) => onWorkspaceTargetChange(event.target.value as CompanionWorkspaceTarget)}
              value={workspaceTarget}
            >
              {workspaceTargets.map((target) => (
                <option key={target} value={target}>{getWorkspaceTargetDefinition(target).label}</option>
              ))}
            </select>
          </label>
          <div aria-label="选择编辑方式" role="group">
            <button aria-pressed={editMode === "append"} onClick={() => onEditModeChange("append")} type="button">补充</button>
            <button aria-pressed={editMode === "replace"} onClick={() => onEditModeChange("replace")} type="button">改写</button>
          </div>
          <p><Undo2 size={12} /> AI 只改选中草稿块；写入后会标记，可在过程档案撤销。</p>
        </div>
      ) : (
        <p className="studio-workbench__coedit-status"><ShieldCheck size={13} /> 讨论不会改动草稿；需要写入时切换到“协作编辑”。</p>
      )}

      <div className="studio-workbench__ai-targets" aria-label="选择AI角色" role="group">
        {targets.map((id) => {
          const companion = getCompanion(id);
          return (
            <button aria-pressed={selectedTargetId === id} key={id} onClick={() => onTargetChange(id)} title={companion.description} type="button">
              <span style={{ background: companion.color }}>{companion.shortName}</span>{companion.name}
            </button>
          );
        })}
      </div>

      <div className="studio-workbench__task-starters">
        {taskStarters.map((prompt) => <button key={prompt} onClick={() => onChangeDraft(prompt)} type="button">{prompt}</button>)}
      </div>

      {latestAppliedEdit ? (
        <button className="studio-workbench__latest-edit" onClick={onShowArchive} type="button">
          <CheckCircle2 size={14} />
          <span><strong>{latestAppliedEdit.title}</strong><small>已写入草稿 · 查看或撤销</small></span>
        </button>
      ) : null}

      <div className="studio-workbench__ai-messages" aria-live="polite">
        {recentReplies.length ? recentReplies.map((message, index) => {
          const companion = message.companionId ? getCompanion(message.companionId) : null;
          return <article key={`${message.ts}-${index}`}><strong>{companion?.name ?? "伴学伙伴"}</strong><p>{message.content}</p></article>;
        }) : <p className="studio-workbench__ai-empty">先选“讨论建议”或“协作编辑”。编辑时必须指定一个内容块，AI 不会替你提交。</p>}
        {runtime.streamingText ? <article className="is-streaming"><strong>正在回应</strong><p>{runtime.streamingText}</p></article> : null}
        {runtime.error ? <p className="studio-workbench__ai-error">{runtime.error}</p> : null}
      </div>

      <form className="studio-workbench__ai-composer" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
        <textarea
          aria-label="给当前AI伙伴的问题"
          disabled={runtime.isActive}
          onChange={(event) => onChangeDraft(event.target.value)}
          placeholder={collaborationMode === "edit" ? `告诉 AI 要怎样${editMode === "append" ? "补充" : "改写"}“${targetLabel}”…` : "描述你的卡点，AI 只给建议，不改草稿…"}
          rows={3}
          value={draft}
        />
        {runtime.isActive ? (
          <button aria-label="停止AI回应" className="is-stop" onClick={onStop} type="button"><Square fill="currentColor" size={12} /></button>
        ) : (
          <button aria-label="发送给AI伙伴" disabled={!draft.trim() || !selectedTargetId} type="submit"><Send size={15} /></button>
        )}
      </form>
    </aside>
  );
}
