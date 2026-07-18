import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useStudentWorkspaceMode, workspaceModeStorageKey } from "./workspace-mode";

describe("student workspace mode", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("starts in the immersive classroom and persists a student-scoped choice", () => {
    const { result } = renderHook(() => useStudentWorkspaceMode("course-1", "student-1", "launch"));
    expect(result.current[0]).toBe("companions");

    act(() => result.current[1]("task"));

    expect(result.current[0]).toBe("task");
    expect(window.sessionStorage.getItem(workspaceModeStorageKey("course-1", "student-1", "launch"))).toBe("task");
  });

  it("restores the saved choice without sharing it with another student", async () => {
    window.sessionStorage.setItem(workspaceModeStorageKey("course-1", "student-1", "launch"), "task");
    const first = renderHook(() => useStudentWorkspaceMode("course-1", "student-1", "launch"));
    const second = renderHook(() => useStudentWorkspaceMode("course-1", "student-2", "launch"));

    await waitFor(() => expect(first.result.current[0]).toBe("task"));
    expect(second.result.current[0]).toBe("companions");
  });

  it("keeps choices isolated by stage and follows each stage default", () => {
    window.sessionStorage.setItem(workspaceModeStorageKey("course-1", "student-1", "launch"), "task");
    const launch = renderHook(() => useStudentWorkspaceMode("course-1", "student-1", "launch", "companions"));
    const make = renderHook(() => useStudentWorkspaceMode("course-1", "student-1", "make", "task"));

    expect(launch.result.current[0]).toBe("task");
    expect(make.result.current[0]).toBe("task");
    expect(window.sessionStorage.getItem(workspaceModeStorageKey("course-1", "student-1", "make"))).toBeNull();
  });
});
