import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";

const mocks = vi.hoisted(() => ({
  updateCourse: vi.fn(),
  requestCourseCoverImage: vi.fn(() => new Promise<string | null>(() => undefined)),
}));

vi.mock("@/lib/session/store", () => ({
  useSession: () => ({ updateCourse: mocks.updateCourse }),
}));

vi.mock("@/lib/course-cover", () => ({
  requestCourseCoverImage: mocks.requestCourseCoverImage,
}));

import { ProjectCoverImage } from "./visuals";

const course = {
  id: "course-1",
  name: "人工智能基础",
  subject: "人工智能通识课程",
  grade: "八年级",
  hours: 2,
  summary: "",
  drivingQuestion: "",
  status: "draft",
  stages: [],
  currentStageIndex: 0,
  content: {
    pblOutline: "",
    knowledgePoints: [],
    lessonOutline: [],
    evaluationPlan: { dimensions: [], overallRubric: "" },
  },
  students: [],
  coverImageUrl: "/cover.webp",
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
} satisfies Course;

describe("ProjectCoverImage", () => {
  it("keeps the current cover visible with a blurred regeneration status", async () => {
    render(<ProjectCoverImage allowGenerate course={course} />);

    fireEvent.click(screen.getByRole("button", { name: "重新生成封面" }));

    expect(await screen.findByText("正在重新生成")).toBeTruthy();
    expect(screen.getByRole("img", { name: "人工智能基础" }).className).toContain("blur-[7px]");
    expect((screen.getByRole("button", { name: "重新生成封面" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
