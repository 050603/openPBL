import { describe, expect, it } from "vitest";
import type { Scene } from "@openmaic/lib/types/stage";
import { classifyScenes } from "./scene-classifier";

function scene(input: Partial<Scene> & Pick<Scene, "id" | "type" | "title">): Scene {
  return {
    stageId: "stage-1",
    order: 0,
    actions: [],
    content: { type: input.type } as Scene["content"],
    ...input,
  } as Scene;
}

describe("classifyScenes", () => {
  it("keeps an explicitly marked interactive scene as a teacher resource", () => {
    const result = classifyScenes([
      scene({
        id: "interactive-1",
        type: "interactive",
        title: "【教师资源-课堂演示】【阶段:group】变量控制实验",
      }),
      scene({
        id: "student-slide-1",
        type: "slide",
        title: "核心知识讲解",
        order: 1,
      }),
    ]);

    expect(result.studentScenes).toHaveLength(1);
    expect(result.teacherScenes).toHaveLength(1);
    expect(result.teacherResourceMeta[0]).toMatchObject({
      id: "interactive-1",
      role: "teaching-aid",
      stageKey: "group",
      type: "interactive",
    });
  });
});
