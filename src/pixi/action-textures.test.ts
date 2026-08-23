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

  it('recovers lightened scarf highlights without walking into the blue-gray body', () => {
    const width = 6
    const height = 3
    const pixels = new Uint8ClampedArray(width * height * 4)
    const put = (x: number, y: number, rgba: readonly number[]) => {
      const index = (y * width + x) * 4
      pixels.set(rgba, index)
    }

    put(1, 1, [46, 107, 203, 255])
    // Real atlas highlight sampled from the outer edge of the scarf tail. It
    // is too pale for the strict core ratio but keeps the master scarf hue.
    put(2, 1, [95, 136, 201, 255])
    put(3, 1, [70, 90, 145, 255])

    const mask = buildRoleScarfMask(
      pixels,
      width,
      height,
      [{ x: 0, y: 0, w: width, h: height }],
    )

    expect(mask[1 * width + 1]).toBe(2)
    expect(mask[1 * width + 2]).toBe(2)
    expect(mask[1 * width + 3]).toBe(0)
  })

  it('recovers a nearby bright highlight separated from the scarf core by an outline', () => {
    const width = 12
    const height = 3
    const pixels = new Uint8ClampedArray(width * height * 4)
    const put = (x: number, y: number, rgba: readonly number[]) => {
      const index = (y * width + x) * 4
      pixels.set(rgba, index)
    }

    put(1, 1, [46, 107, 203, 255])
    put(2, 1, [42, 48, 57, 255])
    put(3, 1, [102, 143, 208, 255])
    put(4, 1, [99, 137, 196, 255])
    // The same highlight color far from a confirmed scarf region is protected.
    put(10, 1, [102, 143, 208, 255])

    const mask = buildRoleScarfMask(
      pixels,
      width,
      height,
      [{ x: 0, y: 0, w: width, h: height }],
    )

    expect(mask[1 * width + 1]).toBe(2)
    expect(mask[1 * width + 2]).toBe(0)
    expect(mask[1 * width + 3]).toBe(2)
    expect(mask[1 * width + 4]).toBe(2)
    expect(mask[1 * width + 10]).toBe(0)
  })

  it('fills a compressed blue pinhole only when scarf pixels surround it', () => {
    const width = 7
    const height = 5
    const pixels = new Uint8ClampedArray(width * height * 4)
    const put = (x: number, y: number, rgba: readonly number[]) => {
      const index = (y * width + x) * 4
      pixels.set(rgba, index)
    }
    const scarf = [46, 107, 203, 255] as const

    put(1, 1, scarf)
    put(2, 1, scarf)
    put(3, 1, scarf)
    put(1, 2, scarf)
    put(3, 2, scarf)
    put(2, 2, [58, 75, 121, 255])
    // The same residual color touches the component from only one side.
    put(4, 2, [58, 75, 121, 255])

    const mask = buildRoleScarfMask(
      pixels,
      width,
      height,
      [{ x: 0, y: 0, w: width, h: height }],
    )

    expect(mask[2 * width + 2]).toBe(2)
    expect(mask[2 * width + 4]).toBe(0)
  })

  it('covers multi-pixel semi-transparent WebP fringe without crossing into opaque art', () => {
    const width = 8
    const height = 3
    const pixels = new Uint8ClampedArray(width * height * 4)
    const put = (x: number, y: number, rgba: readonly number[]) => {
      const index = (y * width + x) * 4
      pixels.set(rgba, index)
    }

    put(1, 1, [46, 107, 203, 255])
    // Chroma subsampling can make the outer fringe blue, magenta, or nearly
    // neutral even though every pixel belongs to the same scarf silhouette.
    put(2, 1, [75, 102, 168, 96])
    put(3, 1, [112, 71, 104, 42])
    put(4, 1, [31, 38, 29, 6])
    put(5, 1, [70, 90, 145, 255])
    put(7, 1, [112, 71, 104, 42])

    const mask = buildRoleScarfMask(
      pixels,
      width,
      height,
      [{ x: 0, y: 0, w: width, h: height }],
    )

    expect(mask[1 * width + 1]).toBe(2)
    expect(mask[1 * width + 2]).toBe(2)
    expect(mask[1 * width + 3]).toBe(2)
    expect(mask[1 * width + 4]).toBe(2)
    expect(mask[1 * width + 5]).toBe(0)
    expect(mask[1 * width + 7]).toBe(0)
  })

  it('recolors an opaque purple-blue compression speck on the scarf silhouette', () => {
    const width = 6
    const height = 3
    const pixels = new Uint8ClampedArray(width * height * 4)
    const put = (x: number, y: number, rgba: readonly number[]) => {
      const index = (y * width + x) * 4
      pixels.set(rgba, index)
    }

    put(1, 1, [46, 107, 203, 255])
    put(2, 1, [91, 83, 164, 255])
    put(3, 1, [70, 90, 145, 255])

    const mask = buildRoleScarfMask(
      pixels,
      width,
      height,
      [{ x: 0, y: 0, w: width, h: height }],
    )

    expect(mask[1 * width + 2]).toBe(2)
    expect(mask[1 * width + 3]).toBe(0)
  })
})
