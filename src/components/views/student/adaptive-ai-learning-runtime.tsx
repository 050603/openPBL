"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenCheck, CheckCircle2, Loader2 } from "lucide-react";
import type { Scene } from "@openmaic/lib/types/stage";
import {
  StudentStageHost,
  prefetchAdaptiveClassroom,
  type AdaptiveSceneInsertion,
} from "@/components/openmaic-bridge/student-stage-host";
import {
  calculateAdaptiveRemainingBudgetSec,
  deriveAdaptiveCheckpointSceneIds,
  evaluateAdaptiveBranchDecision,
  resolveAdaptiveSceneIdentity,
} from "@/lib/adaptive-learning";
import type {
  AdaptiveBranchOutline,
  AdaptiveBranchRun,
  Course,
  StudentAdaptiveLearningState,
} from "@/lib/session/types";
import { readSubmittedState } from "@openmaic/lib/quiz/persistence";
import { deriveClassroomTimingSnapshot } from "@/lib/classroom/timing";

type QueuedResource = {
  branch: AdaptiveBranchOutline;
  run: Omit<AdaptiveBranchRun, "classroomId"> & { classroomId: string };
  placement: AdaptiveSceneInsertion["placement"];
  anchorSceneId?: string;
};

export function AdaptiveAiLearningRuntime({
  course,
  classroomId,
  studentId,
  studentName,
  backHref,
  variant = "embedded",
}: {
  course: Course;
  classroomId: string;
  studentId: string;
  studentName: string;
  backHref: string;
  variant?: "embedded" | "fullscreen";
}) {
  const plan = course.content.adaptiveLearningPlan;
  const initialState = course.aiLearningProgress?.[studentId]?.adaptiveLearning ?? {
    evidence: [],
    branchRuns: [],
    microLessons: [],
  };
  const [adaptiveState, setAdaptiveState] = useState<StudentAdaptiveLearningState>(initialState);
  const [insertedResources, setInsertedResources] = useState<QueuedResource[]>([]);
  const switchingRef = useRef(false);
  const checkpointSceneIds = useMemo(
    () => new Set(deriveAdaptiveCheckpointSceneIds(course.content._openmaicSceneOutlines ?? [])),
    [course.content._openmaicSceneOutlines],
  );
  const remoteAdaptiveState = course.aiLearningProgress?.[studentId]?.adaptiveLearning;
  const preparedClassroomIds = useMemo(
    () => Array.from(new Set([
      ...(plan?.branches.flatMap((branch) =>
        branch.preparedResource?.status === "ready" &&
        branch.preparedResource.classroomId
          ? [branch.preparedResource.classroomId]
          : [],
      ) ?? []),
      ...adaptiveState.branchRuns.flatMap((run) =>
        run.status === "ready" && run.classroomId ? [run.classroomId] : [],
      ),
      ...adaptiveState.microLessons.flatMap((lesson) =>
        lesson.status === "ready" && lesson.classroomId
          ? [lesson.classroomId]
          : [],
      ),
    ])),
    [adaptiveState.branchRuns, adaptiveState.microLessons, plan],
  );
  const adaptiveInsertions = useMemo<AdaptiveSceneInsertion[]>(
    () => {
      const insertions = new Map<string, AdaptiveSceneInsertion>();
      for (const resource of insertedResources) {
        insertions.set(resource.run.id, {
          id: resource.run.id,
          classroomId: resource.run.classroomId,
          placement: resource.placement,
          anchorSceneId: resource.anchorSceneId,
        });
      }
      for (const run of adaptiveState.branchRuns) {
        if (run.status !== "ready" || !run.classroomId || insertions.has(run.id)) {
          continue;
        }
        const branch = plan?.branches.find((item) => item.id === run.branchOutlineId);
        insertions.set(run.id, {
          id: run.id,
          classroomId: run.classroomId,
          placement: branch?.trigger?.placement === "before-main-course"
            ? "before-current"
            : "after-current",
        });
      }
      for (const lesson of adaptiveState.microLessons) {
        if (lesson.status !== "ready" || !lesson.classroomId) continue;
        const id = `micro-lesson:${lesson.id}`;
        insertions.set(id, {
          id,
          classroomId: lesson.classroomId,
          placement: "after-current",
        });
      }
      return [...insertions.values()];
    },
    [adaptiveState.branchRuns, adaptiveState.microLessons, insertedResources, plan],
  );

  useEffect(() => {
    for (const preparedClassroomId of preparedClassroomIds) {
      void prefetchAdaptiveClassroom(preparedClassroomId).catch(() => undefined);
    }
  }, [preparedClassroomIds]);

  useEffect(() => {
    if (!remoteAdaptiveState) return;
    queueMicrotask(() => setAdaptiveState(remoteAdaptiveState));
  }, [remoteAdaptiveState]);

  function remainingAdaptiveBudgetSec(state: StudentAdaptiveLearningState): number {
    if (!plan) return 0;
    const timing = course.uiState?.classroomTiming;
    const runtimeStageRemainingSec =
      timing?.activeStageKey === "ai-learning"
        ? deriveClassroomTimingSnapshot(
            timing,
            new Date().toISOString(),
          ).activeStage?.remainingSec
        : undefined;
    return calculateAdaptiveRemainingBudgetSec(
      plan,
      state,
      runtimeStageRemainingSec,
    );
  }

  async function persistState(body: Record<string, unknown>) {
    const response = await fetch("/api/adaptive-learning/state", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-OpenPBL-Role": "student" },
      body: JSON.stringify({ courseId: course.id, studentId, ...body }),
    });
    const payload = await response.json() as { state?: StudentAdaptiveLearningState; error?: string };
    if (!response.ok || !payload.state) throw new Error(payload.error || "学习路径保存失败");
    setAdaptiveState(payload.state);
    return payload.state;
  }

  function toQueuedResource(
    branch: AdaptiveBranchOutline,
    reason: string,
    placement: AdaptiveSceneInsertion["placement"],
    anchorSceneId?: string,
  ): QueuedResource | null {
    const preparedClassroomId = branch.preparedResource?.status === "ready"
      ? branch.preparedResource.classroomId
      : undefined;
    if (!preparedClassroomId) return null;
    return {
      branch,
      run: {
        id: `resource-run-${branch.id}-${Date.now().toString(36)}`,
        branchOutlineId: branch.id,
        kind: branch.kind,
        status: "ready",
        classroomId: preparedClassroomId,
        reason,
        createdAt: new Date().toISOString(),
      },
      placement,
      anchorSceneId,
    };
  }

  async function insertResource(resource: QueuedResource) {
    switchingRef.current = true;
    try {
      await persistState({ action: "upsert-branch-run", run: resource.run });
      setInsertedResources((current) =>
        current.some((item) => item.run.id === resource.run.id)
          ? current
          : [...current, resource],
      );
    } finally {
      switchingRef.current = false;
    }
  }

  async function preparePreCourseResources(state: StudentAdaptiveLearningState) {
    if (!plan) return;
    let simulatedState = state;
    let budget = remainingAdaptiveBudgetSec(simulatedState);
    const queue: QueuedResource[] = [];
    for (const branch of plan.branches.filter((item) => item.enabled !== false && item.trigger?.placement === "before-main-course")) {
      const result = evaluateAdaptiveBranchDecision({
        plan,
        state: simulatedState,
        anchorKnowledgePointIds: [],
        candidateBranchIds: [branch.id],
        phase: "pre-course",
        remainingBudgetSec: budget,
      });
      if (result.evaluations.length) {
        await persistState({
          action: "record-trigger-evaluations",
          evaluations: result.evaluations,
        }).catch(() => simulatedState);
      }
      if (result.decision.action !== "insert") continue;
      const resource = toQueuedResource(
        result.decision.branch,
        result.decision.reason,
        "before-current",
      );
      if (!resource) continue;
      queue.push(resource);
      simulatedState = {
        ...simulatedState,
        branchRuns: [...simulatedState.branchRuns, resource.run],
      };
      budget = remainingAdaptiveBudgetSec(simulatedState);
    }
    if (!queue.length) return;
    for (const resource of queue) {
      await persistState({ action: "upsert-branch-run", run: resource.run });
    }
    setInsertedResources((current) => [...current, ...queue]);
  }

  async function handlePretestSubmit(answers: Record<string, number>) {
    const nextState = await persistState({ action: "submit-pretest", answers });
    await preparePreCourseResources(nextState);
  }

  async function handleMainSceneComplete(detail: { scene: Scene; quizScore?: number }) {
    if (!plan || adaptiveState.enabled === false || switchingRef.current) return;
    const sceneIdentity = resolveAdaptiveSceneIdentity(detail.scene);
    const anchorKnowledgePointIds = detail.scene.knowledgePointIds ?? [];
    const submittedQuiz = readSubmittedState(sceneIdentity.runtimeSceneId);
    const questionResults = submittedQuiz?.kind === "reviewing"
      ? submittedQuiz.results.map((result) => ({ questionId: result.questionId, correct: result.correct }))
      : [];
    let evidenceState = adaptiveState;
    if (typeof detail.quizScore === "number") {
      const weakKnowledgePointIds = detail.quizScore < 100 ? anchorKnowledgePointIds : [];
      const masteredKnowledgePointIds = detail.quizScore >= (plan.thresholds.enrichmentMasteryMin ?? 80)
        ? anchorKnowledgePointIds
        : [];
      evidenceState = await persistState({
        action: "record-node-assessment",
        evidence: {
          id: `evidence-node-${sceneIdentity.stableSceneId}`,
          source: "node-quiz",
          score: detail.quizScore,
          occurredAt: new Date().toISOString(),
          sceneId: sceneIdentity.stableSceneId,
          knowledgePointIds: anchorKnowledgePointIds,
          questionResults,
          weakKnowledgePointIds,
          masteredKnowledgePointIds,
        },
      }).catch(() => adaptiveState);
    }
    // Only module mastery can add a resource here. Incorrect answers remain in
    // the quiz review/analysis flow and are surfaced to teacher analytics.
    const evaluation = evaluateAdaptiveBranchDecision({
      plan,
      state: evidenceState,
      nodeQuizScore: detail.quizScore,
      anchorKnowledgePointIds,
      completedSceneId: sceneIdentity.stableSceneId,
      runtimeSceneId: sceneIdentity.runtimeSceneId,
      completedSceneTitle: detail.scene.title,
      questionResults,
      isAutomaticCheckpoint: checkpointSceneIds.has(sceneIdentity.stableSceneId),
      phase: "after-module",
      remainingBudgetSec: remainingAdaptiveBudgetSec(evidenceState),
    });
    if (evaluation.evaluations.length) {
      await persistState({
        action: "record-trigger-evaluations",
        evaluations: evaluation.evaluations,
      }).catch(() => evidenceState);
    }
    if (evaluation.decision.action !== "insert") return;
    const resource = toQueuedResource(
      evaluation.decision.branch,
      evaluation.decision.reason,
      "after-current",
      sceneIdentity.runtimeSceneId,
    );
    if (resource) await insertResource(resource);
  }

  async function handleResourceComplete(scene: Scene) {
    const adaptiveScene = scene as Scene & {
      openpblAdaptiveInsertionId?: string;
      openpblAdaptiveLastScene?: boolean;
    };
    if (
      !adaptiveScene.openpblAdaptiveInsertionId ||
      !adaptiveScene.openpblAdaptiveLastScene ||
      switchingRef.current
    ) return;
    const insertionId = adaptiveScene.openpblAdaptiveInsertionId;
    const resource = insertedResources.find((item) => item.run.id === insertionId);
    switchingRef.current = true;
    try {
      if (resource) {
        await persistState({
          action: "upsert-branch-run",
          run: {
            ...resource.run,
            status: "completed",
            completedAt: new Date().toISOString(),
          },
        });
        return;
      }
      const persistedRun = adaptiveState.branchRuns.find(
        (run) => run.id === insertionId && run.status === "ready",
      );
      if (persistedRun) {
        await persistState({
          action: "upsert-branch-run",
          run: {
            ...persistedRun,
            status: "completed",
            completedAt: new Date().toISOString(),
          },
        });
        return;
      }
      if (insertionId.startsWith("micro-lesson:")) {
        await persistState({
          action: "complete-micro-lesson",
          lessonId: insertionId.slice("micro-lesson:".length),
        });
      }
    } catch {
      // The ready item stays in the persisted queue and can be retried safely.
    } finally {
      switchingRef.current = false;
    }
  }

  if (
    plan?.enabled
    && plan.status === "teacher-confirmed"
    && adaptiveState.enabled !== false
    && !adaptiveState.pretestCompletedAt
  ) {
    return <AdaptivePretest plan={plan} onSubmit={handlePretestSubmit} />;
  }

  return (
    <div className="relative">
      <span className="sr-only" aria-live="polite">
        Adaptive resources play in the main course player.
      </span>
      <StudentStageHost
        adaptiveInsertions={adaptiveInsertions}
        backHref={backHref}
        classroomId={classroomId}
        className="rounded-none border-0"
        courseId={course.id}
        knowledgeGraph={course.content.knowledgeGraph}
        knowledgePoints={course.content.knowledgePoints ?? []}
        onSceneComplete={(detail) => {
          if (
            (detail.scene as Scene & { openpblAdaptiveInsertionId?: string })
              .openpblAdaptiveInsertionId
          ) {
            void handleResourceComplete(detail.scene);
          } else {
            void handleMainSceneComplete(detail);
          }
        }}
        prefetchClassroomIds={preparedClassroomIds}
        studentId={studentId}
        studentName={studentName}
        variant={variant}
      />
    </div>
  );
}

function AdaptivePretest({
  plan,
  onSubmit,
}: {
  plan: NonNullable<Course["content"]["adaptiveLearningPlan"]>;
  onSubmit: (answers: Record<string, number>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const questions = plan.pretest.questions.slice(0, 5);
  const complete = questions.every((question) => answers[question.id] !== undefined);

  return (
    <div className="min-h-[720px] bg-[radial-gradient(circle_at_top_left,#cffafe_0,transparent_32%),linear-gradient(145deg,#f8fafc,#fff)] p-5 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-cyan-950 text-white">
            <BookOpenCheck size={21} />
          </span>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-800">
              开课前 · 约 {plan.pretest.estimatedMinutes} 分钟 · 最多 5 题
            </p>
            <h2 className="font-editorial mt-1 text-2xl font-semibold text-stone-950">{plan.pretest.title}</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">{plan.pretest.introduction}</p>
          </div>
        </div>
        <div className="mt-6 space-y-4">
          {questions.map((question, questionIndex) => (
            <fieldset className="rounded-[10px] border border-stone-200 bg-white p-4 shadow-sm" key={question.id}>
              <legend className="px-1 text-sm font-bold text-stone-900">
                {questionIndex + 1}. {question.prompt}
              </legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {question.options.map((option, optionIndex) => {
                  const selected = answers[question.id] === optionIndex;
                  return (
                    <button
                      className={`rounded-[8px] border px-3 py-2.5 text-left text-xs leading-5 transition ${
                        selected
                          ? "border-cyan-700 bg-cyan-50 font-bold text-cyan-950 ring-1 ring-cyan-700"
                          : "border-stone-200 text-stone-600 hover:border-cyan-300 hover:bg-cyan-50/40"
                      }`}
                      key={`${question.id}-${optionIndex}`}
                      onClick={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))}
                      type="button"
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-cyan-200 bg-white p-4">
          <p className="text-xs text-stone-500">
            {complete
              ? "检查已完成。系统只会在确有必要时，于主课开始前连续播放相应回顾内容。"
              : `还需完成 ${questions.length - Object.keys(answers).length} 题。`}
          </p>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-cyan-950 px-5 text-sm font-bold text-white hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!complete || submitting}
            onClick={async () => {
              setSubmitting(true);
              setError(undefined);
              try {
                await onSubmit(answers);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "提交失败");
              } finally {
                setSubmitting(false);
              }
            }}
            type="button"
          >
            {submitting ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
            开始学习
          </button>
        </div>
        {error ? <p className="mt-2 text-right text-xs text-rose-700">{error}</p> : null}
      </div>
    </div>
  );
}
