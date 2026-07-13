import { describe, expect, it } from "vitest";
import { DEFAULT_PBL_COURSE_CONFIG } from "@/lib/pbl-course-config";
import type { GenerateInput } from "./types";
import { normalizeTeachingOutlineResponse } from "./client";

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
});
