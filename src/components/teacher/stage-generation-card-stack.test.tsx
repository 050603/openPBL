import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StageGenerationCardStack, type StageGenerationCardData } from "./stage-generation-card-stack";

function cards(ids: string[]): StageGenerationCardData[] {
  return ids.map((id) => ({
    id,
    eyebrow: "正在生成",
    title: id,
    detail: `${id} 的真实生成信息`,
    items: ["质量检查"],
  }));
}

describe("StageGenerationCardStack", () => {
  it("keeps keys unique while live job cards change", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = render(<StageGenerationCardStack cards={cards(["stage-base", "stage-evaluationPlan"])} kind="quickCourse" />);

    view.rerender(<StageGenerationCardStack cards={cards(["stage-evaluationPlan", "stage-lessonOutline"])} kind="quickCourse" />);
    await act(async () => Promise.resolve());

    expect(error.mock.calls.flat().join(" ")).not.toContain("same key");
    expect(view.getAllByRole("article")).toHaveLength(2);
    error.mockRestore();
  });

  it("deduplicates repeated stage ids from transient polling payloads", async () => {
    const view = render(
      <StageGenerationCardStack
        cards={cards(["stage-lessonOutline", "stage-lessonOutline", "stage-adaptiveLearning"])}
        kind="quickCourse"
      />,
    );
    await act(async () => Promise.resolve());

    expect(view.getAllByRole("article")).toHaveLength(2);
  });
});
