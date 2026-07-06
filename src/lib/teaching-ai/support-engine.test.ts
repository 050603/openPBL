import { describe, expect, it, vi } from "vitest";
import type { Course, ProjectGroup } from "@/lib/session/types";

// Mock LLM client to avoid real network calls during tests.
// Forces all functions to use local fallback logic.
vi.mock("@/lib/llm/client", () => ({
  callLLM: vi.fn().mockRejectedValue(new Error("LLM disabled in test")),
  isLlmReady: vi.fn().mockResolvedValue(false),
  parseLLMJson: vi.fn(() => ({})),
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
  topic: "待确定选题方向",
  goal: "",
  keywords: [],
  selectedForms: [],
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
  it("diagnoses missing group idea elements with actionable suggestions", async () => {
    const draft = await diagnoseGroupIdea({ course, group, tasks: [] });

    expect(draft.kind).toBe("idea-check");
    expect(draft.suggestions.join(" ")).toContain("选题");
    expect(draft.suggestions.join(" ")).toContain("分配");
    expect(draft.evidence.length).toBeGreaterThan(0);
  });

  it("does not produce a complete project artifact for students", async () => {
    const improvedGroup = {
      ...group,
      topic: "如何减少教室无人时的照明浪费？",
      goal: "通过观察数据和提醒机制，减少教室无人时的照明浪费。",
      selectedForms: ["方案报告"],
    };

    const draft = await diagnoseGroupIdea({
      course,
      group: improvedGroup,
      tasks: [{ id: "t1", groupId: "g1", role: "调研员", memberName: "小明", task: "记录照明使用数据", progress: 20 }],
    });

    expect(draft.suggestions.every((item) => !item.includes("完整方案如下"))).toBe(true);
    expect(draft.suggestions.length).toBeGreaterThan(0);
  });

  it("flags evidence gaps in current project artifacts", async () => {
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
    expect(draft.suggestions.join(" ")).toContain("证据");
    expect(draft.evidence.join(" ")).toContain("缺少");
  });

  it("builds teacher intervention signals from teaching events", async () => {
    const signals = await buildTeacherInterventionSignals(course, "group");

    expect(signals[0]?.groupId).toBe("g1");
    expect(signals[0]?.supportCard).toContain("建议教师");
  });

  it("creates a showcase coaching checklist from uploads and process evidence", async () => {
    const draft = await buildShowcaseCoach({
      course,
      group,
      uploads: [{ id: "u1", courseId: "c1", groupId: "g1", stageKey: "showcase", category: "presentation", title: "汇报PPT", fileName: "demo.pptx", fileType: "PPTX", size: "1MB", url: "/demo", createdAt: "2026-01-01T00:00:00.000Z" }],
      activities: [],
      aiSupports: [],
    });

    expect(draft.kind).toBe("showcase-coach");
    expect(draft.suggestions.join(" ")).toContain("追问");
  });
});
