import { describe, expect, it } from "vitest";
import { detectInterventionSignals, evaluateStageGate } from "./stage-gates";
import {
  DEFAULT_EVALUATION_FLOWS,
  DEFAULT_STAGES,
  type Course,
  type LearningEvidence,
} from "@/lib/session/types";
import {
  LEARNING_EVIDENCE_SCHEMA_VERSION,
  type LearningEvidenceKind,
  type LearningEvidencePayloadByKind,
} from "@/lib/learning-evidence/types";

const now = "2026-07-31T00:00:00.000Z";

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1", name: "城市水循环", subject: "科学", grade: "八年级", hours: 8,
    summary: "研究社区用水", drivingQuestion: "如何减少校园用水浪费？", learningObjectives: ["解释水循环"], expectedOutcome: "节水方案",
    status: "teaching", stages: DEFAULT_STAGES, currentStageIndex: 0, students: [{ id: "s1", name: "小林", joinedAt: now, stageProgress: {} }],
    content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "", flows: DEFAULT_EVALUATION_FLOWS } },
    learningEvidence: [], artifactSnapshots: [],
    createdAt: now, updatedAt: now,
    ...overrides,
  };
}

function evidence<Kind extends LearningEvidenceKind>(
  kind: Kind,
  stageKey: string,
  payload: LearningEvidencePayloadByKind[Kind],
  status: LearningEvidence["status"] = "submitted",
): LearningEvidence<Kind> {
  return {
    id: `${kind}-${Math.random()}`,
    schemaVersion: LEARNING_EVIDENCE_SCHEMA_VERSION,
    courseId: "course-1",
    studentId: "s1",
    stageKey,
    kind,
    title: kind,
    summary: "学生证据",
    payload,
    status,
    source: "student",
    countsTowardReadiness: true,
    evidenceRefs: [],
    artifactSnapshotIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe("evaluateStageGate", () => {
  it("blocks launch without a participant", () => expect(evaluateStageGate(course({ students: [] }), 0).blockers.map((item) => item.code)).toContain("participants"));
  it("requires every student to select a teacher-provided research direction during launch", () => {
    expect(evaluateStageGate(course(), 0).blockers.map((item) => item.code)).toContain("launch-selection");
    const personalProject = {
      id: "g1", name: "小林的个人项目", topic: "怎样减少校园用水浪费？",
      keywords: [], selectedForms: [], members: [{ studentId: "s1", name: "小林" }],
      createdAt: now, updatedAt: now,
    };
    expect(evaluateStageGate(course({ groups: [personalProject] }), 0).canAdvance).toBe(true);
  });
  it("blocks AI learning without generated content", () => expect(evaluateStageGate(course(), 1).blockers.map((item) => item.code)).toContain("ai-content"));
  it("requires one complete project plan before teacher approval", () => {
    const proposalEvidence = [
      evidence("knowledge-transfer", "proposal", { concept: "变量", ownExplanation: "一次只改变一个因素", projectConstraint: "只改提示位置", application: "固定文案" }),
      evidence("key-decision", "proposal", {
        alternatives: [
          { id: "a", title: "海报", description: "视觉提示", comparison: { 可测试: "高" } },
          { id: "b", title: "装置", description: "实体提醒", comparison: { 可测试: "中" } },
        ],
        successCriteria: ["可测试"], selectedAlternativeId: "a", reason: "可在课内验证",
      }),
      evidence("plan-version", "proposal", {
        versionLabel: "V1", changeSummary: "制作节水提示并应用变量控制知识", nextActions: ["制作"], validationMethod: "用户测试",
        risks: ["隐私"], aiBoundary: "AI 只检查遗漏",
      }),
    ];
    expect(evaluateStageGate(course({ learningEvidence: proposalEvidence.slice(0, 2) }), 2).blockers.map((item) => item.code))
      .toContain("proposal-evidence");
    expect(evaluateStageGate(course({ learningEvidence: proposalEvidence }), 2).blockers.map((item) => item.code))
      .toContain("teacher-approval");
  });
  it("accepts a submitted work file for project making", () => {
    const result = evaluateStageGate(course({
      uploads: [{ id: "u1", courseId: "course-1", studentId: "s1", stageKey: "make", category: "artifact", title: "初稿", fileName: "a.pdf", fileType: "PDF", size: "1MB", url: "/a", createdAt: now }],
    }), 3);
    expect(result.blockers.map((item) => item.code)).not.toContain("iteration-evidence");
    expect(result.completed).toContain("所有学生均已提交作品");
  });
  it("also blocks making while a high-risk intervention is open", () => {
    const result = evaluateStageGate(course({
      teacherInterventions: [{ id: "i1", stageKey: "make", scope: "student", targetIds: ["s1"], reason: "伦理风险", evidence: ["作品内容"], action: "guidance", instruction: "重新判断", severity: "high", status: "open", teacherName: "教师", createdAt: now }],
    }), 3);
    expect(result.blockers.map((item) => item.code)).toContain("high-risk");
  });
  it("requires a showcase workstation submission and teacher live evaluation", () => {
    const project = { id: "g1", name: "小林的个人项目", topic: "节水", keywords: [], selectedForms: [], members: [{ studentId: "s1", name: "小林" }], createdAt: now, updatedAt: now };
    const base = {
      groups: [project],
      uploads: [{ id: "upload-1", courseId: "course-1", studentId: "s1", groupId: "g1", stageKey: "showcase", category: "presentation" as const, title: "节水海报", fileName: "showcase.pdf", fileType: "PDF", size: "1 MB", url: "/showcase.pdf", createdAt: now }],
    };
    const withoutEvaluation = evaluateStageGate(course(base), 4);
    expect(withoutEvaluation.blockers.map((item) => item.code)).toContain("showcase-evaluation");
    const withEvaluation = evaluateStageGate(course({
      ...base,
      rubricScores: [{ id: "score-1", courseId: "course-1", groupId: "g1", stageKey: "showcase", dimensionScores: {}, teacherTotal: 82, comment: "已完成现场评价", total: 82, status: "submitted", createdAt: now, updatedAt: now }],
    }), 4);
    expect(withEvaluation.canAdvance).toBe(true);
  });
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

  it("covers the six teacher-attention signals from canonical evidence and operational records", () => {
    const old = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    const offTarget = {
      ...evidence("artifact-version", "make", {
        iterationId: "round-1",
        versionLabel: "V1",
        artifactTitle: "节水海报",
        changeSummary: "完成第一版",
        contentExcerpt: "提醒随手关水",
      }, "needs-revision"),
      id: "evidence-off-target",
      teacherFeedback: "当前版本偏离驱动问题，需要重新校准范围。",
    };
    const ethics = {
      ...evidence("test-result", "make", {
        iterationId: "round-1",
        method: "现场观察",
        target: "同学",
        observation: "记录用水行为",
        result: "获得初步数据",
      }, "needs-revision"),
      id: "evidence-ethics",
      teacherFeedback: "测试涉及学生隐私与数据安全，请先调整方法。",
    };
    const result = detectInterventionSignals(course({
      currentStageIndex: 3,
      students: [
        { id: "s1", name: "小林", joinedAt: old, stageProgress: {} },
        { id: "s2", name: "小周", joinedAt: old, stageProgress: {} },
      ],
      aiLearningProgress: {
        s1: { classroomId: "c", studentId: "s1", currentSceneIndex: 1, totalScenes: 2, completedScenes: [], lastActiveAt: old, masteryLevel: "in-progress", unmetGoals: ["变量关系"] },
        s2: { classroomId: "c", studentId: "s2", currentSceneIndex: 1, totalScenes: 2, completedScenes: [], lastActiveAt: old, masteryLevel: "in-progress", unmetGoals: ["变量关系"] },
      },
      learningSignals: [{
        id: "signal-stalled",
        courseId: "course-1",
        studentId: "s1",
        stageKey: "make",
        kind: "goal-stalled",
        severity: "warning",
        status: "open",
        title: "当前小目标停滞",
        summary: "尚未形成新的版本证据",
        normalizedIssueKey: "goal-stalled:make",
        evidenceEventIds: ["event-1"],
        aiInterventionAttempts: 1,
        firstDetectedAt: old,
        lastDetectedAt: old,
      }],
      aiContributions: [{
        id: "ai-ready-made",
        courseId: "course-1",
        studentId: "s1",
        stageKey: "make",
        companionId: "planner",
        impact: "high",
        request: "请你直接生成一个可直接提交的完整作品",
        suggestion: "系统已阻止完整代做",
        sourceEvidenceIds: [],
        status: "pending-decision",
        createdAt: old,
      }],
      learningEvidence: [offTarget, ethics],
      aiAssessmentSuggestions: [{
        id: "assessment-gap",
        courseId: "course-1",
        studentId: "s1",
        stageKey: "make",
        dimensions: [],
        evidenceIds: [offTarget.id],
        evidenceGaps: ["缺少真实测试结果"],
        confidence: "low",
        status: "insufficient-evidence",
        createdAt: old,
      }],
    }));
    expect(new Set(result.map((signal) => signal.kind))).toEqual(new Set(["shared-misconception", "off-target", "over-generation", "ethics", "low-confidence", "stalled"]));
    expect(result.every((signal) => signal.evidence.length && signal.targetIds.length && signal.suggestedAction.length)).toBe(true);
  });

  it("does not derive new intervention signals from legacy task progress or AI-support records", () => {
    const old = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    const result = detectInterventionSignals(course({
      currentStageIndex: 3,
      groups: [{ id: "g1", name: "旧个人项目", topic: "旧任务", keywords: [], selectedForms: [], members: [{ studentId: "s1", name: "小林" }], createdAt: old, updatedAt: old }],
      workPlan: [{ id: "t1", groupId: "g1", role: "成员", memberName: "小林", task: "旧任务", progress: 0 }],
      aiSupports: [{ id: "old-ai", courseId: "course-1", stageKey: "make", targetType: "group", targetId: "g1", groupId: "g1", kind: "artifact-diagnosis", trigger: "完整生成", inputSummary: "", diagnosis: "证据不足", suggestions: [], evidence: ["旧记录"], status: "draft", createdAt: old, updatedAt: old }],
    }));
    expect(result).toEqual([]);
  });
});
