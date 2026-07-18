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
  })
})
