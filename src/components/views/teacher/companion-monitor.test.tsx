import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

vi.mock("@/lib/session/store", () => ({ useSession: () => ({ upsertTeacherAgentDirective: vi.fn() }) }));
vi.mock("./teacher-directive-form", () => ({ TeacherDirectiveForm: () => <div>教师目标表单</div> }));

import { CompanionMonitor } from "./companion-monitor";

const course: Course = {
  id: "c1", name: "课程", subject: "科学", grade: "六年级", hours: 2, summary: "", drivingQuestion: "", status: "teaching", stages: DEFAULT_STAGES, currentStageIndex: 2,
  content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
  students: [{ id: "s1", name: "张三", joinedAt: "2026-07-11T10:00:00.000Z", stageProgress: {} }, { id: "s2", name: "李四", joinedAt: "2026-07-11T10:00:00.000Z", stageProgress: {} }],
  learningSignals: [{ id: "sig1", courseId: "c1", studentId: "s1", stageKey: "proposal", kind: "conversation-no-progress", severity: "high", status: "open", title: "对话无进展", summary: "连续三轮无产物变化", normalizedIssueKey: "same", evidenceEventIds: [], aiInterventionAttempts: 2, firstDetectedAt: "2026-07-11T10:00:00.000Z", lastDetectedAt: "2026-07-11T10:00:00.000Z" }],
  classCommonIssues: [{ id: "common1", courseId: "c1", stageKey: "proposal", normalizedIssueKey: "same", title: "共性问题", summary: "多人无进展", severity: "high", studentIds: ["s1", "s2"], signalIds: ["sig1"], status: "open", firstDetectedAt: "2026-07-11T10:00:00.000Z", lastDetectedAt: "2026-07-11T10:00:00.000Z" }],
  createdAt: "2026-07-11T10:00:00.000Z", updatedAt: "2026-07-11T10:00:00.000Z",
};

describe("CompanionMonitor", () => {
  it("groups signals by student and separates class common issues", () => {
    render(<CompanionMonitor course={course} stageKey="proposal" />);
    expect(screen.getByText("共性问题")).toBeTruthy();
    expect(screen.getAllByText("张三").length).toBeGreaterThan(0);
    expect(screen.getAllByText("李四").length).toBeGreaterThan(0);
    expect(screen.getByText("教师目标表单")).toBeTruthy();
  });
});
