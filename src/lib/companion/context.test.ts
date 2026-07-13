import { describe, expect, it } from "vitest";
import { DEFAULT_STAGES, type Course } from "@/lib/session/types";
import { buildCompanionContext } from "./context";

function makeCourse(): Course {
  return {
    id: "course-1",
    name: "校园节能",
    subject: "科学",
    grade: "六年级",
    hours: 8,
    summary: "调查校园用电并提出改进方案",
    drivingQuestion: "怎样让校园用电更节约？",
    learningObjectives: ["理解能耗数据", "根据证据提出改进"],
    status: "teaching",
    stages: DEFAULT_STAGES,
    currentStageIndex: 5,
    content: {
      pblOutline: "",
      knowledgePoints: [],
      lessonOutline: [],
      evaluationPlan: {
        dimensions: [{ id: "evidence", name: "证据", weight: 40, description: "使用证据" }],
        overallRubric: "",
      },
    },
    students: [{ id: "student-1", name: "小林", joinedAt: "2026-01-01T00:00:00.000Z", stageProgress: { reflection: 60 } }],
    groups: [{
      id: "group-1",
      name: "小林的项目",
      topic: "节能提醒",
      goal: "减少待机浪费",
      keywords: [],
      selectedForms: ["调研报告"],
      members: [{ studentId: "student-1", name: "小林" }],
      proposal: {
        projectQuestion: "哪些设备待机浪费最多？",
        outcomeFormat: "调研报告",
        implementationPlan: "观察、记录、比较、提出建议",
        requiredKnowledge: ["数据统计"],
        aiUsePlan: "请 AI 提问，不代写",
        risks: ["样本不足"],
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }],
    submissions: [
      { id: "sub-1", courseId: "course-1", studentId: "student-1", groupId: "group-1", stageKey: "make", type: "document", title: "测试记录", content: "我们比较了两个时段的数据，发现午休时段待机设备最多。", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
    ],
    feedback: [
      { id: "feedback-1", courseId: "course-1", targetType: "student", targetId: "student-1", stageKey: "showcase", kind: "comment", sourceRole: "teacher", content: "请说明数据如何支持你的结论。", createdAt: "2026-01-03T00:00:00.000Z" },
    ],
    rubricScores: [
      { id: "score-1", courseId: "course-1", groupId: "group-1", stageKey: "showcase", dimensionScores: { evidence: 82 }, teacherTotal: 82, aiDimensionScores: { evidence: 76 }, aiTotal: 76, finalTotal: 79, comment: "证据较清楚，还需解释限制。", total: 79, status: "submitted", createdAt: "2026-01-04T00:00:00.000Z", updatedAt: "2026-01-04T00:00:00.000Z" },
    ],
    evaluations: [
      { id: "eval-1", courseId: "course-1", stageKey: "make", sourceRole: "ai", targetType: "student", targetId: "student-1", score: 76, comment: "测试记录显示了迭代。", evidence: ["测试记录"], status: "submitted", createdAt: "2026-01-04T00:00:00.000Z", updatedAt: "2026-01-04T00:00:00.000Z" },
    ],
    aiSupports: [
      { id: "support-1", courseId: "course-1", stageKey: "make", targetType: "student", targetId: "student-1", studentId: "student-1", groupId: "group-1", kind: "artifact-diagnosis", trigger: "检查证据", inputSummary: "", diagnosis: "测试记录有变化", suggestions: ["补充样本说明"], evidence: ["测试记录"], status: "student-applied", adoption: { decision: "adopted", reason: "帮助补充样本", handledBy: "student-1", handledAt: "2026-01-03T00:00:00.000Z" }, createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" },
    ],
    reflections: [
      { id: "reflection-1", courseId: "course-1", studentId: "student-1", studentName: "小林", content: "我发现先记录数据再做判断更可靠。", improvementPlan: "下一次先设计样本表。", createdAt: "2026-01-05T00:00:00.000Z", updatedAt: "2026-01-05T00:00:00.000Z" },
    ],
    activityLog: [{ id: "activity-1", actor: "小林", action: "保存测试记录", detail: "比较午休和放学数据", createdAt: "2026-01-02T00:00:00.000Z" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
  };
}

describe("companion context", () => {
  it("includes reflection evidence from artifacts, teacher and AI evaluation", () => {
    const context = buildCompanionContext(makeCourse(), "student-1", "reflection");

    expect(context.prompt).toContain("测试记录");
    expect(context.prompt).toContain("教师分=82");
    expect(context.prompt).toContain("AI分=76");
    expect(context.prompt).toContain("请说明数据如何支持你的结论");
    expect(context.prompt).toContain("我发现先记录数据再做判断更可靠");
    expect(context.prompt).toContain("采纳状态=adopted");
  });
});
