import { describe, expect, it } from "vitest";
import type { Course } from "@/lib/session/types";
import {
  buildCourseBasicsPatch,
  createCourseBasicsDraft,
  parseLearningObjectives,
} from "./course-basics-draft";

function courseFixture(): Course {
  return {
    id: "course-1",
    name: "旧课程",
    subject: "科学",
    grade: "七年级",
    hours: 6,
    summary: "旧说明",
    drivingQuestion: "旧问题？",
    learningObjectives: ["旧目标"],
    status: "draft",
    stages: [],
    currentStageIndex: 0,
    content: {
      pblOutline: "",
      knowledgePoints: [],
      lessonOutline: [],
      evaluationPlan: { dimensions: [], overallRubric: "" },
    },
    students: [],
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

describe("course basics draft", () => {
  it("keeps typing local until a save patch is explicitly built", () => {
    const course = courseFixture();
    const draft = createCourseBasicsDraft(course);

    draft.name = "新的课程名称";
    draft.summary = "新的说明";

    expect(course.name).toBe("旧课程");
    expect(course.summary).toBe("旧说明");
    expect(buildCourseBasicsPatch(course, draft)).toMatchObject({
      name: "新的课程名称",
      summary: "新的说明",
    });
  });

  it("normalizes multiline objectives and keeps optional evidence unselected", () => {
    const course = courseFixture();
    const draft = createCourseBasicsDraft(course);
    draft.learningObjectivesText = "  解释概念  \n\n运用证据\n";

    const patch = buildCourseBasicsPatch(course, draft);

    expect(parseLearningObjectives(draft.learningObjectivesText)).toEqual([
      "解释概念",
      "运用证据",
    ]);
    expect(patch.pblConfig.evidenceRequirements.map((item) => item.kind)).not.toEqual(
      expect.arrayContaining(["ai-decision-log", "artifact-version"]),
    );
  });

  it("keeps the common AI-literacy course duration within one to five hours", () => {
    const course = courseFixture();
    const draft = createCourseBasicsDraft(course);
    draft.hours = 8;

    expect(buildCourseBasicsPatch(course, draft).hours).toBe(5);
  });
});
