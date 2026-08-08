import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCoursePresence } from "@/hooks/use-course-presence";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCoursePresence", () => {
  it("sends a student heartbeat and reads the shared presence snapshot", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Response(JSON.stringify({ online: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          members: [
            { id: "teacher-1", role: "teacher", name: "教师" },
            { id: "student-1", role: "student", name: "测试学生" },
          ],
          source: "database",
          degraded: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() =>
      useCoursePresence({
        courseId: "course-1",
        role: "student",
        heartbeat: true,
      }),
    );

    await waitFor(() => expect(result.current.onlineCount).toBe(1));
    expect(result.current.onlineStudentIds.has("student-1")).toBe(true);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true);
    expect(
      fetchMock.mock.calls.some(([, init]) =>
        init?.method === undefined
        && (init?.headers as Record<string, string>)?.["X-OpenPBL-Role"] === "student"
      ),
    ).toBe(true);

    unmount();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });
});
