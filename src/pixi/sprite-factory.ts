import { Container, Graphics, Sprite, Texture } from 'pixi.js'

export type WorkstationTextureName =
  | 'shadow_boss.png'
  | 'shadow.png'
  | 'screen_on.png'
  | 'screen.png'
  | 'desk_boss.png'
  | 'desk.png'
  | 'chair_boss.png'
  | 'chair.png'

export type SpriteOptions = {
  name: WorkstationTextureName
  x: number
  y: number
  scale?: number
  anchor?: number
  alpha?: number
  rotation?: number
}

export type SpriteFactory = {
  addBoundsGuide: (target: Container, color: number) => void
  createSprite: (textures: Record<string, Texture>, options: SpriteOptions) => Sprite
}

export function createSpriteFactory(): SpriteFactory {
  function addBoundsGuide(): void {
    // Kept as an extension point for a future visual debug mode.
  }

  function createSprite(
    textures: Record<string, Texture>,
    options: SpriteOptions,
  ): Sprite {
    const texture = textures[options.name]

    if (!texture) {
      throw new Error(`Missing workstation texture: ${options.name}`)
    }

    const sprite = new Sprite(texture)
    sprite.x = options.x
    sprite.y = options.y
    sprite.anchor.set(options.anchor ?? 0)
    sprite.scale.set(options.scale ?? 1)
    sprite.alpha = options.alpha ?? 1
    sprite.rotation = options.rotation ?? 0
    return sprite
  }

  return { addBoundsGuide, createSprite }
}

export function drawPixelPanel(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: number,
  stroke = 0xb8aa98,
): void {
  graphics
    .roundRect(x, y, width, height, 8)
    .fill({ color: fill, alpha: 0.96 })
    .stroke({ width: 3, color: stroke, alpha: 0.9 })
}
