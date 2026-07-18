import { describe, expect, it } from 'vitest'
import { getStatePresentation } from './status-presentation'

describe('classroom workstation state presentation', () => {
  it('keeps an idle companion seated at the computer', () => {
    expect(getStatePresentation('zhizhi', 'idle').body).toBe('working')
  })

  it('uses a speaking pose while TTS is active', () => {
    expect(getStatePresentation('zhizhi', 'speaking').body).toBe('talking_on_seat')
  })

  it('keeps a companion seated while waiting for student review', () => {
    expect(getStatePresentation('cece', 'waiting_user').body).toBe('working')
  })
})
