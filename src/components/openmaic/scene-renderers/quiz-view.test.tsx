import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "@openmaic/lib/types/stage";
import type { KnowledgeLectureAttempt } from "@/lib/session/types";
import { KnowledgeLectureQuizLockProvider } from "@/components/openmaic-bridge/knowledge-lecture-quiz-lock";
import { I18nProvider } from "@openmaic/lib/hooks/use-i18n";
import { QuizView } from "./quiz-view";

describe("QuizView single-attempt review", () => {
  it("restores the server submission as read-only and never renders a retry action", () => {
    const questions = [{
      id: "question-1",
      type: "short_answer",
      question: "什么是变量关系？",
      points: 10,
      analysis: "说明变量之间的变化关系。",
    }] as QuizQuestion[];
    const attempt: KnowledgeLectureAttempt = {
      id: "attempt-1",
      sectionId: "section-1",
      quizOutlineId: "quiz-1",
      runtimeSceneId: "old-runtime-scene",
      submittedAt: "2026-09-01T10:00:00.000Z",
      score: 4,
      maxScore: 10,
      knowledgePointIds: ["kp-1"],
      questions: [{
        questionId: "question-1",
        prompt: "什么是变量关系？",
        answer: "首次提交的答案",
        points: 10,
        earned: 4,
        correct: false,
        feedback: "需要说明变化方向",
        referenceAnswer: "因变量随自变量变化",
        knowledgePointIds: ["kp-1"],
      }],
    };
    const attempts = new Map([["quiz-1", attempt]]);

    render(
      <I18nProvider>
        <KnowledgeLectureQuizLockProvider attemptsBySceneId={attempts}>
          <QuizView questions={questions} quizOutlineId="quiz-1" sceneId="new-runtime-scene" />
        </KnowledgeLectureQuizLockProvider>
      </I18nProvider>,
    );

    expect(screen.getByText("首次提交的答案")).toBeTruthy();
    expect(screen.getByText("本小节测验仅可作答一次")).toBeTruthy();
    expect(screen.queryByText("重做")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
