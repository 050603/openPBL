import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callLLM: vi.fn(),
  getCourse: vi.fn(),
  resolveSearchConfig: vi.fn(),
  searchWeb: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  isAuthConfigured: () => false,
  readAuthFromRequest: vi.fn(),
}));
vi.mock("@/lib/llm/client", () => ({ callLLM: mocks.callLLM }));
vi.mock("@/lib/session/server-store", () => ({ getCourse: mocks.getCourse }));
vi.mock("@openmaic/lib/server/web-search-config", () => ({
  resolveClassroomWebSearchConfig: mocks.resolveSearchConfig,
}));
vi.mock("@openmaic/lib/web-search", () => ({ searchWeb: mocks.searchWeb }));

import { POST } from "./route";

const baseCourse = {
  id: "course-1",
  name: "桥梁项目",
  subject: "科学",
  grade: "六年级",
  drivingQuestion: "如何设计稳定的桥？",
  stages: [{ key: "proposal", label: "方案构思" }],
};

function request(body: unknown) {
  return new Request("http://localhost/api/companion/resource-query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("companion resource query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCourse.mockResolvedValue(baseCourse);
  });

  it("uses the LLM by default for legacy courses", async () => {
    mocks.callLLM.mockResolvedValue("这是结合课程背景给出的解释。");
    const response = await POST(request({ courseId: "course-1", stageKey: "proposal", query: "什么是桁架？" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ success: true, mode: "llm", sources: [] });
    expect(mocks.callLLM).toHaveBeenCalledOnce();
    expect(mocks.searchWeb).not.toHaveBeenCalled();
  });

  it("uses configured web search when the teacher selects it", async () => {
    mocks.getCourse.mockResolvedValue({
      ...baseCourse,
      pblConfig: { resourceInquiryMode: "web-search" },
    });
    mocks.resolveSearchConfig.mockReturnValue({ providerId: "tavily", apiKey: "server-key" });
    mocks.searchWeb.mockResolvedValue({
      answer: "检索摘要",
      query: "桥梁 桁架",
      sources: [{ title: "来源", url: "https://example.edu", content: "摘要", score: 0.9 }],
    });
    const response = await POST(request({ courseId: "course-1", query: "什么是桁架？" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.mode).toBe("web-search");
    expect(data.sources).toHaveLength(1);
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });

  it("returns a student-safe configuration hint instead of exposing provider details", async () => {
    mocks.getCourse.mockResolvedValue({
      ...baseCourse,
      pblConfig: { resourceInquiryMode: "web-search" },
    });
    mocks.resolveSearchConfig.mockReturnValue(undefined);
    const response = await POST(request({ courseId: "course-1", query: "什么是桁架？" }));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("当前资料查询服务暂不可用，请联系教师检查课程设置。");
    expect(data.error).not.toContain("TAVILY_API_KEY");
    expect(data.error).not.toContain("LLM");
  });
});
