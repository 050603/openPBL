import { describe, expect, it } from "vitest";
import { DEFAULT_STAGES, type TeacherResourceScene } from "@/lib/session/types";
import { resolveTeacherResourceStageKey, teacherResourceTypeLabel } from "./teacher-resources";

function resource(overrides: Partial<TeacherResourceScene> = {}): TeacherResourceScene {
  return {
    id: "scene-1",
    role: "teaching-aid",
    title: "互动演示",
    type: "interactive",
    description: "",
    keyPoints: [],
    ...overrides,
  };
}

describe("teacher resources", () => {
  it("uses an explicit stage key when it exists", () => {
    expect(
      resolveTeacherResourceStageKey(resource({ stageKey: "group" }), DEFAULT_STAGES),
    ).toBe("group");
  });

  it("maps legacy introduction resources to the project launch stage", () => {
    expect(
      resolveTeacherResourceStageKey(
        resource({ role: "introduction", title: "课程引入", type: "slide" }),
        DEFAULT_STAGES,
      ),
    ).toBe("launch");
  });

  it("keeps the real interactive resource label", () => {
    expect(teacherResourceTypeLabel("interactive")).toBe("互动演示");
  });
});
