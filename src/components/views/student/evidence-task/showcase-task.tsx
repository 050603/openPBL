"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock3,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  ShieldQuestion,
} from "lucide-react";
import type { Course } from "@/lib/session/types";
import { PrimaryButton } from "@/components/ui";
import { ArtifactSnapshotField } from "./artifact-snapshot-field";
import { EvidenceCard, EvidenceTimeline, Field } from "./shared";
import { evidenceRecordId, useEvidenceDraft } from "./use-evidence-draft";

export function ShowcaseEvidenceTask({
  course,
  studentId,
}: {
  course: Course;
  studentId: string;
}) {
  const finalArtifactId = evidenceRecordId({
    courseId: course.id,
    studentId,
    kind: "final-artifact",
  });
  const eligibleEvidence = useMemo(
    () => (course.learningEvidence ?? [])
      .filter((item) =>
        item.studentId === studentId
        && item.countsTowardReadiness
        && item.status !== "draft"
        && item.status !== "needs-revision"
        && !["presentation-claim", "defense-response", "reflection-chain", "transfer-response"].includes(item.kind))
      .map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.kind,
        stageKey: item.stageKey,
      })),
    [course.learningEvidence, studentId],
  );
  const finalArtifact = useEvidenceDraft({
    course,
    studentId,
    stageKey: "showcase",
    kind: "final-artifact",
    title: "最终作品",
    initialPayload: {
      title: "",
      description: "",
      snapshotId: undefined,
    },
    artifactSnapshotIds: (payload) => payload.snapshotId ? [payload.snapshotId] : [],
  });
  const claim = useEvidenceDraft({
    course,
    studentId,
    stageKey: "showcase",
    kind: "presentation-claim",
    title: "主张—证据—局限汇报",
    initialPayload: {
      claim: "",
      evidenceIds: [],
      evidenceSummary: "",
      limitation: "",
    },
    evidenceRefs: (payload) => payload.evidenceIds,
  });
  const defense = useEvidenceDraft({
    course,
    studentId,
    stageKey: "showcase",
    kind: "defense-response",
    title: "答辩追问与回应",
    initialPayload: {
      question: "",
      response: "",
      evidenceIds: [],
    },
    evidenceRefs: (payload) => payload.evidenceIds,
  });

  const teacherEvaluation = useMemo(() => {
    const project = course.groups?.find((item) =>
      item.members.some((member) => member.studentId === studentId));
    return (course.rubricScores ?? [])
      .filter((item) =>
        item.groupId === project?.id
        && item.stageKey === "showcase"
        && item.status !== "draft"
        && typeof item.teacherTotal === "number")
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  }, [course.groups, course.rubricScores, studentId]);

  function toggleEvidence(
    ids: string[],
    id: string,
    update: (next: string[]) => void,
  ) {
    update(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  return (
    <div className="grid gap-5">
      {teacherEvaluation ? (
        <section className="evidence-task-context rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <strong>教师现场评价已记录：{teacherEvaluation.teacherTotal} 分</strong>
          <p className="mt-1 leading-6">
            {teacherEvaluation.comment || "教师已完成成果与现场表现评价。"}
          </p>
        </section>
      ) : (
        <section className="evidence-task-context rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          学生证据提交完成后，仍需教师现场答辩与评价，阶段才会达标。
        </section>
      )}

      <EvidenceCard
        actionId="final-artifact"
        active={finalArtifact.status === "draft"}
        description="选择最终版本，并补充作品说明和便于查看的关键内容。"
        error={finalArtifact.error}
        eyebrow="1 · Final artifact"
        onSubmit={() => finalArtifact.submit({ confirm: true })}
        saveState={finalArtifact.saveState}
        status={finalArtifact.status}
        title="确认最终作品"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            input
            label="作品名称"
            onChange={(title) =>
              finalArtifact.setPayload((value) => ({ ...value, title }))}
            placeholder="公开展示时使用的正式名称"
            value={finalArtifact.payload.title}
          />
          <Field
            label="作品说明"
            onChange={(description) =>
              finalArtifact.setPayload((value) => ({ ...value, description }))}
            placeholder="它解决什么问题、面向谁、最终实现到什么程度？"
            value={finalArtifact.payload.description}
          />
        </div>
        <ArtifactSnapshotField
          allowEarlierStages
          course={course}
          onChange={(snapshotId) =>
            finalArtifact.setPayload((value) => ({ ...value, snapshotId }))}
          stageKey="showcase"
          studentId={studentId}
          value={finalArtifact.payload.snapshotId}
        />
      </EvidenceCard>

      <EvidenceCard
        actionId="claim"
        active={finalArtifact.status !== "draft" && claim.status === "draft"}
        description="汇报不靠堆叠页面。用一句核心主张、真实证据和诚实局限构成可答辩的论证。"
        error={claim.error}
        eyebrow="2 · Claim, evidence, limitation"
        onSubmit={() => claim.submit()}
        saveState={claim.saveState}
        status={claim.status}
        title="制作汇报论证图"
      >
        <Field
          label="核心主张"
          onChange={(value) =>
            claim.setPayload((current) => ({ ...current, claim: value }))}
          placeholder="你希望听众最终相信或理解什么？"
          value={claim.payload.claim}
        />
        <div>
          <p className="mb-2 text-sm font-semibold text-stone-800">选择支持主张的真实证据</p>
          <EvidenceTimeline
            items={eligibleEvidence}
            onToggle={(id) =>
              toggleEvidence(claim.payload.evidenceIds, id, (evidenceIds) =>
                claim.setPayload((value) => ({ ...value, evidenceIds })))}
            selectedIds={claim.payload.evidenceIds}
          />
        </div>
        <Field
          label="证据怎样支持主张"
          onChange={(evidenceSummary) =>
            claim.setPayload((value) => ({ ...value, evidenceSummary }))}
          placeholder="不要只列证据名称，说明版本、测试结果与主张之间的关系。"
          value={claim.payload.evidenceSummary}
        />
        <Field
          label="目前仍存在的局限"
          onChange={(limitation) =>
            claim.setPayload((value) => ({ ...value, limitation }))}
          placeholder="说明作品、测试或结论还不能覆盖什么。诚实的局限不会被自动扣分。"
          value={claim.payload.limitation}
        />
      </EvidenceCard>

      <EvidenceCard
        actionId="defense"
        active={claim.status !== "draft" && defense.status === "draft"}
        description="可在伴学场景请问问针对你的主张或局限追问。若AI暂时不可用，可由教师给题或使用系统追问模板，任务不会被阻塞。"
        error={defense.error}
        eyebrow="3 · Defense"
        onSubmit={() => defense.submit()}
        saveState={defense.saveState}
        status={defense.status}
        title="完成一次证据答辩"
      >
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
          <p className="flex items-center gap-2 font-bold">
            <ShieldQuestion size={16} />
            无AI时可用的证据追问模板
          </p>
          <p className="mt-1 leading-6">
            “你引用的证据为什么足以支持这项主张？如果测试对象或条件改变，结论还成立吗？”
          </p>
          {!defense.payload.question ? (
            <button
              className="mt-2 text-xs font-bold text-violet-800 underline underline-offset-2"
              onClick={() =>
                defense.setPayload((value) => ({
                  ...value,
                  question: "你引用的证据为什么足以支持这项主张？如果测试对象或条件改变，结论还成立吗？",
                }))}
              type="button"
            >
              使用该模板
            </button>
          ) : null}
        </div>
        <Field
          label="追问"
          onChange={(question) =>
            defense.setPayload((value) => ({ ...value, question }))}
          placeholder="记录问问或教师提出的真实问题。"
          value={defense.payload.question}
        />
        <Field
          label="你的回应"
          onChange={(response) =>
            defense.setPayload((value) => ({ ...value, response }))}
          placeholder="直接回应问题，承认证据边界，并说明后续如何验证。"
          value={defense.payload.response}
        />
        <div>
          <p className="mb-2 text-sm font-semibold text-stone-800">引用回应所依据的项目证据</p>
          <EvidenceTimeline
            items={[
              ...eligibleEvidence,
              {
                id: finalArtifactId,
                title: "最终作品",
                kind: "final-artifact",
                stageKey: "showcase",
              },
            ]}
            onToggle={(id) =>
              toggleEvidence(defense.payload.evidenceIds, id, (evidenceIds) =>
                defense.setPayload((value) => ({ ...value, evidenceIds })))}
            selectedIds={defense.payload.evidenceIds}
          />
        </div>
      </EvidenceCard>

      <PracticeTimer />
    </div>
  );
}

function PracticeTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running]);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-stone-900">
            <Clock3 size={17} />
            自主彩排计时
          </h2>
          <p className="mt-1 text-xs text-stone-500">计时只帮助彩排，不计入完成状态或评分。</p>
        </div>
        <time className="font-mono text-3xl font-bold tabular-nums" data-testid="presentation-timer">
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:
          {String(seconds % 60).padStart(2, "0")}
        </time>
        <div className="flex gap-2">
          <PrimaryButton
            onClick={() => setRunning((value) => !value)}
            size="sm"
            tone="teal"
            type="button"
            variant="outline"
          >
            {running ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
            {running ? "暂停" : "开始"}
          </PrimaryButton>
          <PrimaryButton
            onClick={() => {
              setRunning(false);
              setSeconds(0);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <RotateCcw size={15} />
            重置
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}
