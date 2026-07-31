import { afterEach, describe, expect, it, vi } from 'vitest'
import { getActionResourceUrls } from './resources'

describe('OpenPBL companion action resources', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('maps existing body action names to the new user-approved character atlas', () => {
    expect(getActionResourceUrls('standby')).toEqual({
      imageUrl: '/assets/openpbl-agent/standby.webp',
      sheetUrl: '/assets/openpbl-agent/standby.webp.json',
    })
    expect(getActionResourceUrls('fc_walking_h').imageUrl).toBe(
      '/assets/openpbl-agent/walking_horizontal.webp',
    )
    expect(getActionResourceUrls('talking_on_stand-0').imageUrl).toBe(
      '/assets/openpbl-agent/talking_on_stand_a.webp',
    )
    expect(getActionResourceUrls('planning_board').imageUrl).toBe(
      '/assets/openpbl-agent/planning_board.webp',
    )
    expect(getActionResourceUrls('brainstorming').imageUrl).toBe(
      '/assets/openpbl-agent/brainstorming.webp',
    )
    expect(getActionResourceUrls('waiting_user').imageUrl).toBe(
      '/assets/openpbl-agent/waiting_user.webp',
    )
    expect(getActionResourceUrls('reviewing_work').imageUrl).toBe(
      '/assets/openpbl-agent/reviewing_work.webp',
    )
    expect(getActionResourceUrls('fc_walking_down').imageUrl).toBe(
      '/assets/openpbl-agent/walking_down.webp',
    )
    expect(getActionResourceUrls('computer_typing_left').imageUrl).toBe(
      '/assets/openpbl-agent/computer_typing_left.webp',
    )
    expect(getActionResourceUrls('napping').imageUrl).toBe(
      '/assets/openpbl-agent/napping.webp',
    )
  })

  it('keeps non-body workstation layers on their existing assets', () => {
    expect(getActionResourceUrls('fc_screen_working_main').imageUrl).toBe(
      '/assets/agent/fc_screen_working_main.webp',
    )
  })

  it('supports the explicit legacy rollback switch', () => {
    vi.stubEnv('NEXT_PUBLIC_AGENT_ART', 'legacy')
    expect(getActionResourceUrls('standby').imageUrl).toBe('/assets/agent/standby.webp')
    expect(getActionResourceUrls('planning_board').imageUrl).toBe(
      '/assets/agent/talking_on_stand-0.webp',
    )
    expect(getActionResourceUrls('fc_walking_down').imageUrl).toBe(
      '/assets/agent/fc_walking_h.webp',
    )
    expect(getActionResourceUrls('computer_typing_left').imageUrl).toBe(
      '/assets/agent/working.webp',
    )
    expect(getActionResourceUrls('napping').imageUrl).toBe(
      '/assets/agent/sleeping.webp',
    )
  })
})
