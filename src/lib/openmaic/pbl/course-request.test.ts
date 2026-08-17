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

  it("removes legacy resource selections before serializing confirmed modules", () => {
    const requirement = buildPblCourseRequirement(course, {
      teachingOutline: [
        {
          id: "module-launch",
          stageKey: "launch",
          title: "Project launch",
          durationMin: 10,
          teachingGoal: "Understand the challenge",
          teacherRole: "Frame the challenge",
          platformRole: "Show the prompt",
          aiRole: "None",
          studentActivity: "Record an initial idea",
          resourceTypes: ["interactive-demo", "worksheet", "project-brief"],
        },
        {
          id: "module-ai",
          stageKey: "ai-learning",
          title: "AI learning",
          durationMin: 20,
          teachingGoal: "Learn the core concept",
          teacherRole: "Coach",
          platformRole: "Present learning pages",
          aiRole: "Explain and check",
          studentActivity: "Learn and answer",
          resourceTypes: ["ppt", "interactive-demo", "script", "rubric"],
        },
      ],
    });

    expect(requirement).not.toContain('"worksheet"');
    expect(requirement).not.toContain('"rubric"');
    expect(requirement).not.toContain('"project-brief"');
    expect(requirement).toMatch(/"resourceTypes": \[\s*"ppt",\s*"script"\s*\]/);
    expect(requirement).toMatch(
      /"resourceTypes": \[\s*"ppt",\s*"interactive-demo",\s*"code-interactive"\s*\]/,
    );
  });
});
