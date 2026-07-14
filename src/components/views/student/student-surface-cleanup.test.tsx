import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

vi.mock("@/components/rich-text-editor", () => ({ RichTextEditor: () => <div>项目编辑器</div> }));
vi.mock("./companion-roundtable", () => ({ CompanionRoundtable: () => <div>AI 伴学圆桌</div> }));
vi.mock("@/lib/session/store", () => ({ useSession: () => ({ studentId: "s1", studentName: "张三", user: { name: "张三" }, upsertSubmission: vi.fn(), addActivity: vi.fn(), updateStudentProgress: vi.fn() }) }));

import { WorkspaceView } from "./workspace";

const course: Course = {
  id: "c1", name: "课程", subject: "科学", grade: "六年级", hours: 2, summary: "", drivingQuestion: "", status: "teaching", stages: DEFAULT_STAGES, currentStageIndex: 3,
  content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
  students: [{ id: "s1", name: "张三", joinedAt: "2026-07-11T10:00:00.000Z", stageProgress: {} }],
  groups: [{ id: "g1", name: "张三的个人项目", topic: "", keywords: [], selectedForms: [], members: [{ studentId: "s1", name: "张三" }], createdAt: "2026-07-11T10:00:00.000Z", updatedAt: "2026-07-11T10:00:00.000Z" }],
  activityLog: [{ id: "a1", actor: "张三", action: "保存", createdAt: "2026-07-11T10:00:00.000Z" }], createdAt: "2026-07-11T10:00:00.000Z", updatedAt: "2026-07-11T10:00:00.000Z",
};

describe("student workspace cleanup", () => {
  it("keeps the editor and companion roundtable without duplicate scaffold or process cards", () => {
    render(<WorkspaceView course={course} />);
    expect(screen.getByText("项目编辑器")).toBeTruthy();
    expect(screen.getByText("AI 伴学圆桌")).toBeTruthy();
    expect(screen.queryByText("AI任务支架")).toBeNull();
    expect(screen.queryByText("过程记录")).toBeNull();
  });
});
