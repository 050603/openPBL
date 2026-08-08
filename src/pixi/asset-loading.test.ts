import { describe, expect, it, vi } from 'vitest'
import { retryAssetLoad } from './asset-loading'

describe('retryAssetLoad', () => {
  it('recovers from transient failures', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue('loaded')

    await expect(retryAssetLoad(load, { attempts: 3, baseDelayMs: 0 }))
      .resolves.toBe('loaded')
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('returns the final error after exhausting retries', async () => {
    const finalError = new Error('still unavailable')
    const load = vi.fn().mockRejectedValue(finalError)

    await expect(retryAssetLoad(load, { attempts: 3, baseDelayMs: 0 }))
      .rejects.toBe(finalError)
    expect(load).toHaveBeenCalledTimes(3)
  })
})
