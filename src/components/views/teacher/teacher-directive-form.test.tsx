import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";

const { upsertTeacherAgentDirective } = vi.hoisted(() => ({
  upsertTeacherAgentDirective: vi.fn(),
}));

vi.mock("@/lib/session/store", () => ({
  useSession: () => ({ upsertTeacherAgentDirective }),
}));

import { TeacherDirectiveForm } from "./teacher-directive-form";

const course = {
  id: "course-1",
  students: [
    { id: "student-1", name: "张三" },
    { id: "student-2", name: "李四" },
    { id: "student-3", name: "王五" },
  ],
} as unknown as Course;

describe("TeacherDirectiveForm", () => {
  it("submits one directive to multiple preselected students", () => {
    render(
      <TeacherDirectiveForm
        course={course}
        initialStudentIds={["student-1", "student-2"]}
        stageKey="proposal"
      />,
    );

    fireEvent.change(screen.getByLabelText("持续目标"), { target: { value: "补全证据" } });
    fireEvent.change(screen.getByLabelText("Agent 引导要求"), { target: { value: "先追问证据来源" } });
    fireEvent.change(screen.getByLabelText("完成标准（每行一条）"), { target: { value: "两条证据\n来源可追溯" } });
    fireEvent.click(screen.getByRole("button", { name: /向 2 名学生 下发目标/ }));

    expect(upsertTeacherAgentDirective).toHaveBeenCalledWith(expect.objectContaining({
      stageKey: "proposal",
      targetScope: "multiple",
      targetStudentIds: ["student-1", "student-2"],
      goal: "补全证据",
      successCriteria: ["两条证据", "来源可追溯"],
    }));
  });

  it("can switch the target to the full class", () => {
    render(<TeacherDirectiveForm course={course} initialStudentIds={["student-1"]} stageKey="proposal" />);
    fireEvent.click(screen.getByRole("button", { name: "全班" }));
    expect(screen.getByText("全班 3 人")).toBeTruthy();
  });
});
