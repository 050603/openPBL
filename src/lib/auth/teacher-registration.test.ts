import { describe, expect, it } from "vitest";
import { TeacherRegistrationSchema } from "./teacher-registration";

describe("TeacherRegistrationSchema", () => {
  it("normalizes a valid username and teacher name", () => {
    const parsed = TeacherRegistrationSchema.parse({
      username: " Teacher.Admin ",
      displayName: " 王老师 ",
      password: "correct-horse-battery-staple",
      confirmPassword: "correct-horse-battery-staple",
    });

    expect(parsed.username).toBe("teacher.admin");
    expect(parsed.displayName).toBe("王老师");
  });

  it("rejects weak passwords and unsupported usernames", () => {
    expect(
      TeacherRegistrationSchema.safeParse({
        username: "教师账号",
        displayName: "王老师",
        password: "short",
        confirmPassword: "short",
      }).success,
    ).toBe(false);
  });

  it("rejects mismatched password confirmation", () => {
    const parsed = TeacherRegistrationSchema.safeParse({
      username: "teacher",
      displayName: "王老师",
      password: "correct-horse-battery-staple",
      confirmPassword: "another-long-password",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.confirmPassword).toBeDefined();
    }
  });
});
