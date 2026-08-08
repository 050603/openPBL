"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  Check,
  GitCompareArrows,
  X,
} from "lucide-react";
import { PrimaryButton, Textarea } from "@/components/ui";
import type {
  AiContribution,
  Course,
  LearningEvidence,
} from "@/lib/session/types";
import {
  LEARNING_EVIDENCE_SCHEMA_VERSION,
  type StudentAiDecisionKind,
} from "@/lib/learning-evidence/types";
import { canApplyAiDecision } from "@/lib/learning-evidence/ai-policy";
import { useSession } from "@/lib/session/store";

type DecisionDraft = {
  reason: string;
  appliedChangeSummary: string;
  resultingEvidenceId: string;
};

const EMPTY_DRAFT: DecisionDraft = {
  reason: "",
  appliedChangeSummary: "",
  resultingEvidenceId: "",
};

export function AiDecisionInbox({
  course,
  studentId,
  stageKey,
}: {
  course: Course;
  studentId: string;
  stageKey: string;
}) {
  const session = useSession();
  const [drafts, setDrafts] = useState<Record<string, DecisionDraft>>({});
  const [message, setMessage] = useState<Record<string, string>>({});
  const contributions = useMemo(
    () => (course.aiContributions ?? [])
      .filter((item) =>
        item.studentId === studentId
        && item.stageKey === stageKey
        && item.status === "pending-decision"
        && (item.impact === "high" || Boolean(item.proposedChange)))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [course.aiContributions, stageKey, studentId],
  );
  const stageEvidence = useMemo(
    () => (course.learningEvidence ?? [])
      .filter((item) =>
        item.studentId === studentId
        && item.stageKey === stageKey
        && item.kind !== "ai-decision")
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [course.learningEvidence, stageKey, studentId],
  );

  if (!contributions.length) return null;

  function updateDraft(contributionId: string, patch: Partial<DecisionDraft>) {
    setDrafts((current) => ({
      ...current,
      [contributionId]: {
        ...(current[contributionId] ?? EMPTY_DRAFT),
        ...patch,
      },
    }));
    setMessage((current) => ({ ...current, [contributionId]: "" }));
  }

  function decide(
    contribution: AiContribution,
    decisionKind: StudentAiDecisionKind,
  ) {
    const draft = drafts[contribution.id] ?? EMPTY_DRAFT;
    const targetEvidence = stageEvidence.find(
      (item) => item.id === draft.resultingEvidenceId,
    );
    const validation = canApplyAiDecision({
      decision: decisionKind,
      reason: draft.reason,
      appliedChangeSummary: draft.appliedChangeSummary,
    });
    if (!validation.allowed) {
      setMessage((current) => ({
        ...current,
        [contribution.id]: validation.reason ?? "请补全决定信息。",
      }));
      return;
    }
    if (decisionKind !== "rejected") {
      if (!targetEvidence) {
        setMessage((current) => ({
          ...current,
          [contribution.id]: "请先在阶段任务中实际修改一项证据，再选择修改后的版本。",
        }));
        return;
      }
      if (Date.parse(targetEvidence.updatedAt) <= Date.parse(contribution.createdAt)) {
        setMessage((current) => ({
          ...current,
          [contribution.id]: "所选证据早于这条AI建议。请先根据你的判断完成实际修改并等待自动保存。",
        }));
        return;
      }
      if (
        typeof window !== "undefined"
        && !window.confirm("确认记录这次AI建议采纳？系统将关联你已经修改的证据版本。")
      ) return;
    }

    const now = new Date().toISOString();
    const decisionId = `ai-decision-${contribution.id}`;
    const resultingEvidenceIds = targetEvidence ? [targetEvidence.id] : [];
    session.recordStudentAiDecision({
      id: decisionId,
      courseId: course.id,
      studentId,
      stageKey,
      contributionId: contribution.id,
      decision: decisionKind,
      reason: draft.reason.trim(),
      appliedChangeSummary:
        decisionKind === "rejected"
          ? undefined
          : draft.appliedChangeSummary.trim(),
      resultingEvidenceIds,
      decidedAt: now,
    });
    const evidence: LearningEvidence<"ai-decision"> = {
      id: `evidence-${decisionId}`,
      schemaVersion: LEARNING_EVIDENCE_SCHEMA_VERSION,
      courseId: course.id,
      studentId,
      stageKey,
      kind: "ai-decision",
      title: `AI建议决定：${
        decisionKind === "adopted"
          ? "采纳"
          : decisionKind === "modified"
            ? "修改后采纳"
            : "拒绝"
      }`,
      summary: draft.reason.trim(),
      payload: {
        contributionId: contribution.id,
        decisionId,
        decision: decisionKind,
        reason: draft.reason.trim(),
        versionChange:
          decisionKind === "rejected"
            ? undefined
            : draft.appliedChangeSummary.trim(),
      },
      status: "submitted",
      source: "student",
      countsTowardReadiness: false,
      evidenceRefs: resultingEvidenceIds,
      artifactSnapshotIds: [],
      createdAt: now,
      updatedAt: now,
      submittedAt: now,
    };
    session.upsertLearningEvidence(evidence);
    const confirmation = (course.companionConfirmations ?? []).find(
      (item) =>
        item.status === "pending"
        && (
          item.payload?.contributionId === contribution.id
          || (item.taskId && contribution.id === `ai-contribution-${item.taskId}`)
        ),
    );
    if (confirmation) {
      session.resolveCompanionConfirmation(
        course.id,
        confirmation.id,
        decisionKind === "rejected" ? "rejected" : "confirmed",
      );
    }
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 shadow-sm md:p-5">
      <header className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-violet-700 shadow-sm">
          <Bot size={20} />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[.15em] text-violet-700">
            AI建议
          </p>
          <h2 className="mt-1 text-lg font-bold text-stone-950">AI建议待决定区</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            查看建议，并记录采纳、调整或不采纳的理由。
          </p>
        </div>
      </header>

      <div className="mt-4 grid gap-4">
        {contributions.map((contribution) => {
          const draft = drafts[contribution.id] ?? EMPTY_DRAFT;
          return (
            <article className="rounded-xl border border-violet-200 bg-white p-4" key={contribution.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm text-stone-900">
                  {contribution.proposedChange || "高影响AI建议"}
                </strong>
                <span className="text-xs font-semibold text-violet-700">
                  {contribution.companionId} · 待决定
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">
                {contribution.suggestion}
              </p>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-stone-800">我的理由（任何决定都必填）</span>
                  <Textarea
                    onChange={(event) =>
                      updateDraft(contribution.id, { reason: event.target.value })}
                    placeholder="核验了什么？这条建议与真实情境、证据或目标是否一致？"
                    rows={2}
                    value={draft.reason}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-stone-800">
                    已实际发生的版本变化（采纳或修改后采纳时必填）
                  </span>
                  <Textarea
                    onChange={(event) =>
                      updateDraft(contribution.id, {
                        appliedChangeSummary: event.target.value,
                      })}
                    placeholder="不要写“准备修改”，请说明你已在正式任务中改了什么。"
                    rows={2}
                    value={draft.appliedChangeSummary}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-stone-800">关联修改后的证据版本</span>
                  <select
                    className="h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm"
                    onChange={(event) =>
                      updateDraft(contribution.id, {
                        resultingEvidenceId: event.target.value,
                      })}
                    value={draft.resultingEvidenceId}
                  >
                    <option value="">拒绝时无需选择；采纳时请选择</option>
                    {stageEvidence.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} · {new Date(item.updatedAt).toLocaleString("zh-CN")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {message[contribution.id] ? (
                <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                  {message[contribution.id]}
                </p>
              ) : null}
              <footer className="mt-4 flex flex-wrap justify-end gap-2 border-t border-stone-100 pt-4">
                <PrimaryButton
                  onClick={() => decide(contribution, "rejected")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <X size={15} />拒绝
                </PrimaryButton>
                <PrimaryButton
                  onClick={() => decide(contribution, "modified")}
                  size="sm"
                  tone="violet"
                  type="button"
                  variant="outline"
                >
                  <GitCompareArrows size={15} />修改后采纳
                </PrimaryButton>
                <PrimaryButton
                  onClick={() => decide(contribution, "adopted")}
                  size="sm"
                  tone="violet"
                  type="button"
                >
                  <Check size={15} />采纳
                </PrimaryButton>
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
