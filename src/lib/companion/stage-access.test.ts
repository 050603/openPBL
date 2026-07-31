import { describe, expect, it } from "vitest";
import { isCompanionStageEnabled } from "./stage-access";

describe("isCompanionStageEnabled", () => {
  it("disables companions in launch and AI learning regardless of stored policy", () => {
    expect(
      isCompanionStageEnabled(
        {
          stageWorkspacePolicies: {
            launch: {
              access: "companions-only",
              defaultMode: "companions",
            },
            "ai-learning": {
              access: "companions-only",
              defaultMode: "companions",
            },
          },
        },
        "launch",
      ),
    ).toBe(false);
    expect(
      isCompanionStageEnabled(
        {
          stageWorkspacePolicies: {
            "ai-learning": {
              access: "companions-only",
              defaultMode: "companions",
            },
          },
        },
        "ai-learning",
      ),
    ).toBe(false);
  });

  it("follows the teacher policy in stages three through six", () => {
    const stageWorkspacePolicies = {
      proposal: {
        access: "companions-only",
        defaultMode: "companions",
      },
      make: { access: "task-only", defaultMode: "task" },
    } as const;

    expect(
      isCompanionStageEnabled({ stageWorkspacePolicies }, "proposal"),
    ).toBe(true);
    expect(
      isCompanionStageEnabled({ stageWorkspacePolicies }, "make"),
    ).toBe(false);
  });

  it("uses the companion-first default for a supported stage", () => {
    expect(
      isCompanionStageEnabled(
        { stageWorkspacePolicies: undefined },
        "proposal",
      ),
    ).toBe(true);
  });
});
