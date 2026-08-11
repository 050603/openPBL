import { describe, expect, it } from "vitest";
import type { SceneOutline } from "@openmaic/lib/types/generation";
import {
  canResumeAfterValidatedLessonOutline,
  canResumeAfterValidatedTeachingOutline,
  isSameCourseDesignRequest,
} from "./resume-policy";

const validOutline: SceneOutline = {
  id: "scene-1",
  type: "slide",
  title: "核心概念",
  description: "解释核心概念并给出案例",
  keyPoints: ["核心概念"],
  estimatedDuration: 180,
  targetDurationSec: 180,
  order: 0,
  stageKey: "ai-learning",
  audience: "student",
  generationPurpose: "knowledge-teaching",
  teachingObjective: "学生能够解释核心概念",
  knowledgePointIds: ["kp-1"],
};

const validOutlines: SceneOutline[] = [
  validOutline,
  { ...validOutline, id: "scene-2", title: "案例比较", order: 1 },
  { ...validOutline, id: "scene-3", title: "迁移练习", order: 2 },
  ...["launch", "proposal", "make", "showcase"].map((stageKey, index): SceneOutline => ({
    ...validOutline,
    id: `teacher-${stageKey}`,
    title: `${stageKey} 教师资源`,
    order: index + 3,
    stageKey,
    audience: "teacher",
    generationPurpose: "teacher-resource",
  })),
];

describe("quick-design resume policy", () => {
  it("requires both a completed trace entry and a still-valid saved outline", () => {
    expect(canResumeAfterValidatedLessonOutline({
      trace: [{ step: "lessonOutline", status: "completed" }],
      outlines: validOutlines,
      interactiveMode: false,
    })).toBe(true);
    expect(canResumeAfterValidatedLessonOutline({
      trace: [],
      outlines: validOutlines,
      interactiveMode: false,
    })).toBe(false);
    expect(canResumeAfterValidatedLessonOutline({
      trace: [{ step: "lessonOutline", status: "completed" }],
      outlines: [],
      interactiveMode: false,
    })).toBe(false);
  });

  it("does not reuse a stage that was recorded as failed", () => {
    expect(canResumeAfterValidatedLessonOutline({
      trace: [{ step: "lessonOutline", status: "failed" }],
      outlines: validOutlines,
      interactiveMode: false,
    })).toBe(false);
  });

  it("resumes at lesson generation only when every saved upstream gate is still valid", () => {
    const valid = {
      trace: [{ step: "teachingOutline", status: "completed" }],
      positioningPassed: true,
      projectDesignPassed: true,
      evaluationPlanPassed: true,
      knowledgePointCount: 10,
      knowledgeGraphNodeCount: 10,
      teachingOutlineCount: 6,
      timingPlanConfirmed: true,
    };
    expect(canResumeAfterValidatedTeachingOutline(valid)).toBe(true);
    expect(canResumeAfterValidatedTeachingOutline({
      ...valid,
      timingPlanConfirmed: false,
    })).toBe(false);
    expect(canResumeAfterValidatedTeachingOutline({
      ...valid,
      trace: [{ step: "teachingOutline", status: "failed" }],
    })).toBe(false);
  });

  it("preserves checkpoints only when the retried design request is unchanged", () => {
    const request = {
      courseId: "course-1",
      teacherBrief: "设计一节人工智能课程",
      options: {
        interactiveMode: true,
        enableImageGeneration: true,
        enableTTS: true,
        enableVideoGeneration: false,
      },
    };
    expect(isSameCourseDesignRequest(request, { ...request })).toBe(true);
    expect(isSameCourseDesignRequest(request, {
      ...request,
      teacherBrief: "设计一节机器人课程",
    })).toBe(false);
  });
});
