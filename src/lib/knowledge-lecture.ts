import type { SceneOutline } from "@openmaic/lib/types/generation";
import { allocateLectureBudget } from "@/lib/classroom/knowledge-lecture-budget";
import type {
  Course,
  KnowledgeGraph,
  KnowledgeLectureAttempt,
  KnowledgeLectureSection,
  KnowledgePoint,
  OpenMaicSceneOutlineSnapshot,
  StudentAiProgress,
} from "@/lib/session/types";

type LectureOutline = SceneOutline & OpenMaicSceneOutlineSnapshot;

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function connectedKnowledgeGroups(
  knowledgePoints: readonly KnowledgePoint[],
  knowledgeGraph?: KnowledgeGraph,
): string[][] {
  const orderedIds = unique(knowledgePoints.map((point) => point.id));
  if (!orderedIds.length) return [];
  const allowed = new Set(orderedIds);
  const neighbors = new Map(orderedIds.map((id) => [id, new Set<string>()]));
  for (const edge of knowledgeGraph?.edges ?? []) {
    if (!allowed.has(edge.source) || !allowed.has(edge.target)) continue;
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }
  for (const point of knowledgePoints) {
    for (const relatedId of point.relatedIds ?? []) {
      if (!allowed.has(relatedId)) continue;
      neighbors.get(point.id)?.add(relatedId);
      neighbors.get(relatedId)?.add(point.id);
    }
  }

  const remaining = new Set(orderedIds);
  const groups: string[][] = [];
  while (remaining.size) {
    const seed = orderedIds.find((id) => remaining.has(id));
    if (!seed) break;
    const group = [seed];
    remaining.delete(seed);
    while (group.length < 3) {
      const next = orderedIds.find((id) =>
        remaining.has(id) && group.some((member) => neighbors.get(member)?.has(id)),
      );
      if (!next) break;
      group.push(next);
      remaining.delete(next);
    }
    groups.push(group);
  }
  return groups;
}

function sectionTitle(
  order: number,
  knowledgePointIds: readonly string[],
  pointNames: ReadonlyMap<string, string>,
): string {
  const names = knowledgePointIds.map((id) => pointNames.get(id)).filter(Boolean) as string[];
  return names.length
    ? `第 ${order + 1} 节 · ${names.join("与")}`
    : `第 ${order + 1} 节 · 核心知识`;
}

/**
 * Turns an AI-learning outline into a stable section sequence. Every section
 * ends in a 2–3 question short-answer check with a 2–5 minute budget.
 */
export function organizeKnowledgeLectureOutlines(
  outlines: readonly LectureOutline[],
  input: {
    totalDurationSec: number;
    knowledgePoints: readonly KnowledgePoint[];
    knowledgeGraph?: KnowledgeGraph;
  },
): { outlines: LectureOutline[]; sections: KnowledgeLectureSection[] } {
  const teaching = outlines.filter((outline) => outline.type !== "quiz");
  if (!teaching.length) return { outlines: [...outlines], sections: [] };

  const pointNames = new Map(input.knowledgePoints.map((point) => [point.id, point.name]));
  const groups = connectedKnowledgeGroups(input.knowledgePoints, input.knowledgeGraph);
  const effectiveGroups = groups.length ? groups : [unique(teaching.flatMap((item) => item.knowledgePointIds ?? []))];
  const assigned = effectiveGroups.map(() => [] as LectureOutline[]);

  teaching.forEach((outline, outlineIndex) => {
    const ids = new Set(outline.knowledgePointIds ?? []);
    const overlaps = effectiveGroups.map((group) => group.filter((id) => ids.has(id)).length);
    const bestOverlap = Math.max(...overlaps);
    const balancedFallback = Math.min(
      effectiveGroups.length - 1,
      Math.floor((outlineIndex * effectiveGroups.length) / Math.max(1, teaching.length)),
    );
    const target = bestOverlap > 0 && ids.size < input.knowledgePoints.length
      ? overlaps.findIndex((value) => value === bestOverlap)
      : balancedFallback;
    assigned[Math.max(0, target)].push(outline);
  });

  const nonEmpty = assigned
    .map((scenes, index) => ({ scenes, knowledgePointIds: effectiveGroups[index] ?? [] }))
    .filter((entry) => entry.scenes.length > 0);
  const totalSeconds = Math.round(input.totalDurationSec);
  // Never add quiz time on top of the approved lecture budget. If necessary,
  // combine adjacent sections, preserving every teaching page and knowledge ID.
  while (nonEmpty.length > 1 && totalSeconds < nonEmpty.length * 120 + teaching.length * 45) {
    const last = nonEmpty.pop()!;
    const previous = nonEmpty.at(-1)!;
    previous.scenes.push(...last.scenes);
    previous.knowledgePointIds = unique([...previous.knowledgePointIds, ...last.knowledgePointIds]);
  }
  const preferredQuizDurations = nonEmpty.map((entry) => (entry.knowledgePointIds.length >= 3 ? 240 : 180));
  const quizDurations = allocateLectureBudget(
    Math.min(preferredQuizDurations.reduce((sum, value) => sum + value, 0), totalSeconds - teaching.length * 45),
    preferredQuizDurations,
    120,
  );
  const quizBudgetSec = quizDurations.reduce((sum, value) => sum + value, 0);
  const teachingDurations = allocateLectureBudget(
    totalSeconds - quizBudgetSec,
    nonEmpty.flatMap((entry) => entry.scenes.map((outline) => outline.targetDurationSec ?? outline.estimatedDuration ?? 60)),
    45,
  );
  let teachingIndex = 0;

  const result: LectureOutline[] = [];
  const sections: KnowledgeLectureSection[] = [];
  nonEmpty.forEach((entry, sectionIndex) => {
    const sectionId = `knowledge-section-${sectionIndex + 1}`;
    const knowledgePointIds = unique([
      ...entry.knowledgePointIds,
      ...entry.scenes.flatMap((scene) => scene.knowledgePointIds ?? []),
    ]).filter((id) => pointNames.has(id));
    const title = sectionTitle(sectionIndex, knowledgePointIds, pointNames);
    const sectionScenes = entry.scenes.map((outline) => {
      const targetDurationSec = teachingDurations[teachingIndex++]!;
      return {
        ...outline,
        lectureSectionId: sectionId,
        lectureSectionTitle: title,
        activityId: sectionId,
        parentActivityId: sectionId,
        targetDurationSec,
        estimatedDuration: targetDurationSec,
      } as LectureOutline;
    });
    const questionCount = knowledgePointIds.length >= 3 ? 3 : 2;
    const quizDurationSec = quizDurations[sectionIndex] ?? 180;
    const quizOutlineId = `${sectionId}-check`;
    const keyPoints = knowledgePointIds.map((id) => pointNames.get(id)).filter(Boolean) as string[];
    const anchor = sectionScenes.at(-1)!;
    const quiz: LectureOutline = {
      ...anchor,
      id: quizOutlineId,
      type: "quiz",
      title: `${title} · 节末小测`,
      description: `围绕本小节的${keyPoints.join("、") || "核心知识"}设置 ${questionCount} 道简短主观题。每题只需用关键词和一两句话说明判断或理由，预计 ${Math.round(quizDurationSec / 60)} 分钟完成；由 AI 自动批阅并进入助教讲解。`,
      keyPoints,
      teachingObjective: "用简短主观表达检查学生能否准确说出概念、依据或关键步骤，并为逐题讲解形成证据。",
      knowledgePointIds,
      lectureSectionId: sectionId,
      lectureSectionTitle: title,
      activityId: sectionId,
      parentActivityId: sectionId,
      detailKind: "other",
      targetDurationSec: quizDurationSec,
      estimatedDuration: quizDurationSec,
      ttsPolicy: "target-duration",
      narrationMode: "embedded-segment",
      resourceTypes: [],
      quizConfig: {
        difficulty: "medium",
        questionTypes: ["short_answer"],
        questionCount,
      },
      widgetType: undefined,
      widgetOutline: undefined,
      interactiveConfig: undefined,
      mediaGenerations: undefined,
      suggestedImageIds: undefined,
    };
    const sceneOutlineIds = sectionScenes.map((scene) => scene.id);
    result.push(...sectionScenes, quiz);
    sections.push({
      id: sectionId,
      title,
      order: sectionIndex,
      knowledgePointIds,
      sceneOutlineIds,
      quizOutlineId,
      estimatedMinutes: Math.max(
        2,
        Math.round((sectionScenes.reduce((sum, scene) => sum + (scene.targetDurationSec ?? 0), 0) + quizDurationSec) / 60),
      ),
    });
  });

  return {
    outlines: result.map((outline, index) => ({ ...outline, order: index })),
    sections,
  };
}

export function deriveKnowledgeLectureSectionsFromOutlines(
  outlines: readonly OpenMaicSceneOutlineSnapshot[],
): KnowledgeLectureSection[] {
  const grouped = new Map<string, OpenMaicSceneOutlineSnapshot[]>();
  for (const outline of outlines) {
    const sectionId = typeof outline.lectureSectionId === "string"
      ? outline.lectureSectionId
      : undefined;
    if (!sectionId) continue;
    grouped.set(sectionId, [...(grouped.get(sectionId) ?? []), outline]);
  }
  return [...grouped.entries()].flatMap(([id, scenes], order) => {
    const quiz = scenes.find((scene) => scene.type === "quiz");
    if (!quiz) return [];
    const title = typeof scenes[0]?.lectureSectionTitle === "string"
      ? scenes[0].lectureSectionTitle
      : `第 ${order + 1} 节`;
    return [{
      id,
      title,
      order,
      knowledgePointIds: unique(scenes.flatMap((scene) => scene.knowledgePointIds ?? [])),
      sceneOutlineIds: scenes.filter((scene) => scene.type !== "quiz").map((scene) => scene.id),
      quizOutlineId: quiz.id,
      estimatedMinutes: Math.max(2, Math.round(scenes.reduce(
        (sum, scene) => sum + Math.max(0, scene.targetDurationSec ?? scene.estimatedDuration ?? 0),
        0,
      ) / 60)),
    }];
  });
}

export type KnowledgePointMasteryRow = {
  knowledgePointId: string;
  name: string;
  answeredStudents: number;
  responseCount: number;
  incorrectStudents: number;
  earned: number;
  maxScore: number;
  errorRate: number;
};

export function latestKnowledgeLectureAttempts(
  progress?: StudentAiProgress,
): KnowledgeLectureAttempt[] {
  const latest = new Map<string, KnowledgeLectureAttempt>();
  for (const attempt of progress?.knowledgeLectureAttempts ?? []) {
    const current = latest.get(attempt.quizOutlineId);
    if (!current || Date.parse(attempt.submittedAt) >= Date.parse(current.submittedAt)) {
      latest.set(attempt.quizOutlineId, attempt);
    }
  }
  return [...latest.values()];
}

export function aggregateKnowledgePointMastery(
  course: Pick<Course, "content" | "aiLearningProgress">,
  progressOverride?: Record<string, StudentAiProgress>,
): KnowledgePointMasteryRow[] {
  const progress = progressOverride ?? course.aiLearningProgress ?? {};
  const accumulators = new Map(course.content.knowledgePoints.map((point) => [point.id, {
    knowledgePointId: point.id,
    name: point.name,
    studentIds: new Set<string>(),
    incorrectStudentIds: new Set<string>(),
    responseCount: 0,
    earned: 0,
    maxScore: 0,
  }]));

  for (const [studentId, entry] of Object.entries(progress)) {
    for (const attempt of latestKnowledgeLectureAttempts(entry)) {
      for (const question of attempt.questions) {
        const ids = question.knowledgePointIds.length
          ? question.knowledgePointIds
          : attempt.knowledgePointIds;
        for (const knowledgePointId of unique(ids)) {
          const accumulator = accumulators.get(knowledgePointId);
          if (!accumulator) continue;
          accumulator.studentIds.add(studentId);
          accumulator.responseCount += 1;
          accumulator.earned += question.earned;
          accumulator.maxScore += question.points;
          if (question.points <= 0 || question.earned / question.points < 0.8) {
            accumulator.incorrectStudentIds.add(studentId);
          }
        }
      }
    }
  }

  return [...accumulators.values()]
    .map((item) => ({
      knowledgePointId: item.knowledgePointId,
      name: item.name,
      answeredStudents: item.studentIds.size,
      responseCount: item.responseCount,
      incorrectStudents: item.incorrectStudentIds.size,
      earned: item.earned,
      maxScore: item.maxScore,
      errorRate: item.maxScore > 0
        ? Math.round((1 - item.earned / item.maxScore) * 100)
        : 0,
    }))
    .sort((a, b) => b.errorRate - a.errorRate || b.answeredStudents - a.answeredStudents);
}
