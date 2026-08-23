"use client";

import { useEffect } from "react";
import { MessageSquareText } from "lucide-react";
import {
  PROPOSAL_WORK_RESULT_ADOPT_EVENT,
  type ProposalWorkResultAdoptEvent,
} from "@/lib/companion/events";
import { resolveCourseLearningPreset } from "@/lib/learning-evidence/missions";
import type { Course } from "@/lib/session/types";
import { EvidenceCard, Field, joinLines, splitLines } from "./shared";
import { useEvidenceDraft } from "./use-evidence-draft";

export function ProposalEvidenceTask({
  course,
  studentId,
}: {
  course: Course;
  studentId: string;
}) {
  const project = course.groups?.find((item) =>
    item.members.some((member) => member.studentId === studentId));
  const preset = resolveCourseLearningPreset(course);
  const plan = useEvidenceDraft({
    course,
    studentId,
    stageKey: "proposal",
    kind: "plan-version",
    title: "项目方案 v1",
    initialPayload: {
      versionLabel: "v1",
      changeSummary: "",
      nextActions: [],
      validationMethod: "",
      risks: [],
      aiBoundary: "",
      ...(preset === "research" ? { sources: [], methodLimitations: "", ethics: "" } : {}),
    },
  });
  const feedback = course.learningEvidence?.find(
    (item) => item.id === plan.evidenceId,
  )?.teacherFeedback;
  const completedCoreItems = [
    plan.payload.changeSummary?.trim(),
    plan.payload.nextActions.length,
    plan.payload.validationMethod.trim(),
  ].filter(Boolean).length;
  const statusLabel = plan.status === "teacher-confirmed"
    ? "教师已确认"
    : plan.status === "needs-revision"
      ? "需要修改"
      : plan.status === "submitted"
        ? "等待教师确认"
        : "方案草稿";
  const setPlanPayload = plan.setPayload;

  useEffect(() => {
    function adoptWorkResult(event: Event) {
      const detail = (event as CustomEvent<ProposalWorkResultAdoptEvent>).detail;
      if (detail.courseId !== course.id || detail.studentId !== studentId) return;
      const content = detail.content.trim();
      if (!content) return;
      setPlanPayload((current) => {
        if (detail.target === "actions") {
          const additions = splitLines(content);
          return {
            ...current,
            nextActions: [...current.nextActions, ...additions.filter((item) => !current.nextActions.includes(item))],
          };
        }
        if (detail.target === "validation") {
          return {
            ...current,
            validationMethod: appendText(current.validationMethod, content),
          };
        }
        return {
          ...current,
          changeSummary: appendText(current.changeSummary ?? "", content),
        };
      });
    }

    window.addEventListener(PROPOSAL_WORK_RESULT_ADOPT_EVENT, adoptWorkResult);
    return () => window.removeEventListener(PROPOSAL_WORK_RESULT_ADOPT_EVENT, adoptWorkResult);
  }, [course.id, setPlanPayload, studentId]);

  return (
    <EvidenceCard
      actionId="core-plan"
      active
      description="完成构想、步骤和验证方式，就能形成一份可执行的方案；其他内容按项目需要补充。"
      error={plan.error}
      eyebrow="项目方案"
      onSubmit={() => plan.submit()}
      saveState={plan.saveState}
      status={plan.status}
      submitLabel={plan.status === "teacher-confirmed"
        ? "教师已确认"
        : plan.status === "submitted"
          ? "重新提交方案"
          : "提交方案给教师"}
      title="项目方案"
    >
      <div className="proposal-workspace">
        <header className="proposal-workspace__header">
          <div className="proposal-workspace__heading">
            <h2>项目方案</h2>
            <p>
              <span>当前方向</span>
              <strong>{project?.topic || course.drivingQuestion || "请先在项目启动阶段选择研究方向"}</strong>
            </p>
          </div>
          <div className="proposal-workspace__progress" aria-label={`核心内容已完成${completedCoreItems}项，共3项`}>
            <strong>{completedCoreItems}<small>/ 3 项</small></strong>
            <span>{statusLabel}</span>
          </div>
        </header>

        {feedback ? (
          <section className="proposal-workspace__feedback">
            <MessageSquareText size={15} />
            <p><span>教师反馈</span><strong>{feedback}</strong></p>
          </section>
        ) : null}

        <section className="proposal-workspace__core" aria-label="方案核心内容">
          <div className="proposal-workspace__step">
            <span className="proposal-workspace__number">1</span>
            <Field
              description="说明准备做什么，以及会怎样运用前面学到的知识。"
              label="方案目标与构想"
              onChange={(changeSummary) =>
                plan.setPayload((value) => ({ ...value, changeSummary }))}
              placeholder="例如：我准备制作……，利用……知识解决当前问题。"
              rows={6}
              value={plan.payload.changeSummary ?? ""}
              workspaceTarget="proposal.concept"
            />
          </div>
          <div className="proposal-workspace__step">
            <span className="proposal-workspace__number">2</span>
            <Field
              description="每行写一个主要步骤，先保留真正需要执行的行动。"
              label="主要实施步骤"
              onChange={(value) =>
                plan.setPayload((current) => ({
                  ...current,
                  nextActions: splitLines(value),
                }))}
              placeholder={"制作第一个版本\n找真实对象试用或测试\n根据结果修改"}
              rows={6}
              value={joinLines(plan.payload.nextActions)}
              workspaceTarget="proposal.actions"
            />
          </div>
          <div className="proposal-workspace__step">
            <span className="proposal-workspace__number">3</span>
            <Field
              description="写出能够观察或测试的判断方法，不必设计复杂量表。"
              label="验证方式"
              onChange={(validationMethod) =>
                plan.setPayload((value) => ({ ...value, validationMethod }))}
              placeholder="我会让……在……条件下使用或测试，并观察……"
              rows={6}
              value={plan.payload.validationMethod}
              workspaceTarget="proposal.validation"
            />
          </div>
        </section>

        <details className="evidence-optional-details proposal-workspace__optional">
          <summary>
            <span><strong>按需补充</strong><small>风险、资料与 AI 分工，不要求逐项写满</small></span>
            <b>展开</b>
          </summary>
          <div className="grid gap-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <Field
                description="每行写一个真实风险和准备采取的应对办法。"
                label="风险与应对"
                onChange={(value) =>
                  plan.setPayload((current) => ({
                    ...current,
                    risks: splitLines(value),
                  }))}
                placeholder={"样本数量不足——增加不同年级的测试对象\n材料强度不够——先做小尺寸承重测试"}
                value={joinLines(plan.payload.risks)}
                workspaceTarget="proposal.risks"
              />
              <Field
                description="说明 AI 可以协助什么，哪些判断和核验仍由你完成。"
                label="AI 协作边界"
                onChange={(aiBoundary) =>
                  plan.setPayload((value) => ({ ...value, aiBoundary }))}
                placeholder="AI 可以整理资料和检查遗漏；最终选材、测试与结论由我完成。"
                value={plan.payload.aiBoundary}
                workspaceTarget="proposal.aiBoundary"
              />
            </div>

            <Field
              description="每行一个可核验来源，优先写标题和原文链接。"
              label="关键资料来源"
              onChange={(value) => plan.setPayload((current) => ({
                ...current,
                sources: splitLines(value),
              }))}
              placeholder="资料标题 — https://…"
              value={joinLines(plan.payload.sources)}
              workspaceTarget="proposal.sources"
            />

            {preset === "research" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <Field
                  description="说明目前的方法、样本和条件还不能证明什么。"
                  label="方法局限"
                  onChange={(methodLimitations) => plan.setPayload((current) => ({ ...current, methodLimitations }))}
                  placeholder="当前样本只来自……，因此还不能说明……"
                  value={plan.payload.methodLimitations ?? ""}
                />
                <Field
                  description="说明隐私、安全、公平和参与者权益的边界。"
                  label="伦理与安全"
                  onChange={(ethics) => plan.setPayload((current) => ({ ...current, ethics }))}
                  placeholder="参与者可以随时退出；不记录可识别个人身份的信息……"
                  value={plan.payload.ethics ?? ""}
                />
              </div>
            ) : null}
          </div>
        </details>
      </div>
    </EvidenceCard>
  );
}

function appendText(current: string, addition: string): string {
  const normalizedCurrent = current.trim();
  const normalizedAddition = addition.trim();
  if (!normalizedCurrent) return normalizedAddition;
  if (normalizedCurrent.includes(normalizedAddition)) return current;
  return `${normalizedCurrent}\n\n${normalizedAddition}`;
}
