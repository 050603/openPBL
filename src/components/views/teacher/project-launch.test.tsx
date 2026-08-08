import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";
import { DEFAULT_PBL_COURSE_CONFIG } from "@/lib/pbl-course-config";

const sessionMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateCourse: vi.fn(),
  upsertAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
}));

vi.mock("@/lib/session/store", () => ({
  useSession: () => sessionMocks,
}));

import { ProjectLaunchTeacherView } from "./project-launch";

const course: Course = {
  id: "course-1",
  name: "校园节水项目",
  subject: "科学",
  grade: "六年级",
  hours: 3,
  summary: "提出可验证的校园节水方案",
  drivingQuestion: "我们如何减少校园用水浪费？",
  status: "teaching",
  stages: DEFAULT_STAGES,
  currentStageIndex: 1,
  content: {
    pblOutline: "",
    knowledgePoints: [],
    lessonOutline: [],
    evaluationPlan: { dimensions: [], overallRubric: "" },
  },
  pblConfig: {
    ...DEFAULT_PBL_COURSE_CONFIG,
    inquiryQuestions: [
      "我们如何减少校园用水浪费？",
      "我们如何让雨水被校园重新利用？",
    ],
  },
  students: [
    { id: "student-1", name: "张三", joinedAt: "", stageProgress: {} },
    { id: "student-2", name: "李四", joinedAt: "", stageProgress: {} },
  ],
  groups: [
    {
      id: "group-1",
      name: "张三的个人项目",
      topic: "我们如何减少校园用水浪费？",
      keywords: [],
      selectedForms: [],
      members: [{ studentId: "student-1", name: "张三" }],
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "group-2",
      name: "李四的个人项目",
      topic: "待确定选题方向",
      keywords: [],
      selectedForms: [],
      members: [{ studentId: "student-2", name: "李四" }],
      createdAt: "",
      updatedAt: "",
    },
  ],
  createdAt: "",
  updatedAt: "",
};

const courseWithResource: Course = {
  ...course,
  resources: [{
    id: "11111111-1111-4111-8111-111111111111",
    title: "项目说明.pdf",
    type: "PDF",
    size: "1.2 MB",
    description: "项目启动材料",
    url: "/api/uploads/11111111-1111-4111-8111-111111111111",
    downloadedBy: [],
  }],
};

describe("teacher project launch inquiry questions", () => {
  beforeEach(() => {
    sessionMocks.updateCourse.mockReset();
    sessionMocks.refresh.mockReset();
    sessionMocks.refresh.mockResolvedValue(undefined);
    vi.unstubAllGlobals();
  });
  it("shows selection distribution and publishes an additional question", () => {
    render(<ProjectLaunchTeacherView course={course} />);

    expect(screen.getByText("已选择 1/2")).toBeTruthy();
    expect(screen.getByText("我们如何让雨水被校园重新利用？")).toBeTruthy();

    fireEvent.change(
      screen.getByPlaceholderText("例如：我们如何利用实地数据，为学校设计一套可验证的节水改进方案？"),
      { target: { value: "我们如何降低教学楼的日常用水？" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /发布到学生选题池/ }));

    expect(sessionMocks.updateCourse).toHaveBeenCalledWith(
      "course-1",
      expect.objectContaining({
        pblConfig: expect.objectContaining({
          inquiryQuestions: [
            "我们如何减少校园用水浪费？",
            "我们如何让雨水被校园重新利用？",
            "我们如何降低教学楼的日常用水？",
          ],
        }),
      }),
    );
  });

  it("uploads a course resource and publishes it to the student resource list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "upload-1",
      title: "项目说明.pdf",
      fileName: "项目说明.pdf",
      fileType: "PDF",
      size: "1.2 MB",
      url: "/api/uploads/upload-1",
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ProjectLaunchTeacherView course={course} />);

    const input = screen.getByLabelText("选择文件上传");
    fireEvent.change(input, { target: { files: [new File(["content"], "项目说明.pdf", { type: "application/pdf" })] } });

    await waitFor(() => expect(sessionMocks.refresh).toHaveBeenCalledOnce());
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("courseId")).toBe("course-1");
    expect(body.get("bindAsCourseResource")).toBe("true");
    expect(await screen.findByText("已上传并同步到学生端：项目说明.pdf")).toBeTruthy();
  });

  it("shows the server message and request id when an upload fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "INVALID_METADATA",
      message: "课程或文件信息无效，请刷新页面后重试。",
      requestId: "upload-request-400",
    }), { status: 400, headers: { "Content-Type": "application/json" } })));
    render(<ProjectLaunchTeacherView course={course} />);

    fireEvent.change(screen.getByLabelText("选择文件上传"), {
      target: { files: [new File(["content"], "项目说明.pdf", { type: "application/pdf" })] },
    });

    expect(await screen.findByText("课程或文件信息无效，请刷新页面后重试。（请求编号：upload-request-400）")).toBeTruthy();
    expect(sessionMocks.refresh).not.toHaveBeenCalled();
  });

  it("confirms and deletes a published course resource", async () => {
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ProjectLaunchTeacherView course={courseWithResource} />);

    fireEvent.click(screen.getByRole("button", { name: "删除资源 项目说明.pdf" }));

    await waitFor(() => expect(sessionMocks.refresh).toHaveBeenCalledOnce());
    expect(confirmMock).toHaveBeenCalledWith("确定删除“项目说明.pdf”吗？删除后教师端和学生端都将无法访问该资源。");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/uploads/11111111-1111-4111-8111-111111111111",
      { method: "DELETE" },
    );
    expect(await screen.findByText("已删除课程资源：项目说明.pdf")).toBeTruthy();
    confirmMock.mockRestore();
  });
});
