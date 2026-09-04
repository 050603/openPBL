import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { SimplifiedStudentStageView, SimplifiedTeacherStageView } from "./simple-stage-resources";

const session = vi.hoisted(() => ({
  refresh: vi.fn(),
  setUiState: vi.fn(),
  markResourceDownloaded: vi.fn(),
  studentId: "student-1",
}));

vi.mock("@/lib/session/store", () => ({
  useSession: () => session,
}));

const course = {
  id: "course-1",
  uiState: {},
  resources: [
    { id: "launch-file", title: "启动说明.pdf", type: "PDF", size: "1 MB", stageKey: "launch", url: "/launch", downloadedBy: [] },
    { id: "reflection-file", title: "反思提示.pdf", type: "PDF", size: "1 MB", stageKey: "reflection", url: "/reflection", downloadedBy: [] },
  ],
} as unknown as Course;

describe("simplified stage resources", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("uses the student title card in the first stage", () => {
    const emptyCourse = { ...course, resources: [] } as Course;
    render(<SimplifiedStudentStageView course={emptyCourse} stageKey="launch" />);

    expect(screen.getByRole("heading", { name: "学习资源" }).closest("header")?.className)
      .toContain("classroom-stage-header--student-card");
  });

  it("shows only the active stage files and starts a classroom projection", () => {
    render(<SimplifiedTeacherStageView course={course} stageKey="reflection" />);

    expect(screen.getAllByText("反思提示.pdf")).toHaveLength(2);
    expect(screen.queryByText("启动说明.pdf")).toBeNull();
    expect(screen.getByRole("heading", { name: "课堂资源" })).toBeTruthy();
    expect(screen.queryByText("轻量授课阶段")).toBeNull();
    expect(screen.queryByText(/会自动生成稳定/)).toBeNull();
    expect(screen.getByText(/PPT 请先导出为 PDF/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "删除资源 反思提示.pdf" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "投屏" }));
    expect(session.setUiState).toHaveBeenCalledWith("course-1", {
      resourceProjection: expect.objectContaining({
        resourceId: "reflection-file",
        stageKey: "reflection",
        title: "反思提示.pdf",
        viewState: expect.objectContaining({
          page: 1,
          scrollRatio: 0,
          mediaPlaying: false,
        }),
      }),
    });
  });

  it("asks whether an uploaded PDF is a slide deck and submits slide mode", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === "POST"
        ? { ok: true, json: async () => ({ id: "new-pdf", title: "课堂演示.pdf" }) }
        : { ok: false, status: 404 }
    ));
    vi.stubGlobal("fetch", fetchMock);
    session.refresh.mockResolvedValue(undefined);
    render(<SimplifiedTeacherStageView course={course} stageKey="reflection" />);

    fireEvent.change(screen.getByLabelText("上传资源"), {
      target: {
        files: [new File(["%PDF-1.7"], "课堂演示.pdf", { type: "application/pdf" })],
      },
    });

    expect(screen.getByRole("dialog", { name: "这份 PDF 如何用于课堂？" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /幻灯片演示/ }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const request = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1] as { body: FormData };
    expect(request.body.get("pdfDisplayMode")).toBe("slides");
  });

  it("switches an existing PDF to slide playback without re-uploading it", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === "PATCH"
        ? { ok: true, json: async () => ({ id: "reflection-file", displayMode: "slides" }) }
        : { ok: false, status: 404 }
    ));
    vi.stubGlobal("fetch", fetchMock);
    session.refresh.mockResolvedValue(undefined);
    render(<SimplifiedTeacherStageView course={course} stageKey="reflection" />);

    fireEvent.click(screen.getByRole("button", { name: "逐页演示" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall?.[0]).toBe("/api/uploads/reflection-file");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ displayMode: "slides" });
    expect(session.refresh).toHaveBeenCalledWith("teacher");
  });
});
