import { describe, expect, it } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";
import {
  deriveStageReadiness,
  isSnapshotInspectable,
} from "./readiness";
import {
  canApplyAiDecision,
  canRequestCompanionSupport,
  isReadyMadeDeliverableRequest,
} from "./ai-policy";
import { getStageMissionDefinition, inferLearningPreset } from "./missions";
import type {
  ArtifactSnapshot,
  LearningEvidence,
  LearningEvidenceKind,
  LearningEvidencePayloadByKind,
} from "./types";
import { LEARNING_EVIDENCE_SCHEMA_VERSION } from "./types";

const now = "2026-07-31T00:00:00.000Z";

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "证据课堂",
    subject: "科学",
    grade: "初二",
    hours: 8,
    summary: "改善校园饮水",
    drivingQuestion: "怎样改善校园饮水体验？",
    status: "teaching",
    stages: DEFAULT_STAGES,
    currentStageIndex: 0,
    students: [{ id: "student-1", name: "小林", joinedAt: now, stageProgress: {} }],
    groups: [{
      id: "grp-student-1",
      name: "小林的个人项目",
      topic: "饮水提示器",
      keywords: [],
      selectedForms: [],
      members: [{ studentId: "student-1", name: "小林" }],
      createdAt: now,
      updatedAt: now,
    }],
    content: {
      pblOutline: "",
      knowledgePoints: [],
      lessonOutline: [],
      evaluationPlan: { dimensions: [], overallRubric: "" },
    },
    learningEvidence: [],
    artifactSnapshots: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function evidence<Kind extends LearningEvidenceKind>(
  kind: Kind,
  stageKey: string,
  payload: LearningEvidencePayloadByKind[Kind],
  overrides: Partial<LearningEvidence<Kind>> = {},
): LearningEvidence<Kind> {
  return {
    id: `evidence-${kind}-${Math.random()}`,
    schemaVersion: LEARNING_EVIDENCE_SCHEMA_VERSION,
    courseId: "course-1",
    studentId: "student-1",
    stageKey,
    kind,
    title: kind,
    summary: "学生自己的证据",
    payload,
    status: "submitted",
    source: "student",
    countsTowardReadiness: true,
    evidenceRefs: [],
    artifactSnapshotIds: [],
    createdAt: now,
    updatedAt: now,
    submittedAt: now,
    ...overrides,
  };
}

const projectIntent = evidence("project-intent", "launch", {
  concern: "饮水点排队",
  affectedPeople: "午休时段的学生",
  importance: "排队影响休息和饮水",
  successIndicator: "平均等待时间减少",
  personalQuestion: "怎样减少午休饮水排队？",
});

describe("learning preset and mission definitions", () => {
  it("uses the same concise work submission task for all three presets", () => {
    expect(inferLearningPreset("小学五年级")).toBe("guided");
    expect(inferLearningPreset("初二")).toBe("standard");
    expect(inferLearningPreset("本科二年级")).toBe("research");

    expect(getStageMissionDefinition("make", "guided").requiredIterations).toBe(0);
    expect(getStageMissionDefinition("make", "standard").requiredIterations).toBe(0);
    expect(getStageMissionDefinition("make", "research").targetIterations).toBe(0);
    expect(getStageMissionDefinition("make", "research").actions.map((item) => item.id))
      .toEqual(["project-work"]);
  });
});

describe("stage readiness derives only from valid evidence", () => {
  it("uses resource viewing and topic choice for project launch", () => {
    const course = makeCourse({
      groups: [{
        id: "grp-student-1",
        name: "个人项目",
        topic: "待确定研究主题",
        keywords: [],
        selectedForms: [],
        members: [{ studentId: "student-1", name: "小林", role: "负责人" }],
        createdAt: now,
        updatedAt: now,
      }],
      resources: [{
        id: "resource-1",
        title: "资料",
        type: "PDF",
        size: "1 MB",
        downloadedBy: ["student-1"],
      }],
      todos: [{
        id: "todo-1",
        title: "浏览资料",
        description: "",
        stageKey: "launch",
        completedBy: ["student-1"],
      }],
      uploads: [{
        id: "upload-1",
        courseId: "course-1",
        studentId: "student-1",
        stageKey: "launch",
        category: "evidence",
        title: "随手上传",
        fileName: "x.png",
        fileType: "PNG",
        size: "10 KB",
        url: "/x.png",
        createdAt: now,
      }],
      companionThreads: [{
        id: "thread-1",
        courseId: "course-1",
        studentId: "student-1",
        stageKey: "launch",
        messages: Array.from({ length: 20 }, (_, index) => ({
          id: `message-${index}`,
          role: "student" as const,
          content: "聊天",
          visibility: "student-and-teacher" as const,
          createdAt: now,
        })),
        createdAt: now,
        updatedAt: now,
      }],
    });

    expect(deriveStageReadiness(course, "student-1", "launch").status).toBe("working");
  });

  it("does not require the retired project-intent form or teacher calibration", () => {
    const course = makeCourse({ learningEvidence: [projectIntent] });
    const readiness = deriveStageReadiness(course, "student-1", "launch");
    expect(readiness.status).toBe("ready");
    expect(readiness.teacherCalibration).toBe("not-required");
  });

  it("marks project making ready after one work upload and keeps later versions", () => {
    const upload = {
      id: "work-v1",
      courseId: "course-1",
      studentId: "student-1",
      stageKey: "make",
      category: "artifact" as const,
      title: "原型.docx",
      fileName: "原型.docx",
      fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: "1024",
      url: "/uploads/work-v1",
      createdAt: now,
    };
    const one = deriveStageReadiness(makeCourse({ uploads: [upload] }), "student-1", "make");
    expect(one.completedIterations).toBe(1);
    expect(one.status).toBe("ready");

    const two = deriveStageReadiness(makeCourse({
      uploads: [upload, { ...upload, id: "work-v2", url: "/uploads/work-v2" }],
    }), "student-1", "make");
    expect(two.completedIterations).toBe(2);
    expect(two.status).toBe("ready");
  });

  it("accepts a concise reflection workstation submission without a word-count threshold", () => {
    const course = makeCourse({
      reflections: [{
        id: "reflection-1",
        courseId: "course-1",
        studentId: "student-1",
        studentName: "小林",
        content: "先测再改",
        improvementPlan: "下一次先观察真实使用情况",
        createdAt: now,
        updatedAt: now,
      }],
    });
    expect(deriveStageReadiness(course, "student-1", "reflection").status).toBe("ready");
  });
});

describe("artifact and AI safeguards", () => {
  it("never treats a metadata-only file as AI-readable", () => {
    expect(isSnapshotInspectable({
      id: "snapshot",
      courseId: "course-1",
      studentId: "student-1",
      stageKey: "showcase",
      title: "报告",
      fileName: "report.pdf",
      fileType: "PDF",
      inspectionStatus: "metadata-only",
      createdAt: now,
    })).toBe(false);
  });

  it("requires a student seed for high-impact roles but keeps knowledge help available", () => {
    const course = makeCourse();
    expect(canRequestCompanionSupport(course, "student-1", "proposal", "planner").allowed)
      .toBe(false);
    expect(canRequestCompanionSupport(course, "student-1", "proposal", "knowledge").allowed)
      .toBe(true);

    const seeded = makeCourse({
      learningEvidence: [{
        ...projectIntent,
        stageKey: "proposal",
        status: "draft",
      }],
    });
    expect(canRequestCompanionSupport(seeded, "student-1", "proposal", "planner").allowed)
      .toBe(true);
  });

  it("does not apply an AI decision without a reason and concrete version change", () => {
    expect(canApplyAiDecision({ decision: "adopted", reason: "" }).allowed).toBe(false);
    expect(canApplyAiDecision({
      decision: "modified",
      reason: "保留我的测试范围",
      appliedChangeSummary: "只调整第二步",
    }).allowed).toBe(true);
    expect(canApplyAiDecision({ decision: "rejected", reason: "与测试结果冲突" }).allowed)
      .toBe(true);
  });

  it("detects requests for a submission-ready deliverable", () => {
    expect(isReadyMadeDeliverableRequest("请直接帮我生成一份完整方案")).toBe(true);
    expect(isReadyMadeDeliverableRequest("帮我写出可直接提交的报告")).toBe(true);
    expect(isReadyMadeDeliverableRequest("请解释这个概念为什么适用于我的草稿")).toBe(false);
  });
});

describe("full-upgrade boundary", () => {
  it("does not infer AI-learning readiness from the retired stageProgress field", () => {
    const course = makeCourse({
      students: [{
        id: "student-1",
        name: "小林",
        joinedAt: now,
        stageProgress: { "ai-learning": 100 },
      }],
    });

    expect(deriveStageReadiness(course, "student-1", "ai-learning").status)
      .toBe("not-started");
  });

  it("uses showcase workstation uploads but never confirms an automatic AI total", () => {
    const course = makeCourse({
      uploads: [{
        id: "upload-1",
        courseId: "course-1",
        studentId: "student-1",
        stageKey: "showcase",
        category: "artifact",
        title: "旧成果",
        fileName: "old.pdf",
        fileType: "PDF",
        size: "1 MB",
        url: "/old.pdf",
        createdAt: now,
      }],
      rubricScores: [{
        id: "score-1",
        courseId: "course-1",
        groupId: "grp-student-1",
        stageKey: "showcase",
        dimensionScores: {},
        aiTotal: 100,
        comment: "",
        total: 100,
        status: "submitted",
        createdAt: now,
        updatedAt: now,
      }],
    });
    expect(course.learningEvidence).toEqual([]);
    expect(course.aiAssessmentSuggestions).toBeUndefined();
    expect(deriveStageReadiness(course, "student-1", "showcase").status)
      .toBe("awaiting-calibration");
  });
});
