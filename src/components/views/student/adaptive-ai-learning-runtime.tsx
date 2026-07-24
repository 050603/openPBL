"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenCheck, CheckCircle2, Loader2, Route, X } from "lucide-react";
import type { Scene } from "@openmaic/lib/types/stage";
import { StudentStageHost } from "@/components/openmaic-bridge/student-stage-host";
import {
  calculateAdaptiveRemainingBudgetSec,
  evaluateAdaptiveBranchDecision,
  resolveAdaptiveSceneIdentity,
  scoreAdaptiveAssessment,
} from "@/lib/adaptive-learning";
import type {
  AdaptiveBranchRun,
  Course,
  StudentAdaptiveLearningState,
} from "@/lib/session/types";

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
  const initialState =
    course.aiLearningProgress?.[studentId]?.adaptiveLearning ?? {
      evidence: [],
      branchRuns: [],
      microLessons: [],
    };
  const [adaptiveState, setAdaptiveState] =
    useState<StudentAdaptiveLearningState>(initialState);
  const [branchOverlay, setBranchOverlay] = useState<{
    run: AdaptiveBranchRun;
    title: string;
  }>();
  const activeBranchRef = useRef(false);
  const remoteAdaptiveState = course.aiLearningProgress?.[studentId]?.adaptiveLearning;

  useEffect(() => {
    if (!remoteAdaptiveState) return;
    queueMicrotask(() => {
      setAdaptiveState((current) => ({
        ...current,
        enabled: remoteAdaptiveState.enabled,
        tier: remoteAdaptiveState.tier,
        tierSource: remoteAdaptiveState.tierSource,
        tierUpdatedAt: remoteAdaptiveState.tierUpdatedAt,
      }));
    });
  }, [remoteAdaptiveState]);

  async function persistState(body: Record<string, unknown>) {
    const response = await fetch("/api/adaptive-learning/state", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-OpenPBL-Role": "student" },
      body: JSON.stringify({ courseId: course.id, studentId, ...body }),
    });
    const payload = await response.json() as {
      state?: StudentAdaptiveLearningState;
      error?: string;
    };
    if (!response.ok || !payload.state) throw new Error(payload.error || "学习路径保存失败");
    setAdaptiveState(payload.state);
    return payload.state;
  }

  async function handlePretestSubmit(answers: Record<string, number>) {
    await persistState({ action: "submit-pretest", answers });
  }

  async function handleSceneComplete(detail: {
    scene: Scene;
    quizScore?: number;
  }) {
    if (!plan || adaptiveState.enabled === false || activeBranchRef.current) return;
    const sceneIdentity = resolveAdaptiveSceneIdentity(detail.scene);
    const anchorKnowledgePointIds = detail.scene.knowledgePointIds ?? [];
    let evidenceState = adaptiveState;
    if (detail.scene.type === "quiz" && typeof detail.quizScore === "number") {
      evidenceState = await persistState({
        action: "record-node-assessment",
        evidence: {
          id: `evidence-node-${sceneIdentity.stableSceneId}`,
          source: "node-quiz",
          score: detail.quizScore,
          occurredAt: new Date().toISOString(),
          sceneId: sceneIdentity.stableSceneId,
          knowledgePointIds: anchorKnowledgePointIds,
        },
      }).catch(() => adaptiveState);
    }
    const evaluation = evaluateAdaptiveBranchDecision({
      plan,
      state: evidenceState,
      nodeQuizScore: detail.quizScore,
      anchorKnowledgePointIds,
      completedSceneId: sceneIdentity.stableSceneId,
      runtimeSceneId: sceneIdentity.runtimeSceneId,
      completedSceneTitle: detail.scene.title,
      remainingBudgetSec: calculateAdaptiveRemainingBudgetSec(plan, evidenceState),
    });
    if (evaluation.evaluations.length > 0) {
      await persistState({
        action: "record-trigger-evaluations",
        evaluations: evaluation.evaluations,
      }).catch(() => evidenceState);
    }
    const decision = evaluation.decision;
    if (decision.action !== "insert") return;

    const preparedClassroomId =
      decision.branch.preparedResource?.status === "ready"
        ? decision.branch.preparedResource.classroomId
        : undefined;
    // Published adaptive paths are an offline resource pool. The classroom
    // runtime never starts a generation job; a missing asset remains visible
    // in teacher audit and the learner continues the main course.
    if (!preparedClassroomId) return;

    activeBranchRef.current = true;
    const run: AdaptiveBranchRun = {
      id: `branch-run-${Date.now().toString(36)}`,
      branchOutlineId: decision.branch.id,
      kind: decision.branch.kind,
      status: "ready",
      classroomId: preparedClassroomId,
      reason: decision.reason,
      createdAt: new Date().toISOString(),
    };
    setBranchOverlay({
      run,
      title: decision.branch.title,
    });
    try {
      await persistState({ action: "upsert-branch-run", run });
    } catch (error) {
      activeBranchRef.current = false;
      setBranchOverlay(undefined);
      console.warn("Failed to open prepared adaptive branch", error);
    }
  }

  async function closeBranch() {
    const overlay = branchOverlay;
    setBranchOverlay(undefined);
    activeBranchRef.current = false;
    if (!overlay || overlay.run.status !== "ready") return;
    await persistState({
      action: "upsert-branch-run",
      run: {
        ...overlay.run,
        status: "completed",
        completedAt: new Date().toISOString(),
      },
    }).catch(() => undefined);
  }

  if (
    plan?.enabled
    && plan.status === "teacher-confirmed"
    && adaptiveState.enabled !== false
    && !adaptiveState.pretestCompletedAt
  ) {
    return (
      <AdaptivePretest
        plan={plan}
        onSubmit={handlePretestSubmit}
      />
    );
  }

  return (
    <>
      {!branchOverlay ? (
        <StudentStageHost
          backHref={backHref}
          classroomId={classroomId}
          className="rounded-none border-0"
          courseId={course.id}
          onSceneComplete={(detail) => void handleSceneComplete(detail)}
          studentId={studentId}
          studentName={studentName}
          variant={variant}
        />
      ) : null}
      {!branchOverlay && adaptiveState.enabled !== false && adaptiveState.tier ? (
        <div className="flex items-center gap-2 border-t border-cyan-100 bg-cyan-50/70 px-4 py-2 text-xs text-cyan-950">
          <Route size={14} />
          <span className="font-bold">
            当前学习路径：
            {adaptiveState.tier === "foundation"
              ? "基础巩固"
              : adaptiveState.tier === "advanced"
                ? "拓展挑战"
                : "标准进阶"}
          </span>
          <span className="text-cyan-800">
            {adaptiveState.tierSource === "teacher" ? "教师已人工调整" : "由课前前测判定"}
            · 系统会在已配置触发点按需调整。
          </span>
        </div>
      ) : null}
      {branchOverlay ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-stone-950/60 p-3 backdrop-blur-sm">
          <div className="flex h-[min(88vh,900px)] w-[min(1120px,96vw)] flex-col overflow-hidden rounded-[14px] border border-white/20 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-[7px] bg-cyan-950 text-white">
                  <Route size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">{branchOverlay.title}</h3>
                  <p className="text-[11px] text-stone-500">已自然插入当前知识锚点，完成后返回主课程</p>
                </div>
              </div>
              <button
                aria-label="返回主课程"
                className="grid h-8 w-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100"
                onClick={() => void closeBranch()}
                type="button"
              >
                <X size={17} />
              </button>
            </div>
            {branchOverlay.run.classroomId ? (
              <StudentStageHost
                backHref={backHref}
                classroomId={branchOverlay.run.classroomId}
                className="min-h-0 flex-1"
                standalone
                variant="embedded"
              />
            ) : (
              <div className="grid flex-1 place-items-center bg-stone-50">
                <p className="text-sm font-bold text-stone-700">
                  该分支资源尚未发布，已返回主课程。
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
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
  const complete = plan.pretest.questions.every((question) => answers[question.id] !== undefined);
  const previewScore = useMemo(
    () => complete ? scoreAdaptiveAssessment(plan.pretest.questions, answers) : undefined,
    [answers, complete, plan.pretest.questions],
  );

  return (
    <div className="min-h-[720px] bg-[radial-gradient(circle_at_top_left,#cffafe_0,transparent_32%),linear-gradient(145deg,#f8fafc,#fff)] p-5 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-cyan-950 text-white">
            <BookOpenCheck size={21} />
          </span>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-800">
              开课前 · 约 {plan.pretest.estimatedMinutes} 分钟
            </p>
            <h2 className="font-editorial mt-1 text-2xl font-semibold text-stone-950">
              {plan.pretest.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">{plan.pretest.introduction}</p>
          </div>
        </div>
        <div className="mt-6 space-y-4">
          {plan.pretest.questions.map((question, questionIndex) => (
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
              ? `已完成 ${plan.pretest.questions.length} 题，系统将据此安排学习路径。`
              : `还需完成 ${plan.pretest.questions.length - Object.keys(answers).length} 题。`}
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
            进入主课程
          </button>
        </div>
        {error ? <p className="mt-2 text-right text-xs text-rose-700">{error}</p> : null}
        {previewScore !== undefined ? <span className="sr-only">当前得分 {previewScore}</span> : null}
      </div>
    </div>
  );
}
