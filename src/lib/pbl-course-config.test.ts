import { describe, expect, it } from "vitest";
import {
  DEFAULT_PBL_COURSE_CONFIG,
  formatPblCourseConfigForPrompt,
  normalizePblCourseConfig,
} from "./pbl-course-config";

describe("PBL course configuration", () => {
  it("defaults to a personal project with a process recorder", () => {
    const config = normalizePblCourseConfig();

    expect(config.projectMode).toBe("personal");
    expect(config.generationTemplate).toBe("pbl-six-stage");
    expect(config.evaluationModel).toBe("tri-party");
    expect(config.companionIds).toContain("recorder");
    expect(config.evidenceRequirements.map((item) => item.label)).toEqual(
      expect.arrayContaining(["构思草稿", "方案修订记录", "反思日志", "数据 / 测试截图"]),
    );
  });

  it("keeps the recorder when a teacher customizes the companion list", () => {
    const config = normalizePblCourseConfig({ companionIds: ["critic", "critic"] });

    expect(config.companionIds).toEqual(["critic", "recorder"]);
  });

  it("does not share nested defaults between courses", () => {
    const first = normalizePblCourseConfig(DEFAULT_PBL_COURSE_CONFIG);
    const second = normalizePblCourseConfig(DEFAULT_PBL_COURSE_CONFIG);

    first.evidenceRequirements[0].stageKeys.push("make");
    first.outcome.artifact = "作品";

    expect(second.evidenceRequirements[0].stageKeys).not.toContain("make");
    expect(second.outcome.artifact).toBe("");
  });

  it("serializes structured configuration for prompt injection", () => {
    const text = formatPblCourseConfigForPrompt({
      ...DEFAULT_PBL_COURSE_CONFIG,
      outcome: { artifact: "校园节能方案", presentation: "现场答辩", reflection: "反思日志" },
    });

    expect(text).toContain('"projectMode": "personal"');
    expect(text).toContain("校园节能方案");
    expect(text).toContain("recorder");
    expect(text).toContain("companionProfiles");
    expect(text).toContain("过程记录");
  });
});
