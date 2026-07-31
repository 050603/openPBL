import { describe, expect, it } from 'vitest'
import { agentActionDefinitions } from '@/assets/agent'
import {
  getActionAuthoredFacing,
  getActionAnimationSpeed,
  getActionRegistrationAnchor,
  getActionTransitionMs,
  getActionFrameBodyOffset,
  getActionFrameOrder,
  getActionSwitchAlignment,
  getActionVisualScale,
  getActionVisualWidthScale,
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
    expect(getActionAuthoredFacing('computer_typing_left', false)).toBe('left')
    expect(getActionAuthoredFacing('fc_walking_h', true)).toBe('left')
  })
})

describe('action playback metadata', () => {
  it('converts authored frames per second to the Pixi 60 Hz ticker scale', () => {
    expect(getActionAnimationSpeed('fc_walking_h')).toBeCloseTo(10 / 60)
    expect(getActionAnimationSpeed('napping')).toBeCloseTo(4.5 / 60)
  })

  it('keeps tuned legacy actions and the moderate fallback cadence', () => {
    expect(getActionAnimationSpeed('working')).toBe(0.11)
    expect(getActionAnimationSpeed('salute')).toBe(0.12)
  })

  it('selects the authored registration point and bounded transition time', () => {
    expect(getActionRegistrationAnchor('fc_walking_down')).toBe('bottomCenter')
    expect(getActionRegistrationAnchor('computer_typing_left')).toBe('bodyCore')
    expect(getActionTransitionMs('computer_typing_left')).toBe(160)
    expect(getActionTransitionMs('salute')).toBe(140)
  })

  it('normalizes undersized source actions to the canonical character height', () => {
    expect(getActionVisualScale('standby')).toBe(1)
    expect(getActionVisualScale('planning_board')).toBeCloseTo(192 / 175)
    expect(getActionVisualScale('organizing_files')).toBeCloseTo(192 / 178)
    expect(getActionVisualScale('screen_pointing')).toBeCloseTo(192 / 183)
  })

  it('widens only the undersized rear walking silhouette', () => {
    expect(getActionVisualWidthScale('fc_walking_up')).toBeCloseTo(10 / 9)
    expect(getActionVisualWidthScale('fc_walking_down')).toBe(1)
    expect(getActionVisualWidthScale('standby')).toBe(1)
  })
})

describe('action switch alignment', () => {
  it('keeps the retiring sprite fixed while the container aligns the next action', () => {
    expect(
      getActionSwitchAlignment(
        { x: 96, y: 192 },
        { x: 83, y: 180 },
      ),
    ).toEqual({
      container: { x: 13, y: 12 },
      retiringSprite: { x: -13, y: -12 },
    })
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
