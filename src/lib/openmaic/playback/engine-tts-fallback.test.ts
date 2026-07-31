import { describe, expect, it } from 'vitest';
import { shouldUseBrowserNativeTtsFallback } from './engine';

describe('shouldUseBrowserNativeTtsFallback', () => {
  it('uses the enabled browser voice when server audio is unavailable', () => {
    expect(shouldUseBrowserNativeTtsFallback({
      hasText: true,
      ttsEnabled: true,
      browserNativeEnabled: true,
      speechSynthesisAvailable: true,
    })).toBe(true);
  });

  it.each([
    ['empty speech', { hasText: false }],
    ['TTS disabled', { ttsEnabled: false }],
    ['browser provider disabled', { browserNativeEnabled: false }],
    ['browser API unavailable', { speechSynthesisAvailable: false }],
  ])('does not use browser fallback when %s', (_label, override) => {
    expect(shouldUseBrowserNativeTtsFallback({
      hasText: true,
      ttsEnabled: true,
      browserNativeEnabled: true,
      speechSynthesisAvailable: true,
      ...override,
    })).toBe(false);
  });
});
