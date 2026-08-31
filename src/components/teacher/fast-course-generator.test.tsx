import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { FastCourseGenerator } from "./fast-course-generator";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("FastCourseGenerator knowledge references", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads an optional private reference and includes its id in the generation request", async () => {
    const requests: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({
        url,
        method,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      if (url === "/api/uploads" && method === "POST") {
        return Response.json({
          id: "11111111-1111-4111-8111-111111111111",
          fileName: "机器学习基础.md",
          fileType: "MD",
          size: "1.2 KB",
          purpose: "generation-reference",
        }, { status: 201 });
      }
      if (url.endsWith("/design-generation") && method === "POST") {
        return Response.json({ backgroundEnabled: true, job: null }, { status: 202 });
      }
      if (url.endsWith("/design-generation")) {
        return Response.json({ backgroundEnabled: true, job: null });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    }));

    render(
      <FastCourseGenerator
        course={{ id: "course-1" } as Course}
        onOpenDetailed={vi.fn()}
        simplified
      />,
    );

    await waitFor(() => expect(requests.some((request) => request.method === "GET")).toBe(true));
    expect(screen.getByText("AI inside practice.")).toBeTruthy();
    expect(screen.queryByText("生成 AI 授知内容")).toBeNull();
    expect(screen.queryByText(/系统只准备第二阶段/)).toBeNull();
    expect(screen.queryByText("普通模式")).toBeNull();
    expect(screen.getByRole("group", { name: "生成内容选项" })).toBeTruthy();
    expect(screen.getByLabelText(/图片：/).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText(/语音：/).getAttribute("aria-pressed")).toBe("true");
    const videoToggle = screen.getByLabelText(/视频：/);
    expect(videoToggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(videoToggle);
    expect(videoToggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "开启深度交互模式" }).getAttribute("aria-pressed")).toBe("false");
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("支持 PDF、Word（DOCX）、PPT（PPTX）、TXT 和 Markdown");
    expect(tooltip.className).toContain("opacity-0");
    expect(tooltip.className).toContain("invisible");

    fireEvent.change(screen.getByLabelText("上传知识资料"), {
      target: { files: [new File(["训练数据与验证集"], "机器学习基础.md", { type: "text/markdown" })] },
    });

    expect(await screen.findByText("机器学习基础.md")).toBeTruthy();
    const upload = requests.find((request) => request.url === "/api/uploads" && request.method === "POST");
    expect(upload).toBeTruthy();

    fireEvent.change(screen.getByLabelText("描述课程生成要求"), {
      target: { value: "为高中生设计机器学习入门课" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始生成课程" }));

    await waitFor(() => {
      const generationRequest = requests.find((request) => request.url.endsWith("/design-generation") && request.method === "POST");
      expect(JSON.parse(generationRequest?.body ?? "{}")).toMatchObject({
        teacherBrief: "为高中生设计机器学习入门课",
        generationMode: "standard",
        referenceIds: ["11111111-1111-4111-8111-111111111111"],
        options: {
          enableImageGeneration: true,
          enableTTS: true,
          enableVideoGeneration: true,
        },
      });
    });
  });

  it("places one deep-interaction toggle next to send and submits the lit state", async () => {
    const requests: Array<{ method: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ method, body: typeof init?.body === "string" ? init.body : undefined });
      return Response.json({ backgroundEnabled: true, job: null }, { status: method === "POST" ? 202 : 200 });
    }));

    render(<FastCourseGenerator course={{ id: "course-2" } as Course} onOpenDetailed={vi.fn()} simplified />);
    await waitFor(() => expect(requests.some((request) => request.method === "GET")).toBe(true));

    const deepToggle = screen.getByRole("button", { name: "开启深度交互模式" });
    const send = screen.getByRole("button", { name: "开始生成课程" });
    expect(deepToggle.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(deepToggle);
    expect(screen.getByRole("button", { name: "关闭深度交互，使用普通模式" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(screen.getByLabelText("描述课程生成要求"), { target: { value: "设计一节交互式 AI 课程" } });
    fireEvent.click(send);
    await waitFor(() => {
      const request = requests.find((item) => item.method === "POST");
      expect(JSON.parse(request?.body ?? "{}")).toMatchObject({ generationMode: "deep-interaction" });
    });
  });
});
