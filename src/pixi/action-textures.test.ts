import { describe, expect, it } from 'vitest'
import {
  buildRoleScarfMask,
  getRoleScarfShade,
} from './action-textures'

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

  it('keeps a touching blue-gray body outside the connected scarf mask', () => {
    const width = 6
    const height = 3
    const pixels = new Uint8ClampedArray(width * height * 4)
    const put = (x: number, y: number, rgba: readonly number[]) => {
      const index = (y * width + x) * 4
      pixels.set(rgba, index)
    }

    // Two scarf pixels, including a darker material shade.
    put(1, 1, [46, 107, 203, 255])
    put(2, 1, [31, 74, 136, 255])
    // A blue-gray body region physically touches the scarf but must not be
    // recolored merely because its hue is nearby.
    put(3, 1, [70, 90, 145, 255])
    put(4, 1, [73, 88, 132, 255])

    const mask = buildRoleScarfMask(
      pixels,
      width,
      height,
      [{ x: 0, y: 0, w: width, h: height }],
    )

    expect(mask[1 * width + 1]).toBe(2)
    expect(mask[1 * width + 2]).toBe(2)
    expect(mask[1 * width + 3]).toBe(0)
    expect(mask[1 * width + 4]).toBe(0)
  })

  it('includes softened scarf edge pixels without leaking into the touching body', () => {
    const width = 9
    const height = 5
    const pixels = new Uint8ClampedArray(width * height * 4)
    const put = (x: number, y: number, rgba: readonly number[]) => {
      const index = (y * width + x) * 4
      pixels.set(rgba, index)
    }

    put(1, 2, [46, 107, 203, 255])
    // First compressed edge layer is diagonal and much darker than the scarf
    // core, while the second layer is only partially opaque.
    put(2, 1, [35, 50, 81, 255])
    put(3, 1, [16, 33, 47, 12])
    // Adjacent blue-gray body must remain protected.
    put(4, 1, [70, 90, 145, 255])
    // Similar edge color elsewhere in the frame is not connected to scarf.
    put(7, 3, [35, 50, 81, 255])

    const mask = buildRoleScarfMask(
      pixels,
      width,
      height,
      [{ x: 0, y: 0, w: width, h: height }],
    )

    expect(mask[2 * width + 1]).toBe(2)
    expect(mask[1 * width + 2]).toBe(2)
    expect(mask[1 * width + 3]).toBe(2)
    expect(mask[1 * width + 4]).toBe(0)
    expect(mask[3 * width + 7]).toBe(0)
  })
})
