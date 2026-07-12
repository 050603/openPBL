import { describe, expect, it } from "vitest";
import {
  applyOutlineFallbacks,
  enforcePblOutlineContract,
  generateSceneOutlinesFromRequirements,
} from "./outline-generator";
import type { SceneOutline } from "@openmaic/lib/types/generation";
import { DEFAULT_PBL_COURSE_CONFIG } from "@/lib/pbl-course-config";

const legacyPblOutline: SceneOutline = {
  id: "legacy-pbl",
  type: "pbl",
  title: "个人项目展示",
  description: "旧版 PBL 场景",
  keyPoints: [],
  order: 1,
  pblConfig: {
    projectTopic: "个人项目",
    projectDescription: "旧版个人项目场景",
    targetSkills: ["方案设计"],
  },
};

describe("PBL outline fallbacks", () => {
  it("converts legacy group PBL scenes to ordinary scenes in personal mode", () => {
    const result = applyOutlineFallbacks(legacyPblOutline, true, { personalProject: true });

    expect(result.type).toBe("slide");
    expect(result.pblConfig).toBeUndefined();
  });

  it("keeps legacy PBL scenes available when personal mode is not enabled", () => {
    const result = applyOutlineFallbacks(legacyPblOutline, true);

    expect(result.type).toBe("pbl");
  });

  it("selects the dedicated six-stage prompt for a personal PBL course", async () => {
    let systemPrompt = "";
    let userPrompt = "";
    const result = await generateSceneOutlinesFromRequirements(
      {
        requirement: "设计校园节能方案",
        pblProfile: DEFAULT_PBL_COURSE_CONFIG,
      },
      undefined,
      undefined,
      async (system, user) => {
        systemPrompt = system;
        userPrompt = user;
        return JSON.stringify({
          languageDirective: "使用简体中文",
          outlines: [
            {
              id: "launch-1",
              type: "slide",
              title: "项目启动",
              description: "发布驱动问题",
              keyPoints: ["驱动问题"],
              order: 1,
              stageKey: "launch",
              stageLabel: "项目启动",
              audience: "teacher",
              generationPurpose: "teacher-resource",
            },
          ],
        });
      },
    );

    expect(result.success).toBe(true);
    expect(systemPrompt).toContain("exactly six phases");
    expect(systemPrompt).toContain("not a generic slide deck");
    expect(userPrompt).toContain("personal");
    expect(userPrompt).toContain("evidenceRequirements");
  });

  it("preserves interactive learning intent and adds ordinary activity teacher support", () => {
    const result = enforcePblOutlineContract(
      [
        {
          id: "learning-2",
          type: "slide",
          title: "变量仿真",
          description: "通过仿真观察变量变化",
          keyPoints: ["变量关系"],
          order: 0,
          stageKey: "ai-learning",
          stageLabel: "AI 授知",
          audience: "student",
          generationPurpose: "knowledge-teaching",
          resourceTypes: ["interactive-demo"],
          parentActivityId: "activity-ai",
          knowledgePointIds: ["kp-1"],
        },
      ],
      {
        requirement: "test",
        pblProfile: DEFAULT_PBL_COURSE_CONFIG,
        pblActivityCatalog: [
          {
            activityId: "activity-ai",
            stageKey: "ai-learning",
            title: "知识点讲解",
            durationMin: 20,
            knowledgePointIds: ["kp-1"],
          },
          {
            activityId: "activity-1",
            stageKey: "proposal",
            title: "方案校准",
            durationMin: 10,
            knowledgePointIds: [],
          },
        ],
        pblTeachingActivities: [
          {
            activityId: "activity-1",
            stageKey: "proposal",
            title: "方案校准",
            durationMin: 10,
            teachingGoal: "完成方案校准",
            teacherRole: "主持证据核对",
            platformRole: "展示提示",
            aiRole: "提供伴学问题",
            studentActivity: "提交修订记录",
            openMaicUse: "none",
            resourceTypes: ["script"],
            requirement: "必须单独生成教师支架",
          },
        ],
      },
    );

    expect(result[0]).toMatchObject({ type: "interactive", widgetType: "simulation" });
    expect(result.find((outline) => outline.activityId === "activity-1")).toMatchObject({
      type: "slide",
      audience: "teacher",
      generationPurpose: "facilitation-scaffold",
      parentActivityId: "activity-1",
      ttsPolicy: "none",
      resourceTypes: ["ppt", "script"],
    });
    expect(result.find((outline) => outline.id === "learning-2")).toMatchObject({
      parentActivityId: "activity-ai",
      targetDurationSec: 1200,
      ttsPolicy: "target-duration",
      knowledgePointIds: ["kp-1"],
    });
  });

  it("fails closed for an unlabelled PBL outline", () => {
    const result = enforcePblOutlineContract(
      [{
        id: "unlabelled",
        type: "interactive",
        title: "未标注场景",
        description: "无法确认阶段",
        keyPoints: [],
        order: 0,
      }],
      {
        requirement: "test",
        pblProfile: DEFAULT_PBL_COURSE_CONFIG,
      },
    );

    expect(result[0]).toMatchObject({
      type: "slide",
      audience: "teacher",
      generationPurpose: "facilitation-scaffold",
      resourceTypes: ["ppt", "script"],
    });
  });
});
