// @vitest-environment node

import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("teacher password hashing", () => {
  it("hashes and verifies a ten-character password", async () => {
    const hash = await hashPassword("openpbl123");

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword("openpbl123", hash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect1", hash)).resolves.toBe(false);
  });

  it("rejects a password shorter than ten characters", async () => {
    await expect(hashPassword("openpbl12")).rejects.toThrow(
      "between 10 and 256 characters",
    );
  });
});
