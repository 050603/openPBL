import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichDocumentPreview } from "./rich-document-preview";

describe("RichDocumentPreview", () => {
  it("renders a teacher-side read-only preview inside Plate context", () => {
    const view = render(
      <RichDocumentPreview html="<h2>调研结论</h2><p>这是学生实时提交的内容。</p>" />,
    );

    expect(screen.getByText("调研结论")).toBeTruthy();
    expect(screen.getByText("这是学生实时提交的内容。")).toBeTruthy();
    expect(view.container.querySelector("[data-document-preview=true]")).toBeTruthy();
  });
});
