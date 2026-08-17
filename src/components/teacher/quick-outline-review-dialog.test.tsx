import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/openmaic/generation/outlines-editor", async () => {
  const { useI18n } = await import("@/lib/openmaic/hooks/use-i18n");
  return {
    OutlinesEditor: () => {
      useI18n();
      return <div>大纲编辑器已加载</div>;
    },
  };
});

import { QuickOutlineReviewDialog } from "./quick-outline-review-dialog";

describe("QuickOutlineReviewDialog", () => {
  it("provides OpenMAIC i18n context while expanding the outline editor", () => {
    expect(() => render(
      <QuickOutlineReviewDialog initialOutlines={[]} onClose={vi.fn()} onConfirm={vi.fn()} />,
    )).not.toThrow();
    expect(screen.getByText("大纲编辑器已加载")).toBeTruthy();
  });
});
