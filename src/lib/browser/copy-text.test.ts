import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./copy-text";

describe("copyTextToClipboard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the selection fallback when Clipboard API rejects on plain HTTP", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });

    await copyTextToClipboard("A2K9QP");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
