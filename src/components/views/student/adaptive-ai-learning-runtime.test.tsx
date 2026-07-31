import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Course, StudentAdaptiveLearningState } from "@/lib/session/types";

vi.mock("@/components/openmaic-bridge/student-stage-host", () => ({
  prefetchAdaptiveClassroom: vi.fn(async () => ({
    stage: { id: "resource-classroom" },
    scenes: [],
  })),
  StudentStageHost: ({
    classroomId,
    onSceneComplete,
    adaptiveInsertions = [],
  }: {
    classroomId: string;
    adaptiveInsertions?: Array<{ id: string; classroomId: string; anchorSceneId?: string }>;
    onSceneComplete?: (detail: {
      scene: {
        id: string;
        outlineId?: string;
        title: string;
        type: "quiz" | "slide" | "interactive";
        knowledgePointIds?: string[];
      };
      quizScore?: number;
      completedSceneCount: number;
      totalSceneCount: number;
    }) => void;
  }) => (
    <button
      data-insertions={adaptiveInsertions.length}
      data-insertion-anchor={adaptiveInsertions[0]?.anchorSceneId}
      data-testid="stage-host"
      onClick={() => onSceneComplete?.({
        scene: classroomId === "main-classroom"
          ? {
              id: "runtime-quiz",
              outlineId: "quiz-1",
              title: "强化学习模块测验",
              type: "interactive",
              knowledgePointIds: ["reinforcement-learning"],
            }
          : {
              id: "resource-slide",
              title: "机器人应用",
              type: "slide",
              knowledgePointIds: ["reinforcement-learning"],
            },
        quizScore: classroomId === "main-classroom" ? 90 : undefined,
        completedSceneCount: 1,
        totalSceneCount: 1,
      })}
      type="button"
    >
      {classroomId}
    </button>
  ),
}));

vi.mock("@openmaic/lib/quiz/persistence", () => ({
  readSubmittedState: () => ({
    kind: "reviewing",
    results: [{ questionId: "question-1", correct: true }],
  }),
}));

import { AdaptiveAiLearningRuntime } from "./adaptive-ai-learning-runtime";

const adaptiveState: StudentAdaptiveLearningState = {
  enabled: true,
  pretestScore: 100,
  pretestCompletedAt: "2026-07-26T00:00:00.000Z",
  pretestWeakKnowledgePointIds: [],
  pretestMasteredKnowledgePointIds: ["reinforcement-learning"],
  evidence: [],
  branchRuns: [],
  microLessons: [],
};

const course = {
  id: "course-1",
  students: [{ id: "student-1", name: "张三" }],
  content: {
    _openmaicSceneOutlines: [{
      id: "quiz-1",
      title: "强化学习模块测验",
      type: "quiz",
      stageKey: "ai-learning",
      audience: "student",
      knowledgePointIds: ["reinforcement-learning"],
    }],
    adaptiveLearningPlan: {
      enabled: true,
      status: "teacher-confirmed",
      updatedAt: "2026-07-26T00:00:00.000Z",
      timeBudgetMin: 8,
      thresholds: { enrichmentMasteryMin: 80 },
      pretest: {
        title: "先决知识检查",
        introduction: "",
        estimatedMinutes: 3,
        questions: [],
      },
      branches: [{
        id: "resource-1",
        kind: "application",
        title: "机器人应用",
        objective: "迁移应用",
        keyPoints: ["新案例"],
        anchorKnowledgePointIds: ["reinforcement-learning"],
        prerequisiteKnowledgePointIds: [],
        noveltyStatement: "使用主课未出现的仓储机器人案例分析奖励稀疏问题。",
        mainCourseOverlapSceneIds: [],
        sceneType: "slide",
        targetDurationSec: 120,
        generationGuidance: "不得重复主课。",
        preparedResource: {
          status: "ready",
          classroomId: "resource-classroom",
          scenesCount: 1,
        },
        trigger: {
          placement: "after-module",
          assessmentSceneIds: ["quiz-1"],
          answerRule: "score-at-least",
          evidenceRule: "module-mastery",
          scoreThreshold: 80,
          minimumRemainingSec: 120,
        },
        status: "teacher-confirmed",
      }],
    },
  },
  aiLearningProgress: {
    "student-1": {
      classroomId: "main-classroom",
      studentId: "student-1",
      currentSceneIndex: 0,
      totalScenes: 1,
      completedScenes: [],
      lastActiveAt: "2026-07-26T00:00:00.000Z",
      masteryLevel: "in-progress",
      adaptiveLearning: adaptiveState,
    },
  },
} as unknown as Course;

describe("AdaptiveAiLearningRuntime seamless sequencing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps one main player mounted and inserts prepared scenes into its queue", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: adaptiveState }),
    })));
    render(
      <AdaptiveAiLearningRuntime
        backHref="/student/course-1"
        classroomId="main-classroom"
        course={course}
        studentId="student-1"
        studentName="张三"
      />,
    );

    expect(screen.getAllByTestId("stage-host")).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("main-classroom"));
    await waitFor(() =>
      expect(screen.getByTestId("stage-host").getAttribute("data-insertions")).toBe("1"),
    );
    expect(screen.getByTestId("stage-host").getAttribute("data-insertion-anchor"))
      .toBe("runtime-quiz");
    expect(screen.getByText("main-classroom")).toBeTruthy();
    expect(screen.getAllByTestId("stage-host")).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("restores a ready companion micro lesson inside the same main player", () => {
    const courseWithMicroLesson = structuredClone(course) as Course;
    courseWithMicroLesson.aiLearningProgress!["student-1"].adaptiveLearning = {
      ...adaptiveState,
      microLessons: [{
        id: "lesson-1",
        stageKey: "proposal",
        topic: "证据可信度",
        decision: "systematic-lesson",
        rationale: "需要系统讲解",
        classroomId: "micro-classroom",
        status: "ready",
        createdAt: "2026-07-26T00:00:00.000Z",
      }],
    };

    render(
      <AdaptiveAiLearningRuntime
        backHref="/student/course-1"
        classroomId="main-classroom"
        course={courseWithMicroLesson}
        studentId="student-1"
        studentName="张三"
      />,
    );

    expect(screen.getAllByTestId("stage-host")).toHaveLength(1);
    expect(screen.getByTestId("stage-host").getAttribute("data-insertions")).toBe("1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not insert a resource that exceeds the live AI-stage remainder", async () => {
    const timedCourse = structuredClone(course) as Course;
    timedCourse.uiState = {
      classroomTiming: {
        schemaVersion: 1,
        status: "paused",
        sessionStartedAt: "2026-07-28T01:00:00.000Z",
        activeStageKey: "ai-learning",
        pausedAt: "2026-07-28T01:01:00.000Z",
        updatedAt: "2026-07-28T01:01:00.000Z",
        stages: [{
          stageKey: "ai-learning",
          label: "AI 授知",
          basePlannedSec: 120,
          adjustmentSec: 0,
          elapsedSec: 60,
          status: "active",
          startedAt: "2026-07-28T01:00:00.000Z",
        }],
      },
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: adaptiveState }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdaptiveAiLearningRuntime
        backHref="/student/course-1"
        classroomId="main-classroom"
        course={timedCourse}
        studentId="student-1"
        studentName="张三"
      />,
    );
    fireEvent.click(screen.getByText("main-classroom"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByTestId("stage-host").getAttribute("data-insertions")).toBe("0");
  });
});
