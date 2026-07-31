import { describe, expect, it } from 'vitest'
import {
  deskAmbientBehaviors,
  eligibleDeskAmbientBehaviors,
  pickWeightedDeskAmbientBehavior,
} from './ambient-behavior'

describe('desk ambient behavior policy', () => {
  it('makes subtle motion visible early while keeping noticeable breaks gated', () => {
    expect(eligibleDeskAmbientBehaviors({
      idleMs: 9_999,
      noticeableRestActive: false,
      previousAction: null,
    })).toEqual([])

    expect(eligibleDeskAmbientBehaviors({
      idleMs: 12_000,
      noticeableRestActive: false,
      previousAction: null,
    }).map((behavior) => behavior.action)).toEqual(['looking_around'])
  })

  it('requires a long uninterrupted idle before napping', () => {
    const beforeNap = eligibleDeskAmbientBehaviors({
      idleMs: 59_999,
      noticeableRestActive: false,
      previousAction: null,
    })
    const afterNap = eligibleDeskAmbientBehaviors({
      idleMs: 60_000,
      noticeableRestActive: false,
      previousAction: null,
    })

    expect(beforeNap.some((behavior) => behavior.action === 'napping')).toBe(false)
    expect(afterNap.some((behavior) => behavior.action === 'napping')).toBe(true)
  })

  it('allows only subtle looking around while another agent takes a noticeable break', () => {
    expect(eligibleDeskAmbientBehaviors({
      idleMs: 120_000,
      noticeableRestActive: true,
      previousAction: null,
    }).map((behavior) => behavior.action)).toEqual(['looking_around'])
  })

  it('avoids immediately repeating the previous desk action when alternatives exist', () => {
    const eligible = eligibleDeskAmbientBehaviors({
      idleMs: 120_000,
      noticeableRestActive: false,
      previousAction: 'slacking',
    })

    expect(eligible.some((behavior) => behavior.action === 'slacking')).toBe(false)
    expect(eligible.length).toBe(deskAmbientBehaviors.length - 1)
  })

  it('uses deterministic weighted selection boundaries', () => {
    const eligible = deskAmbientBehaviors
    expect(pickWeightedDeskAmbientBehavior(0, eligible)?.action).toBe('looking_around')
    expect(pickWeightedDeskAmbientBehavior(0.999_999, eligible)?.action).toBe('napping')
  })
})
