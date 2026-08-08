import { describe, expect, it } from 'vitest'
import {
  agentActionDefinitions,
  type AgentActionDefinition,
} from './index'

type MotionActionDefinition = AgentActionDefinition & {
  authoredFacing?: 'left' | 'right'
  authoredFps?: number
  frameCount?: number
  pixelsPerCycle?: number
  registrationAnchor?: 'bottomCenter' | 'bodyCore'
  transitionMs?: number
}

const motionActionIds = [
  'fc_walking_h',
  'fc_walking_up',
  'fc_walking_down',
  'turn_arrive',
  'computer_typing_left',
  'computer_browsing_left',
  'computer_thinking_left',
  'screen_pointing',
  'raising_hand',
  'board_listening',
  'comparing_materials',
  'looking_around',
  'slacking',
  'stretching',
  'napping',
  'waking_up',
] as const

describe('C plan motion catalog', () => {
  const definitions = agentActionDefinitions as Record<string, MotionActionDefinition>

  it('registers every approved classroom motion', () => {
    expect(motionActionIds.every((id) => definitions[id])).toBe(true)
  })

  it('gives every new body motion an explicit cadence and stable registration rule', () => {
    for (const id of motionActionIds) {
      const definition = definitions[id]
      expect(definition.layer, id).toBe('body')
      expect(definition.authoredFps, id).toBeGreaterThanOrEqual(4)
      expect(definition.authoredFps, id).toBeLessThanOrEqual(12)
      expect(definition.frameCount, id).toBeGreaterThanOrEqual(3)
      expect(definition.frameCount, id).toBeLessThanOrEqual(8)
      expect(definition.registrationAnchor, id).toMatch(/^(bottomCenter|bodyCore)$/)
      expect(definition.transitionMs, id).toBeGreaterThanOrEqual(120)
      expect(definition.transitionMs, id).toBeLessThanOrEqual(180)
    }
  })

  it('calibrates locomotion from authored cadence instead of a global speed', () => {
    for (const id of ['fc_walking_h', 'fc_walking_up', 'fc_walking_down'] as const) {
      const definition = definitions[id]
      expect(definition.pixelsPerCycle, id).toBeGreaterThan(0)
      expect(definition.frameCount, id).toBe(8)
      expect(definition.authoredFps, id).toBeGreaterThanOrEqual(9)
    }
  })

  it('uses eight distinct gait phases at the same cadence and world speed as vertical walking', () => {
    const horizontal = definitions.fc_walking_h
    const vertical = definitions.fc_walking_down
    const horizontalSpeed =
      (horizontal.pixelsPerCycle! * horizontal.authoredFps!) / horizontal.frameCount!
    const verticalSpeed =
      (vertical.pixelsPerCycle! * vertical.authoredFps!) / vertical.frameCount!

    expect(horizontal.authoredFps).toBe(10)
    expect(horizontal.frameCount).toBe(8)
    expect(horizontal.pixelsPerCycle).toBe(68)
    expect(horizontalSpeed).toBeCloseTo(verticalSpeed, 1)
  })

  it('locks every computer interaction toward the character own left side', () => {
    for (const id of [
      'computer_typing_left',
      'computer_browsing_left',
      'computer_thinking_left',
      'screen_pointing',
    ] as const) {
      expect(definitions[id].authoredFacing, id).toBe('left')
    }
  })
})
