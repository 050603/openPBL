import { describe, expect, it } from "vitest";
import { buildFacilitationScaffold, classifyTeacherResourceGeneration } from "./facilitation-scaffolds";

describe("teacher resource generation modes", () => {
  it("keeps predictable teaching content pre-generated", () => {
    expect(classifyTeacherResourceGeneration("项目导入与驱动问题")).toEqual({ mode: "predictable" });
    expect(classifyTeacherResourceGeneration("课后延伸与价值升华")).toEqual({ mode: "predictable" });
  });

  it("turns unpredictable conclusions into empty facilitation scaffolds", () => {
    expect(classifyTeacherResourceGeneration("学生方案点评")).toMatchObject({ mode: "dynamic-scaffold", kind: "proposal-critique" });
    const scaffold = buildFacilitationScaffold({ courseId: "course-1", stageKey: "showcase", title: "汇报总结", kind: "presentation-summary" });
    expect(scaffold.status).toBe("template");
    expect(scaffold.filledContent).toBeUndefined();
    expect(scaffold.sections.every((section) => section.evidenceSlots.length > 0)).toBe(true);
  });
});
