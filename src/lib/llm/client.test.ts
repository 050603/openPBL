import { describe, expect, it } from "vitest";
import { DEFAULT_PBL_COURSE_CONFIG } from "@/lib/pbl-course-config";
import type { GenerateInput } from "./types";
import {
  localizeGeneratedNarrative,
  normalizeKnowledgeGraphOutput,
  normalizePblTimingRecommendationResponse,
  normalizeTeachingOutlineResponse,
} from "./client";
import { LlmOutputIncompleteError } from "./errors";
import {
  buildEvaluationPlanPrompt,
  buildKnowledgeGraphPrompt,
  buildLessonOutlinePrompt,
  buildModuleTimingPlanPrompt,
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
    // Provide 4 of the 6 role fields so the section stays under the
    // MISSING_FIELDS_THRESHOLD (>3) and exercises the transparent
    // normalizationNote path rather than the hard-failure path.
    const result = normalizeTeachingOutlineResponse(
      {
        teachingOutline: [
          {
            stageKey: "ai-learning",
            title: "核心知识建构",
            teacherRole: "教师组织学习并答疑",
            platformRole: "平台展示学习资源",
            studentActivity: "学生独立完成任务并提交",
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
    // teachingGoal + aiRole are the two missing fields → defaults are filled in.
    expect(result[0]?.teachingGoal).toContain("核心知识建构");
    expect(result[0]?.aiRole).toContain("不直接给出最终答案");
    expect(result[0]?.notes).toContain("AI 输出缺少字段");
  });

  it("throws LlmOutputIncompleteError when a section is missing more than 3 role fields", () => {
    // Only stageKey + title are provided → 5 role fields missing (>3) → throw.
    try {
      normalizeTeachingOutlineResponse(
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
      expect.fail("Expected normalizeTeachingOutlineResponse to throw LlmOutputIncompleteError");
    } catch (err) {
      expect(err).toBeInstanceOf(LlmOutputIncompleteError);
      const incomplete = err as LlmOutputIncompleteError;
      expect(incomplete.missingFields).toEqual(
        expect.arrayContaining(["teachingGoal", "aiRole", "platformRole", "teacherRole", "studentActivity"]),
      );
      expect(incomplete.message).toContain("LLM_OUTPUT_INCOMPLETE");
    }
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

describe("module timing recommendation", () => {
  it("builds a prompt that explicitly uses learner and knowledge evidence", () => {
    const prompt = buildModuleTimingPlanPrompt(
      { ...input, pblConfig: DEFAULT_PBL_COURSE_CONFIG },
      {
        knowledgePoints: [
          { id: "kp-1", name: "证据判断", level: "core" },
          { id: "kp-2", name: "方案迭代", level: "application" },
        ],
        knowledgeGraph: {
          nodes: [],
          edges: [{ id: "edge-1", source: "kp-1", target: "kp-2", label: "支撑" }],
        },
      },
    ).user;

    expect(prompt).toContain("已有知识基础");
    expect(prompt).toContain("学习支持需求");
    expect(prompt).toContain("知识关系");
    expect(prompt).toContain("标准难度");
    expect(prompt).not.toContain('"priorKnowledge"');
    expect(prompt).not.toContain('"learningNeeds"');
    expect(prompt).toContain("rationale");
    expect(prompt).toContain("confidence");
    expect(prompt).toContain("六个阶段");
  });

  it("normalizes a structured model response into a fixed-total plan and skeleton", () => {
    const result = normalizePblTimingRecommendationResponse(
      {
        moduleTimingRecommendation: {
          allocations: [
            { stageKey: "project-launch", durationMin: 8, rationale: "建立情境。" },
            { stageKey: "knowledge", durationMin: 18, rationale: "处理先修依赖。" },
            { stageKey: "proposal", durationMin: 8, rationale: "比较方案。" },
            { stageKey: "make", durationMin: 42, rationale: "制作与迭代。" },
            { stageKey: "showcase", durationMin: 10, rationale: "表达与反馈。" },
            { stageKey: "reflection", durationMin: 4, rationale: "迁移反思。" },
          ],
          evidence: ["知识图谱存在依赖", "学生需要分步案例"],
          assumptions: ["按常规班额估算"],
          confidence: "high",
        },
      },
      { ...input, hours: 1.5, pblConfig: DEFAULT_PBL_COURSE_CONFIG },
      {
        knowledgePoints: [
          { id: "kp-1", name: "证据判断", description: "判断证据质量", level: "core" },
        ],
      },
      "2026-07-28T00:00:00.000Z",
    );

    expect(result.teachingOutline).toHaveLength(6);
    expect(result.moduleTimingPlan.allocations.reduce(
      (sum, allocation) => sum + allocation.durationMin,
      0,
    )).toBe(90);
    expect(result.moduleTimingPlan.recommendationSource).toBe("llm");
    expect(result.moduleTimingPlan.confidence).toBe("high");
    expect(result.teachingOutline.map((item) => item.durationMin)).toEqual(
      result.moduleTimingPlan.allocations.map((item) => item.durationMin),
    );
  });

  it("localizes leaked internal vocabulary and knowledge ids in teacher-facing reasons", () => {
    const result = normalizePblTimingRecommendationResponse(
      {
        moduleTimingRecommendation: {
          allocations: [
            { stageKey: "launch", durationMin: 10, rationale: "课程难度standard，priorKnowledge与learningNeeds均为空。" },
            { stageKey: "ai-learning", durationMin: 20, rationale: "foundation（kp-1）到core（kp-2）的依赖链要求ai-learning阶段系统学习。" },
            { stageKey: "proposal", durationMin: 10, rationale: "proposal阶段比较实例。" },
            { stageKey: "make", durationMin: 40, rationale: "make阶段完成制作。" },
            { stageKey: "showcase", durationMin: 15, rationale: "showcase阶段展示分类理由。" },
            { stageKey: "reflection", durationMin: 5, rationale: "reflection阶段反思迁移。" },
          ],
          evidence: ["knowledgeGraph从foundation（kp-1）到application（kp-2）递进。"],
          assumptions: ["learningNeeds为空，采用standard支架。"],
          confidence: "medium",
        },
      },
      { ...input, hours: 100 / 60, pblConfig: DEFAULT_PBL_COURSE_CONFIG },
      {
        knowledgePoints: [
          { id: "kp-1", name: "训练数据", description: "模型学习所用样本", level: "foundation" },
          { id: "kp-2", name: "分类规则", description: "依据特征进行判断", level: "application" },
        ],
      },
      "2026-08-09T00:00:00.000Z",
    );

    const visibleText = [
      ...Object.values(result.moduleTimingPlan.rationaleByStage ?? {}),
      ...(result.moduleTimingPlan.evidence ?? []),
      ...(result.moduleTimingPlan.assumptions ?? []),
    ].join("\n");
    expect(visibleText).toContain("标准难度");
    expect(visibleText).toContain("已有知识基础与学习支持需求均为空");
    expect(visibleText).toContain("基础层（训练数据）到核心层（分类规则）");
    expect(visibleText).toContain("AI 授知阶段");
    expect(visibleText).not.toMatch(/priorKnowledge|learningNeeds|knowledgeGraph|foundation|core|application|standard|ai-learning|proposal|make|showcase|reflection|kp-\d+/i);
  });

  it("keeps structural enum values unchanged while localizing narrative text", () => {
    expect(localizeGeneratedNarrative("proposal阶段使用kp-1", [{ id: "kp-1", name: "方案比较" }]))
      .toBe("方案构思与校准阶段使用方案比较");
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
      expect(prompt).toContain("八年级（初中）");
      expect(prompt).toContain("60 分钟");
      expect(prompt).toContain("运用证据比较并修订方案");
      expect(prompt).toContain("理解分类与简单统计图");
    }
    expect(prompts[0]).toContain("知识点数量范围：5-8");
  });

  it("treats teacher-specified knowledge points as non-optional graph constraints", () => {
    const prompt = buildKnowledgeGraphPrompt(input, {
      teacherRequiredKnowledgePoints: ["训练数据", "模型偏差"],
    }).user;

    expect(prompt).toContain('["训练数据","模型偏差"]');
    expect(prompt).toContain("完全相同的 name");
    expect(prompt).toContain("不得删除、合并、偷换概念或改名");
    expect(prompt).toContain("不得自环、重复或形成有向循环");
  });
});

describe("normalizeKnowledgeGraphOutput", () => {
  it("keeps graph nodes aligned with knowledge points and accepts a sound progression", () => {
    const knowledgePoints = [
      { id: "kp-1", name: "训练数据", description: "模型学习所用样本", keyInfo: "样本需要覆盖真实情况", level: "foundation" },
      { id: "kp-2", name: "分类规则", description: "依据特征进行判断", keyInfo: "规则需要可解释", level: "core" },
    ];
    const result = normalizeKnowledgeGraphOutput(knowledgePoints, {
      nodes: knowledgePoints.map((point) => ({ ...point, label: point.name })),
      edges: [{ id: "edge-1", source: "kp-1", target: "kp-2", label: "是构建的前提" }],
    }, ["训练数据"]);

    expect(result.knowledgeGraph.nodes.map((node) => node.id)).toEqual(["kp-1", "kp-2"]);
    expect(result.knowledgeGraph.nodes.map((node) => node.label)).toEqual(["训练数据", "分类规则"]);
  });

  it("rejects a generated graph that drops a teacher-required point", () => {
    const knowledgePoints = [
      { id: "kp-1", name: "分类规则", description: "依据特征进行判断", keyInfo: "规则需要可解释", level: "core" },
    ];

    expect(() => normalizeKnowledgeGraphOutput(knowledgePoints, {
      nodes: [{ ...knowledgePoints[0], label: "分类规则" }],
      edges: [],
    }, ["模型偏差"])).toThrow("教师指定知识点未被保留");
  });
});
