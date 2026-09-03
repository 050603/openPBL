import { describe, expect, it } from "vitest";
import { isUnsupportedMobileOrTablet } from "./device-access";

describe("isUnsupportedMobileOrTablet", () => {
  it.each([
    ["Android phone", { userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile" }],
    ["Android tablet", { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36" }],
    ["iPhone", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }],
    ["classic iPad", { userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)" }],
    ["desktop-mode iPad", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", platform: "MacIntel", maxTouchPoints: 5 }],
    ["User-Agent Client Hint mobile", { userAgent: "Mozilla/5.0", mobile: true }],
  ])("rejects %s", (_label, signals) => {
    expect(isUnsupportedMobileOrTablet(signals)).toBe(true);
  });

  it.each([
    ["Windows desktop", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32" }],
    ["touch-enabled Windows laptop", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 10 }],
    ["macOS desktop", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6)", platform: "MacIntel", maxTouchPoints: 0 }],
    ["Linux desktop", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)", platform: "Linux x86_64" }],
    ["desktop client hint overrides a compatibility UA", { userAgent: "Mozilla/5.0 Android Mobile", mobile: false }],
    ["fine-pointer remote Mac desktop with touch points", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6)", platform: "MacIntel", maxTouchPoints: 5, hasFinePointer: true, viewportWidth: 1440 }],
  ])("allows %s", (_label, signals) => {
    expect(isUnsupportedMobileOrTablet(signals)).toBe(false);
  });
});
