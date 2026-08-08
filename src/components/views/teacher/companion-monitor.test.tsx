import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

const { resolveInterventionSignals } = vi.hoisted(() => ({
  resolveInterventionSignals: vi.fn(),
}));

vi.mock("@/lib/session/store", () => ({
  useSession: () => ({
    user: { name: "教师" },
    reviewLearningEvidence: vi.fn(),
    addActivity: vi.fn(),
    upsertTeacherAgentDirective: vi.fn(),
    resolveInterventionSignals,
  }),
}));
vi.mock("./teacher-directive-form", () => ({ TeacherDirectiveForm: () => <div>教师目标表单</div> }));

import { CompanionMonitor } from "./companion-monitor";

const course: Course = {
  id: "c1", name: "课程", subject: "科学", grade: "六年级", hours: 2, summary: "", drivingQuestion: "", status: "teaching", stages: DEFAULT_STAGES, currentStageIndex: 2,
  content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
  students: [{ id: "s1", name: "张三", joinedAt: "2026-07-11T10:00:00.000Z", stageProgress: {} }, { id: "s2", name: "李四", joinedAt: "2026-07-11T10:00:00.000Z", stageProgress: {} }],
  learningSignals: [{ id: "sig1", courseId: "c1", studentId: "s1", stageKey: "proposal", kind: "conversation-no-progress", severity: "high", status: "open", title: "对话无进展", summary: "连续三轮无产物变化", normalizedIssueKey: "same", evidenceEventIds: [], aiInterventionAttempts: 2, firstDetectedAt: "2026-07-11T10:00:00.000Z", lastDetectedAt: "2026-07-11T10:00:00.000Z" }],
  classCommonIssues: [{ id: "common1", courseId: "c1", stageKey: "proposal", normalizedIssueKey: "same", title: "共性问题", summary: "多人无进展", severity: "high", studentIds: ["s1", "s2"], signalIds: ["sig1"], status: "open", firstDetectedAt: "2026-07-11T10:00:00.000Z", lastDetectedAt: "2026-07-11T10:00:00.000Z" }],
  companionTasks: [{ id: "task1", courseId: "c1", studentId: "s1", stageKey: "proposal", companionId: "planner", kind: "planning", title: "拆解项目步骤", request: "帮我安排下一步", status: "waiting-student", createdAt: "2026-07-11T10:00:00.000Z", updatedAt: "2026-07-11T10:01:00.000Z" }],
  createdAt: "2026-07-11T10:00:00.000Z", updatedAt: "2026-07-11T10:00:00.000Z",
};

describe("CompanionMonitor", () => {
  it("prioritizes students by readiness and keeps chat in the audit drawer", () => {
    render(<CompanionMonitor course={course} stageKey="proposal" />);
    expect(screen.getByText("方案校准行动台")).toBeTruthy();
    expect(screen.getByText("班级共同证据缺口")).toBeTruthy();
    expect(screen.getAllByText("可验证方案版本").length).toBeGreaterThan(0);
    expect(screen.getAllByText("张三").length).toBeGreaterThan(0);
    expect(screen.getAllByText("李四").length).toBeGreaterThan(0);
    expect(screen.queryByText("教师目标表单")).toBeNull();
    expect(screen.queryByText("教师持续目标")).toBeNull();
    expect(screen.queryByText("当前任务")).toBeNull();
    expect(screen.queryByText("建议教师动作")).toBeNull();
    expect(screen.getAllByText(/1 条学习信号/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    expect(resolveInterventionSignals).toHaveBeenCalledWith("c1", ["sig1"]);

    fireEvent.click(screen.getByRole("button", { name: /李四.*尚未提交阶段证据/ }));
    expect(screen.getByText("该学生尚未提交本阶段内容")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /仅对此学生下发目标/ }));
    expect(screen.getByText("教师目标表单")).toBeTruthy();
    expect(screen.getByText("伴学任务与对话记录")).toBeTruthy();
    expect(screen.queryByText(/阶段进度.*%/)).toBeNull();
  });
});
