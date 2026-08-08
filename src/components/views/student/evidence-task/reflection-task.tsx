"use client";

import { useMemo } from "react";
import { BrainCircuit, LockKeyhole, MoveRight } from "lucide-react";
import type { Course } from "@/lib/session/types";
import { EvidenceCard, EvidenceTimeline, Field } from "./shared";
import { useEvidenceDraft } from "./use-evidence-draft";

export function ReflectionEvidenceTask({
  course,
  studentId,
}: {
  course: Course;
  studentId: string;
}) {
  const timeline = useMemo(
    () => (course.learningEvidence ?? [])
      .filter((item) =>
        item.studentId === studentId
        && item.countsTowardReadiness
        && item.status !== "draft"
        && item.status !== "needs-revision"
        && !["reflection-chain", "transfer-response"].includes(item.kind))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.kind,
        stageKey: item.stageKey,
      })),
    [course.learningEvidence, studentId],
  );
  const reflection = useEvidenceDraft({
    course,
    studentId,
    stageKey: "reflection",
    kind: "reflection-chain",
    title: "选择—行动—结果—认识反思链",
    initialPayload: {
      selectedEvidenceIds: [],
      choice: "",
      action: "",
      result: "",
      learning: "",
    },
    evidenceRefs: (payload) => payload.selectedEvidenceIds,
  });
  const transfer = useEvidenceDraft({
    course,
    studentId,
    stageKey: "reflection",
    kind: "transfer-response",
    title: "新情境迁移",
    initialPayload: {
      scenario: "",
      response: "",
      rationale: "",
    },
  });

  const confirmedAssessment = (course.aiAssessmentSuggestions ?? [])
    .filter((item) =>
      item.studentId === studentId
      && ["confirmed", "adjusted"].includes(item.status)
      && typeof item.teacherScore === "number")
    .sort((a, b) => Date.parse(b.reviewedAt ?? b.createdAt) - Date.parse(a.reviewedAt ?? a.createdAt))[0];

  function toggleEvidence(id: string) {
    reflection.setPayload((value) => ({
      ...value,
      selectedEvidenceIds: value.selectedEvidenceIds.includes(id)
        ? value.selectedEvidenceIds.filter((item) => item !== id)
        : [...value.selectedEvidenceIds, id],
    }));
  }

  return (
    <div className="grid gap-5">
      <section className="evidence-task-context rounded-2xl border border-violet-200 bg-violet-50/80 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-violet-700">
            <LockKeyhole size={18} />
          </span>
          <div>
            <h2 className="text-sm font-bold text-violet-950">评价透明度</h2>
            {confirmedAssessment ? (
              <p className="mt-1 text-sm leading-6 text-violet-900">
                经教师{confirmedAssessment.status === "adjusted" ? "调整" : "确认"}的AI过程建议：
                <strong className="ml-1">{confirmedAssessment.teacherScore} 分</strong>
                {confirmedAssessment.teacherComment
                  ? `；教师说明：${confirmedAssessment.teacherComment}`
                  : "。"}
              </p>
            ) : (
              <p className="mt-1 text-sm leading-6 text-violet-900">
                暂无经教师确认的 AI 过程评价。证据不足的维度会记 0 分，教师检查或调整后才计入最终分；
                原始对话次数、页面停留与上传数量不计分。
              </p>
            )}
          </div>
        </div>
      </section>

      <EvidenceCard
        actionId="causal-reflection"
        active={reflection.status === "draft"}
        description="从项目时间线选择关键证据，再解释选择、行动、结果与认识之间的关系。"
        error={reflection.error}
        eyebrow="1 · Reflection chain"
        onSubmit={() => reflection.submit()}
        saveState={reflection.saveState}
        status={reflection.status}
        title="完成因果反思"
      >
        <div>
          <p className="mb-2 text-sm font-semibold text-stone-800">
            选择能证明过程变化的证据
          </p>
          <EvidenceTimeline
            items={timeline}
            onToggle={toggleEvidence}
            selectedIds={reflection.payload.selectedEvidenceIds}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-start">
          <Field
            label="选择"
            onChange={(choice) =>
              reflection.setPayload((value) => ({ ...value, choice }))}
            placeholder="我当时选择了什么？"
            value={reflection.payload.choice}
          />
          <MoveRight className="mt-10 hidden text-stone-300 lg:block" size={18} />
          <Field
            label="行动"
            onChange={(action) =>
              reflection.setPayload((value) => ({ ...value, action }))}
            placeholder="我实际做了什么？"
            value={reflection.payload.action}
          />
          <MoveRight className="mt-10 hidden text-stone-300 lg:block" size={18} />
          <Field
            label="结果"
            onChange={(result) =>
              reflection.setPayload((value) => ({ ...value, result }))}
            placeholder="真实结果是什么？"
            value={reflection.payload.result}
          />
          <MoveRight className="mt-10 hidden text-stone-300 lg:block" size={18} />
          <Field
            label="认识"
            onChange={(learning) =>
              reflection.setPayload((value) => ({ ...value, learning }))}
            placeholder="由此改变了什么认识？"
            value={reflection.payload.learning}
          />
        </div>
      </EvidenceCard>

      <EvidenceCard
        actionId="transfer"
        active={reflection.status !== "draft" && transfer.status === "draft"}
        description="把本项目学到的方法放到一个新的、但有关联的情境中。迁移不是重复原方案，而是解释哪些原则仍适用、哪些需要改变。"
        error={transfer.error}
        eyebrow="2 · Transfer"
        onSubmit={() => transfer.submit()}
        saveState={transfer.saveState}
        status={transfer.status}
        title="解决一个新情境"
      >
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">
          <p className="flex items-center gap-2 font-bold">
            <BrainCircuit size={16} />
            迁移提示
          </p>
          <p className="mt-1 leading-6">
            教师可给出新情境；若暂未给题，你可以选择与原项目对象、资源或约束不同的真实情境。
          </p>
        </div>
        <Field
          label="新的情境"
          onChange={(scenario) =>
            transfer.setPayload((value) => ({ ...value, scenario }))}
          placeholder="说明新情境与原项目相比发生了什么变化。"
          value={transfer.payload.scenario}
        />
        <Field
          label="你的解决方案"
          onChange={(response) =>
            transfer.setPayload((value) => ({ ...value, response }))}
          placeholder="你会采取哪些行动？"
          value={transfer.payload.response}
        />
        <Field
          label="迁移理由"
          onChange={(rationale) =>
            transfer.setPayload((value) => ({ ...value, rationale }))}
          placeholder="说明哪些项目经验可以迁移，以及为什么需要作出调整。"
          value={transfer.payload.rationale}
        />
      </EvidenceCard>
    </div>
  );
}
