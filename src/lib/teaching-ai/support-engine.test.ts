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
  buildTeacherInterventionSignals,
  diagnoseGroupIdea,
  diagnoseProjectArtifact,
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

  it("throws instead of returning fake local data when LLM fails", async () => {
    llmMock.callLLM.mockRejectedValueOnce(new Error("LLM disabled in test"));

    await expect(diagnoseGroupIdea({ course, group, tasks: [] })).rejects.toThrow("LLM disabled in test");
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
});
