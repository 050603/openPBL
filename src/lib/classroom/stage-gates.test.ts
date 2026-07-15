import { describe, expect, it } from "vitest";
import { detectInterventionSignals, evaluateStageGate } from "./stage-gates";
import { DEFAULT_EVALUATION_FLOWS, DEFAULT_STAGES, type Course } from "@/lib/session/types";

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1", name: "城市水循环", subject: "科学", grade: "八年级", hours: 8,
    summary: "研究社区用水", drivingQuestion: "如何减少校园用水浪费？", learningObjectives: ["解释水循环"], expectedOutcome: "节水方案",
    status: "teaching", stages: DEFAULT_STAGES, currentStageIndex: 0, students: [{ id: "s1", name: "小林", joinedAt: new Date().toISOString(), stageProgress: {} }],
    content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "", flows: DEFAULT_EVALUATION_FLOWS } },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("evaluateStageGate", () => {
  it("blocks launch without a participant", () => expect(evaluateStageGate(course({ students: [] }), 0).blockers.map((item) => item.code)).toContain("participants"));
  it("blocks AI learning without generated content", () => expect(evaluateStageGate(course(), 1).blockers.map((item) => item.code)).toContain("ai-content"));
  it("blocks incomplete personal proposals", () => expect(evaluateStageGate(course({ groups: [{ id: "g1", name: "小林的个人项目", topic: "", keywords: [], selectedForms: [], members: [{ studentId: "s1", name: "小林" }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }), 2).blockers.map((item) => item.code)).toContain("proposal-fields"));
  it("requires teacher approval in the merged proposal stage", () => expect(evaluateStageGate(course({ groups: [{ id: "g1", name: "小林的个人项目", topic: "节水", goal: "方案", keywords: [], selectedForms: [], members: [{ studentId: "s1", name: "小林" }], proposal: { projectQuestion: "如何节水", outcomeFormat: "海报", implementationPlan: "调研并设计", requiredKnowledge: ["数据"], aiUsePlan: "请 AI 质疑方案", risks: [] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }), 2).blockers.map((item) => item.code)).toContain("teacher-approval"));
  it("blocks making while high-risk intervention is open", () => expect(evaluateStageGate(course({ classConfig: { groupMode: "free", totalStudents: 1 }, groups: [{ id: "g1", name: "一组", topic: "节水", keywords: [], selectedForms: [], members: [{ studentId: "s1", name: "小林" }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }], uploads: [{ id: "u1", courseId: "course-1", groupId: "g1", stageKey: "make", category: "artifact", title: "初稿", fileName: "a.pdf", fileType: "PDF", size: "1MB", url: "/a", createdAt: new Date().toISOString() }], teacherInterventions: [{ id: "i1", stageKey: "make", scope: "group", targetIds: ["g1"], reason: "伦理风险", evidence: ["作品内容"], action: "guidance", instruction: "重新判断", severity: "high", status: "open", teacherName: "教师", createdAt: new Date().toISOString() }] }), 3).blockers.map((item) => item.code)).toContain("high-risk"));
  it("treats reflection as terminal with warnings, not a forward blocker", () => expect(evaluateStageGate(course(), 5).canAdvance).toBe(true));
});

describe("detectInterventionSignals", () => {
  it("returns evidence, targets and action for shared misconceptions", () => {
    const result = detectInterventionSignals(course({ aiLearningProgress: {
      s1: { classroomId: "c", studentId: "s1", currentSceneIndex: 1, totalScenes: 2, completedScenes: [], lastActiveAt: new Date().toISOString(), masteryLevel: "in-progress", unmetGoals: ["解释变量关系"] },
      s2: { classroomId: "c", studentId: "s2", currentSceneIndex: 1, totalScenes: 2, completedScenes: [], lastActiveAt: new Date().toISOString(), masteryLevel: "in-progress", unmetGoals: ["解释变量关系"] },
    } }));
    expect(result[0]).toMatchObject({ kind: "shared-misconception", targetIds: ["s1", "s2"], confidence: "high" });
    expect(result[0].evidence.length).toBeGreaterThan(0);
    expect(result[0].suggestedAction.length).toBeGreaterThan(0);
  });

  it("covers the six personal-project teacher-attention signals", () => {
    const old = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    const result = detectInterventionSignals(course({
      currentStageIndex: 3,
      aiLearningProgress: {
        s1: { classroomId: "c", studentId: "s1", currentSceneIndex: 1, totalScenes: 2, completedScenes: [], lastActiveAt: old, masteryLevel: "in-progress", unmetGoals: ["变量关系"] },
        s2: { classroomId: "c", studentId: "s2", currentSceneIndex: 1, totalScenes: 2, completedScenes: [], lastActiveAt: old, masteryLevel: "in-progress", unmetGoals: ["变量关系"] },
      },
      groups: [{ id: "g1", name: "小林的个人项目", topic: "节水", keywords: [], selectedForms: [], members: [{ studentId: "s1", name: "小林" }], createdAt: old, updatedAt: old }],
      workPlan: [{ id: "t1", groupId: "g1", role: "成员", memberName: "小林", task: "调研", progress: 0 }],
      aiSupports: [
        { id: "a1", courseId: "course-1", stageKey: "make", targetType: "group", targetId: "g1", groupId: "g1", kind: "artifact-diagnosis", trigger: "检查目标", inputSummary: "", diagnosis: "作品偏离教学目标", suggestions: [], evidence: ["目标对照"], status: "draft", createdAt: old, updatedAt: old },
        { id: "a2", courseId: "course-1", stageKey: "make", targetType: "group", targetId: "g1", groupId: "g1", kind: "artifact-diagnosis", trigger: "完整生成", inputSummary: "", diagnosis: "学生要求代写全部完成", suggestions: [], evidence: ["请求记录"], status: "draft", createdAt: old, updatedAt: old },
        { id: "a3", courseId: "course-1", stageKey: "make", targetType: "group", targetId: "g1", groupId: "g1", kind: "artifact-diagnosis", trigger: "伦理检查", inputSummary: "", diagnosis: "涉及隐私与公平", suggestions: [], evidence: ["作品文本"], status: "draft", createdAt: old, updatedAt: old },
        { id: "a4", courseId: "course-1", stageKey: "make", targetType: "group", targetId: "g1", groupId: "g1", kind: "artifact-diagnosis", trigger: "事实检查", inputSummary: "", diagnosis: "证据不足，AI 无法判断", suggestions: [], evidence: ["缺少来源"], status: "draft", createdAt: old, updatedAt: old },
      ],
    }));
    expect(new Set(result.map((signal) => signal.kind))).toEqual(new Set(["shared-misconception", "off-target", "over-generation", "ethics", "low-confidence", "stalled"]));
    expect(result.every((signal) => signal.evidence.length && signal.targetIds.length && signal.suggestedAction.length)).toBe(true);
  });
});
