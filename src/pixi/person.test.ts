import { describe, expect, it } from 'vitest'
import {
  getActionAuthoredFacing,
  getActionFrameBodyOffset,
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
  it('pins the lower body during board and archive reaching frames', () => {
    expect(getActionFrameBodyOffset('planning_board', 1)).toEqual({ x: -19, y: 0 })
    expect(getActionFrameBodyOffset('planning_board', 2)).toEqual({ x: -19, y: 0 })
    expect(getActionFrameBodyOffset('organizing_files', 0)).toEqual({ x: -21, y: 0 })
    expect(getActionFrameBodyOffset('organizing_files', 3)).toEqual({ x: -2, y: 0 })
  })

  it('uses the matching authored offset when a strip is reversed', () => {
    expect(getActionFrameBodyOffset('planning_board', 3, true)).toEqual({ x: -19, y: 0 })
    expect(getActionFrameBodyOffset('standby', 0)).toEqual({ x: 0, y: 0 })
  })
})
