import { describe, expect, it } from "vitest";
import {
  applyOutlineFallbacks,
  normalizeSceneOutlinesForDuration,
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
  it("preserves an AI semantic page plan instead of splitting by fixed seconds", () => {
    const result = normalizeSceneOutlinesForDuration([
      {
        id: "detail-1",
        type: "slide",
        title: "核心方法",
        description: "讲清方法、案例和练习。",
        keyPoints: ["概念", "方法", "案例", "练习"],
        order: 0,
        stageKey: "ai-learning",
        audience: "student",
        parentActivityId: "module-ai",
        targetDurationSec: 300,
        ttsPolicy: "target-duration",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "detail-1",
      targetDurationSec: 300,
      parentActivityId: "module-ai",
      ttsPolicy: "target-duration",
    });
    expect(result[0]?.segmentCount).toBeUndefined();
  });

  it.each([1500, 3000])("does not turn %s seconds of teacher facilitation time into extra PPT pages", (targetDurationSec) => {
    const result = normalizeSceneOutlinesForDuration([
      {
        id: "teacher-detail",
        type: "slide",
        title: "项目实践教师支架",
        description: "教师用这张 PPT 组织项目实践、巡视和反馈。",
        keyPoints: ["任务说明", "巡视反馈", "成果要求"],
        order: 0,
        stageKey: "practice",
        audience: "teacher",
        generationPurpose: "teacher-resource",
        targetDurationSec,
        ttsPolicy: "none",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "teacher-detail",
      targetDurationSec,
      ttsPolicy: "none",
    });
    expect(result[0]?.segmentCount).toBeUndefined();
  });

  it("keeps teacher scaffolds intact when audience metadata is incomplete", () => {
    const result = normalizeSceneOutlinesForDuration([
      {
        id: "practice-scaffold",
        type: "slide",
        title: "实践阶段主持提示",
        description: "教师主持项目实践。",
        keyPoints: ["时间提醒", "证据检查"],
        order: 0,
        stageKey: "practice",
        generationPurpose: "facilitation-scaffold",
        targetDurationSec: 1500,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("practice-scaffold");
  });

  it("does not clone interactive activities or short slides", () => {
    const result = normalizeSceneOutlinesForDuration([
      {
        id: "interactive-1",
        type: "interactive",
        title: "练习",
        description: "完成练习。",
        keyPoints: ["练习"],
        order: 0,
        targetDurationSec: 300,
      },
      {
        id: "slide-1",
        type: "slide",
        title: "短讲解",
        description: "短讲解。",
        keyPoints: ["概念"],
        order: 1,
        targetDurationSec: 120,
      },
    ]);

    expect(result.map((outline) => outline.id)).toEqual(["interactive-1", "slide-1"]);
  });

  it("keeps multiple AI-planned semantic details and their target allocation in order", () => {
    const result = normalizeSceneOutlinesForDuration([
      {
        id: "concept",
        type: "slide",
        title: "核心概念",
        description: "先建立概念模型。",
        keyPoints: ["概念"],
        order: 2,
        stageKey: "ai-learning",
        audience: "student",
        parentActivityId: "module-ai",
        targetDurationSec: 80,
        ttsPolicy: "target-duration",
      },
      {
        id: "practice",
        type: "interactive",
        title: "迁移练习",
        description: "用概念分析新情境。",
        keyPoints: ["应用"],
        order: 1,
        stageKey: "ai-learning",
        audience: "student",
        parentActivityId: "module-ai",
        targetDurationSec: 220,
        ttsPolicy: "target-duration",
      },
    ]);

    expect(result.map((outline) => outline.id)).toEqual(["concept", "practice"]);
    expect(result.map((outline) => outline.targetDurationSec)).toEqual([80, 220]);
  });

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
    expect(userPrompt).toContain("companionStagePolicies");
    expect(systemPrompt).toContain("semantic PPT page");
    expect(systemPrompt).toContain("fixed seconds-per-page");
    expect(userPrompt).toContain("fixed seconds-per-page threshold");
    expect(userPrompt).toContain("assigned knowledge points");
    expect(result.data?.outlines[0]?.companionIds).toEqual(["knowledge", "ideation"]);
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
      companionIds: ["knowledge", "ideation", "critic", "planner", "recorder"],
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
