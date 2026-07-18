import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openmaic/lib/store/settings", () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    ttsProviderId: "qwen-tts",
    ttsVoice: "default",
    ttsSpeed: 1,
    ttsProvidersConfig: { "qwen-tts": { enabled: true, modelId: "qwen3-tts-flash" } },
    agentVoiceOverrides: {},
  }),
}));

import { useCompanionTTS } from "./companion-roundtable";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

class FakeAudio {
  static instances: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public readonly src: string) { FakeAudio.instances.push(this); }
  play = vi.fn(async () => undefined);
  pause = vi.fn();
}

describe("companion TTS pipeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudio.instances = [];
    vi.stubGlobal("Audio", FakeAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("prefetches later audio immediately but preserves playback order", async () => {
    const firstResponse = deferred<{ json: () => Promise<unknown>; ok: boolean }>();
    const secondResponse = deferred<{ json: () => Promise<unknown>; ok: boolean }>();
    const fetchMock = vi.fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useCompanionTTS());
    let first!: NonNullable<ReturnType<typeof result.current.prepare>>;
    let second!: NonNullable<ReturnType<typeof result.current.prepare>>;
    act(() => {
      first = result.current.prepare("第一位伙伴的建议", "knowledge")!;
      second = result.current.prepare("第二位伙伴的补充", "critic")!;
      result.current.enqueuePrepared(first);
      result.current.enqueuePrepared(second);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.preparingCompanionId).toBe("knowledge");
    expect(result.current.currentTTS).toBeNull();
    expect(result.current.speaking).toBe(false);

    await act(async () => {
      secondResponse.resolve({ ok: true, json: async () => ({ success: true, base64: "SECOND", format: "mp3" }) });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(FakeAudio.instances).toHaveLength(0);

    await act(async () => {
      firstResponse.resolve({ ok: true, json: async () => ({ success: true, base64: "FIRST", format: "mp3" }) });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(FakeAudio.instances[0]?.src).toContain("FIRST");
    expect(result.current.currentTTS?.companionId).toBe("knowledge");
    expect(result.current.speaking).toBe(true);

    await act(async () => {
      FakeAudio.instances[0]?.onended?.();
      vi.advanceTimersByTime(2_199);
      await Promise.resolve();
    });
    expect(result.current.speaking).toBe(false);
    expect(result.current.currentTTS?.companionId).toBe("knowledge");
    expect(FakeAudio.instances).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(2);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(FakeAudio.instances[1]?.src).toContain("SECOND");
    unmount();
  });
});
