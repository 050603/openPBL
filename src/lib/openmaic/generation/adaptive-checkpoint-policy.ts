import type { SceneOutline } from "@openmaic/lib/types/generation";

function isStudentKnowledgeScene(outline: SceneOutline): boolean {
  return outline.stageKey === "ai-learning" && outline.audience === "student";
}

function overlapsKnowledge(left: SceneOutline, right: SceneOutline): boolean {
  const rightIds = new Set(right.knowledgePointIds ?? []);
  return (left.knowledgePointIds ?? []).some((id) => rightIds.has(id));
}

/**
 * Guarantees that every contiguous AI-learning knowledge block ends in a
 * short assessment. The LLM still designs the course; this policy repairs the
 * common failure mode where it postpones all questions until the module end.
 */
export function ensureAdaptiveCheckpointQuizzes(
  outlines: readonly SceneOutline[],
): SceneOutline[] {
  const result: SceneOutline[] = [];
  for (let index = 0; index < outlines.length; index += 1) {
    const outline = outlines[index];
    result.push(
      isStudentKnowledgeScene(outline) && outline.type === "quiz"
        ? {
            ...outline,
            quizConfig: {
              ...(outline.quizConfig ?? {
                difficulty: "medium" as const,
                questionTypes: ["single" as const],
              }),
              questionCount: 3,
            },
          }
        : { ...outline },
    );
    if (
      !isStudentKnowledgeScene(outline)
      || outline.type === "quiz"
      || (outline.knowledgePointIds?.length ?? 0) === 0
    ) {
      continue;
    }

    const nextStudentIndex = outlines.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index && isStudentKnowledgeScene(candidate),
    );
    const nextStudent = nextStudentIndex >= 0 ? outlines[nextStudentIndex] : undefined;
    const continuesSameBlock =
      nextStudent
      && nextStudent.type !== "quiz"
      && overlapsKnowledge(outline, nextStudent);
    const followedByMatchingQuiz =
      nextStudent?.type === "quiz" && overlapsKnowledge(outline, nextStudent);
    if (continuesSameBlock || followedByMatchingQuiz) continue;

    const knowledgePointIds = [...new Set(outline.knowledgePointIds ?? [])];
    result.push({
      ...outline,
      id: `checkpoint-${outline.id}`,
      type: "quiz",
      title: `${outline.title} · 节点小测`,
      description: "用约 3 道聚焦题检验刚完成知识模块的理解；错题进入解析与教师统计，掌握良好时可获得额外应用或拓展资源。",
      keyPoints: [
        "只检验刚完成的小节知识",
        "保留逐题正误作为个性化资源编排证据",
        "答错查看解析，不重复讲授相同内容",
      ],
      teachingObjective: `检验学生是否掌握${knowledgePointIds.join("、")}，并形成下一步学习路径证据。`,
      order: outline.order + 0.5,
      detailKind: "knowledge-explanation",
      knowledgePointIds,
      targetDurationSec: 120,
      estimatedDuration: 120,
      ttsPolicy: "target-duration",
      quizConfig: {
        questionCount: 3,
        difficulty: "medium",
        questionTypes: ["single", "true_false"],
      },
    });
  }
  return result.map((outline, index) => ({ ...outline, order: index }));
}
