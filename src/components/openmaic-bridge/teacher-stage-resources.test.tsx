import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

vi.mock("@/lib/session/store", () => ({
  useSession: () => ({
    addActivity: vi.fn(),
    refresh: vi.fn(),
    setUiState: vi.fn(),
  }),
}));

vi.mock("@/lib/openmaic-bridge/teacher-resources", () => ({
  getTeacherResourcesForStage: () => [],
  teacherResourceTypeLabel: () => "演示",
}));

vi.mock("./openmaic-resource-player", () => ({
  OpenMaicResourcePlayer: () => <div>资源播放器</div>,
}));

vi.mock("@openmaic/lib/store/interaction-sync", () => ({
  useInteractionSyncStore: (selector: (state: { versions: Record<string, number>; states: Record<string, unknown> }) => unknown) => selector({ versions: {}, states: {} }),
}));

import { TeacherStageResources } from "./teacher-stage-resources";

const course: Course = {
  id: "course-1",
  name: "测试课程",
  subject: "科学",
  grade: "六年级",
  hours: 3,
  summary: "测试",
  drivingQuestion: "如何解决问题？",
  status: "teaching",
  stages: DEFAULT_STAGES,
  currentStageIndex: 0,
  content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
  students: [],
  createdAt: "",
  updatedAt: "",
};

describe("TeacherStageResources", () => {
  it("collapses and expands the whole stage resource area", () => {
    render(<TeacherStageResources course={course} stageKey="launch" />);

    const trigger = screen.getByRole("button", { name: /本阶段授课资源/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("本阶段暂无生成的授课资源。")).toBeTruthy();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("本阶段暂无生成的授课资源。")).toBeNull();
  });
});
