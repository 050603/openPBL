import { describe, expect, it } from 'vitest'
import { agentActionDefinitions } from '@/assets/agent'
import {
  getActionAuthoredFacing,
  getActionFrameBodyOffset,
  getActionFrameOrder,
  getFacingScaleSign,
} from './person'

describe('getFacingScaleSign', () => {
  it('keeps the new right-authored walking art pointed toward travel', () => {
    expect(getFacingScaleSign('right', 'right')).toBe(1)
    expect(getFacingScaleSign('left', 'right')).toBe(-1)
  })

  it('preserves the legacy left-authored rollback convention', () => {
    expect(getFacingScaleSign('right', 'left')).toBe(-1)
    expect(getFacingScaleSign('left', 'left')).toBe(1)
  })

  it('uses action-specific authored directions for the new character', () => {
    expect(getActionAuthoredFacing('fc_walking_h', false)).toBe('right')
    expect(getActionAuthoredFacing('reading_book', false)).toBe('left')
    expect(getActionAuthoredFacing('organizing_files', false)).toBe('left')
    expect(getActionAuthoredFacing('fc_walking_h', true)).toBe('left')
  })
})

describe('getActionFrameBodyOffset', () => {
  it('pins corrections to the body core instead of hand or prop bounds', () => {
    expect(getActionFrameBodyOffset('planning_board', 1)).toEqual({ x: -19, y: 0 })
    expect(getActionFrameBodyOffset('planning_board', 2)).toEqual({ x: -19, y: 0 })
    expect(getActionFrameBodyOffset('organizing_files', 0)).toEqual({ x: 0, y: 0 })
    expect(getActionFrameBodyOffset('organizing_files', 1)).toEqual({ x: -1, y: 1 })
    expect(getActionFrameBodyOffset('organizing_files', 2)).toEqual({ x: 0, y: 0 })
  })

  it('uses the matching authored offset when a strip is reversed', () => {
    expect(getActionFrameBodyOffset('planning_board', 3, true)).toEqual({ x: -19, y: 0 })
    expect(getActionFrameBodyOffset('standby', 0)).toEqual({ x: 0, y: 0 })
  })
})

describe('getActionFrameOrder', () => {
  it('omits archive frames whose shoulder and hand detach from the body', () => {
    expect(getActionFrameOrder('organizing_files', 5)).toEqual([1, 2, 4, 2])
  })

  it('keeps the authored order for ordinary actions', () => {
    expect(getActionFrameOrder('standby', 4)).toEqual([0, 1, 2, 3])
  })
})

describe('character playback cadence', () => {
  it('keeps every explicitly tuned body action in the moderate classroom range', () => {
    const bodySpeeds = Object.values(agentActionDefinitions)
      .filter((definition) => definition.layer === 'body')
      .map((definition) => definition.playback?.animationSpeed)
      .filter((speed): speed is number => speed !== undefined)

    expect(bodySpeeds.length).toBeGreaterThan(0)
    expect(Math.min(...bodySpeeds)).toBeGreaterThanOrEqual(0.08)
    expect(Math.max(...bodySpeeds)).toBeLessThanOrEqual(0.13)
  })
})
