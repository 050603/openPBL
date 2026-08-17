"use client";

import { useState } from "react";
import {
  Archive,
  Bot,
  CheckCircle2,
  Circle,
  FilePenLine,
  HandHelping,
  Inbox,
  Library,
  PanelRightClose,
  Send,
  ShieldCheck,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { getCompanion, type AiCompanionId } from "@/lib/ai-companions";
import {
  parseWorkspaceOperation,
  revertCompanionWorkspaceOperation,
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

export function StudioProjectWorkbench({
  course,
  stageKey,
  runtime,
  onAskCompanion,
  onStopCompanion,
  initialView = "editor",
}: {
  course: Course;
  stageKey: string;
  runtime?: CompanionRuntimeContextValue;
  onAskCompanion?: (text: string, companionIds?: AiCompanionId[]) => Promise<boolean>;
  onStopCompanion?: () => void;
  initialView?: WorkbenchView;
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
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [assistantDraft, setAssistantDraft] = useState("");
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
    const ok = await onAskCompanion(
      [
        `我正在完成“${mission.currentAction.label}”。`,
        `我的具体任务是：${question}`,
        "操作约束：仅当上面的任务明确提出草稿字段变更时，才使用共编能力；不要替我提交。",
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
    editor: { title: pageTitle, description: mission.currentAction.description },
    resources: { title: `${pageTitle} · 资料角`, description: "查找来源、打开原文，并把需要核对的线索交给知知。" },
    archive: { title: `${pageTitle} · 过程档案`, description: "查看项目变化、AI 编辑和提交记录，并撤销仍可安全回退的编辑。" },
    suggestions: { title: `${pageTitle} · 待确认建议`, description: "这些高影响建议没有直接写入工作台，需要你作出决定。" },
  };

  return (
    <div className="studio-workbench studio-workbench--single">
      <header className="studio-workbench__single-header">
        <div className="studio-workbench__single-title">
          <span className="studio-workbench__mark" aria-hidden="true"><FilePenLine size={19} /></span>
          <div><h1>{viewCopy[view].title}</h1><p>{viewCopy[view].description}</p></div>
        </div>
        <div className="studio-workbench__single-actions">
          <span className="studio-workbench__readiness" data-status={readiness.status}>
            {STAGE_READINESS_LABEL[readiness.status]}
          </span>
          {runtime && onAskCompanion && eligibleCompanions.length ? (
            <button
              aria-expanded={assistantOpen}
              aria-label={assistantOpen ? "关闭AI协作" : "打开AI协作"}
              className={cn("studio-workbench__assistant-toggle", assistantOpen && "is-active")}
              onClick={() => setAssistantOpen((value) => !value)}
              type="button"
            >
              {assistantOpen ? <PanelRightClose size={15} /> : <Bot size={15} />}
              <span>AI 协作</span>
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
            {helpRequested ? "已请求帮助" : "请求教师帮助"}
          </button>
        </div>
      </header>

      <main aria-live="polite" className="studio-workbench__single-canvas">
        <div className={cn("studio-workbench__desktop-grid", !assistantOpen && "is-ai-closed")}>
          <aside aria-label="工作台导航" className="studio-workbench__context-rail">
            <section>
              <span>当前任务</span>
              <strong>{mission.currentAction.label}</strong>
              <p>{mission.currentAction.doneWhen}</p>
            </section>
            <nav>
              <button aria-pressed={view === "editor"} onClick={() => setView("editor")} type="button"><FilePenLine size={16} /><span>共享编辑</span></button>
              <button aria-pressed={view === "resources"} onClick={() => setView("resources")} type="button"><Library size={16} /><span>资料角</span></button>
              <button aria-pressed={view === "archive"} onClick={() => setView("archive")} type="button"><Archive size={16} /><span>过程档案</span>{appliedEditCount ? <b>{appliedEditCount}</b> : null}</button>
              {pendingAiDecisions.length ? <button aria-pressed={view === "suggestions"} onClick={() => setView("suggestions")} type="button"><Inbox size={16} /><span>待确认建议</span><b>{pendingAiDecisions.length}</b></button> : null}
            </nav>
            <section className="studio-workbench__checks">
              <span>完成条件</span>
              {readiness.checks.map((check) => (
                <div key={check.id}>{check.satisfied ? <CheckCircle2 size={14} /> : <Circle size={14} />}<p>{check.label}{check.detail ? <small>{check.detail}</small> : null}</p></div>
              ))}
            </section>
            <section className="studio-workbench__responsibility">
              <span><ShieldCheck size={13} /> 协作边界</span>
              <p>AI 可直接改草稿；你负责核验事实和最终提交。每次 AI 编辑都能在档案中查看与撤销。</p>
            </section>
          </aside>

          <div className="studio-workbench__canvas-body">
            <section hidden={view !== "editor"}>
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
              <section hidden={view !== "resources"}>
                <StudioResourceLibrary
                  course={course}
                  disabled={!eligibleCompanions.some((item) => item.id === "knowledge")}
                  onAsk={onAskCompanion}
                  stageKey={stageKey}
                />
              </section>
            ) : null}
            <section hidden={view !== "archive"}>
              <StudioProcessArchive
                course={course}
                messages={runtime?.messages ?? []}
                onUndo={undoWorkspaceEdit}
                stageKey={stageKey}
                studentId={studentId}
              />
            </section>
            {pendingAiDecisions.length ? (
              <section hidden={view !== "suggestions"}>
                <AiDecisionInbox course={course} stageKey={stageKey} studentId={studentId} />
              </section>
            ) : null}
          </div>

          {assistantOpen && runtime && onAskCompanion ? (
            <WorkbenchAiPanel
              draft={assistantDraft}
              onChangeDraft={setAssistantDraft}
              onClose={() => setAssistantOpen(false)}
              onSend={() => void askCompanion()}
              onStop={onStopCompanion}
              onTargetChange={setAssistantTargetId}
              runtime={runtime}
              selectedTargetId={resolvedAssistantTargetId}
              stageKey={stageKey}
              targets={eligibleCompanions.map((companion) => companion.id)}
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
  onChangeDraft,
  onSend,
  onStop,
  onClose,
}: {
  runtime: CompanionRuntimeContextValue;
  targets: AiCompanionId[];
  selectedTargetId: AiCompanionId | null;
  stageKey: string;
  draft: string;
  onTargetChange: (id: AiCompanionId) => void;
  onChangeDraft: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onClose: () => void;
}) {
  const recentReplies = runtime.messages.filter((message) => message.role === "assistant").slice(-2);
  const taskStarters = stageKey === "make"
    ? ["把我刚才说的测试观察整理到工作台", "根据现有结果补充一条测试局限，不要修改其他字段"]
    : ["把我刚才说的风险补充到工作台", "根据现有方案完善下一步，不要修改其他字段"];

  return (
    <aside aria-label="AI伴学协作" className="studio-workbench__ai-panel">
      <header>
        <div>
          <span><Bot size={14} /> AI 组员</span>
          <strong>{runtime.generatingCompanionId ? `${getCompanion(runtime.generatingCompanionId).name}正在思考` : runtime.currentSpeaker ? `${getCompanion(runtime.currentSpeaker).name}正在回应` : "可以对话，也可以直接编辑"}</strong>
        </div>
        <button aria-label="关闭AI协作" onClick={onClose} type="button"><X size={16} /></button>
      </header>

      <p className="studio-workbench__coedit-status"><Undo2 size={13} /> 直接编辑已开启 · 每次改动可撤销</p>

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

      <div className="studio-workbench__ai-messages" aria-live="polite">
        {recentReplies.length ? recentReplies.map((message, index) => {
          const companion = message.companionId ? getCompanion(message.companionId) : null;
          return <article key={`${message.ts}-${index}`}><strong>{companion?.name ?? "伴学伙伴"}</strong><p>{message.content}</p></article>;
        }) : <p className="studio-workbench__ai-empty">可以问问题，也可以直接指派“补充、修改、整理到工作台”等局部编辑任务。</p>}
        {runtime.streamingText ? <article className="is-streaming"><strong>正在回应</strong><p>{runtime.streamingText}</p></article> : null}
        {runtime.error ? <p className="studio-workbench__ai-error">{runtime.error}</p> : null}
      </div>

      <form className="studio-workbench__ai-composer" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
        <textarea
          aria-label="给当前AI伙伴的问题"
          disabled={runtime.isActive}
          onChange={(event) => onChangeDraft(event.target.value)}
          placeholder="描述问题，或指派一项具体的编辑任务…"
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
