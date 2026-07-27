import { describe, expect, it } from 'vitest'
import { getRoleScarfShade } from './action-textures'

describe('getRoleScarfShade', () => {
  it('recognises the saturated OpenPBL blue scarf across highlights and shadows', () => {
    expect(getRoleScarfShade(62, 107, 183, 255)).not.toBeNull()
    expect(getRoleScarfShade(31, 74, 136, 255)).not.toBeNull()
  })

  it('protects the low-saturation blue-gray body from role recolouring', () => {
    expect(getRoleScarfShade(73, 88, 106, 255)).toBeNull()
    expect(getRoleScarfShade(84, 95, 110, 255)).toBeNull()
  })

  it('ignores transparent pixels and keeps legacy red scarf support', () => {
    expect(getRoleScarfShade(62, 107, 183, 10)).toBeNull()
    expect(getRoleScarfShade(229, 73, 58, 255)).not.toBeNull()
  })
})
