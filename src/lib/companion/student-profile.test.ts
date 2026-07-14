import { describe, expect, it } from "vitest";
import { DEFAULT_STAGES } from "@/lib/session/types";
import { deriveStudentLearningProfile, studentProfilePrompt } from "./student-profile";

describe("student learning profile", () => {
  it("does not use interaction count alone to mark AI reliance", () => {
    const course = {
      id: "c1", name: "课", subject: "科学", grade: "六年级", hours: 2, summary: "", drivingQuestion: "问题", status: "teaching" as const,
      stages: DEFAULT_STAGES, currentStageIndex: 2,
      content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
      students: [{ id: "s1", name: "小林", joinedAt: "2026-07-12", stageProgress: { proposal: 75 } }],
      submissions: [{ id: "sub1", courseId: "c1", studentId: "s1", stageKey: "proposal", type: "document" as const, title: "方案", content: "经过测试并引用来源后修改方案", createdAt: "2026-07-12", updatedAt: "2026-07-12" }],
      companionThreads: [{ id: "t1", courseId: "c1", studentId: "s1", stageKey: "proposal", messages: [{ id: "m1", role: "student" as const, content: "我会先核对来源并比较两个方案", createdAt: "2026-07-12", visibility: "student-and-teacher" as const }], createdAt: "2026-07-12", updatedAt: "2026-07-12" }],
      createdAt: "2026-07-12", updatedAt: "2026-07-12",
    };
    const profile = deriveStudentLearningProfile({ course, studentId: "s1", stageKey: "proposal" });
    expect(profile.collaborationHealth).toBe("scored");
    expect(profile.supportStrategy).not.toBe("verification-first");
    expect(studentProfilePrompt(profile)).toContain("不参与评分");
  });
});
