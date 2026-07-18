import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_STAGES, type StageWorkspacePolicy } from "@/lib/session/types";
import { StageWorkspacePolicyPanel } from "./stage-workspace-policy-panel";

describe("StageWorkspacePolicyPanel", () => {
  it("configures stage access and the default for student choice", () => {
    let policies: Record<string, StageWorkspacePolicy> | undefined;
    const onChange = vi.fn((next: Record<string, StageWorkspacePolicy>) => { policies = next; });
    const { rerender } = render(
      <StageWorkspacePolicyPanel onChange={onChange} policies={policies} stages={DEFAULT_STAGES} />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "方案构思与校准可用模式" }), {
      target: { value: "task-only" },
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      proposal: { access: "task-only", defaultMode: "task" },
    }));

    rerender(<StageWorkspacePolicyPanel onChange={onChange} policies={policies} stages={DEFAULT_STAGES} />);
    fireEvent.change(screen.getByRole("combobox", { name: "方案构思与校准可用模式" }), {
      target: { value: "student-choice" },
    });
    rerender(<StageWorkspacePolicyPanel onChange={onChange} policies={policies} stages={DEFAULT_STAGES} />);
    fireEvent.click(screen.getByRole("button", { name: "方案构思与校准默认伴学模式" }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      proposal: { access: "student-choice", defaultMode: "companions" },
    }));
  });

  it("shows only the current stage in compact classroom mode", () => {
    render(
      <StageWorkspacePolicyPanel compact currentStageKey="make" onChange={vi.fn()} stages={DEFAULT_STAGES} />,
    );
    expect(screen.getByRole("combobox", { name: "项目实践可用模式" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "项目启动可用模式" })).toBeNull();
  });

  it("keeps the first two stages fixed to the traditional workspace", () => {
    render(<StageWorkspacePolicyPanel onChange={vi.fn()} stages={DEFAULT_STAGES} />);
    expect(screen.queryByRole("combobox", { name: "项目启动可用模式" })).toBeNull();
    expect(screen.getByLabelText("项目启动可用模式").textContent).toContain("仅普通模式");
    expect(screen.queryByRole("combobox", { name: "AI授知可用模式" })).toBeNull();
  });
});
