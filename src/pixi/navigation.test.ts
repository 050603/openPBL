import { describe, expect, it } from 'vitest'
import { classroomAisleRoute, compactNavigationRoute, walkingDuration } from './navigation'

describe('compactNavigationRoute', () => {
  it('keeps a direct partner route pointed at the destination', () => {
    expect(compactNavigationRoute({ x: 560, y: 200 }, [{ x: 780, y: 204 }]))
      .toEqual([{ x: 780, y: 204 }])
  })

  it('drops duplicate arrival points and merges same-direction segments', () => {
    expect(compactNavigationRoute(
      { x: 100, y: 100 },
      [{ x: 103, y: 102 }, { x: 200, y: 100 }, { x: 300, y: 100 }],
    )).toEqual([{ x: 300, y: 100 }])
  })
})

describe('classroomAisleRoute', () => {
  it('keeps same-row movement on the marked horizontal aisle', () => {
    expect(classroomAisleRoute({ x: 700, y: 220 }, { x: 920, y: 226 }, 840))
      .toEqual([
        { x: 840, y: 220 },
        { x: 920, y: 226 },
      ])
  })

  it('routes cross-row movement through the clear central aisle', () => {
    expect(classroomAisleRoute({ x: 700, y: 220 }, { x: 920, y: 720 }, 840))
      .toEqual([
        { x: 840, y: 220 },
        { x: 840, y: 720 },
        { x: 920, y: 720 },
      ])
  })
})

describe('walkingDuration', () => {
  it('uses one steady world speed with a short-segment floor', () => {
    expect(walkingDuration({ x: 0, y: 0 }, { x: 140, y: 0 })).toBe(1000)
    expect(walkingDuration({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(180)
  })
})
