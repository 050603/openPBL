import { describe, expect, it, vi } from "vitest";
import {
  retryVersionConflict,
  SessionActionRequestError,
} from "./action-version-retry";

describe("session action version conflict recovery", () => {
  it("retries with the server version and preserves the original operation", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new SessionActionRequestError("VERSION_CONFLICT", 409, 8))
      .mockResolvedValueOnce({ courseVersion: 9 });

    await expect(retryVersionConflict(send, 7)).resolves.toEqual({ courseVersion: 9 });
    expect(send.mock.calls).toEqual([[7], [8]]);
  });

  it("does not retry unrelated request failures", async () => {
    const error = new SessionActionRequestError("FORBIDDEN_ACTION", 403);
    const send = vi.fn().mockRejectedValue(error);

    await expect(retryVersionConflict(send, 7)).rejects.toBe(error);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("recovers a missing local version from the server response", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new SessionActionRequestError("EXPECTED_VERSION_REQUIRED", 428, 1))
      .mockResolvedValueOnce({ courseVersion: 2 });

    await expect(retryVersionConflict(send, undefined)).resolves.toEqual({ courseVersion: 2 });
    expect(send.mock.calls).toEqual([[undefined], [1]]);
  });

  it("bounds repeated conflicts instead of looping forever", async () => {
    const send = vi.fn((version: number | undefined) =>
      Promise.reject(new SessionActionRequestError("VERSION_CONFLICT", 409, (version ?? 0) + 1)),
    );

    await expect(retryVersionConflict(send, 3)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    expect(send.mock.calls).toEqual([[3], [4], [5]]);
  });
});
