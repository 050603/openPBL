import { describe, expect, it } from "vitest";
import type { SceneOutline } from "@openmaic/lib/types/generation";
import type {
  Course,
  KnowledgeLectureAttempt,
  OpenMaicSceneOutlineSnapshot,
  StudentAiProgress,
} from "@/lib/session/types";
import {
  aggregateKnowledgePointMastery,
  deriveKnowledgeLectureSectionsFromOutlines,
  organizeKnowledgeLectureOutlines,
} from "./knowledge-lecture";

function outline(
  id: string,
  knowledgePointIds: string[],
): SceneOutline & OpenMaicSceneOutlineSnapshot {
  return {
    id,
    type: "slide",
    title: id,
    description: id,
    keyPoints: [id],
    order: 0,
    stageKey: "ai-learning",
    stageLabel: "知识讲授",
    audience: "student",
    generationPurpose: "knowledge-teaching",
    activityId: "knowledge",
    parentActivityId: "knowledge",
    detailKind: "knowledge-explanation",
    knowledgePointIds,
    targetDurationSec: 180,
    ttsPolicy: "target-duration",
  };
}

describe("knowledge lecture sections", () => {
  it.each([600, 1440, 2880, 1501])("keeps teaching and quizzes inside an exact %i second budget", (totalDurationSec) => {
    const points = Array.from({ length: 5 }, (_, index) => ({ id: `kp-${index}`, name: `知识${index}`, description: "" }));
    const result = organizeKnowledgeLectureOutlines(points.map((point) => outline(`page-${point.id}`, [point.id])), {
      totalDurationSec, knowledgePoints: points,
    });
    expect(result.outlines.reduce((sum, item) => sum + (item.targetDurationSec ?? 0), 0)).toBe(totalDurationSec);
    expect(result.outlines.filter((item) => item.type !== "quiz")).toHaveLength(points.length);
    expect(result.outlines.filter((item) => item.type === "quiz").every((item) => item.targetDurationSec! >= 120 && item.targetDurationSec! <= 300)).toBe(true);
  });

  it("refuses an impossible budget rather than silently extending the lecture", () => {
    expect(() => organizeKnowledgeLectureOutlines([outline("p", ["kp"])], {
      totalDurationSec: 100,
      knowledgePoints: [{ id: "kp", name: "概念", description: "" }],
    })).toThrow("时间预算");
  });

  it("groups related knowledge points and appends a concise subjective quiz to every section", () => {
    const result = organizeKnowledgeLectureOutlines([
      outline("page-1", ["kp-1"]),
      outline("page-2", ["kp-2"]),
      outline("page-3", ["kp-3"]),
    ], {
      totalDurationSec: 1_200,
      knowledgePoints: [
        { id: "kp-1", name: "概念", description: "" },
        { id: "kp-2", name: "依据", description: "" },
        { id: "kp-3", name: "应用", description: "" },
      ],
      knowledgeGraph: {
        nodes: [],
        edges: [{ id: "edge-1", source: "kp-1", target: "kp-2", label: "支撑" }],
      },
    });

    expect(result.sections).toHaveLength(2);
    expect(result.outlines.filter((item) => item.type === "quiz")).toHaveLength(2);
    expect(result.outlines.filter((item) => item.type !== "quiz").map((item) => item.id)).toEqual([
      "page-1",
      "page-2",
      "page-3",
    ]);
    for (const quiz of result.outlines.filter((item) => item.type === "quiz")) {
      expect(quiz.targetDurationSec).toBeGreaterThanOrEqual(120);
      expect(quiz.targetDurationSec).toBeLessThanOrEqual(300);
      expect(quiz.quizConfig?.questionCount).toBeGreaterThanOrEqual(2);
      expect(quiz.quizConfig?.questionCount).toBeLessThanOrEqual(3);
      expect(quiz.quizConfig?.questionTypes).toEqual(["short_answer"]);
    }
    expect(deriveKnowledgeLectureSectionsFromOutlines(result.outlines)).toEqual(result.sections);
  });

  it("ranks knowledge points by weighted AI-scored error rate using the latest attempt", () => {
    const attempt = (
      submittedAt: string,
      earned: number,
      knowledgePointId: string,
    ): KnowledgeLectureAttempt => ({
      id: `attempt-${submittedAt}`,
      sectionId: "knowledge-section-1",
      quizOutlineId: "knowledge-section-1-check",
      runtimeSceneId: "runtime-quiz",
      submittedAt,
      score: earned,
      maxScore: 10,
      knowledgePointIds: [knowledgePointId],
      questions: [{
        questionId: "q-1",
        prompt: "为什么？",
        answer: "回答",
        points: 10,
        earned,
        correct: earned >= 8,
        feedback: "反馈",
        knowledgePointIds: [knowledgePointId],
      }],
    });
    const progress = (studentId: string, attempts: KnowledgeLectureAttempt[]): StudentAiProgress => ({
      classroomId: "classroom",
      studentId,
      currentSceneIndex: 1,
      totalScenes: 3,
      completedScenes: [],
      lastActiveAt: "2026-01-01T00:00:00.000Z",
      masteryLevel: "in-progress",
      knowledgeLectureAttempts: attempts,
    });
    const course = {
      content: {
        knowledgePoints: [
          { id: "kp-1", name: "概念", description: "" },
          { id: "kp-2", name: "应用", description: "" },
        ],
      },
      aiLearningProgress: {
        student1: progress("student1", [
          attempt("2026-01-01T00:00:00.000Z", 2, "kp-1"),
          attempt("2026-01-02T00:00:00.000Z", 4, "kp-1"),
        ]),
        student2: progress("student2", [attempt("2026-01-02T00:00:00.000Z", 9, "kp-2")]),
      },
    } as unknown as Course;

    expect(aggregateKnowledgePointMastery(course)).toEqual([
      expect.objectContaining({ knowledgePointId: "kp-1", errorRate: 60, answeredStudents: 1 }),
      expect.objectContaining({ knowledgePointId: "kp-2", errorRate: 10, answeredStudents: 1 }),
    ]);
  });
});
