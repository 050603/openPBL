import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";

const store = vi.hoisted(() => ({
  updateCourse: vi.fn(),
  getCourse: vi.fn(),
}));

vi.mock("@/lib/session/server-store", () => store);

import { linkClassroomToCourse } from "./course-linker";

describe("linkClassroomToCourse", () => {
  beforeEach(() => vi.clearAllMocks());

  it("durably links generated student and teacher content before publication", async () => {
    await linkClassroomToCourse("course-1", "student-classroom", {
      scenesCount: 8,
      stageName: "人工智能项目课",
      teacherClassroomId: "teacher-classroom",
      teacherResourceScenes: [{ id: "teacher-scene", title: "教师引导" }] as never,
    });

    expect(store.updateCourse).toHaveBeenCalledWith("course-1", expect.any(Function));
    const updater = store.updateCourse.mock.calls[0]?.[1] as (course: Course) => Course;
    const saved = updater({ content: {} } as Course);
    expect(saved.aiLearningClassroomId).toBe("student-classroom");
    expect(saved.teacherClassroomId).toBe("teacher-classroom");
    expect(saved.content._openmaicClassroomId).toBe("student-classroom");
    expect(saved.content._openmaicScenesCount).toBe(8);
    expect(saved.content.teacherResources?.scenes).toHaveLength(1);
  });
});
