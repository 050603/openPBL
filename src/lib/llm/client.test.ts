import { describe, expect, it } from "vitest";
import { DEFAULT_PBL_COURSE_CONFIG } from "@/lib/pbl-course-config";
import type { GenerateInput } from "./types";
import { normalizeTeachingOutlineResponse } from "./client";
import {
  buildEvaluationPlanPrompt,
  buildKnowledgeGraphPrompt,
  buildLessonOutlinePrompt,
  buildTeachingOutlinePrompt,
} from "./prompts";
import { createPblTimingSkeleton } from "@/lib/pbl-outline-normalization";
import { buildPblModuleTimingPlan } from "@/lib/pbl-time-model";

const stages = [
  { key: "launch", label: "项目启动", description: "明确情境与驱动问题" },
  { key: "ai-learning", label: "AI 授知", description: "建构核心知识" },
  { key: "proposal", label: "方案构思", description: "形成个人方案" },
  { key: "make", label: "项目实践", description: "制作、测试与迭代" },
  { key: "showcase", label: "成果汇报", description: "展示成果并评价" },
  { key: "reflection", label: "反思迁移", description: "总结并规划迁移" },
];

const input: GenerateInput = {
  name: "个人项目课程",
  subject: "信息科技",
  grade: "八年级",
  hours: 1,
  summary: "围绕真实问题完成一个个人项目。",
  drivingQuestion: "如何用证据改进自己的方案？",
  learningObjectives: ["运用证据比较并修订方案"],
  learnerProfile: {
    priorKnowledge: "理解分类与简单统计图",
    learningNeeds: "需要分步案例",
    familiarContexts: "校园生活",
  },
  stages,
};

describe("normalizeTeachingOutlineResponse", () => {
  it("accepts common module envelopes, aliases, and nested role fields", () => {
    const result = normalizeTeachingOutlineResponse(
      {
        modules: [
          {
            id: "module-1",
            phase: "项目启动",
            name: "启动与驱动问题",
            duration: "5分钟",
            objective: "理解项目任务与成果要求",
            roles: {
              teacher: "教师发布任务并说明评价边界",
              platform: "平台展示项目资料",
              ai: "AI 提供澄清问题，不直接给出答案",
              student: ["分析驱动问题", "提交任务理解"],
            },
            knowledgePoints: [{ id: "kp-1" }],
          },
        ],
      },
      { ...input, pblConfig: DEFAULT_PBL_COURSE_CONFIG },
      { knowledgePoints: [{ id: "kp-1", name: "证据", description: "用于验证方案的事实" }] },
    );

    expect(result).toHaveLength(6);
    expect(result[0]).toMatchObject({
      id: "module-1",
      stageKey: "launch",
      title: "启动与驱动问题",
      teachingGoal: "理解项目任务与成果要求",
      teacherRole: "教师发布任务并说明评价边界",
      platformRole: "平台展示项目资料",
      aiRole: "AI 提供澄清问题，不直接给出答案",
      studentActivity: "分析驱动问题；提交任务理解",
      knowledgePointIds: ["kp-1"],
    });
    expect(result[0]?.durationMin).toBeGreaterThan(0);
    expect(result.every((item) =>
      item.title &&
      item.teachingGoal &&
      item.teacherRole &&
      item.platformRole &&
      item.aiRole &&
      item.studentActivity,
    )).toBe(true);
  });

  it("fills editable defaults when a model omits operational role fields", () => {
    const result = normalizeTeachingOutlineResponse(
      {
        teachingOutline: [
          {
            stageKey: "ai-learning",
            title: "核心知识建构",
          },
        ],
      },
      input,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      stageKey: "ai-learning",
      openMaicUse: "student-ai-learning",
      resourceTypes: ["ppt"],
    });
    expect(result[0]?.teachingGoal).toContain("核心知识建构");
    expect(result[0]?.aiRole).toContain("不直接给出最终答案");
    expect(result[0]?.notes).toContain("AI 输出缺少字段");
  });

  it("unwraps a JSON string returned under a data envelope", () => {
    const result = normalizeTeachingOutlineResponse(
      {
        data: JSON.stringify([
          {
            title: "项目实践",
            teachingGoal: "完成制作与测试",
            teacherRole: "提供流程支架",
            platformRole: "记录迭代证据",
            aiRole: "提出验证问题",
            studentActivity: "完成制作并记录修改",
          },
        ]),
      },
      input,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("项目实践");
    expect(result[0]?.stageKey).toBe("launch");
  });

  it("still rejects an empty or unusable module list", () => {
    expect(() => normalizeTeachingOutlineResponse({ modules: [] }, input)).toThrow(
      "授课大纲生成失败：AI 未返回教案级授课大纲。",
    );
    expect(() => normalizeTeachingOutlineResponse({ modules: [null, "not-a-module"] }, input)).toThrow(
      "授课大纲生成失败：AI 未返回可用课程模块。",
    );
  });

  it("merges duplicate top-level stages and preserves teacher-confirmed durations", () => {
    const pblInput = { ...input, pblConfig: DEFAULT_PBL_COURSE_CONFIG };
    const skeleton = createPblTimingSkeleton({ totalMinutes: 60 });
    const confirmedDurations = [5, 12, 8, 25, 7, 3];
    const timedSkeleton = skeleton.map((module, index) => ({
      ...module,
      durationMin: confirmedDurations[index]!,
    }));
    const moduleTimingPlan = buildPblModuleTimingPlan(60, timedSkeleton, undefined, {
      status: "confirmed",
      preserveCurrentDurations: true,
    });
    const result = normalizeTeachingOutlineResponse(
      {
        modules: [
          ...timedSkeleton,
          { ...timedSkeleton[1]!, id: "duplicate-knowledge", title: "第二知识点讲解" },
          { ...timedSkeleton[3]!, id: "duplicate-practice", title: "第二知识点实践" },
        ],
      },
      pblInput,
      { moduleTimingPlan },
    );

    expect(result).toHaveLength(6);
    expect(result.map((module) => module.stageKey)).toEqual([
      "launch",
      "ai-learning",
      "proposal",
      "make",
      "showcase",
      "reflection",
    ]);
    expect(result.map((module) => module.durationMin)).toEqual(confirmedDurations);
    expect(result[1]?.teachingGoal).toContain(timedSkeleton[1]!.teachingGoal);
  });
});

describe("buildTeachingOutlinePrompt", () => {
  it("treats the confirmed timing plan as an authoritative generation input", () => {
    const skeleton = createPblTimingSkeleton({ totalMinutes: 60 });
    const moduleTimingPlan = buildPblModuleTimingPlan(60, skeleton, undefined, {
      status: "confirmed",
      preserveCurrentDurations: true,
    });
    const prompt = buildTeachingOutlinePrompt(
      { ...input, pblConfig: DEFAULT_PBL_COURSE_CONFIG },
      { moduleTimingPlan },
    ).user;

    expect(prompt).toContain("教师最终确认的时间安排（最高优先级）");
    expect(prompt).toContain(JSON.stringify(moduleTimingPlan));
    expect(prompt).toContain("多个知识点必须合并进唯一的 ai-learning 顶级阶段");
  });

  it("propagates confirmed course basics and hour capacity to every downstream prompt", () => {
    const prompts = [
      buildKnowledgeGraphPrompt(input).user,
      buildTeachingOutlinePrompt(input).user,
      buildLessonOutlinePrompt(input).user,
      buildEvaluationPlanPrompt(input).user,
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain("教师确认的课程基础约束（最高优先级）");
      expect(prompt).toContain("八年级 (middle-school)");
      expect(prompt).toContain("60 分钟");
      expect(prompt).toContain("运用证据比较并修订方案");
      expect(prompt).toContain("理解分类与简单统计图");
    }
    expect(prompts[0]).toContain("知识点数量范围：5-8");
  });
});
