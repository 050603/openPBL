import { describe, expect, it } from "vitest";
import { isCompanionStageEnabled } from "./stage-access";

describe("isCompanionStageEnabled", () => {
  it("uses the same default policy shown in the teacher workspace panel", () => {
    expect(isCompanionStageEnabled({ stageWorkspacePolicies: undefined }, "proposal")).toBe(true);
  });

  it("never enables companion features in task-only stages", () => {
    expect(
      isCompanionStageEnabled(
        {
          stageWorkspacePolicies: {
            "ai-learning": { access: "companions-only", defaultMode: "companions" },
          },
        },
        "ai-learning",
      ),
    ).toBe(false);
  });

  it("follows the teacher's stage workspace access setting", () => {
    const stageWorkspacePolicies = {
      proposal: { access: "companions-only", defaultMode: "companions" },
      make: { access: "task-only", defaultMode: "task" },
    } as const;

    expect(isCompanionStageEnabled({ stageWorkspacePolicies }, "proposal")).toBe(true);
    expect(isCompanionStageEnabled({ stageWorkspacePolicies }, "make")).toBe(false);
  });
});
