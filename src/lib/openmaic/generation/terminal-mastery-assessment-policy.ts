import type { SceneOutline } from "@openmaic/lib/types/generation";

function isStudentKnowledgeScene(outline: SceneOutline): boolean {
  return (
    outline.stageKey === "ai-learning" && outline.audience === "student"
  ) || (!outline.stageKey && !outline.audience);
}

/**
 * Normalizes generated student teaching pages to one terminal mastery
 * assessment. Earlier quizzes are folded into the final assessment so the
 * main lesson remains explanation -> practice -> feedback, not test-taking.
 */
export function ensureTerminalMasteryAssessment(
  outlines: readonly SceneOutline[],
): SceneOutline[] {
  const studentKnowledge = outlines.filter(isStudentKnowledgeScene);
  if (studentKnowledge.length === 0) return [...outlines];

  const quizzes = studentKnowledge.filter((outline) => outline.type === "quiz");
  const taughtScenes = studentKnowledge.filter((outline) => outline.type !== "quiz");
  const knowledgePointIds = Array.from(new Set(
    taughtScenes.flatMap((outline) => outline.knowledgePointIds ?? []),
  ));
  if (knowledgePointIds.length === 0) return [...outlines];

  const anchor = taughtScenes.at(-1)!;
  const taughtDurationSec = taughtScenes.reduce(
    (sum, scene) => sum + (scene.targetDurationSec ?? scene.estimatedDuration ?? 0),
    0,
  );
  const existingQuizDurationSec = quizzes.reduce(
    (sum, quiz) => sum + (quiz.targetDurationSec ?? quiz.estimatedDuration ?? 0),
    0,
  );
  // quiz / (teaching + quiz) <= 20%, therefore quiz <= teaching / 4.
  const assessmentBudgetSec = taughtDurationSec > 0
    ? Math.max(60, Math.floor(taughtDurationSec / 4))
    : 3 * 60;
  const mergedQuiz: SceneOutline = {
    ...anchor,
    id: quizzes.at(-1)?.id || `mastery-assessment-${anchor.id || "course"}`,
    type: "quiz",
    title: "主课达标测",
    description: "在完整讲解与互动练习后，集中检验本节课各知识点的理解与迁移；每题需标注对应知识点，供课后拓展资源进行个性化选择。",
    keyPoints: [
      "覆盖本节课已经完整讲解的核心知识点",
      "同时检查概念理解、应用与迁移",
      "只进行一次计分测验，不在测验后追加新的测验",
    ],
    teachingObjective: "形成各知识点的终结性掌握证据，并据此选择不计分的课后拓展资源。",
    detailKind: "knowledge-explanation",
    knowledgePointIds,
    targetDurationSec: Math.min(
      8 * 60,
      assessmentBudgetSec,
      existingQuizDurationSec || 5 * 60,
    ),
    ttsPolicy: "target-duration",
    quizConfig: {
      difficulty: quizzes.at(-1)?.quizConfig?.difficulty ?? "medium",
      questionTypes: quizzes.at(-1)?.quizConfig?.questionTypes?.length
        ? quizzes.at(-1)!.quizConfig!.questionTypes
        : ["single", "multiple", "true_false"],
      questionCount: Math.max(4, Math.min(8, knowledgePointIds.length + 2)),
    },
    widgetType: undefined,
    widgetOutline: undefined,
    interactiveConfig: undefined,
    mediaGenerations: undefined,
    suggestedImageIds: undefined,
  };

  const withoutStudentQuizzes = outlines.filter(
    (outline) => !(isStudentKnowledgeScene(outline) && outline.type === "quiz"),
  );
  const lastStudentIndex = withoutStudentQuizzes.reduce(
    (last, outline, index) => isStudentKnowledgeScene(outline) ? index : last,
    -1,
  );
  withoutStudentQuizzes.splice(lastStudentIndex + 1, 0, mergedQuiz);
  return withoutStudentQuizzes.map((outline, index) => ({ ...outline, order: index }));
}
