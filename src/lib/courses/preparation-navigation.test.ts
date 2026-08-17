import { describe, expect, it } from "vitest";
import {
  courseDetailedEditHref,
  resolvePreparationGenerationMode,
} from "./preparation-navigation";

describe("course preparation navigation", () => {
  it("routes preview edits directly into the detailed editor", () => {
    const href = courseDetailedEditHref("course/one");
    expect(href).toBe("/teacher/prepare/course%2Fone/verify/edit");
    expect(resolvePreparationGenerationMode(href)).toBe("detailed");
  });

  it("keeps the normal preparation entry in quick-generation mode", () => {
    expect(resolvePreparationGenerationMode("/teacher/prepare/course-1/verify")).toBe("quick");
  });
});
