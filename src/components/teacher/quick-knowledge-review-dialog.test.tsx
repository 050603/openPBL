import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickKnowledgeReviewDialog } from "./quick-knowledge-review-dialog";

vi.mock("@/components/knowledge-graph-flow", () => ({
  KnowledgeGraphFlow: () => <div data-testid="knowledge-graph-preview" />,
}));

describe("QuickKnowledgeReviewDialog", () => {
  it("lets the teacher edit a knowledge point and continue with the edited graph", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <QuickKnowledgeReviewDialog
        initialKnowledgeGraph={{
          nodes: [{
            id: "kp-1",
            label: "旧名称",
            description: "旧说明",
            level: "core",
            instructionalRole: "lesson",
          }],
          edges: [],
        }}
        initialKnowledgePoints={[{
          id: "kp-1",
          name: "旧名称",
          description: "旧说明",
          level: "core",
        }]}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByTestId("knowledge-graph-preview")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "新名称" } });
    fireEvent.click(screen.getByRole("button", { name: "确认并继续" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const [points, graph] = onConfirm.mock.calls[0];
    expect(points[0].name).toBe("新名称");
    expect(graph.nodes[0].label).toBe("新名称");
  });
});
