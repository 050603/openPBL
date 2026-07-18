import { AnimatedSprite, Container, type Texture } from 'pixi.js'
import { Easing, Tween } from '@tweenjs/tween.js'
import {
  type AgentActionName,
  type AgentActionPlaybackOptions,
  getAgentActionDefinition,
  roleSpriteActions,
} from '@/assets/agent'
import type { AgentRoleProfile } from '@/assets/agent/roles'
import type { AgentId } from '@/domain/studio'
import type { ActionTextureLoader } from './action-textures'

export type VisualAnchorName = 'center' | 'bottomCenter'
export type PersonPosture = 'normal' | 'crouched'
export type PersonFacing = 'left' | 'right'

export function getFacingScaleSign(
  facing: PersonFacing,
  authoredFacing: PersonFacing,
): 1 | -1 {
  return facing === authoredFacing ? 1 : -1
}

export function getActionAuthoredFacing(
  actionName: AgentActionName,
  legacyArt: boolean,
): PersonFacing {
  if (legacyArt) {
    return 'left'
  }

  // The horizontal walking strip was drawn facing right. The interaction
  // strips and the canonical character were drawn facing left. Tracking this
  // per action prevents a correct walk fix from mirroring shelf interactions
  // back toward the room.
  return actionName === 'fc_walking_h' ? 'right' : 'left'
}

export function getActionFrameBodyOffset(
  actionName: AgentActionName,
  frameIndex: number,
  reverse = false,
): { x: number; y: number } {
  const offsets = getAgentActionDefinition(actionName).frameBodyOffsets
  if (!offsets?.length) {
    return { x: 0, y: 0 }
  }

  const sourceFrameIndex = reverse
    ? offsets.length - 1 - frameIndex
    : frameIndex
  return offsets[sourceFrameIndex] ?? { x: 0, y: 0 }
}

export type PersonController = {
  container: Container
  role: AgentId
  roleProfile: AgentRoleProfile
  play: (actionName: AgentActionName, options?: PersonPlaybackOptions) => Promise<void>
  moveTo: (x: number, y: number, duration?: number) => Promise<void>
  moveVisualAnchorTo: (x: number, y: number, options?: { duration?: number; anchor?: VisualAnchorName }) => Promise<void>
  placeVisualAnchorAt: (x: number, y: number, anchor?: VisualAnchorName) => void
  cancelMovement: () => void
  getVisualAnchorPosition: (anchor?: VisualAnchorName) => { x: number; y: number }
  setFacing: (facing: PersonFacing) => void
  setPosture: (posture: PersonPosture) => void
  setAnimationSpeed: (value: number) => void
  destroy: () => void
}

type PersonFactoryOptions = {
  textureLoader: ActionTextureLoader
}

type VisualAnchorOffset = { x: number; y: number }

type PersonPlaybackOptions = AgentActionPlaybackOptions & {
  preserveVisualAnchor?: VisualAnchorName
  visualAnchorOffset?: VisualAnchorOffset
}

export function createPersonFactory({ textureLoader }: PersonFactoryOptions) {
  async function createPerson(
    roleProfile: AgentRoleProfile,
  ): Promise<PersonController> {
    const actions = roleSpriteActions[roleProfile.id]
    const container = new Container()
    const spriteLayer = new Container()
    const spritesByLayer = new Map<'body', AnimatedSprite>()
    const visualAnchorOffsets = new Map<'body', VisualAnchorOffset>()
    const frameBodyCorrections = new Map<AnimatedSprite, VisualAnchorOffset>()
    // The 1x atlas metadata keeps the same logical frame size as @2x, while
    // using one quarter of the GPU memory.
    const baseScale = process.env.NEXT_PUBLIC_AGENT_ART === 'legacy' ? 0.45 : 0.78
    const textureOptions = { replaceDefaultRedWith: roleProfile.scarfColor }
    let animationSpeed = 0.12
    let currentAction: AgentActionName = actions.default
    let currentTextureAction: AgentActionName | null = null
    let facing: PersonFacing = 'left'
    let playbackRequest = 0
    let movementRequest = 0
    let disposed = false
    let settleCurrentPlayback: (() => void) | null = null
    let applyCurrentFrameCorrection: (() => void) | null = null
    const movementFrameIds = new Set<number>()
    const movementCancels = new Set<() => void>()

    container.x = roleProfile.position.x
    container.y = roleProfile.position.y
    container.scale.set(baseScale)
    container.addChild(spriteLayer)

    function getSpriteLocalBounds(sprite: AnimatedSprite) {
      const bounds = sprite.getLocalBounds()
      const left = sprite.x + Math.min(bounds.x * sprite.scale.x, (bounds.x + bounds.width) * sprite.scale.x)
      const right = sprite.x + Math.max(bounds.x * sprite.scale.x, (bounds.x + bounds.width) * sprite.scale.x)
      const top = sprite.y + Math.min(bounds.y * sprite.scale.y, (bounds.y + bounds.height) * sprite.scale.y)
      const bottom = sprite.y + Math.max(bounds.y * sprite.scale.y, (bounds.y + bounds.height) * sprite.scale.y)

      return {
        left,
        right,
        top,
        bottom,
        centerX: (left + right) / 2,
        centerY: (top + bottom) / 2,
      }
    }

    function getVisualAnchor(
      sprite: AnimatedSprite,
      anchor: VisualAnchorName,
      offset: VisualAnchorOffset = { x: 0, y: 0 },
    ) {
      const bounds = getSpriteLocalBounds(sprite)
      // Frame stabilization moves the rendered canvas inside spriteLayer, but
      // it must not move the person's logical feet/label/navigation anchor.
      const frameCorrection = frameBodyCorrections.get(sprite) ?? { x: 0, y: 0 }
      return anchor === 'bottomCenter'
        ? {
            x: bounds.centerX - frameCorrection.x + offset.x,
            y: bounds.bottom - frameCorrection.y + offset.y,
          }
        : {
            x: bounds.centerX - frameCorrection.x + offset.x,
            y: bounds.centerY - frameCorrection.y + offset.y,
          }
    }

    function removeBody(): void {
      settleCurrentPlayback?.()
      settleCurrentPlayback = null
      const previous = spritesByLayer.get('body')
      if (!previous) {
        return
      }

      spriteLayer.removeChild(previous)
      frameBodyCorrections.delete(previous)
      previous.destroy()
      spritesByLayer.delete('body')
      applyCurrentFrameCorrection = null
      if (currentTextureAction) {
        textureLoader.releaseActionTextures(currentTextureAction, textureOptions)
        currentTextureAction = null
      }
    }

    function applyFacing(sprite: AnimatedSprite, actionName: AgentActionName): void {
      const legacyArt = process.env.NEXT_PUBLIC_AGENT_ART === 'legacy'
      const direction = getFacingScaleSign(
        facing,
        getActionAuthoredFacing(actionName, legacyArt),
      )
      sprite.scale.x = Math.abs(sprite.scale.x) * direction
    }

    async function play(actionName: AgentActionName, options: PersonPlaybackOptions = {}): Promise<void> {
      const definition = getAgentActionDefinition(actionName)

      if (definition.layer !== 'body') {
        throw new Error(`Only body actions can be played by a person: ${actionName}`)
      }

      const request = ++playbackRequest
      settleCurrentPlayback?.()
      settleCurrentPlayback = null
      const previous = spritesByLayer.get('body')
      const previousOffset = visualAnchorOffsets.get('body')
      const preserveAnchor = options.preserveVisualAnchor && previous
        ? getVisualAnchor(previous, options.preserveVisualAnchor, previousOffset)
        : undefined
      const nextOffset = options.visualAnchorOffset ?? { x: 0, y: 0 }
      let textures: Texture[]
      try {
        textures = await textureLoader.loadActionTextures(actionName, textureOptions)
      } catch (error) {
        textureLoader.releaseActionTextures(actionName, textureOptions)
        throw error
      }

      if (disposed || request !== playbackRequest) {
        textureLoader.releaseActionTextures(actionName, textureOptions)
        return
      }

      const nextSprite = new AnimatedSprite(options.reverse ? [...textures].reverse() : textures)
      const playback = { ...definition.playback, ...options }
      nextSprite.x = playback.x ?? 0
      nextSprite.y = playback.y ?? 0
      nextSprite.alpha = playback.alpha ?? 1
      nextSprite.rotation = playback.rotation ?? 0
      nextSprite.angle = playback.angle ?? nextSprite.angle
      nextSprite.visible = playback.visible ?? true
      nextSprite.animationSpeed = playback.animationSpeed ?? animationSpeed
      nextSprite.loop = playback.loop ?? true

      const completed = nextSprite.loop
        ? null
        : new Promise<void>((resolve) => {
            let settled = false
            const settle = () => {
              if (settled) return
              settled = true
              if (settleCurrentPlayback === settle) settleCurrentPlayback = null
              resolve()
            }
            settleCurrentPlayback = settle
            nextSprite.onComplete = settle
          })

      if (typeof playback.scale === 'number') {
        nextSprite.scale.set(playback.scale)
      } else if (playback.scale) {
        nextSprite.scale.set(playback.scale.x, playback.scale.y)
      }
      applyFacing(nextSprite, actionName)

      const authoredPosition = { x: nextSprite.x, y: nextSprite.y }
      const applyNextFrameCorrection = () => {
        const offset = getActionFrameBodyOffset(
          actionName,
          nextSprite.currentFrame,
          Boolean(options.reverse),
        )
        // Sprite scale carries the facing mirror. Multiplying the authored
        // correction by the signed scale keeps the same feet fixed when the
        // action is mirrored toward the opposite side of the room.
        nextSprite.x = authoredPosition.x + offset.x * nextSprite.scale.x
        nextSprite.y = authoredPosition.y + offset.y * nextSprite.scale.y
        frameBodyCorrections.set(nextSprite, {
          x: nextSprite.x - authoredPosition.x,
          y: nextSprite.y - authoredPosition.y,
        })
      }
      nextSprite.onFrameChange = applyNextFrameCorrection
      applyNextFrameCorrection()

      nextSprite.play()
      spriteLayer.addChild(nextSprite)
      spritesByLayer.set('body', nextSprite)
      applyCurrentFrameCorrection = applyNextFrameCorrection
      visualAnchorOffsets.set('body', nextOffset)

      if (previous) {
        spriteLayer.removeChild(previous)
        frameBodyCorrections.delete(previous)
        previous.destroy()
      }
      if (currentTextureAction) {
        textureLoader.releaseActionTextures(currentTextureAction, textureOptions)
      }
      currentTextureAction = actionName

      if (preserveAnchor && options.preserveVisualAnchor) {
        const nextAnchor = getVisualAnchor(nextSprite, options.preserveVisualAnchor, nextOffset)
        container.x += (preserveAnchor.x - nextAnchor.x) * container.scale.x
        container.y += (preserveAnchor.y - nextAnchor.y) * container.scale.y
      }

      currentAction = actionName
      if (completed) await completed
    }

    function setFacing(nextFacing: PersonFacing): void {
      if (facing === nextFacing) {
        return
      }

      const sprite = spritesByLayer.get('body')
      const previousAnchor = sprite
        ? getVisualAnchorPosition('bottomCenter')
        : undefined
      facing = nextFacing
      if (!sprite || !previousAnchor) {
        return
      }

      applyFacing(sprite, currentAction)
      applyCurrentFrameCorrection?.()
      const nextAnchor = getVisualAnchorPosition('bottomCenter')
      container.x += previousAnchor.x - nextAnchor.x
      container.y += previousAnchor.y - nextAnchor.y
    }

    function setAnimationSpeed(value: number): void {
      animationSpeed = value
      spritesByLayer.forEach((sprite) => {
        sprite.animationSpeed = value
      })
    }

    function setPosture(posture: PersonPosture): void {
      const previousAnchor = spritesByLayer.has('body')
        ? getVisualAnchorPosition('bottomCenter')
        : undefined
      container.scale.set(baseScale, posture === 'crouched' ? baseScale * 0.72 : baseScale)
      if (!previousAnchor) {
        return
      }

      const nextAnchor = getVisualAnchorPosition('bottomCenter')
      container.y += previousAnchor.y - nextAnchor.y
    }

    function moveTo(x: number, y: number, duration = 900): Promise<void> {
      const request = ++movementRequest
      // A walking cycle has a steady cadence, so the actor should cover ground
      // at a steady rate as well. Easing the container while the feet animate at
      // a constant speed is what makes the character look like it is sliding.
      const tween = new Tween(container).to({ x, y }, duration).easing(Easing.Linear.None)

      return new Promise((resolve) => {
        let frameId = 0
        let settled = false
        const finish = () => {
          if (settled) {
            return
          }

          settled = true
          if (frameId) {
            window.cancelAnimationFrame(frameId)
            movementFrameIds.delete(frameId)
          }
          movementCancels.delete(finish)
          resolve()
        }
        movementCancels.add(finish)
        const tick = (time: number) => {
          if (frameId) {
            movementFrameIds.delete(frameId)
            frameId = 0
          }

          if (disposed || request !== movementRequest) {
            finish()
            return
          }

          if (tween.update(time)) {
            frameId = window.requestAnimationFrame(tick)
            movementFrameIds.add(frameId)
          } else {
            finish()
          }
        }

        tween.start(performance.now())
        frameId = window.requestAnimationFrame(tick)
      })
    }

    function cancelMovement(): void {
      movementRequest += 1
      Array.from(movementCancels).forEach((cancel) => cancel())
      movementCancels.clear()
      movementFrameIds.forEach((frameId) => window.cancelAnimationFrame(frameId))
      movementFrameIds.clear()
    }

    function getVisualAnchorPosition(anchor: VisualAnchorName = 'bottomCenter') {
      const sprite = spritesByLayer.get('body')
      if (!sprite) {
        return { x: container.x, y: container.y }
      }

      const visualAnchor = getVisualAnchor(sprite, anchor, visualAnchorOffsets.get('body'))
      return {
        x: container.x + visualAnchor.x * container.scale.x,
        y: container.y + visualAnchor.y * container.scale.y,
      }
    }

    async function moveVisualAnchorTo(
      x: number,
      y: number,
      options: { duration?: number; anchor?: VisualAnchorName } = {},
    ): Promise<void> {
      const anchor = options.anchor ?? 'bottomCenter'
      const sprite = spritesByLayer.get('body')
      if (!sprite) {
        await moveTo(x, y, options.duration)
        return
      }

      const visualAnchor = getVisualAnchor(sprite, anchor, visualAnchorOffsets.get('body'))
      await moveTo(
        x - visualAnchor.x * container.scale.x,
        y - visualAnchor.y * container.scale.y,
        options.duration,
      )
    }

    function placeVisualAnchorAt(
      x: number,
      y: number,
      anchor: VisualAnchorName = 'bottomCenter',
    ): void {
      cancelMovement()
      const current = getVisualAnchorPosition(anchor)
      container.x += x - current.x
      container.y += y - current.y
    }

    await play(currentAction)

    return {
      container,
      role: roleProfile.id,
      roleProfile,
      play,
      moveTo,
      moveVisualAnchorTo,
      placeVisualAnchorAt,
      cancelMovement,
      getVisualAnchorPosition,
      setFacing,
      setPosture,
      setAnimationSpeed,
      destroy: () => {
        disposed = true
        playbackRequest += 1
        cancelMovement()
        removeBody()
        spriteLayer.destroy({ children: true })
      },
    }
  }

  return { createPerson }
}
