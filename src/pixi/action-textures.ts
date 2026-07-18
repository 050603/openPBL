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
    ? await createRedReplacedTexture(imageUrl, options.replaceDefaultRedWith)
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

function shouldReplaceDefaultRed(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  if (alpha < 24) {
    return false
  }

  return red > 90
    && red > green * 1.45
    && red > blue * 1.45
    && green < 110
    && blue < 110
}

async function createRedReplacedTexture(imageUrl: string, color: string): Promise<Texture> {
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

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const alpha = data[index + 3]

    if (!shouldReplaceDefaultRed(red, green, blue, alpha)) {
      continue
    }

    const shade = Math.min(1.25, Math.max(0.25, red / 229))
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
