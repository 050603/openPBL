import { describe, expect, it } from "vitest";
import type { Course } from "@/lib/session/types";
import {
  assessmentToBoundaryResponse,
  buildDelegatedWorkAssessmentPrompts,
  buildDelegatedWorkStarterReviewPrompts,
  buildDelegatedWorkStarterPrompts,
  normalizeDelegatedWorkAssessment,
  normalizeDelegatedWorkDelivery,
  normalizeDelegatedWorkStarters,
  researchTemporarilyUnavailableResponse,
  unavailableResearchResponse,
} from "./delegated-work-policy";

const course = {
  id: "course-1",
  name: "校园节水研究",
  drivingQuestion: "怎样用可靠证据找到校园浪费水的主要原因？",
  expectedOutcome: "基于实地数据形成并验证节水方案",
  learningObjectives: ["自主采集数据", "分析证据并形成结论"],
  stages: [{ key: "make", label: "项目实践", description: "完成实地调查、分析并验证方案" }],
  currentStageIndex: 0,
  students: [{ id: "student-1", name: "小林" }],
  groups: [{
    id: "group-1",
    name: "节水组",
    topic: "教学楼用水调查",
    goal: "识别浪费原因并提出可验证方案",
    selectedForms: ["研究报告"],
    members: [{ studentId: "student-1", name: "小林" }],
  }],
  feedback: [],
  learningEvidence: [],
  teacherAgentDirectives: [],
  content: {
    knowledgePoints: [],
    evaluationPlan: {
      overallRubric: "重视学生自主调查与证据分析过程",
      dimensions: [{ name: "证据质量", weight: 45, description: "数据由学生可靠采集并解释" }],
    },
  },
} as unknown as Course;

describe("delegated work policy", () => {
  it("requires contextual judgment instead of a static task blacklist", () => {
    const prompts = buildDelegatedWorkAssessmentPrompts({
      course,
      studentId: "student-1",
      studentName: "小林",
      stageKey: "make",
      request: "帮我搜集校园用水数据并汇总结论",
      documentText: "我们准备调查教学楼洗手池。",
    });
    expect(prompts.system).toContain("同一项工作在不同项目中结论可以不同");
    expect(prompts.system).toContain("搜集资料并汇总");
    expect(prompts.user).toContain("自主采集数据");
    expect(prompts.user).toContain("证据质量（权重 45）");
    expect(prompts.user).toContain("重视学生自主调查与证据分析过程");
  });

  it("conservatively normalizes malformed assessments to clarification", () => {
    const assessment = normalizeDelegatedWorkAssessment({ decision: "maybe" });
    expect(assessment.decision).toBe("clarify");
    expect(assessment.studentResponsibility).toBeTruthy();
  });

  it("asks the student directly instead of exposing internal assessment language", () => {
    const response = assessmentToBoundaryResponse(normalizeDelegatedWorkAssessment({
      decision: "clarify",
      taskTitle: "搜集资料",
      reason: "任务描述过于模糊，需要学生澄清。",
      studentMessage: "我还不确定你想先补哪类资料。你希望我先找背景数据、案例，还是表达范例？",
      protectedLearningWork: "学生选择研究方向",
      studentResponsibility: "学生需要选择主题",
      proposedScope: "AI 可以先整理三个资料方向",
    }));
    expect(response.message).toContain("我还不确定你想先补哪类资料");
    expect(response.message).not.toContain("学生");
    expect(response.message).not.toContain("任务描述过于模糊");
  });

  it("turns protected core learning into a refusal with an auxiliary alternative", () => {
    const response = assessmentToBoundaryResponse(normalizeDelegatedWorkAssessment({
      decision: "protected",
      taskTitle: "完成实地数据调查",
      reason: "自主采集与解释数据正是本项目的核心学习目标。",
      protectedLearningWork: "学生亲自采集并解释数据",
      studentResponsibility: "规划调查、采集数据并形成结论",
      proposedScope: "帮你设计一个空白记录表和核验清单",
      needsWebResearch: false,
      searchQuery: "",
    }));
    expect(response.kind).toBe("boundary");
    expect(response.message).toContain("需要由你亲自完成");
    expect(response.message).toContain("空白记录表");
  });

  it("returns an auditable detached delivery instead of an edit suggestion", () => {
    const assessment = normalizeDelegatedWorkAssessment({
      decision: "accepted",
      taskTitle: "整理术语表",
      reason: "术语整理是辅助工作。",
      protectedLearningWork: "证据分析",
      studentResponsibility: "核验术语并完成分析",
      proposedScope: "基于现有文档整理术语表",
      needsWebResearch: false,
      searchQuery: "",
    });
    const response = normalizeDelegatedWorkDelivery({
      assessment,
      researchMode: "model",
      raw: {
        message: "我完成了术语表，请你审阅。",
        deliverable: {
          title: "术语表",
          summary: "统一三个术语。",
          content: "| 术语 | 含义 |\n|---|---|\n| 流量 | 单位时间用水量 |",
          documentActions: [{
            operation: "insert-before",
            targetText: "研究方法",
            content: "| 术语 | 含义 |\n|---|---|\n| 流量 | 单位时间用水量 |",
            description: "在“研究方法”前加入术语表",
          }],
        },
      },
    });
    expect(response.kind).toBe("work-delivery");
    expect(response.suggestion).toBeUndefined();
    expect(response.message).toContain("确认后我再一次性应用");
    expect(response.message).not.toContain("已经插入");
    expect(response.deliverable?.content).toContain("| 术语 | 含义 |");
    expect(response.deliverable?.documentActions[0]).toMatchObject({
      operation: "insert-before",
      targetText: "研究方法",
    });
  });

  it("generates contextual quick tasks from the current document", () => {
    const prompts = buildDelegatedWorkStarterPrompts({
      course,
      studentId: "student-1",
      stageKey: "make",
      documentText: "我们已经记录了三处洗手池漏水现象，但还没有统一记录单位。",
    });
    expect(prompts.user).toContain("三处洗手池漏水现象");
    expect(prompts.system).toContain("不能使用固定通用模板");
    expect(normalizeDelegatedWorkStarters({
      starters: [
        "把文稿里已有的漏水现象整理成统一字段的记录表。",
        "根据当前记录整理一份单位和术语对照表。",
        "把当前文稿中的待补信息整理成资料搜集清单。",
      ],
    })).toHaveLength(3);
    const review = buildDelegatedWorkStarterReviewPrompts({
      course,
      studentId: "student-1",
      stageKey: "make",
      documentText: "我们准备调查教学楼洗手池。",
      candidates: ["替我采集所有数据并得出最终结论。"],
    });
    expect(review.system).toContain("必须改写为边缘性支持工作");
    expect(review.user).toContain("替我采集所有数据并得出最终结论");
  });

  it("never pretends to have searched when the course has no search service", () => {
    const response = unavailableResearchResponse(normalizeDelegatedWorkAssessment({
      decision: "accepted",
      taskTitle: "搜集最新数据",
      reason: "这是辅助材料。",
      protectedLearningWork: "方案设计",
      studentResponsibility: "核验数据并完成设计",
      proposedScope: "搜集三项公开数据",
      needsWebResearch: true,
      searchQuery: "校园节水 最新数据",
    }));
    expect(response.kind).toBe("task-clarification");
    expect(response.message).toContain("不能假装已经搜索");
  });

  it("keeps a search outage distinct from an AI collaboration failure", () => {
    const assessment = normalizeDelegatedWorkAssessment({
      decision: "accepted",
      taskTitle: "搜集公开数据",
      protectedLearningWork: "形成研究结论",
      studentResponsibility: "核验数据并作出判断",
      proposedScope: "搜集三项公开数据并保留来源",
      needsWebResearch: true,
      searchQuery: "公开数据",
    });
    const response = researchTemporarilyUnavailableResponse(assessment);
    expect(response.kind).toBe("task-clarification");
    expect(response.message).toContain("没有编造数据或来源");
  });
});
