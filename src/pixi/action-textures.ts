import { Assets, Spritesheet, Texture } from 'pixi.js'
import type { SpritesheetData } from 'pixi.js'
import type { AgentActionName } from '@/assets/agent'
import { getActionResourceUrls } from './resources'

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

    const loadPromise = loadTextures(actionName, options)
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
    void entry.promise.then(({ spritesheet, ownsBaseTexture }) => {
      spritesheet.destroy(ownsBaseTexture)
    })
  }

  return {
    loadActionTextures,
    releaseActionTextures,
    clearCache: () => {
      const entries = Array.from(actionTextures.values())
      actionTextures.clear()
      entries.forEach((entry) => {
        void entry.promise.then(({ spritesheet, ownsBaseTexture }) => {
          spritesheet.destroy(ownsBaseTexture)
        })
      })
    },
  }
}

async function loadTextures(
  actionName: AgentActionName,
  options: LoadActionTextureOptions,
): Promise<{ textures: Texture[]; spritesheet: Spritesheet; ownsBaseTexture: boolean }> {
  const { imageUrl, sheetUrl } = getActionResourceUrls(actionName)
  const sheetResponse = await fetch(sheetUrl, { cache: 'force-cache' })

  if (!sheetResponse.ok) {
    throw new Error(`Unable to load action sheet: ${actionName}`)
  }

  const sheetData = (await sheetResponse.json()) as SpritesheetData
  const baseTexture = options.replaceDefaultRedWith
    ? await createRoleScarfTexture(imageUrl, options.replaceDefaultRedWith, sheetData)
    : await Assets.load<Texture>(imageUrl)
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

/**
 * Returns 0 for protected pixels, 1 for legacy-red scarf pixels, and 2 for
 * OpenPBL-blue scarf pixels. Blue pixels are accepted only when they belong to
 * a scarf-colored connected component containing a strong master-color seed.
 * This prevents nearby blue-gray body material from being recolored.
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

    // WebP compression leaves a dark, partially transparent fringe around
    // both the front fold and rear edge of the scarf. It can be diagonal and
    // up to two pixels wide, so a single four-neighbour pass leaves blue
    // pinstripes behind. Expand only two layers, within the current frame,
    // while retaining the strict red/blue ratio that protects the blue-gray
    // body material.
    for (let edgePass = 0; edgePass < 2; edgePass += 1) {
      const edgeAdditions: number[] = []
      const queuedEdges = new Uint8Array(width * height)
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
              if (mask[neighbour] !== 0 || queuedEdges[neighbour]) {
                continue
              }
              const [red, green, blue, alpha] = rgbaAt(neighbour)
              if (!isOpenPblScarfEdgeCandidate(red, green, blue, alpha)) {
                continue
              }
              queuedEdges[neighbour] = 1
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
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load image for recoloring: ${imageUrl}`))
    image.src = imageUrl
  })
}
