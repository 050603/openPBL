import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateWithQwenImage, testQwenImageConnectivity } from './qwen-image-adapter';

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

describe('Qwen image connectivity security', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not automatically follow redirects during the credential probe', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));
    vi.stubGlobal('fetch', fetchMock);

    await testQwenImageConnectivity({ providerId: 'qwen-image', apiKey: 'test-key' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'manual' }),
    );
  });
});
