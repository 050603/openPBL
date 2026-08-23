import { Assets, Spritesheet, Texture } from 'pixi.js'
import type { SpritesheetData } from 'pixi.js'
import type { AgentActionName } from '@/assets/agent'
import { getActionResourceUrls } from './resources'
import { pixiAssetLoadOptions, retryAssetLoad } from './asset-loading'

export type LoadActionTextureOptions = {
  replaceDefaultRedWith?: string
}

export type ActionTextureLoader = {
  loadActionTextures: (
    actionName: AgentActionName,
    options?: LoadActionTextureOptions,
  ) => Promise<Texture[]>
  releaseActionTextures: (
    actionName: AgentActionName,
    options?: LoadActionTextureOptions,
  ) => void
  clearCache: () => void
}

export function createActionTextureLoader(): ActionTextureLoader {
  type LoadedSheet = { textures: Texture[]; spritesheet: Spritesheet; ownsBaseTexture: boolean }
  type CacheEntry = { promise: Promise<LoadedSheet>; references: number }
  const actionTextures = new Map<string, CacheEntry>()

  function cacheKey(actionName: AgentActionName, options: LoadActionTextureOptions): string {
    return `${actionName}:${options.replaceDefaultRedWith ?? 'default'}`
  }

  function loadActionTextures(
    actionName: AgentActionName,
    options: LoadActionTextureOptions = {},
  ): Promise<Texture[]> {
    const key = cacheKey(actionName, options)
    const cachedTextures = actionTextures.get(key)

    if (cachedTextures) {
      cachedTextures.references += 1
      return cachedTextures.promise.then(({ textures }) => textures)
    }

    const loadPromise = loadTextures(actionName, options).catch((error: unknown) => {
      if (actionTextures.get(key)?.promise === loadPromise) {
        actionTextures.delete(key)
      }
      throw error
    })
    actionTextures.set(key, { promise: loadPromise, references: 1 })
    return loadPromise.then(({ textures }) => textures)
  }

  function releaseActionTextures(
    actionName: AgentActionName,
    options: LoadActionTextureOptions = {},
  ): void {
    const key = cacheKey(actionName, options)
    const entry = actionTextures.get(key)
    if (!entry) {
      return
    }

    entry.references = Math.max(0, entry.references - 1)
    if (entry.references > 0) {
      return
    }

    actionTextures.delete(key)
    void entry.promise
      .then(({ spritesheet, ownsBaseTexture }) => {
        spritesheet.destroy(ownsBaseTexture)
      })
      .catch(() => undefined)
  }

  return {
    loadActionTextures,
    releaseActionTextures,
    clearCache: () => {
      const entries = Array.from(actionTextures.values())
      actionTextures.clear()
      entries.forEach((entry) => {
        void entry.promise
          .then(({ spritesheet, ownsBaseTexture }) => {
            spritesheet.destroy(ownsBaseTexture)
          })
          .catch(() => undefined)
      })
    },
  }
}

async function loadTextures(
  actionName: AgentActionName,
  options: LoadActionTextureOptions,
): Promise<{ textures: Texture[]; spritesheet: Spritesheet; ownsBaseTexture: boolean }> {
  const { imageUrl, sheetUrl } = getActionResourceUrls(actionName)
  const sheetResponse = await retryAssetLoad(async () => {
    const response = await fetch(sheetUrl, { cache: 'force-cache' })
    if (!response.ok) {
      throw new Error(`Unable to load action sheet: ${actionName}`)
    }
    return response
  })

  const sheetData = (await sheetResponse.json()) as SpritesheetData
  const baseTexture = options.replaceDefaultRedWith
    ? await createRoleScarfTexture(imageUrl, options.replaceDefaultRedWith, sheetData)
    : await Assets.load<Texture>(imageUrl, pixiAssetLoadOptions)
  const spritesheet = new Spritesheet(baseTexture, sheetData)

  await spritesheet.parse()

  const textures = Object.entries(spritesheet.textures)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, texture]) => texture)

  return { textures, spritesheet, ownsBaseTexture: Boolean(options.replaceDefaultRedWith) }
}

function toRgb(color: string): [number, number, number] {
  const value = Number.parseInt(color.replace('#', ''), 16)

  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

export function getRoleScarfShade(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): number | null {
  if (alpha < 24) {
    return null
  }

  const maxChannel = Math.max(red, green, blue)
  const minChannel = Math.min(red, green, blue)
  const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel
  const legacyRed = red > 90
    && red > green * 1.45
    && red > blue * 1.45
    && green < 110
    && blue < 110
    && saturation >= 0.45
  const openPblBlue = blue > 105
    && blue - red >= 52
    && blue - green >= 26
    && red < 105
    && saturation >= 0.42

  if (legacyRed) {
    return red / 229
  }
  if (openPblBlue) {
    return blue / 203
  }
  return null
}

export type AtlasFrameRect = { x: number; y: number; w: number; h: number }

function isLegacyRedScarf(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  if (alpha < 24) return false
  const maxChannel = Math.max(red, green, blue)
  const minChannel = Math.min(red, green, blue)
  const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel
  return red > 90
    && red > green * 1.45
    && red > blue * 1.45
    && green < 110
    && blue < 110
    && saturation >= 0.45
}

function isOpenPblScarfSeed(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  if (alpha < 24 || blue < 105) return false
  const saturation = blue === 0 ? 0 : (blue - Math.min(red, green)) / blue
  return blue - red >= 52
    && blue - green >= 26
    && red / blue <= 0.43
    && green / blue >= 0.32
    && green / blue <= 0.74
    && saturation >= 0.48
}

function isOpenPblScarfCandidate(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  if (alpha < 24 || blue < 58) return false
  const saturation = blue === 0 ? 0 : (blue - Math.min(red, green)) / blue
  return blue - red >= 34
    && blue - green >= 16
    && red / blue <= 0.43
    && green / blue >= 0.3
    && green / blue <= 0.76
    && saturation >= 0.46
}

function isOpenPblScarfEdgeCandidate(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  if (alpha < 8 || blue < 35) return false
  const saturation = blue === 0 ? 0 : (blue - Math.min(red, green)) / blue
  return blue - red >= 18
    && blue - green >= 7
    && green - red >= 10
    && red / blue <= 0.47
    && green / blue >= 0.26
    && green / blue <= 0.88
    && saturation >= 0.42
}

function getRgbHue(red: number, green: number, blue: number): number {
  const maxChannel = Math.max(red, green, blue)
  const minChannel = Math.min(red, green, blue)
  const channelRange = maxChannel - minChannel

  if (channelRange === 0) return 0

  let hue: number
  if (maxChannel === red) {
    hue = 60 * (((green - blue) / channelRange) % 6)
  } else if (maxChannel === green) {
    hue = 60 * ((blue - red) / channelRange + 2)
  } else {
    hue = 60 * ((red - green) / channelRange + 4)
  }

  return hue < 0 ? hue + 360 : hue
}

/**
 * WebP lightens a few scarf highlights enough that their red/blue ratio no
 * longer matches the strict connected-component candidate. Their hue remains
 * stable, though, unlike the adjacent blue-gray body. This predicate is used
 * for exactly one expansion pass so it can recover the highlight without
 * walking across a touching body region.
 */
function isOpenPblScarfHighlightCandidate(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  if (alpha === 0 || blue < 80 || blue < red || blue < green) return false

  const saturation = (blue - Math.min(red, green)) / blue
  const hue = getRgbHue(red, green, blue)
  const materialHighlight = blue >= 125 && hue >= 205 && hue <= 222
  const compressedBrightEdge = blue >= 160 && hue > 222 && hue <= 230
  return (materialHighlight || compressedBrightEdge) && saturation >= 0.2
}

function isOpenPblScarfChromaSpillCandidate(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  if (alpha === 0 || blue < 90 || blue < red || blue < green) return false

  const saturation = (blue - Math.min(red, green)) / blue
  const hue = getRgbHue(red, green, blue)
  return hue >= 230 && hue <= 285 && saturation >= 0.25
}

function isOpenPblScarfResidualCandidate(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  if (alpha === 0 || blue < 35) return false
  const saturation = (blue - Math.min(red, green)) / blue
  return blue - red >= 8
    && blue - green >= 4
    && saturation >= 0.12
}

function isOpenPblScarfBrightHighlightCandidate(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  if (alpha === 0 || blue < 125 || blue < red || blue < green) return false

  const saturation = (blue - Math.min(red, green)) / blue
  const hue = getRgbHue(red, green, blue)
  return hue >= 205
    && hue <= 222
    && saturation >= 0.2
}

function isCompressedScarfFringe(alpha: number): boolean {
  return alpha > 0 && alpha < 128
}

/**
 * Returns 0 for protected pixels, 1 for legacy-red scarf pixels, and 2 for
 * OpenPBL-blue scarf pixels. Blue pixels are accepted only when they belong to
 * a scarf-colored connected component containing a strong master-color seed.
 * A bounded highlight/fringe expansion recovers WebP-compressed edge pixels
 * without allowing the mask to spread through the touching blue-gray body.
 */
export function buildRoleScarfMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  frameRects: readonly AtlasFrameRect[],
): Uint8Array {
  const mask = new Uint8Array(width * height)
  const visited = new Uint8Array(width * height)
  const rects = frameRects.length > 0
    ? frameRects
    : [{ x: 0, y: 0, w: width, h: height }]

  const rgbaAt = (pixelIndex: number) => {
    const dataIndex = pixelIndex * 4
    return [
      data[dataIndex],
      data[dataIndex + 1],
      data[dataIndex + 2],
      data[dataIndex + 3],
    ] as const
  }

  for (const sourceRect of rects) {
    const left = Math.max(0, Math.floor(sourceRect.x))
    const top = Math.max(0, Math.floor(sourceRect.y))
    const right = Math.min(width, Math.ceil(sourceRect.x + sourceRect.w))
    const bottom = Math.min(height, Math.ceil(sourceRect.y + sourceRect.h))
    const seeds: number[] = []

    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const pixelIndex = y * width + x
        const [red, green, blue, alpha] = rgbaAt(pixelIndex)
        if (isLegacyRedScarf(red, green, blue, alpha)) {
          mask[pixelIndex] = 1
          continue
        }
        if (isOpenPblScarfSeed(red, green, blue, alpha)) {
          seeds.push(pixelIndex)
        }
      }
    }

    const queue = [...seeds]
    let cursor = 0
    while (cursor < queue.length) {
      const pixelIndex = queue[cursor]
      cursor += 1
      if (visited[pixelIndex]) continue
      visited[pixelIndex] = 1
      const x = pixelIndex % width
      const y = Math.floor(pixelIndex / width)
      if (x < left || x >= right || y < top || y >= bottom) continue
      const [red, green, blue, alpha] = rgbaAt(pixelIndex)
      if (!isOpenPblScarfCandidate(red, green, blue, alpha)) continue

      mask[pixelIndex] = 2
      if (x > left) queue.push(pixelIndex - 1)
      if (x + 1 < right) queue.push(pixelIndex + 1)
      if (y > top) queue.push(pixelIndex - width)
      if (y + 1 < bottom) queue.push(pixelIndex + width)
    }

    const expandMask = (
      passes: number,
      isCandidate: (red: number, green: number, blue: number, alpha: number) => boolean,
    ) => {
      for (let edgePass = 0; edgePass < passes; edgePass += 1) {
        const edgeAdditions: number[] = []
        const queuedEdges = new Uint8Array((right - left) * (bottom - top))
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) {
            const pixelIndex = y * width + x
            if (mask[pixelIndex] !== 2) continue
            for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
              for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
                if (xOffset === 0 && yOffset === 0) continue
                const neighbourX = x + xOffset
                const neighbourY = y + yOffset
                if (
                  neighbourX < left
                  || neighbourX >= right
                  || neighbourY < top
                  || neighbourY >= bottom
                ) {
                  continue
                }
                const neighbour = neighbourY * width + neighbourX
                const queuedIndex = (neighbourY - top) * (right - left) + neighbourX - left
                if (mask[neighbour] !== 0 || queuedEdges[queuedIndex]) {
                  continue
                }
                const [red, green, blue, alpha] = rgbaAt(neighbour)
                if (!isCandidate(red, green, blue, alpha)) {
                  continue
                }
                queuedEdges[queuedIndex] = 1
                edgeAdditions.push(neighbour)
              }
            }
          }
        }
        edgeAdditions.forEach((pixelIndex) => {
          mask[pixelIndex] = 2
        })
      }
    }

    const includeNearbyBrightHighlights = () => {
      const localWidth = right - left
      const localSize = localWidth * (bottom - top)
      const proximity = new Uint8Array(localSize)
      let frontier: number[] = []

      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const pixelIndex = y * width + x
          if (mask[pixelIndex] !== 2) continue
          const localIndex = (y - top) * localWidth + x - left
          proximity[localIndex] = 1
          frontier.push(pixelIndex)
        }
      }

      // The rear-view upper highlight is separated from the saturated scarf
      // core by its dark stitched outline. Build a short frame-local distance
      // field so the highlight can seed without treating arbitrary blue art
      // elsewhere in the frame as scarf material.
      for (let distance = 0; distance < 4; distance += 1) {
        const nextFrontier: number[] = []
        frontier.forEach((pixelIndex) => {
          const x = pixelIndex % width
          const y = Math.floor(pixelIndex / width)
          for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
            for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
              if (xOffset === 0 && yOffset === 0) continue
              const neighbourX = x + xOffset
              const neighbourY = y + yOffset
              if (
                neighbourX < left
                || neighbourX >= right
                || neighbourY < top
                || neighbourY >= bottom
              ) {
                continue
              }
              const localIndex = (neighbourY - top) * localWidth + neighbourX - left
              if (proximity[localIndex]) continue
              proximity[localIndex] = 1
              nextFrontier.push(neighbourY * width + neighbourX)
            }
          }
        })
        frontier = nextFrontier
      }

      const highlightQueue: number[] = []
      const queuedHighlights = new Uint8Array(localSize)
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const pixelIndex = y * width + x
          const localIndex = (y - top) * localWidth + x - left
          if (!proximity[localIndex] || mask[pixelIndex] !== 0) continue
          const [red, green, blue, alpha] = rgbaAt(pixelIndex)
          if (!isOpenPblScarfBrightHighlightCandidate(red, green, blue, alpha)) continue
          mask[pixelIndex] = 2
          queuedHighlights[localIndex] = 1
          highlightQueue.push(pixelIndex)
        }
      }

      // Once a nearby part of the highlight is confirmed, include its whole
      // bright component. This covers a long horizontal glint in one pass and
      // does not depend on its width or animation-frame compression pattern.
      let highlightCursor = 0
      while (highlightCursor < highlightQueue.length) {
        const pixelIndex = highlightQueue[highlightCursor]
        highlightCursor += 1
        const x = pixelIndex % width
        const y = Math.floor(pixelIndex / width)
        for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
          for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
            if (xOffset === 0 && yOffset === 0) continue
            const neighbourX = x + xOffset
            const neighbourY = y + yOffset
            if (
              neighbourX < left
              || neighbourX >= right
              || neighbourY < top
              || neighbourY >= bottom
            ) {
              continue
            }
            const neighbour = neighbourY * width + neighbourX
            const localIndex = (neighbourY - top) * localWidth + neighbourX - left
            if (mask[neighbour] !== 0 || queuedHighlights[localIndex]) continue
            const [red, green, blue, alpha] = rgbaAt(neighbour)
            if (!isOpenPblScarfBrightHighlightCandidate(red, green, blue, alpha)) continue
            mask[neighbour] = 2
            queuedHighlights[localIndex] = 1
            highlightQueue.push(neighbour)
          }
        }
      }
    }

    const fillDenseMaskGaps = () => {
      for (let gapPass = 0; gapPass < 2; gapPass += 1) {
        const gapAdditions: number[] = []
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) {
            const pixelIndex = y * width + x
            if (mask[pixelIndex] !== 0) continue
            const [red, green, blue, alpha] = rgbaAt(pixelIndex)
            if (!isOpenPblScarfResidualCandidate(red, green, blue, alpha)) continue

            let scarfNeighbours = 0
            for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
              for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
                if (xOffset === 0 && yOffset === 0) continue
                const neighbourX = x + xOffset
                const neighbourY = y + yOffset
                if (
                  neighbourX < left
                  || neighbourX >= right
                  || neighbourY < top
                  || neighbourY >= bottom
                ) {
                  continue
                }
                if (mask[neighbourY * width + neighbourX] === 2) {
                  scarfNeighbours += 1
                }
              }
            }
            if (scarfNeighbours >= 5) gapAdditions.push(pixelIndex)
          }
        }
        gapAdditions.forEach((pixelIndex) => {
          mask[pixelIndex] = 2
        })
      }
    }

    // The saturated material edge can be diagonal and two pixels wide.
    expandMask(2, isOpenPblScarfEdgeCandidate)

    // Some rear-view highlights are separated from the saturated core by a
    // stitched outline, so recover the nearby bright component first.
    includeNearbyBrightHighlights()

    // A lightened scarf edge has the same hue as the master material but can
    // fail the strict red/blue ratio. Only one pass is allowed: making this
    // recursive would eventually enter the similarly blue-gray torso.
    expandMask(1, isOpenPblScarfHighlightCandidate)

    // A final one-pixel cleanup catches opaque purple/blue WebP chroma spill
    // at the scarf silhouette. The hue is deliberately outside the body and
    // material ranges, and the pass is non-recursive.
    expandMask(1, isOpenPblScarfChromaSpillCandidate)

    // Recover compressed blue pinholes that are surrounded by confirmed
    // scarf pixels. Requiring a five-of-eight local majority keeps a body
    // boundary (which touches the mask from only one side) protected.
    fillDenseMaskGaps()

    // WebP chroma bleed can occupy several almost-transparent pixels and may
    // no longer retain a trustworthy hue at all. Alpha is safe here because
    // the body pixels touching the scarf are opaque. Keep this frame-bounded
    // so padding from a neighbouring atlas frame can never join the mask.
    expandMask(3, (_red, _green, _blue, alpha) => isCompressedScarfFringe(alpha))
  }

  return mask
}

async function createRoleScarfTexture(
  imageUrl: string,
  color: string,
  sheetData: SpritesheetData,
): Promise<Texture> {
  const image = await loadImage(imageUrl)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Could not create canvas context for recolored sprite sheet')
  }

  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  context.drawImage(image, 0, 0)

  const [targetRed, targetGreen, targetBlue] = toRgb(color)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  const frameRects = Object.values(sheetData.frames).map(({ frame }) => ({
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
  }))
  const scarfMask = buildRoleScarfMask(data, canvas.width, canvas.height, frameRects)

  for (let index = 0; index < data.length; index += 4) {
    const maskKind = scarfMask[index / 4]
    if (maskKind === 0) {
      continue
    }
    const red = data[index]
    const blue = data[index + 2]
    const sourceShade = maskKind === 1 ? red / 229 : blue / 203

    const shade = Math.min(1.25, Math.max(0.25, sourceShade))
    data[index] = Math.min(255, Math.round(targetRed * shade))
    data[index + 1] = Math.min(255, Math.round(targetGreen * shade))
    data[index + 2] = Math.min(255, Math.round(targetBlue * shade))
  }

  context.putImageData(imageData, 0, 0)
  return Texture.from(canvas)
}

function loadImage(imageUrl: string): Promise<HTMLImageElement> {
  return retryAssetLoad(() => new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load image for recoloring: ${imageUrl}`))
    image.src = imageUrl
  }))
}
