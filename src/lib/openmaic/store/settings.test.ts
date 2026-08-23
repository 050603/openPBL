import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('playback settings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('enables continuous AI lecture playback by default', async () => {
    const { useSettingsStore } = await import('./settings');

    expect(useSettingsStore.getInitialState().autoPlayLecture).toBe(true);
  });

  it('applies the new default once to existing browser settings', async () => {
    localStorage.setItem(
      'settings-storage',
      JSON.stringify({ state: { autoPlayLecture: false }, version: 4 }),
    );
    const { useSettingsStore } = await import('./settings');

    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().autoPlayLecture).toBe(true);
  });
});
