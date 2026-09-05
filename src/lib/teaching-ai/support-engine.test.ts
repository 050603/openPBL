import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course, ProjectGroup } from "@/lib/session/types";

const llmMock = vi.hoisted(() => ({
  callLLM: vi.fn(),
}));

vi.mock("@/lib/llm/client", () => ({
  callLLM: llmMock.callLLM,
  parseLLMJson: (text: string) => JSON.parse(text),
}));

import {
  buildShowcaseCoach,
  buildReflectionClassSummary,
  buildReflectionEvidencePrompts,
  buildTeacherInterventionSignals,
  buildTeacherDashboardAdvice,
  diagnoseGroupIdea,
  diagnoseProjectArtifact,
  generateProcessEvaluation,
  generateProjectSkeleton,
  isStrongPblDrivingQuestion,
} from "./support-engine";

const group: ProjectGroup = {
  id: "g1",
  name: "第一组",
  topic: "校园节能调研",
  goal: "通过数据记录和 AI 辅助分析，提出校园节能改进方案。",
  keywords: [],
  selectedForms: ["方案报告"],
  members: [{ studentId: "s1", name: "小明" }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const course: Course = {
  id: "c1",
  name: "校园低碳生活",
  subject: "人工智能通识",
  grade: "高一",
  hours: 8,
  summary: "",
  drivingQuestion: "如何用 AI 改善校园低碳生活？",
  status: "teaching",
  stages: [{ key: "group", label: "小组构思", view: "group", description: "" }],
  currentStageIndex: 0,
  content: {
    pblOutline: "",
    knowledgePoints: [],
    lessonOutline: [],
    evaluationPlan: { dimensions: [], overallRubric: "" },
  },
  students: [{ id: "s1", name: "小明", joinedAt: "2026-01-01T00:00:00.000Z", stageProgress: { group: 10 } }],
  groups: [group],
  workPlan: [],
  uploads: [],
  aiSupports: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("teaching AI support engine", () => {
  beforeEach(() => {
    llmMock.callLLM.mockReset();
  });

  it("recognizes open, authentic and bounded PBL driving questions", () => {
    expect(
      isStrongPblDrivingQuestion(
        "我们如何为学校食堂设计一份有调查数据支持、可在本学期试行的减塑方案？",
      ),
    ).toBe(true);
    expect(isStrongPblDrivingQuestion("塑料有哪些种类？")).toBe(false);
    expect(isStrongPblDrivingQuestion("是否应该保护环境？")).toBe(false);
  });

  it("returns separate candidate groups for each course basics field", async () => {
    llmMock.callLLM.mockResolvedValueOnce(JSON.stringify({
      learningObjectiveOptions: Array.from({ length: 3 }, (_, index) => [
        `解释核心概念 ${index}`,
        `分析调查证据 ${index}`,
        `迭代项目成果 ${index}`,
      ]),
      summaryOptions: [
        "学生围绕校园减塑开展真实调查，分析数据并比较多种改进路径，最终形成可供食堂评估的实施建议。",
        "学生面向校园食堂观察塑料使用现状，以访谈和记录作为证据，设计并论证一项可实施的减塑方案。",
        "课程从校园日常消费情境出发，引导学生界定问题、收集证据、权衡限制并迭代面向真实对象的成果。",
      ],
      learnerProfileOptions: Array.from({ length: 3 }, () => ({
        priorKnowledge: "理解统计图表的基本含义",
        learningNeeds: "需要样本选择和证据论证支架",
        familiarContexts: "校园食堂与日常消费",
      })),
      drivingQuestions: [
        "我们如何为学校食堂设计一份有调查数据支持、可在本学期试行的减塑方案？",
        "我们怎样帮助校园商店依据一周消费记录，形成可执行并能验证效果的包装改进建议？",
        "什么样的校园减塑指南既能服务同学，又能用实测证据说明方案在八课时内可以完成？",
      ],
      scenario: "学校食堂邀请学生研究一次性塑料用品的使用现状。",
      suggestedForms: ["减塑方案", "数据报告", "倡议指南"],
      evaluationDimensions: [
        { name: "证据", weight: 50, description: "证据可靠" },
        { name: "可行性", weight: 50, description: "方案可实施" },
      ],
    }));

    const result = await generateProjectSkeleton({
      courseName: "校园减塑",
      subject: "科学",
      grade: "七年级",
      hours: 8,
    });

    expect(result.learningObjectiveOptions).toHaveLength(3);
    expect(result.summaryOptions).toHaveLength(3);
    expect(result.learnerProfileOptions).toHaveLength(3);
    expect(result.drivingQuestions.every(isStrongPblDrivingQuestion)).toBe(true);
  });

  it("accepts a focused summary response without unrelated project skeleton fields", async () => {
    llmMock.callLLM.mockResolvedValueOnce(JSON.stringify({
      summaries: [
        "学生将在校园真实情境中调查语言现象，比较不同处理方案，并依据收集到的证据形成可供同学使用的成果。",
        "课程围绕真实语言任务展开，学生需要界定问题、整理语料、检验判断并说明方案的适用边界。",
      ],
    }));

    const result = await generateProjectSkeleton({
      courseName: "自然语言处理基础",
      subject: "人工智能通识",
      grade: "高二",
      hours: 2,
      targetPart: "summary",
    });

    expect(result.summaryOptions).toHaveLength(2);
    expect(result.drivingQuestions).toEqual([]);
    expect(result.learningObjectiveOptions).toEqual([]);
  });

  it("puts grade band, learner profile, objectives and hour capacity into targeted suggestion prompts", async () => {
    llmMock.callLLM.mockResolvedValueOnce(JSON.stringify({
      summaryOptions: ["学生基于校园通知开展语言数据调查，在两课时内比较分类规则并形成一份有证据支持的改进说明。"],
    }));

    await generateProjectSkeleton({
      courseName: "自然语言处理基础",
      subject: "人工智能通识",
      grade: "高二",
      hours: 2,
      learningObjectives: ["比较两种文本分类方法"],
      learnerProfile: {
        priorKnowledge: "理解分类的直观含义",
        learningNeeds: "需要图示和分步示例",
        familiarContexts: "校园通知",
      },
      targetPart: "summary",
    });

    const messages = llmMock.callLLM.mock.calls[0]?.[0] as Array<{ content: string }>;
    const prompt = messages[1]?.content ?? "";
    expect(prompt).toContain("学段：高二");
    expect(prompt).toContain("课程容量：2 课时，共 120 分钟");
    expect(prompt).not.toContain("high-school");
    expect(prompt).toContain("理解分类的直观含义");
    expect(prompt).toContain("比较两种文本分类方法");
  });

  it("recommends bounded one-to-five hour course options from the topic and learner stage", async () => {
    llmMock.callLLM.mockResolvedValueOnce(JSON.stringify({
      courseHourOptions: [
        { hours: 1, rationale: "聚焦基础体验", scope: "认识分词、词频与一个分类体验" },
        { hours: 2, rationale: "兼顾原理与应用", scope: "增加语料整理、比较与项目产出" },
        { hours: 4, rationale: "适合完整小项目", scope: "包含测试、修订和成果说明" },
      ],
    }));

    const result = await generateProjectSkeleton({
      courseName: "自然语言处理基础",
      subject: "人工智能通识",
      grade: "高二",
      hours: 1,
      learnerProfile: { priorKnowledge: "没有编程基础" },
      targetPart: "courseHours",
    });

    expect(result.courseHourOptions.map((item) => item.hours)).toEqual([1, 2, 4]);
    const messages = llmMock.callLLM.mock.calls[0]?.[0] as Array<{ content: string }>;
    const prompt = messages[1]?.content ?? "";
    expect(prompt).toContain("1-5 课时");
    expect(prompt).not.toContain("10 课时");
  });

  it("keeps usable driving questions when a focused response omits legacy fields", async () => {
    llmMock.callLLM.mockResolvedValueOnce(JSON.stringify({
      questions: [
        "我们如何为学校图书馆设计一份有真实语料证据支持、两课时内可评审的智能检索改进建议？",
        "怎样帮助校园社团依据访谈记录，制作一份可验证效果的活动文本分类方案？",
      ],
    }));

    const result = await generateProjectSkeleton({
      courseName: "自然语言处理基础",
      subject: "人工智能通识",
      grade: "高二",
      hours: 2,
      targetPart: "drivingQuestions",
    });

    expect(result.drivingQuestions).toHaveLength(2);
    expect(result.summaryOptions).toEqual([]);
  });

  it("throws instead of returning fake local data when LLM fails", async () => {
    llmMock.callLLM.mockRejectedValueOnce(new Error("LLM disabled in test"));

    await expect(diagnoseGroupIdea({ course, group, tasks: [] })).rejects.toThrow("LLM disabled in test");
  });

  it("generates an anonymous persisted-ready class reflection summary with source mappings", async () => {
    const summaryCourse: Course = {
      ...course,
      students: [
        ...course.students,
        { id: "s2", name: "小红", joinedAt: "2026-01-01T00:00:00.000Z", stageProgress: {} },
        { id: "s3", name: "小刚", joinedAt: "2026-01-01T00:00:00.000Z", stageProgress: {} },
      ],
      reflections: [
        {
          id: "r1",
          courseId: "c1",
          studentId: "s1",
          studentName: "小明",
          content: "",
          survey: { schemaVersion: 1, learningReflection: "用数据调整了方案。", systemReflection: "AI 帮助整理资料。", aiHelpfulness: 4, systemUsability: 4, reuseIntention: 4 },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T01:00:00.000Z",
        },
        {
          id: "r2",
          courseId: "c1",
          studentId: "s2",
          studentName: "小红",
          content: "",
          survey: { schemaVersion: 1, learningReflection: "学会比较证据。", systemReflection: "分工还不够清楚。", aiHelpfulness: 3, systemUsability: 4, reuseIntention: 4 },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T01:01:00.000Z",
        },
        {
          id: "r3",
          courseId: "c1",
          studentId: "s3",
          studentName: "小刚",
          content: "",
          survey: { schemaVersion: 1, learningReflection: "重新理解了验证。", systemReflection: "没有采纳一次建议，因为不符合数据。", aiHelpfulness: 4, systemUsability: 3, reuseIntention: 5 },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T01:02:00.000Z",
        },
      ],
    };
    llmMock.callLLM.mockResolvedValueOnce(JSON.stringify({
      courseSummary: "学生逐渐用证据解释方案调整，但分工仍需提前约定。",
      teachingRecommendations: ["在实践前明确分工与交付物", "增加一次证据互查复盘"],
      categories: [
        { key: "learning-gains", summary: "证据意识增强", terms: [{ label: "证据", sources: [{ studentId: "respondent-1", fields: ["learningReflection"] }, { studentId: "unknown", fields: ["learningReflection"] }] }] },
        { key: "common-difficulties", summary: "分工仍有困难", terms: [{ label: "分工", sources: [{ studentId: "respondent-2", fields: ["systemReflection"] }] }] },
        { key: "ai-collaboration", summary: "AI 用于整理与比较", terms: [] },
        { key: "course-improvements", summary: "需要更多复盘", terms: [] },
      ],
      studentSummaries: [
        { studentId: "respondent-1", summary: "用数据调整方案。" },
        { studentId: "respondent-2", summary: "比较了不同证据。" },
        { studentId: "respondent-3", summary: "重新理解了验证。" },
        { studentId: "unknown", summary: "不应进入持久化结果。" },
      ],
    }));

    const draft = await buildReflectionClassSummary({ course: summaryCourse, trigger: "threshold" });
    expect(draft.kind).toBe("reflection-class-summary");
    expect(draft.targetType).toBe("course");
    expect(draft.structuredPayload).toMatchObject({ responseCount: 3, coverageBucket: 100 });
    expect(JSON.stringify(llmMock.callLLM.mock.calls[0])).not.toContain("小红");
    expect(draft.structuredPayload).toMatchObject({
      categories: expect.arrayContaining([
        expect.objectContaining({ key: "learning-gains", terms: [{ label: "证据", sources: [{ studentId: "s1", fields: ["learningReflection"] }] }] }),
      ]),
      studentSummaries: expect.arrayContaining([
        { studentId: "s1", summary: "用数据调整方案。" },
        { studentId: "s2", summary: "比较了不同证据。" },
        { studentId: "s3", summary: "重新理解了验证。" },
      ]),
    });
    expect(JSON.stringify(draft.structuredPayload)).not.toContain("unknown");
  });

  it("diagnoses group ideas from real LLM JSON", async () => {
    llmMock.callLLM.mockResolvedValueOnce(JSON.stringify({
      diagnosis: "方案方向清晰，但证据计划需要更具体。",
      suggestions: ["补充样本来源", "明确 AI 只用于整理访谈记录"],
      evidence: ["已有校园节能主题和成果形式"],
    }));

    const draft = await diagnoseGroupIdea({ course, group, tasks: [] });

    expect(draft.kind).toBe("idea-check");
    expect(draft.source).toBe("llm");
    expect(draft.suggestions).toContain("补充样本来源");
  });

  it("flags artifact gaps from real LLM JSON", async () => {
    llmMock.callLLM.mockResolvedValueOnce(JSON.stringify({
      diagnosis: "作品缺少证据链说明。",
      suggestions: ["补充调研数据来源"],
      evidence: ["当前文档只描述宣传方案"],
    }));

    const draft = await diagnoseProjectArtifact({
      course,
      group,
      stageKey: "make",
      documentHtml: "<p>我们准备做一个低碳宣传方案。</p>",
      uploads: [],
      tasks: [],
      focus: "evidence",
    });

    expect(draft.kind).toBe("artifact-diagnosis");
    expect(draft.source).toBe("llm");
    expect(draft.evidence).toContain("当前文档只描述宣传方案");
  });

  it("applies teacher guidance and converts unsupported process dimensions to zero", async () => {
    llmMock.callLLM.mockResolvedValueOnce(JSON.stringify({
      summary: "学生已完成项目意图，尚缺少实践与迭代证据。",
      dimensions: [
        {
          dimensionId: "progress",
          name: "过程推进",
          score: 60,
          rationale: "已完成项目意图。",
          evidenceIds: ["evidence-1"],
          evidenceGaps: ["缺少实践记录"],
        },
        {
          dimensionId: "iteration",
          name: "证据与迭代质量",
          rationale: "尚无迭代证据。",
          evidenceIds: [],
          evidenceGaps: ["缺少迭代记录"],
        },
      ],
      evidenceIds: ["evidence-1"],
      evidenceGaps: ["缺少实践记录", "缺少迭代记录"],
      confidence: "low",
      highlights: ["已明确项目意图"],
      improvements: ["补充测试与修订记录"],
    }));

    const result = await generateProcessEvaluation({
      course: {
        ...course,
        learningEvidence: [{
          id: "evidence-1",
          schemaVersion: 1,
          courseId: course.id,
          studentId: "s1",
          stageKey: "make",
          kind: "project-intent",
          title: "项目意图",
          summary: "研究校园节能并形成可验证方案。",
          payload: {
            concern: "校园能耗偏高",
            affectedPeople: "全校师生",
            importance: "减少浪费",
            successIndicator: "形成可验证的节能方案",
            personalQuestion: "如何减少教室无效能耗？",
          },
          status: "submitted",
          source: "student",
          countsTowardReadiness: true,
          evidenceRefs: [],
          artifactSnapshotIds: [],
          createdAt: "2026-08-06T00:00:00.000Z",
          updatedAt: "2026-08-06T00:00:00.000Z",
        }],
      },
      groupId: "g1",
      teacherGuidance: "重点检查测试方法是否可靠，不要因为选题新颖加分。",
    });

    expect(result.dimensions.map((dimension) => dimension.score)).toEqual([60, 0, 0, 0, 0]);
    const messages = llmMock.callLLM.mock.calls[0]?.[0] as Array<{ content: string }>;
    expect(messages[1]?.content).toContain("重点检查测试方法是否可靠");
    expect(messages[1]?.content).toContain("阶段=项目实践");
    expect(messages[1]?.content).toContain("类型=项目立意");
    expect(messages[1]?.content).toContain("状态=已提交");
    expect(messages[1]?.content).not.toContain("阶段=make");
  });

  it("builds teacher intervention signals only from LLM output", async () => {
    llmMock.callLLM.mockResolvedValueOnce(JSON.stringify({
      groups: [{
        groupId: "g1",
        riskLevel: "high",
        reasons: ["证据计划不足"],
        evidence: ["上传材料为 0 个"],
        supportCard: "请教师要求小组在 10 分钟内补充样本来源。",
      }],
    }));

    const signals = await buildTeacherInterventionSignals(course, "group");

    expect(signals[0]?.groupId).toBe("g1");
    expect(signals[0]?.supportCard).toContain("10 分钟");
  });

  it("builds dashboard advice from the current course evidence without inventing student ids", async () => {
    llmMock.callLLM.mockResolvedValueOnce(JSON.stringify({
      summary: "小明当前阶段进度为 10%，需要教师核对实际卡点。",
      actions: [{
        title: "巡视小明",
        detail: "依据当前 10% 的阶段进度，当面确认卡点后再决定是否提供支架。",
        kind: "patrol",
        studentIds: ["s1", "not-a-student"],
      }],
    }));

    const advice = await buildTeacherDashboardAdvice(course, "group");

    expect(advice.source).toBe("llm");
    expect(advice.actions[0]?.studentIds).toEqual(["s1"]);
    const messages = llmMock.callLLM.mock.calls[0]?.[0] as Array<{ content: string }>;
    expect(messages[1]?.content).toContain("校园低碳生活");
    expect(messages[1]?.content).toContain("证据不足时 actions 返回空数组");
  });

  it("creates showcase coaching from real LLM JSON", async () => {
    llmMock.callLLM.mockResolvedValueOnce(JSON.stringify({
      diagnosis: "汇报准备基本完整，需要突出 AI 使用判断。",
      suggestions: ["增加 AI 建议如何被验证的页面"],
      evidence: ["已有汇报 PPT"],
    }));

    const draft = await buildShowcaseCoach({
      course,
      group,
      uploads: [{ id: "u1", courseId: "c1", groupId: "g1", stageKey: "showcase", category: "presentation", title: "汇报PPT", fileName: "demo.pptx", fileType: "PPTX", size: "1MB", url: "/demo", createdAt: "2026-01-01T00:00:00.000Z" }],
      activities: [],
      aiSupports: [],
    });

    expect(draft.kind).toBe("showcase-coach");
    expect(draft.source).toBe("llm");
    expect(draft.suggestions.join(" ")).toContain("验证");
  });

  it("limits the new reflection guidance to two short prompts", async () => {
    llmMock.callLLM.mockResolvedValueOnce(JSON.stringify({
      diagnosis: "结合课程证据与系统体验回顾。",
      suggestions: [
        "有没有一次关键方案调整改变了你的想法？",
        "AI 的建议中有没有你没有采纳的？为什么？",
        "这条多余提示不应显示。",
      ],
      evidence: ["过程记录"],
    }));

    const draft = await buildReflectionEvidencePrompts({
      course,
      group,
      studentId: "s1",
      format: "compact",
    });

    expect(draft.suggestions).toHaveLength(2);
    expect(draft.suggestions.every((suggestion) => suggestion.length <= 60)).toBe(true);
    expect(draft.suggestions.every((suggestion) => /[？?]$/.test(suggestion))).toBe(true);
    const prompt = llmMock.callLLM.mock.calls[0]?.[0] as Array<{ content: string }>;
    expect(prompt[1]?.content).toContain("严格返回 2 条");
    expect(prompt[1]?.content).toContain("主要收获");
    expect(prompt[1]?.content).toContain("常见困难");
    expect(prompt[1]?.content).toContain("AI 协作看法");
    expect(prompt[1]?.content).toContain("下一轮课程改进");
  });
});
