import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getCourse: vi.fn(),
  readSessionState: vi.fn(),
  scopeCourseForClaims: vi.fn((course: unknown) => course),
}));

vi.mock("@/lib/auth/request-guards", () => ({
  authenticateRequest: mocks.authenticateRequest,
}));
vi.mock("@/lib/auth/course-scope", () => ({
  scopeCourseForClaims: mocks.scopeCourseForClaims,
}));
vi.mock("@/lib/session/server-store", () => ({
  getCourse: mocks.getCourse,
  readSessionState: mocks.readSessionState,
}));

import { GET } from "./route";

describe("GET /api/courses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads only the signed-in student's course", async () => {
    const claims = {
      sub: "student-1",
      role: "student",
      courseId: "course-1",
      studentId: "student-1",
      studentName: "学生一",
      sv: 1,
    } as const;
    const course = {
      id: "course-1",
      updatedAt: "2026-08-24T10:00:00.000Z",
    };
    mocks.authenticateRequest.mockResolvedValue({ claims });
    mocks.getCourse.mockResolvedValue(course);

    const response = await GET(new Request("http://localhost/api/courses"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getCourse).toHaveBeenCalledWith("course-1");
    expect(mocks.readSessionState).not.toHaveBeenCalled();
    expect(mocks.scopeCourseForClaims).toHaveBeenCalledWith(course, claims);
    await expect(response.json()).resolves.toMatchObject({
      courses: [course],
      joinedCourseId: "course-1",
      studentId: "student-1",
      hydrated: true,
    });
  });

  it("keeps the teacher dashboard on the full course list", async () => {
    mocks.authenticateRequest.mockResolvedValue({
      claims: {
        sub: "teacher-1",
        role: "teacher",
        username: "teacher",
        displayName: "教师一",
        sv: 1,
      },
    });
    mocks.readSessionState.mockResolvedValue({
      courses: [{ id: "course-1" }, { id: "course-2" }],
      user: { role: "teacher", name: "教师" },
      hydrated: true,
    });

    const response = await GET(new Request("http://localhost/api/courses"));

    expect(response.status).toBe(200);
    expect(mocks.readSessionState).toHaveBeenCalledTimes(1);
    expect(mocks.getCourse).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      courses: [{ id: "course-1" }, { id: "course-2" }],
      user: { role: "teacher", name: "教师一" },
    });
  });
});
