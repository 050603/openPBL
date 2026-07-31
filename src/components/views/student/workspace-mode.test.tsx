import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  useStudentWorkspaceMode,
  workspaceModeStorageKey,
} from "./workspace-mode";

describe("student workspace mode", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("uses the teacher-defined default and persists a student-scoped choice", () => {
    const { result } = renderHook(() =>
      useStudentWorkspaceMode("course-1", "student-1", "proposal", "companions"),
    );
    expect(result.current[0]).toBe("companions");

    act(() => result.current[1]("task"));

    expect(result.current[0]).toBe("task");
    expect(
      window.sessionStorage.getItem(
        workspaceModeStorageKey("course-1", "student-1", "proposal"),
      ),
    ).toBe("task");
  });

  it("does not share a saved choice with another student", async () => {
    window.sessionStorage.setItem(
      workspaceModeStorageKey("course-1", "student-1", "proposal"),
      "task",
    );
    const first = renderHook(() =>
      useStudentWorkspaceMode("course-1", "student-1", "proposal"),
    );
    const second = renderHook(() =>
      useStudentWorkspaceMode("course-1", "student-2", "proposal"),
    );

    await waitFor(() => expect(first.result.current[0]).toBe("task"));
    expect(second.result.current[0]).toBe("companions");
  });

  it("keeps choices isolated by stage and follows each stage default", () => {
    window.sessionStorage.setItem(
      workspaceModeStorageKey("course-1", "student-1", "proposal"),
      "task",
    );
    const proposal = renderHook(() =>
      useStudentWorkspaceMode(
        "course-1",
        "student-1",
        "proposal",
        "companions",
      ),
    );
    const make = renderHook(() =>
      useStudentWorkspaceMode("course-1", "student-1", "make", "task"),
    );

    expect(proposal.result.current[0]).toBe("task");
    expect(make.result.current[0]).toBe("task");
    expect(
      window.sessionStorage.getItem(
        workspaceModeStorageKey("course-1", "student-1", "make"),
      ),
    ).toBeNull();
  });
});
