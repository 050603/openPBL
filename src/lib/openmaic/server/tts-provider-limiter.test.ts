import { describe, expect, it } from "vitest";
import { runWithGlobalTtsProviderSlot } from "./tts-provider-limiter";

describe("global TTS provider limiter", () => {
  it("caps concurrency across independent classroom callers", async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    const providerId = `provider-${Date.now()}`;
    const tasks = Array.from({ length: 6 }, (_, index) =>
      runWithGlobalTtsProviderSlot(providerId, 2, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        return index;
      }),
    );

    await Promise.resolve();
    expect(maxActive).toBe(2);
    for (let batch = 0; batch < 3; batch += 1) {
      await Promise.resolve();
      await Promise.resolve();
      releases.splice(0).forEach((release) => release());
      await Promise.resolve();
      await Promise.resolve();
    }
    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3, 4, 5]);
    expect(maxActive).toBe(2);
  });
});
