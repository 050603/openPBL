import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";

const { hostPropsSpy, hostUnmountSpy } = vi.hoisted(() => ({
  hostPropsSpy: vi.fn(),
  hostUnmountSpy: vi.fn(),
}));

vi.mock("@/components/openmaic-bridge/student-stage-host", async () => {
  const React = await import("react");
  return {
    StudentStageHost: (props: Record<string, unknown>) => {
      hostPropsSpy(props);
      React.useEffect(() => () => hostUnmountSpy(), []);
      return <div data-testid="student-stage-host">课程播放器</div>;
    },
  };
});

import { AiLearningTeacherPreview } from "./ai-learning-preview";

const knowledgeGraph = {
  nodes: [{ id: "kp-1", label: "像素", description: "数字图像基础" }],
  edges: [],
};

const course = {
  id: "course-1",
  name: "计算机视觉",
  aiLearningClassroomId: "classroom-1",
  content: {
    knowledgePoints: [{ id: "kp-1", name: "像素", description: "数字图像基础" }],
    knowledgeGraph,
  },
} as unknown as Course;

describe("AiLearningTeacherPreview", () => {
  it("starts collapsed and unmounts the player when collapsed again", () => {
    render(<AiLearningTeacherPreview course={course} />);

    const toggle = screen.getByRole("button", { name: /学生 AI 课程预览/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("student-stage-host")).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByTestId("student-stage-host")).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle);
    expect(screen.queryByTestId("student-stage-host")).toBeNull();
    expect(hostUnmountSpy).toHaveBeenCalledTimes(1);
  });

  it("opens the page rail and supplies the knowledge graph to the player", () => {
    render(<AiLearningTeacherPreview course={course} />);
    fireEvent.click(screen.getByRole("button", { name: /学生 AI 课程预览/ }));

    expect(hostPropsSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      classroomId: "classroom-1",
      mode: "teacher-preview",
      sidebarCollapsed: false,
      knowledgeGraph,
      knowledgePoints: course.content.knowledgePoints,
    }));
    expect(screen.getByText(/左侧缩略页快速切换/)).toBeTruthy();
  });
});
