import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";

const generateProjectSkeleton = vi.fn();
const callLLM = vi.fn();

vi.mock("@/lib/teaching-ai/support-engine", () => ({ generateProjectSkeleton }));
vi.mock("@/lib/llm/client", () => ({
  callLLM,
  generateCourseContent: vi.fn(),
  parseLLMJson: (value: string) => JSON.parse(value),
}));

describe("quick positioning generation", () => {
  beforeEach(() => {
    generateProjectSkeleton.mockReset();
    callLLM.mockReset();
  });

  it("falls back to one directly adoptable draft when skeleton candidates are incomplete", async () => {
    generateProjectSkeleton.mockRejectedValue(
      new Error("项目骨架生成失败：AI 返回结构不完整，请检查模型输出后重试。"),
    );
    callLLM.mockResolvedValue(JSON.stringify({
      learningObjectives: ["解释核心概念", "比较不同证据", "形成并修订项目方案"],
      summary: "学生将在真实校园情境中调查问题、比较证据并形成可实施的个人项目方案，同时说明自己的关键判断和改进依据。",
      learnerProfile: {
        priorKnowledge: "具备基础信息检索经验",
        learningNeeds: "需要结构化证据支架",
        familiarContexts: "校园生活",
      },
      drivingQuestion: "我们如何为校园提出一项有证据支持且能够实施的改进方案？",
    }));
    const { generatePositioningDetails } = await import("./job-runner");
    const controller = new AbortController();
    const result = await generatePositioningDetails(
      {
        id: "course-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        name: "未命名课程",
        subject: "综合实践",
        grade: "七年级",
        hours: 2,
        summary: "",
        drivingQuestion: "",
        status: "draft",
        stages: [],
        currentStageIndex: 0,
        content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
        students: [],
      },
      { name: "校园改进项目", subject: "综合实践", grade: "七年级", hours: 2 },
      { courseId: "course-1", teacherBrief: "设计一节校园改进项目课" },
      "",
      controller.signal,
    );

    expect(generateProjectSkeleton).toHaveBeenCalledTimes(4);
    expect(result.learningObjectives).toHaveLength(3);
    expect(result.drivingQuestion).toMatch(/[？?]$/);
    expect(result.summary.length).toBeGreaterThan(30);
  });

  it("merges generated authoring fields without restoring a stale course version", async () => {
    const { mergeGeneratedCourseSnapshot } = await import("./job-runner");
    const current = {
      id: "course-1",
      version: 12,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      name: "旧名称",
      subject: "综合实践",
      grade: "七年级",
      hours: 2,
      summary: "",
      drivingQuestion: "",
      status: "draft",
      stages: [],
      currentStageIndex: 0,
      content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
      students: [{ id: "student-1", name: "学生", joinedAt: "2026-01-01", stageProgress: {} }],
    } as Course;
    const generated = {
      ...current,
      version: 4,
      name: "校园节能项目",
      content: { ...current.content, knowledgePoints: [{ id: "kp-1", name: "能耗", description: "理解能耗" }] },
      students: [],
    } as Course;

    const merged = mergeGeneratedCourseSnapshot(current, generated);

    expect(merged.version).toBe(12);
    expect(merged.students).toEqual(current.students);
    expect(merged.name).toBe("校园节能项目");
    expect(merged.content.knowledgePoints).toHaveLength(1);
  });

  it("lets the design agent repair positioning misalignment instead of failing the quick flow", async () => {
    generateProjectSkeleton.mockImplementation(async (input: { targetPart: string }) => {
      if (input.targetPart === "learningObjectives") {
        return { learningObjectiveOptions: [["列举 AI 误判案例", "归纳常见错误类型", "撰写校园广播稿", "形成 AI 使用守则"]] };
      }
      if (input.targetPart === "summary") {
        return { summaryOptions: ["学生分析校园生活中的人工智能误判案例，归纳问题成因，并完成面向同学的校园广播内容和使用建议。"] };
      }
      if (input.targetPart === "learnerProfile") {
        return { learnerProfileOptions: [{ priorKnowledge: "了解常见 AI 应用", learningNeeds: "需要案例分类支架", familiarContexts: "校园广播" }] };
      }
      return { drivingQuestions: ["我们如何设计校园广播稿介绍 AI 错误类型和正确用法？"] };
    });
    callLLM
      .mockResolvedValueOnce(JSON.stringify({ name: "校园 AI 使用指南", subject: "信息科技", grade: "七年级", hours: 2 }))
      .mockResolvedValueOnce(JSON.stringify({
        passed: false,
        summary: "目标与驱动问题不一致且任务量偏大",
        issues: [
          "驱动问题要求介绍AI错误类型，但课程目标未完整覆盖错误类型与正确用法",
          "2课时内同时完成多个大型成果，任务量超出范围",
        ],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: "学生在两课时内分析三个校园 AI 误判案例，归纳错误类型和核验方法，最终共同形成一份简明校园广播稿。",
        learningObjectives: ["识别校园情境中的 AI 误判", "归纳两类常见错误及核验方法", "依据案例撰写简明校园广播稿"],
        learnerProfile: { priorKnowledge: "了解常见 AI 应用", learningNeeds: "需要案例分类与写作支架", familiarContexts: "校园广播" },
        drivingQuestion: "我们如何用一份校园广播稿帮助同学识别 AI 错误并正确核验？",
      }))
      .mockResolvedValueOnce(JSON.stringify({ passed: true, summary: "定位一致且课时可执行", issues: [] }));

    const { generatePositioning } = await import("./job-runner");
    const baseCourse = {
      id: "course-agent-review",
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      name: "未命名课程",
      subject: "信息科技",
      grade: "七年级",
      hours: 2,
      summary: "",
      drivingQuestion: "",
      status: "draft",
      stages: [],
      currentStageIndex: 0,
      content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
      students: [],
    } as Course;

    const result = await generatePositioning(
      baseCourse,
      { courseId: baseCourse.id, teacherBrief: "用两课时设计校园广播稿，帮助学生理解 AI 误判和正确用法" },
      new AbortController().signal,
    );

    expect(result.review.revisionCount).toBe(1);
    expect(result.value.learningObjectives).toHaveLength(3);
    expect(result.value.drivingQuestion).toContain("识别 AI 错误");
    expect(result.value.hours).toBe(2);
    expect(callLLM).toHaveBeenCalledTimes(4);
  });
});
