import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course, ProjectGroup } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";
import { collectShowcaseMaterials, DimensionRow } from "./showcase";

describe("collectShowcaseMaterials", () => {
  it("exposes a student's real showcase upload even before evidence annotation", () => {
    const group: ProjectGroup = {
      id: "g1",
      name: "林同学的项目",
      topic: "校园节能",
      keywords: [],
      selectedForms: [],
      members: [{ studentId: "s1", name: "林同学", role: "负责人" }],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    const course = {
      id: "course-1",
      name: "测试课程",
      subject: "科学",
      grade: "六年级",
      hours: 8,
      summary: "",
      drivingQuestion: "",
      status: "teaching",
      stages: DEFAULT_STAGES,
      currentStageIndex: 4,
      content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
      students: [],
      groups: [group],
      uploads: [{
        id: "upload-1",
        courseId: "course-1",
        groupId: "g1",
        studentId: "s1",
        studentName: "林同学",
        stageKey: "showcase",
        category: "artifact",
        title: "最终报告",
        fileName: "final-report.pdf",
        fileType: "application/pdf",
        size: "1024",
        url: "/api/uploads/final-report.pdf",
        createdAt: "2024-01-02T00:00:00.000Z",
      }],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    } satisfies Course;

    expect(collectShowcaseMaterials(course, group)).toEqual([
      expect.objectContaining({ fileName: "final-report.pdf", url: "/api/uploads/final-report.pdf" }),
    ]);
  });
});

describe("DimensionRow", () => {
  it("shows the complete scoring criterion and keeps both score controls in sync", () => {
    const onChange = vi.fn();

    render(
      <ul>
        <DimensionRow
          dimension={{
            id: "communication",
            name: "表达与答辩",
            weight: 30,
            description: "观点表达清晰，能够使用作品证据回应现场提问并说明项目局限。",
          }}
          onChange={onChange}
          value={72}
        />
      </ul>,
    );

    expect(screen.getByText("观点表达清晰，能够使用作品证据回应现场提问并说明项目局限。")).toBeTruthy();
    expect(screen.getByText("权重 30%")).toBeTruthy();
    expect((screen.getByLabelText("表达与答辩分数") as HTMLInputElement).value).toBe("72");
    expect((screen.getByLabelText("表达与答辩评分滑块") as HTMLInputElement).value).toBe("72");

    fireEvent.change(screen.getByLabelText("表达与答辩评分滑块"), {
      target: { value: "86" },
    });
    expect(onChange).toHaveBeenCalledWith(86);
  });
});
