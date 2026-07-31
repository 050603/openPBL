import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_STAGES } from "@/lib/session/types";
import { StageWorkspacePolicyPanel } from "./stage-workspace-policy-panel";

describe("StageWorkspacePolicyPanel", () => {
  it("fixes the first two stages to traditional pages and controls stages three through six", () => {
    render(
      <StageWorkspacePolicyPanel
        onChange={vi.fn()}
        stages={DEFAULT_STAGES}
      />,
    );

    expect(
      screen.getByText(
        "第 1、2 阶段固定为传统学习页面；第 3–6 阶段由教师决定是否启用 AI 伴学场景。",
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        `${DEFAULT_STAGES[0].label}学生端显示`,
      ).textContent,
    ).toContain("仅传统学习页面");
    expect(
      screen.getByLabelText(
        `${DEFAULT_STAGES[1].label}学生端显示`,
      ).textContent,
    ).toContain("仅传统学习页面");
    expect(screen.getAllByRole("combobox")).toHaveLength(4);
  });

  it("persists a teacher mode change for a supported stage", () => {
    const onChange = vi.fn();
    const proposal = DEFAULT_STAGES.find((stage) => stage.key === "proposal")!;
    render(
      <StageWorkspacePolicyPanel
        onChange={onChange}
        stages={DEFAULT_STAGES}
      />,
    );

    fireEvent.change(
      screen.getByRole("combobox", {
        name: `${proposal.label}学生端显示`,
      }),
      { target: { value: "task-only" } },
    );

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal: { access: "task-only", defaultMode: "task" },
      }),
    );
  });

  it("shows only the current stage in compact classroom mode", () => {
    const launch = DEFAULT_STAGES.find((stage) => stage.key === "launch")!;
    render(
      <StageWorkspacePolicyPanel
        compact
        currentStageKey="launch"
        onChange={vi.fn()}
        stages={DEFAULT_STAGES}
      />,
    );

    expect(
      screen.getByLabelText(`${launch.label}学生端显示`).textContent,
    ).toContain("仅传统学习页面");
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
