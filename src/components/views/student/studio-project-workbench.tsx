"use client";

import { useState } from "react";
import {
  Bot,
  FilePenLine,
  HandHelping,
  Inbox,
  Send,
  Square,
  X,
} from "lucide-react";
import { getCompanion, type AiCompanionId } from "@/lib/ai-companions";
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

const STAGE_NUMBER_LABEL = ["一", "二", "三", "四", "五", "六"];

export function StudioProjectWorkbench({
  course,
  stageKey,
  runtime,
  onAskCompanion,
  onStopCompanion,
}: {
  course: Course;
  stageKey: string;
  runtime?: CompanionRuntimeContextValue;
  onAskCompanion?: (text: string, companionIds?: AiCompanionId[]) => Promise<boolean>;
  onStopCompanion?: () => void;
}) {
  const session = useSession();
  const studentId = session.studentId ?? "";
  const readiness = deriveStageReadiness(course, studentId, stageKey);
  const preset = resolveCourseLearningPreset(course);
  const mission = getStageMissionDefinition(
    stageKey,
    preset,
    readiness.missingEvidenceKinds,
  );
  const pendingAiDecisions = (course.aiContributions ?? []).filter(
    (item) =>
      item.studentId === studentId
      && item.stageKey === stageKey
      && item.status === "pending-decision"
      && (item.impact === "high" || Boolean(item.proposedChange)),
  );
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
  const [showingAiInbox, setShowingAiInbox] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
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
      `我正在完成“${mission.currentAction.label}”。我的具体问题是：${question}`,
      [resolvedAssistantTargetId],
    );
    if (ok) setAssistantDraft("");
  }

  return (
    <div className="studio-workbench studio-workbench--single">
      <header className="studio-workbench__single-header">
        <div className="studio-workbench__single-title">
          <span className="studio-workbench__mark" aria-hidden="true">
            <FilePenLine size={19} />
          </span>
          <div>
            <h1>{showingAiInbox ? "AI建议" : pageTitle}</h1>
            <p>{showingAiInbox ? "选择采纳、修改或拒绝。" : mission.currentAction.description}</p>
          </div>
        </div>
        <div className="studio-workbench__single-actions">
          <span className="studio-workbench__readiness" data-status={readiness.status}>
            {STAGE_READINESS_LABEL[readiness.status]}
          </span>
          {pendingAiDecisions.length ? (
            <button
              className={cn("studio-workbench__inbox-toggle", showingAiInbox && "is-active")}
              onClick={() => setShowingAiInbox((value) => !value)}
              type="button"
            >
              <Inbox size={15} />
              {showingAiInbox ? "返回任务" : `AI建议 ${pendingAiDecisions.length}`}
            </button>
          ) : null}
          {runtime && onAskCompanion && eligibleCompanions.length ? (
            <button
              aria-expanded={assistantOpen}
              aria-label={assistantOpen ? "关闭AI协作" : "打开AI协作"}
              className={cn("studio-workbench__assistant-toggle", assistantOpen && "is-active")}
              onClick={() => setAssistantOpen((value) => !value)}
              type="button"
            >
              <Bot size={15} />
              <span>AI协作</span>
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
              targets={eligibleCompanions.map((companion) => companion.id)}
            />
          ) : null}

          <div className="studio-workbench__canvas-body">
            {showingAiInbox ? (
              <AiDecisionInbox
                course={course}
                stageKey={stageKey}
                studentId={studentId}
              />
            ) : (
              <EvidenceStageWorkspace
                course={course}
                embedded
                focusActionId={mission.currentAction.id}
                showAiInbox={false}
                showMission={false}
                stageKey={stageKey}
              />
            )}
          </div>
      </main>
    </div>
  );
}

function WorkbenchAiPanel({
  runtime,
  targets,
  selectedTargetId,
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
  draft: string;
  onTargetChange: (id: AiCompanionId) => void;
  onChangeDraft: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onClose: () => void;
}) {
  const recentReplies = runtime.messages
    .filter((message) => message.role === "assistant")
    .slice(-2);

  return (
    <aside aria-label="AI伴学协作" className="studio-workbench__ai-panel">
      <header>
        <div>
          <span><Bot size={14} /> AI伴学协作</span>
          <strong>
            {runtime.generatingCompanionId
              ? `${getCompanion(runtime.generatingCompanionId).name}正在思考`
              : runtime.currentSpeaker
                ? `${getCompanion(runtime.currentSpeaker).name}正在回应`
                : "围绕当前任务提问"}
          </strong>
        </div>
        <button aria-label="关闭AI协作" onClick={onClose} type="button"><X size={16} /></button>
      </header>

      <div className="studio-workbench__ai-targets" aria-label="选择AI角色" role="group">
        {targets.map((id) => {
          const companion = getCompanion(id);
          return (
            <button
              aria-pressed={selectedTargetId === id}
              key={id}
              onClick={() => onTargetChange(id)}
              title={companion.description}
              type="button"
            >
              <span style={{ background: companion.color }}>{companion.shortName}</span>
              {companion.name}
            </button>
          );
        })}
      </div>

      <div className="studio-workbench__ai-messages" aria-live="polite">
        {recentReplies.length ? recentReplies.map((message, index) => {
          const companion = message.companionId
            ? getCompanion(message.companionId)
            : null;
          return (
            <article key={`${message.ts}-${index}`}>
              <strong>{companion?.name ?? "伴学伙伴"}</strong>
              <p>{message.content}</p>
            </article>
          );
        }) : (
          <p className="studio-workbench__ai-empty">
            写下你在当前任务中的具体卡点，选择一位伙伴协助。
          </p>
        )}
        {runtime.streamingText ? (
          <article className="is-streaming">
            <strong>正在回应</strong>
            <p>{runtime.streamingText}</p>
          </article>
        ) : null}
        {runtime.error ? <p className="studio-workbench__ai-error">{runtime.error}</p> : null}
      </div>

      <form
        className="studio-workbench__ai-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <textarea
          aria-label="给当前AI伙伴的问题"
          disabled={runtime.isActive}
          onChange={(event) => onChangeDraft(event.target.value)}
          placeholder="例如：我的测试方法哪里还不清楚？"
          rows={2}
          value={draft}
        />
        {runtime.isActive ? (
          <button aria-label="停止AI回应" className="is-stop" onClick={onStop} type="button">
            <Square fill="currentColor" size={12} />
          </button>
        ) : (
          <button
            aria-label="发送给AI伙伴"
            disabled={!draft.trim() || !selectedTargetId}
            type="submit"
          >
            <Send size={15} />
          </button>
        )}
      </form>
    </aside>
  );
}
