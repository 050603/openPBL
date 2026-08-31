import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Course } from "@/lib/session/types";
import { AiCollaborationTeacherMonitor } from "./ai-collaboration-monitor";

const course = {
  students: [{ id: "student-1", name: "小明" }],
  groups: [],
  submissions: [],
  aiContributions: [],
} as unknown as Course;

describe("AI collaboration teacher monitor", () => {
  it("uses classroom-facing headings instead of implementation language", () => {
    render(<AiCollaborationTeacherMonitor course={course} />);

    expect(screen.getByText("项目实践")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "学习进度" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "学生列表" })).toBeTruthy();
    expect(screen.queryByText(/真实产物/)).toBeNull();
  });
});
