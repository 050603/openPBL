import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";
import { StudioResourceLibrary } from "./studio-resource-library";

const course = {
  id: "course-1",
  name: "桥梁项目",
  subject: "科学",
  grade: "六年级",
  hours: 6,
  summary: "",
  drivingQuestion: "如何设计稳定的桥？",
  status: "teaching",
  stages: DEFAULT_STAGES,
  currentStageIndex: 2,
  students: [],
  content: {
    pblOutline: "",
    knowledgePoints: [],
    lessonOutline: [],
    evaluationPlan: { dimensions: [], overallRubric: "" },
  },
  resources: [{
    id: "resource-1",
    title: "桥梁结构课程资料",
    type: "PDF",
    size: "1 MB",
    url: "/uploads/bridge.pdf",
    downloadedBy: [],
  }],
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
} as Course;

describe("StudioResourceLibrary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("searches real sources, keeps original links, and sends one source to Zhizhi", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        answer: "拱形结构会把部分竖向荷载转化为沿拱轴的压力。",
        sources: [{
          title: "Arch bridge basics",
          url: "https://example.edu/arch-bridge",
          content: "A concise description of compression in arch bridges.",
          score: 0.91,
        }],
      }),
    } as Response);
    const onAsk = vi.fn().mockResolvedValue(true);
    render(
      <StudioResourceLibrary
        course={course}
        disabled={false}
        onAsk={onAsk}
        stageKey="proposal"
      />,
    );

    expect(screen.getByText("桥梁结构课程资料")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "检索资料" }), {
      target: { value: "拱桥为什么稳定" },
    });
    fireEvent.click(screen.getByRole("button", { name: "查资料" }));

    await waitFor(() => expect(screen.getByText("Arch bridge basics")).toBeTruthy());
    expect(screen.getByRole("link", { name: /打开原文/ }).getAttribute("href"))
      .toBe("https://example.edu/arch-bridge");
    fireEvent.click(screen.getByRole("button", { name: /交给知知核对/ }));
    await waitFor(() => expect(onAsk).toHaveBeenCalledWith(
      expect.stringContaining("https://example.edu/arch-bridge"),
      ["knowledge"],
    ));
  });
});
