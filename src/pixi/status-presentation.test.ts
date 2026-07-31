import { describe, expect, it } from 'vitest'
import {
  getComputerFacingForAgent,
  getStatePresentation,
  isOwnComputerFacingAction,
} from './status-presentation'

describe('classroom workstation state presentation', () => {
  it('keeps an idle companion seated at the computer', () => {
    expect(getStatePresentation('zhizhi', 'idle').body).toBe('working')
  })

  it('uses a speaking pose while TTS is active', () => {
    expect(getStatePresentation('zhizhi', 'speaking').body).toBe('talking_on_seat')
  })

  it('keeps a companion seated while waiting for student review', () => {
    expect(getStatePresentation('cece', 'waiting_user').body).toBe('waiting_user')
  })

  it('gives each role a recognisable work sequence', () => {
    const zhizhiSequence = getStatePresentation('zhizhi', 'working').bodySequence
    expect(zhizhiSequence).toContain('computer_typing_left')
    expect(zhizhiSequence).toContain('computer_browsing_left')
    expect(zhizhiSequence).toContain('computer_thinking_left')
    expect(zhizhiSequence).toContain('searching_info')
    expect(getStatePresentation('lingling', 'working').bodySequence).toContain('brainstorming')
    expect(getStatePresentation('cece', 'working').bodySequence).toContain('screen_pointing')
    expect(getStatePresentation('pingping', 'working').bodySequence).toContain('reviewing_work')
    expect(getStatePresentation('jiji', 'working').bodySequence).toContain('comparing_materials')
    expect(getStatePresentation('cece', 'waiting_user').bodySequence).toContain('raising_hand')
  })

  it('identifies only actions authored toward the character own left-side computer', () => {
    expect(isOwnComputerFacingAction('computer_typing_left')).toBe(true)
    expect(isOwnComputerFacingAction('computer_browsing_left')).toBe(true)
    expect(isOwnComputerFacingAction('computer_thinking_left')).toBe(true)
    expect(isOwnComputerFacingAction('screen_pointing')).toBe(true)
    expect(isOwnComputerFacingAction('comparing_materials')).toBe(true)
    expect(isOwnComputerFacingAction('working')).toBe(false)
  })

  it('faces every computer action right toward the task screen', () => {
    expect(getComputerFacingForAgent('zhizhi')).toBe('right')
    expect(getComputerFacingForAgent('lingling')).toBe('right')
    expect(getComputerFacingForAgent('pingping')).toBe('right')
    expect(getComputerFacingForAgent('wenwen')).toBe('right')
    expect(getComputerFacingForAgent('cece')).toBe('right')
    expect(getComputerFacingForAgent('jiji')).toBe('right')
  })
})
