import { describe, expect, it } from 'vitest'
import { getSceneCameraLayout } from './scene'

describe('getSceneCameraLayout', () => {
  it('keeps the complete classroom visible on desktop', () => {
    expect(getSceneCameraLayout(1440, 1000)).toEqual({
      pivotX: 600,
      pivotY: 450,
      scale: (1000 / 900) * 0.98,
    })
  })

  it('zooms portrait screens into the six-person collaboration area', () => {
    const layout = getSceneCameraLayout(390, 844)
    expect(layout.pivotX).toBe(700)
    expect(layout.pivotY).toBe(450)
    expect(layout.scale).toBeCloseTo((390 / 560) * 0.98)
    expect(layout.scale).toBeGreaterThan(0.65)
  })
})
