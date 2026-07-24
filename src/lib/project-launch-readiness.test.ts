import { describe, expect, it } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";
import {
  buildCourseTopicOptions,
  getLaunchTodoKind,
  hasSelectedProjectTopic,
  haveAllResourcesBeenViewed,
} from "./project-launch-readiness";

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "校园水资源研究",
    subject: "科学",
    grade: "六年级",
    hours: 4,
    summary: "设计校园节水方案",
    drivingQuestion: "如何减少校园用水浪费？",
    status: "teaching",
    stages: DEFAULT_STAGES,
    currentStageIndex: 0,
    content: {
      pblOutline: "",
      knowledgePoints: [
        { id: "kp-1", name: "水循环", description: "理解水在自然界中的循环" },
      ],
      lessonOutline: [],
      evaluationPlan: { dimensions: [], overallRubric: "" },
    },
    students: [],
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("project launch readiness", () => {
  it("recognizes legacy launch todo names", () => {
    expect(getLaunchTodoKind({ id: "x", title: "阅读项目说明", description: "", completedBy: [] })).toBe("resources");
    expect(getLaunchTodoKind({ id: "todo-join-group-x", title: "确认", description: "", completedBy: [] })).toBe("personal-space");
    expect(getLaunchTodoKind({ id: "x", title: "选择兴趣方向", description: "", completedBy: [] })).toBe("topic");
  });

  it("treats no resources as complete and otherwise requires every resource", () => {
    expect(haveAllResourcesBeenViewed(makeCourse(), "student-1")).toBe(true);
    const course = makeCourse({
      resources: [
        { id: "r1", title: "说明", type: "PDF", size: "1 MB", downloadedBy: ["student-1"] },
        { id: "r2", title: "数据", type: "XLSX", size: "2 MB", downloadedBy: [] },
      ],
    });
    expect(haveAllResourcesBeenViewed(course, "student-1")).toBe(false);
    course.resources?.[1].downloadedBy.push("student-1");
    expect(haveAllResourcesBeenViewed(course, "student-1")).toBe(true);
  });

  it("builds selectable topics from teacher-authored PBL inquiry questions", () => {
    const course = makeCourse({
      pblConfig: {
        projectMode: "personal",
        difficultyLevel: "standard",
        evidenceRequirements: [],
        outcome: { artifact: "", presentation: "", reflection: "" },
        companionIds: ["recorder"],
        inquiryQuestions: [
          "我们如何减少校园用水浪费？",
          "我们如何让雨水被校园重新利用？",
        ],
        evaluationModel: "tri-party",
        generationTemplate: "pbl-six-stage",
      },
    });
    expect(buildCourseTopicOptions(course).map((option) => option.value)).toEqual([
      "我们如何减少校园用水浪费？",
      "我们如何让雨水被校园重新利用？",
    ]);
  });

  it("does not accept the default placeholder as a chosen topic", () => {
    const base = {
      id: "group-1",
      name: "个人项目",
      keywords: [],
      selectedForms: [],
      members: [],
      createdAt: "",
      updatedAt: "",
    };
    expect(hasSelectedProjectTopic({ ...base, topic: "待确定选题方向" })).toBe(false);
    expect(hasSelectedProjectTopic({ ...base, topic: "校园节水" })).toBe(true);
    expect(
      hasSelectedProjectTopic(
        { ...base, topic: "知识点名称" },
        ["我们如何减少校园用水浪费？"],
      ),
    ).toBe(false);
  });
});
