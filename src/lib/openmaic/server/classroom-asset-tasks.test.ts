import { describe, expect, it } from "vitest";
import { runIndependentClassroomAssetTasks } from "@openmaic/lib/server/classroom-asset-tasks";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("runIndependentClassroomAssetTasks", () => {
  it("starts media and TTS before either task completes, then persists the merged state", async () => {
    const media = deferred();
    const tts = deferred();
    const events: string[] = [];

    const running = runIndependentClassroomAssetTasks({
      media: async () => {
        events.push("media:start");
        await media.promise;
        events.push("media:done");
      },
      tts: async () => {
        events.push("tts:start");
        await tts.promise;
        events.push("tts:done");
      },
      persistMergedState: async () => {
        events.push("persist");
      },
    });

    await Promise.resolve();
    expect(events).toEqual(["media:start", "tts:start"]);

    tts.resolve();
    media.resolve();
    await running;

    expect(events).toContain("media:done");
    expect(events).toContain("tts:done");
    expect(events.at(-1)).toBe("persist");
  });
});
