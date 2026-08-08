import type { LoadOptions } from 'pixi.js'

export const pixiAssetLoadOptions = {
  strategy: 'retry',
  retryCount: 3,
  retryDelay: 250,
} satisfies LoadOptions

export async function retryAssetLoad<T>(
  load: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 4)
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250)
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await load()
    } catch (error) {
      lastError = error
      if (attempt === attempts - 1) break
      const delayMs = baseDelayMs * 2 ** attempt
      if (delayMs > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs))
      }
    }
  }

  throw lastError
}
