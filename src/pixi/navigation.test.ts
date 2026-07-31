import { describe, expect, it } from 'vitest'
import {
  classroomAisleRoute,
  compactNavigationRoute,
  createNavigationTrafficController,
  deskDepartureWaypoint,
  walkingActionForVector,
  walkingDuration,
  walkingDurationForAction,
  walkingSpeedForAction,
} from './navigation'

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
  it('uses one direct segment when a same-row trip crosses the clear aisle', () => {
    expect(classroomAisleRoute({ x: 700, y: 220 }, { x: 920, y: 226 }, 840))
      .toEqual([{ x: 920, y: 226 }])
  })

  it('does not detour to the aisle and double back on a clear same-side row', () => {
    expect(classroomAisleRoute({ x: 700, y: 220 }, { x: 620, y: 226 }, 840))
      .toEqual([{ x: 620, y: 226 }])
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

describe('deskDepartureWaypoint', () => {
  const seatExit = { x: 653, y: 158 }
  const forwardClearance = { x: 653, y: 234 }

  it('does not walk down before a same-row or upward trip', () => {
    expect(deskDepartureWaypoint(
      seatExit,
      forwardClearance,
      { x: 728, y: 172 },
    )).toBeNull()
    expect(deskDepartureWaypoint(
      seatExit,
      forwardClearance,
      { x: 420, y: 80 },
    )).toBeNull()
  })

  it('uses the forward clearance point when the destination is below the desk', () => {
    expect(deskDepartureWaypoint(
      seatExit,
      forwardClearance,
      { x: 444, y: 510 },
    )).toEqual(forwardClearance)
  })
})

describe('navigation traffic controller', () => {
  it('grants the shared aisle in FIFO order and skips cancelled waiters', async () => {
    const traffic = createNavigationTrafficController()
    const first = await traffic.acquire()
    expect(first).not.toBeNull()

    let secondActive = true
    const secondTurn = traffic.acquire(() => secondActive)
    const thirdTurn = traffic.acquire()
    secondActive = false
    first?.release()

    await expect(secondTurn).resolves.toBeNull()
    const third = await thirdTurn
    expect(third).not.toBeNull()
    third?.release()
  })

  it('allows an idempotent release without advancing the queue twice', async () => {
    const traffic = createNavigationTrafficController()
    const first = await traffic.acquire()
    const secondTurn = traffic.acquire()

    first?.release()
    first?.release()
    const second = await secondTurn
    expect(second).not.toBeNull()
    second?.release()
  })
})

describe('walkingDuration', () => {
  it('uses one steady world speed with a short-segment floor', () => {
    expect(walkingDuration({ x: 0, y: 0 }, { x: 140, y: 0 })).toBe(1000)
    expect(walkingDuration({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(180)
  })
})

describe('directional walking cadence', () => {
  it('selects horizontal, upward, and downward strips from the travel vector', () => {
    expect(walkingActionForVector(120, 24)).toBe('fc_walking_h')
    expect(walkingActionForVector(20, -120)).toBe('fc_walking_up')
    expect(walkingActionForVector(-20, 120)).toBe('fc_walking_down')
  })

  it('derives world speed from stride, authored fps, and frame count', () => {
    expect(walkingSpeedForAction('fc_walking_h')).toBe(90)
    expect(walkingSpeedForAction('fc_walking_up')).toBe(85)
    expect(walkingSpeedForAction('fc_walking_down')).toBe(85)
  })

  it('uses the matching directional cadence without losing the short-route floor', () => {
    expect(walkingDurationForAction(
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      'fc_walking_h',
    )).toBe(1000)
    expect(walkingDurationForAction(
      { x: 0, y: 0 },
      { x: 0, y: 85 },
      'fc_walking_down',
    )).toBe(1000)
    expect(walkingDurationForAction(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      'fc_walking_h',
    )).toBe(180)
  })
})
