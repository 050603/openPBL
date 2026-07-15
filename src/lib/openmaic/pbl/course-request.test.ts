import { describe, expect, it } from "vitest";
import { buildCourseTeachingConstraints, buildPblCourseRequirement } from "./course-request";

const course = {
  name: "自然语言处理基础",
  subject: "人工智能通识",
  grade: "高二",
  hours: 2,
  summary: "处理校园真实语言数据。",
  drivingQuestion: "我们如何为校园社团设计有证据支持的文本分类方案？",
  learningObjectives: ["比较两种文本分类方法"],
  learnerProfile: {
    priorKnowledge: "理解分类的直观含义",
    learningNeeds: "需要图示和分步示例",
    familiarContexts: "校园通知",
  },
  pblConfig: undefined,
};

describe("course generation requirements", () => {
  it("uses the same hour-scaled teaching constraints for final OpenMAIC generation", () => {
    const constraints = buildCourseTeachingConstraints(course);
    const requirement = buildPblCourseRequirement(course);

    expect(constraints.totalMinutes).toBe(120);
    expect(constraints.recommendedKnowledgePointRange).toEqual({ min: 8, max: 12 });
    expect(requirement).toContain('"learningObjectives"');
    expect(requirement).toContain('"totalMinutes": 120');
    expect(requirement).toContain("理解分类的直观含义");
  });
});
