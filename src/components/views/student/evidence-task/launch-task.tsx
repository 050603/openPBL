"use client";

import type { Course } from "@/lib/session/types";
import { EvidenceCard, Field } from "./shared";
import { useEvidenceDraft } from "./use-evidence-draft";

export function LaunchEvidenceTask({
  course,
  studentId,
}: {
  course: Course;
  studentId: string;
}) {
  const intent = useEvidenceDraft({
    course,
    studentId,
    stageKey: "launch",
    kind: "project-intent",
    title: "我的项目立意",
    initialPayload: {
      concern: "",
      affectedPeople: "",
      importance: "",
      successIndicator: "",
      personalQuestion: "",
    },
  });

  const feedback = course.learningEvidence?.find(
    (item) => item.id === intent.evidenceId,
  )?.teacherFeedback;

  return (
    <EvidenceCard
      actionId="intent"
      active
      description="先从你真实关心的情境出发。这里不是填写标准答案，而是在教师给出的边界内形成你自己的项目子问题。"
      error={intent.error}
      eyebrow="Project intent"
      onSubmit={() => intent.submit()}
      saveState={intent.saveState}
      status={intent.status}
      title="形成个人项目立意"
    >
      {feedback ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          教师校准意见：{feedback}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          input
          label="你关注什么问题？"
          onChange={(concern) => intent.setPayload((value) => ({ ...value, concern }))}
          placeholder="例如：午休后的教室里经常留下许多一次性垃圾"
          value={intent.payload.concern}
        />
        <Field
          input
          label="这个问题主要影响谁？"
          onChange={(affectedPeople) =>
            intent.setPayload((value) => ({ ...value, affectedPeople }))}
          placeholder="具体的人、群体或环境"
          value={intent.payload.affectedPeople}
        />
      </div>
      <Field
        label="为什么值得解决？"
        onChange={(importance) => intent.setPayload((value) => ({ ...value, importance }))}
        placeholder="结合你观察到的真实现象说明，不要只写“很重要”。"
        value={intent.payload.importance}
      />
      <Field
        label="怎样才算有所改善？"
        onChange={(successIndicator) =>
          intent.setPayload((value) => ({ ...value, successIndicator }))}
        placeholder="写一个以后能够观察或验证的成功标志。"
        value={intent.payload.successIndicator}
      />
      <Field
        label="你想亲自追究的项目问题"
        onChange={(personalQuestion) =>
          intent.setPayload((value) => ({ ...value, personalQuestion }))}
        placeholder="把它写成一个开放但范围可控的问题。"
        value={intent.payload.personalQuestion}
      />
    </EvidenceCard>
  );
}
