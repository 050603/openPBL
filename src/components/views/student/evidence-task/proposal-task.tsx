"use client";

import { Target } from "lucide-react";
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

  return (
    <EvidenceCard
      actionId="core-plan"
      active
      description="把想法写成一份能动手实施的方案即可。平台只保留方案本身，不要求把每一个思考步骤都拆开填写。"
      error={plan.error}
      eyebrow="项目方案"
      onSubmit={() => plan.submit()}
      saveState={plan.saveState}
      status={plan.status}
      title="形成你的项目方案"
    >
      <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-blue-700">
          <Target size={15} /> 已选研究方向
        </p>
        <p className="mt-2 text-base font-semibold leading-7 text-stone-900">
          {project?.topic || course.drivingQuestion || "请先在项目启动阶段选择研究方向"}
        </p>
      </section>

      {feedback ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          教师校准意见：{feedback}
        </p>
      ) : null}

      <Field
        description="说清楚准备做出什么，以及会怎样使用授知阶段学到的知识。不需要列出多个候选方案。"
        label="你的方案构想"
        onChange={(changeSummary) =>
          plan.setPayload((value) => ({ ...value, changeSummary }))}
        placeholder="例如：我准备制作……，并利用……知识来解决所选问题。"
        value={plan.payload.changeSummary ?? ""}
      />

      <Field
        description="每行一个主要行动，只保留真正需要执行的步骤。"
        label="准备如何实现"
        onChange={(value) =>
          plan.setPayload((current) => ({
            ...current,
            nextActions: splitLines(value),
          }))}
        placeholder={"制作第一个版本\n找真实对象试用或测试\n根据结果修改"}
        value={joinLines(plan.payload.nextActions)}
      />

      <Field
        description="写出一个能够观察或测试的判断方法。"
        label="怎样判断方案是否有效"
        onChange={(validationMethod) =>
          plan.setPayload((value) => ({ ...value, validationMethod }))}
        placeholder="我会让……在……条件下使用或测试，并观察……"
        value={plan.payload.validationMethod}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Field
          description="每行一个真实风险，并写清准备怎样降低它。AI 可以帮你整理，但不能虚构项目情况。"
          label="风险与应对"
          onChange={(value) =>
            plan.setPayload((current) => ({
              ...current,
              risks: splitLines(value),
            }))}
          placeholder={"样本数量不足——增加不同年级的测试对象\n材料强度不够——先做小尺寸承重测试"}
          value={joinLines(plan.payload.risks)}
        />
        <Field
          description="说明哪些工作可以交给 AI，哪些判断、制作和核验必须由你完成。"
          label="AI 组员的分工边界"
          onChange={(aiBoundary) =>
            plan.setPayload((value) => ({ ...value, aiBoundary }))}
          placeholder="AI 可以整理资料和检查遗漏；最终选材、测试与结论由我完成并核验。"
          value={plan.payload.aiBoundary}
        />
      </div>

      <Field
        description="每行一个可核验来源，优先写标题和原文链接。资料角交给知知核对的线索会追加到这里。"
        label="关键资料来源"
        onChange={(value) => plan.setPayload((current) => ({
          ...current,
          sources: splitLines(value),
        }))}
        placeholder="资料标题 — https://…"
        value={joinLines(plan.payload.sources)}
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
    </EvidenceCard>
  );
}
