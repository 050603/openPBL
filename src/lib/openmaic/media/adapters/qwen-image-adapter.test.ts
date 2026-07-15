import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateWithQwenImage } from './qwen-image-adapter';

describe('Qwen image throttling metadata', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserves 429 status and Retry-After for the shared retry policy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 'Throttling.RateQuota', message: 'rate limit exceeded' }),
      { status: 429, headers: { 'Retry-After': '30' } },
    )));

    await expect(generateWithQwenImage(
      { providerId: 'qwen-image', apiKey: 'test-key' },
      { prompt: 'classroom illustration' },
    )).rejects.toMatchObject({ statusCode: 429, retryAfterMs: 30_000 });
  });
});
