import { describe, expect, it, vi } from 'vitest';
import { LlmEmptyResponseError, LlmTimeoutError } from '@/lib/llm/errors';
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

  it('retries a course-generation LLM timeout without treating it as cancellation', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const operation = vi.fn()
      .mockRejectedValueOnce(new LlmTimeoutError(600_000))
      .mockResolvedValueOnce('complete outline');

    await expect(withGenerationRetry(operation, {
      label: 'course outline',
      maxRetries: 1,
      sleep,
      random: () => 0,
    })).resolves.toBe('complete outline');

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('retries an empty successful upstream response once', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new LlmEmptyResponseError())
      .mockResolvedValueOnce('valid JSON');

    await expect(withGenerationRetry(operation, {
      label: 'course design JSON',
      maxRetries: 1,
      sleep: vi.fn().mockResolvedValue(undefined),
      random: () => 0,
    })).resolves.toBe('valid JSON');
  });
});
