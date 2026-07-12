import { describe, expect, it } from "vitest";
import { DEFAULT_PBL_COURSE_CONFIG, formatPblCourseConfigForPrompt } from "@/lib/pbl-course-config";
import { formatPblStageDefinitionsForPrompt } from "@/lib/openmaic/pbl/course-template";
import { buildPrompt, PROMPT_IDS } from "./index";

describe("PBL course prompt", () => {
  it("loads the six-stage contract and structured teacher configuration", () => {
    const prompt = buildPrompt(PROMPT_IDS.PBL_COURSE, {
      requirement: "课程：校园节能设计；驱动问题：如何减少浪费？",
      pblProfile: formatPblCourseConfigForPrompt({
        ...DEFAULT_PBL_COURSE_CONFIG,
        outcome: {
          artifact: "节能方案",
          presentation: "个人答辩",
          reflection: "成长反思",
        },
      }),
      pblStages: formatPblStageDefinitionsForPrompt(),
      requiredTeacherResourceStages: "launch, showcase",
      teacherContext: "教师负责线下校准与成果评价。",
      researchContext: "None",
    });

    expect(prompt).not.toBeNull();
    expect(prompt?.system).toContain("exactly six phases");
    expect(prompt?.system).toContain("personal-project classroom");
    expect(prompt?.system).toContain("stageKey");
    expect(prompt?.system).toContain("audience");
    expect(prompt?.system).toContain("parentActivityId");
    expect(prompt?.system).toContain("targetDurationSec");
    expect(prompt?.user).toContain("节能方案");
    expect(prompt?.user).toContain("launch, showcase");
    expect(prompt?.user).toContain("教师负责线下校准与成果评价");
  });
});
