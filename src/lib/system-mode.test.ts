import { describe, expect, it } from "vitest";
import {
  generationTemplateForSystemMode,
  getStagesForSystemMode,
  inferStageCollectionMode,
  mapStageKeyToSystemMode,
  resolveOpenPblSystemMode,
  reconcileCourseGenerationMode,
} from "./system-mode";
import type { Course } from "./session/types";

describe("system mode", () => {
  it("keeps the six-stage legacy system as the safe default", () => {
    expect(resolveOpenPblSystemMode()).toBe("legacy");
    expect(resolveOpenPblSystemMode("unexpected")).toBe("legacy");
    expect(getStagesForSystemMode("legacy").map((stage) => stage.key)).toEqual([
      "launch",
      "ai-learning",
      "proposal",
      "make",
      "showcase",
      "reflection",
    ]);
  });

  it("uses five stages and merges proposal and making into project practice", () => {
    const stages = getStagesForSystemMode("new");
    expect(stages.map((stage) => stage.key)).toEqual([
      "launch",
      "ai-learning",
      "make",
      "showcase",
      "reflection",
    ]);
    expect(stages[0]).toMatchObject({ view: "simple-resource" });
    expect(stages[2]).toMatchObject({ label: "项目实践", view: "ai-collaboration" });
    expect(stages[4]).toMatchObject({ view: "reflection-survey" });
    expect(inferStageCollectionMode(stages)).toBe("new");
  });

  it("maps the old proposal stage into the merged practice stage", () => {
    expect(mapStageKeyToSystemMode("launch", "new")).toBe("launch");
    expect(mapStageKeyToSystemMode("proposal", "new")).toBe("make");
    expect(mapStageKeyToSystemMode("showcase", "new")).toBe("showcase");
  });

  it("uses an isolated generation template for the new command", () => {
    expect(generationTemplateForSystemMode("new")).toBe("new-ai-learning-only");
    expect(generationTemplateForSystemMode("legacy")).toBe("pbl-six-stage");
  });

  it("preserves the legacy generation snapshot while new content changes", () => {
    const legacy = {
      id: "course-mode-snapshot",
      name: "测试课程",
      subject: "科学",
      grade: "初中",
      hours: 1,
      summary: "测试",
      drivingQuestion: "如何完成测试？",
      status: "ready",
      stages: getStagesForSystemMode("legacy"),
      currentStageIndex: 2,
      pblConfig: { generationTemplate: "pbl-six-stage" },
      content: {
        pblOutline: "旧版完整项目大纲",
        knowledgePoints: [],
        lessonOutline: [],
        evaluationPlan: { dimensions: [], overallRubric: "" },
        _openmaicSceneOutlines: [
          { id: "student-ai", title: "AI 页面", stageKey: "ai-learning", audience: "student" },
          { id: "teacher-launch", title: "教师资源", stageKey: "launch", audience: "teacher" },
        ],
        teacherResources: { generatedAt: "2026-08-30T00:00:00.000Z", scenes: [] },
      },
      teacherClassroomId: "teacher-legacy",
      aiLearningClassroomId: "student-legacy",
      students: [],
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    } as unknown as Course;

    const selectedNew = reconcileCourseGenerationMode(legacy, "new");
    expect(selectedNew.content.pblOutline).toBe("");
    expect(selectedNew.content._openmaicSceneOutlines?.map((item) => item.id)).toEqual(["student-ai"]);
    expect(selectedNew.teacherClassroomId).toBeUndefined();

    const restoredLegacy = reconcileCourseGenerationMode({
      ...selectedNew,
      aiLearningClassroomId: "student-new",
      content: { ...selectedNew.content, pblOutline: "新版不应覆盖旧版" },
    }, "legacy");
    expect(restoredLegacy.content.pblOutline).toBe("旧版完整项目大纲");
    expect(restoredLegacy.teacherClassroomId).toBe("teacher-legacy");
    expect(restoredLegacy.aiLearningClassroomId).toBe("student-legacy");
  });
});
