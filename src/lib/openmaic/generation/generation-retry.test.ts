import { describe, expect, it, vi } from 'vitest';
import { withGenerationRetry } from './generation-retry';

describe('withGenerationRetry', () => {
  it('honors an upstream retryAfterMs hint for throttled requests', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const throttled = Object.assign(new Error('rate limit exceeded'), {
      statusCode: 429,
      retryAfterMs: 45_000,
    });
    const operation = vi.fn()
      .mockRejectedValueOnce(throttled)
      .mockResolvedValueOnce('ok');

    await expect(withGenerationRetry(operation, {
      label: 'qwen image',
      maxRetries: 1,
      baseDelayMs: 1_000,
      maxDelayMs: 60_000,
      sleep,
      random: () => 0,
    })).resolves.toBe('ok');

    expect(sleep).toHaveBeenCalledWith(45_000, undefined);
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
