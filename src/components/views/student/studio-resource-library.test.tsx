import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";
import { normalizePblCourseConfig } from "@/lib/pbl-course-config";
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

  it("translates raw MIME types in course resources", () => {
    render(
      <StudioResourceLibrary
        course={{
          ...course,
          resources: [{
            ...course.resources![0],
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          }],
        }}
        disabled={false}
        onAsk={vi.fn().mockResolvedValue(true)}
        stageKey="proposal"
      />,
    );

    expect(screen.getByText("Word · 1 MB")).toBeTruthy();
    expect(screen.queryByText(/application\/vnd/)).toBeNull();
  });

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
        course={{ ...course, pblConfig: normalizePblCourseConfig({ resourceInquiryMode: "web-search" }) }}
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
    expect(fetch).toHaveBeenCalledWith("/api/companion/resource-query", expect.objectContaining({
      body: JSON.stringify({ courseId: "course-1", stageKey: "proposal", query: "拱桥为什么稳定" }),
    }));
  });

  it("shows the teacher-selected LLM mode and renders an answer without source cards", async () => {
    const requestMicroLesson = vi.fn().mockResolvedValue(false);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        mode: "llm",
        answer: "## 核心解释\n\n先区分桥面承受的压力与构件内部的力。\n\n- 再用可靠教材核验",
        sources: [],
      }),
    } as Response);
    render(
      <StudioResourceLibrary
        course={course}
        disabled={false}
        onAsk={vi.fn().mockResolvedValue(true)}
        onRequestMicroLesson={requestMicroLesson}
        stageKey="proposal"
      />,
    );

    expect(screen.getByText(/查询课程相关概念与问题/)).toBeTruthy();
    expect(screen.queryByText("LLM 问答")).toBeNull();
    expect(screen.queryByText("由教师设置")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "检索资料" }), {
      target: { value: "桥梁受力是什么" },
    });
    fireEvent.click(screen.getByRole("button", { name: "查资料" }));
    await waitFor(() => expect(screen.getByText(/先区分桥面/)).toBeTruthy());
    expect(screen.getByRole("heading", { name: "核心解释" })).toBeTruthy();
    expect(screen.getByRole("listitem").textContent).toContain("再用可靠教材核验");
    expect(requestMicroLesson).toHaveBeenCalledWith("桥梁受力是什么");
    expect(screen.queryByRole("link", { name: /打开原文/ })).toBeNull();
  });

  it("starts a micro lesson for a complex knowledge query instead of requesting a text answer", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const requestMicroLesson = vi.fn().mockResolvedValue(true);
    render(
      <StudioResourceLibrary
        course={course}
        disabled={false}
        onAsk={vi.fn().mockResolvedValue(true)}
        onRequestMicroLesson={requestMicroLesson}
        stageKey="proposal"
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "检索资料" }), {
      target: { value: "请系统解释拱形结构如何分散荷载，以及它和材料选择的关系" },
    });
    fireEvent.click(screen.getByRole("button", { name: "查资料" }));

    await waitFor(() => expect(screen.getByText("这个问题更适合用微课讲清楚")).toBeTruthy());
    expect(requestMicroLesson).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("查询结果")).toBeNull();
  });
});
