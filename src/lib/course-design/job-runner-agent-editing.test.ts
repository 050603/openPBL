import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";

const callLLM = vi.fn();

vi.mock("@/lib/llm/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/llm/client")>();
  return {
    ...original,
    callLLM,
    parseLLMJson: (value: string) => JSON.parse(value),
  };
});

describe("course design Agent editing", () => {
  beforeEach(() => callLLM.mockReset());

  it("generates the project outcome once and sends review findings only to the editor", async () => {
    callLLM
      .mockResolvedValueOnce(JSON.stringify({
        difficultyLevel: "standard",
        artifact: "校园节能方案",
        presentation: "现场说明方案与证据",
        reflection: "反思方案改进过程",
        evidenceKinds: ["idea-draft", "revision-log", "reflection-log", "data-screenshot"],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        passed: false,
        summary: "成果没有明确服务对象",
        issues: ["作品描述缺少服务对象"],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: "已补充服务对象",
        revised: {
          difficultyLevel: "standard",
          artifact: "面向学校后勤部门的校园节能方案",
          presentation: "向学校后勤部门说明方案与证据",
          reflection: "反思方案改进过程",
          evidenceKinds: ["idea-draft", "revision-log", "reflection-log", "data-screenshot"],
        },
      }))
      .mockResolvedValueOnce(JSON.stringify({ passed: true, summary: "明显问题已修复", issues: [] }));

    const { generateProjectDesign } = await import("./job-runner");
    const course = {
      id: "course-project-edit",
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      name: "校园节能",
      subject: "综合实践",
      grade: "八年级",
      hours: 2,
      summary: "学生调查校园能耗并提出改进建议。",
      drivingQuestion: "我们如何用证据帮助学校减少不必要的能源消耗？",
      learningObjectives: ["分析校园能耗证据", "提出可实施的节能方案", "说明方案依据"],
      status: "draft",
      stages: [],
      currentStageIndex: 0,
      content: {
        pblOutline: "",
        knowledgePoints: [
          { id: "kp-1", name: "能耗证据", description: "分析能耗数据" },
          { id: "kp-2", name: "节能方案", description: "依据证据形成方案" },
          { id: "kp-3", name: "方案论证", description: "说明方案依据" },
        ],
        lessonOutline: [],
        evaluationPlan: { dimensions: [], overallRubric: "" },
      },
      students: [],
    } as Course;

    const result = await generateProjectDesign(
      course,
      { courseId: course.id, teacherBrief: "设计两课时校园节能项目" },
      new AbortController().signal,
    );

    expect(result.pblConfig?.outcome.artifact).toContain("学校后勤部门");
    expect(callLLM).toHaveBeenCalledTimes(4);
    expect(callLLM.mock.calls.filter((call) => call[0][0].content.includes("PBL 项目成果设计师"))).toHaveLength(1);
    expect(callLLM.mock.calls[2][0][0].content).toContain("课程设计编辑 Agent");
    expect(callLLM.mock.calls[2][0][1].content).toContain("作品描述缺少服务对象");
  });
});
