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

export type VisualAnchorName = 'center' | 'bottomCenter' | 'bodyCore'
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

  return getAgentActionDefinition(actionName).authoredFacing ?? 'left'
}

export function getActionAnimationSpeed(actionName: AgentActionName): number {
  const definition = getAgentActionDefinition(actionName)
  if (definition.authoredFps) {
    return definition.authoredFps / 60
  }

  return definition.playback?.animationSpeed ?? 0.12
}

export function getActionRegistrationAnchor(
  actionName: AgentActionName,
): VisualAnchorName {
  return getAgentActionDefinition(actionName).registrationAnchor ?? 'bottomCenter'
}

export function getActionTransitionMs(actionName: AgentActionName): number {
  return getAgentActionDefinition(actionName).transitionMs ?? 140
}

export function getActionPairTransitionMs(
  previousAction: AgentActionName,
  nextAction: AgentActionName,
): number {
  return Math.max(
    getActionTransitionMs(previousAction),
    getActionTransitionMs(nextAction),
  )
}

export function getPhaseAlignedFrame(
  previousFrame: number,
  previousFrameCount: number,
  nextFrameCount: number,
): number {
  if (previousFrameCount <= 0 || nextFrameCount <= 0) return 0

  const safePreviousFrame = Math.floor(previousFrame)
  const wrappedPreviousFrame = (
    (safePreviousFrame % previousFrameCount) + previousFrameCount
  ) % previousFrameCount
  const cyclePhase = wrappedPreviousFrame / previousFrameCount
  return Math.min(
    nextFrameCount - 1,
    Math.floor(cyclePhase * nextFrameCount),
  )
}

export function getActionVisualScale(actionName: AgentActionName): number {
  return getAgentActionDefinition(actionName).visualScale ?? 1
}

export function getActionVisualWidthScale(actionName: AgentActionName): number {
  return getAgentActionDefinition(actionName).visualWidthScale ?? 1
}

export function getActionSwitchAlignment(
  previousAnchor: { x: number; y: number },
  nextAnchor: { x: number; y: number },
): {
  container: { x: number; y: number }
  retiringSprite: { x: number; y: number }
} {
  const x = previousAnchor.x - nextAnchor.x
  const y = previousAnchor.y - nextAnchor.y
  return {
    container: { x, y },
    retiringSprite: { x: -x, y: -y },
  }
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

export function getActionFrameOrder(
  actionName: AgentActionName,
  frameCount: number,
): number[] {
  const authoredOrder = getAgentActionDefinition(actionName).frameOrder
  if (!authoredOrder?.length) {
    return Array.from({ length: frameCount }, (_, index) => index)
  }

  const validOrder = authoredOrder.filter((index) => index >= 0 && index < frameCount)
  return validOrder.length > 0
    ? [...validOrder]
    : Array.from({ length: frameCount }, (_, index) => index)
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
  startBodyAnimation: () => void
  stopBodyAnimation: () => void
  destroy: () => void
}

type PersonFactoryOptions = {
  textureLoader: ActionTextureLoader
}

type VisualAnchorOffset = { x: number; y: number }
type RetiringBody = {
  sprite: AnimatedSprite
  actionName: AgentActionName
}

export type PersonPlaybackOptions = AgentActionPlaybackOptions & {
  autoplay?: boolean
  onMounted?: () => void
  preserveVisualAnchor?: VisualAnchorName
  visualAnchorOffset?: VisualAnchorOffset
  restart?: boolean
  transitionMs?: number
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
    const retiringBodies = new Map<AnimatedSprite, RetiringBody>()
    // The 1x atlas metadata keeps the same logical frame size as @2x, while
    // using one quarter of the GPU memory.
    const baseScale = process.env.NEXT_PUBLIC_AGENT_ART === 'legacy' ? 0.45 : 0.78
    const textureOptions = { replaceDefaultRedWith: roleProfile.scarfColor }
    // Pixi animationSpeed is frames per 60 Hz tick. 0.12 produces roughly
    // 7.2 authored frames per second, keeping gestures legible and calm on a
    // classroom display while still retaining continuous motion.
    let fallbackAnimationSpeed = 0.12
    let currentAction: AgentActionName = actions.default
    let currentTextureAction: AgentActionName | null = null
    let currentPlaybackSignature = ''
    let currentTargetAlpha = 1
    let facing: PersonFacing = 'left'
    let playbackRequest = 0
    let transitionRequest = 0
    let movementRequest = 0
    let disposed = false
    let settleCurrentPlayback: (() => void) | null = null
    let applyCurrentFrameCorrection: (() => void) | null = null
    const movementFrameIds = new Set<number>()
    const movementCancels = new Set<() => void>()
    const transitionFrameIds = new Set<number>()
    const lastVisualAnchorPositions = new Map<VisualAnchorName, { x: number; y: number }>()

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
      actionName: AgentActionName = currentAction,
    ) {
      const bounds = getSpriteLocalBounds(sprite)
      // Frame stabilization moves the rendered canvas inside spriteLayer, but
      // it must not move the person's logical feet/label/navigation anchor.
      const frameCorrection = frameBodyCorrections.get(sprite) ?? { x: 0, y: 0 }
      if (anchor === 'bodyCore') {
        const bodyCore = getAgentActionDefinition(actionName).bodyCoreAnchor
        if (bodyCore) {
          return {
            x: sprite.x - frameCorrection.x + bodyCore.x * sprite.scale.x + offset.x,
            y: sprite.y - frameCorrection.y + bodyCore.y * sprite.scale.y + offset.y,
          }
        }
        return {
          x: bounds.centerX - frameCorrection.x + offset.x,
          y: bounds.top + (bounds.bottom - bounds.top) * 0.54 - frameCorrection.y + offset.y,
        }
      }

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

    function destroyRetiringBody(body: RetiringBody): void {
      retiringBodies.delete(body.sprite)
      frameBodyCorrections.delete(body.sprite)
      if (body.sprite.parent === spriteLayer) {
        spriteLayer.removeChild(body.sprite)
      }
      body.sprite.destroy()
      textureLoader.releaseActionTextures(body.actionName, textureOptions)
    }

    function clearBodyTransitions(): void {
      transitionRequest += 1
      transitionFrameIds.forEach((frameId) => window.cancelAnimationFrame(frameId))
      transitionFrameIds.clear()
      retiringBodies.forEach(destroyRetiringBody)
      retiringBodies.clear()
      const active = spritesByLayer.get('body')
      if (active) {
        active.alpha = currentTargetAlpha
      }
    }

    function startBodyTransition(
      previous: AnimatedSprite,
      previousAction: AgentActionName,
      nextSprite: AnimatedSprite,
      targetAlpha: number,
      duration: number,
    ): void {
      if (duration <= 0) {
        destroyRetiringBody({ sprite: previous, actionName: previousAction })
        nextSprite.alpha = targetAlpha
        return
      }

      const request = ++transitionRequest
      const previousAlpha = previous.alpha
      const startedAt = performance.now()
      const retiring = { sprite: previous, actionName: previousAction }
      retiringBodies.set(previous, retiring)
      nextSprite.alpha = 0

      let frameId = 0
      const finish = () => {
        if (frameId) {
          transitionFrameIds.delete(frameId)
          frameId = 0
        }
        if (retiringBodies.has(previous)) {
          destroyRetiringBody(retiring)
        }
        if (spritesByLayer.get('body') === nextSprite) {
          nextSprite.alpha = targetAlpha
        }
      }
      const tick = (time: number) => {
        if (frameId) {
          transitionFrameIds.delete(frameId)
          frameId = 0
        }
        if (disposed || request !== transitionRequest) {
          finish()
          return
        }

        const progress = Math.min(1, Math.max(0, (time - startedAt) / duration))
        const eased = progress * progress * (3 - 2 * progress)
        previous.alpha = previousAlpha * (1 - eased)
        nextSprite.alpha = targetAlpha * eased
        if (progress >= 1) {
          finish()
          return
        }

        frameId = window.requestAnimationFrame(tick)
        transitionFrameIds.add(frameId)
      }

      frameId = window.requestAnimationFrame(tick)
      transitionFrameIds.add(frameId)
    }

    function removeBody(): void {
      settleCurrentPlayback?.()
      settleCurrentPlayback = null
      clearBodyTransitions()
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
      currentPlaybackSignature = ''
    }

    function applyFacing(sprite: AnimatedSprite, actionName: AgentActionName): void {
      const legacyArt = process.env.NEXT_PUBLIC_AGENT_ART === 'legacy'
      const direction = getFacingScaleSign(
        facing,
        getActionAuthoredFacing(actionName, legacyArt),
      )
      sprite.scale.x = Math.abs(sprite.scale.x) * direction
    }

    function playbackSignature(
      actionName: AgentActionName,
      playback: PersonPlaybackOptions,
      offset: VisualAnchorOffset,
    ): string {
      return JSON.stringify({
        actionName,
        x: playback.x ?? 0,
        y: playback.y ?? 0,
        alpha: playback.alpha ?? 1,
        rotation: playback.rotation ?? 0,
        angle: playback.angle,
        visible: playback.visible ?? true,
        animationSpeed: playback.animationSpeed,
        loop: playback.loop ?? true,
        reverse: playback.reverse ?? false,
        autoplay: playback.autoplay ?? true,
        scale: playback.scale,
        offset,
      })
    }

    async function play(actionName: AgentActionName, options: PersonPlaybackOptions = {}): Promise<void> {
      const definition = getAgentActionDefinition(actionName)

      if (definition.layer !== 'body') {
        throw new Error(`Only body actions can be played by a person: ${actionName}`)
      }

      const playback = { ...definition.playback, ...options }
      const resolvedAnimationSpeed = options.animationSpeed
        ?? definition.playback?.animationSpeed
        ?? (definition.authoredFps ? getActionAnimationSpeed(actionName) : fallbackAnimationSpeed)
      playback.animationSpeed = resolvedAnimationSpeed
      const nextOffset = options.visualAnchorOffset ?? { x: 0, y: 0 }
      const signature = playbackSignature(actionName, playback, nextOffset)
      const active = spritesByLayer.get('body')
      if (
        active
        && active.loop
        && (playback.loop ?? true)
        && !options.restart
        && signature === currentPlaybackSignature
      ) {
        active.animationSpeed = resolvedAnimationSpeed
        return
      }

      const request = ++playbackRequest
      clearBodyTransitions()
      settleCurrentPlayback?.()
      settleCurrentPlayback = null
      const previous = spritesByLayer.get('body')
      const previousAction = currentAction
      const previousTextureAction = currentTextureAction
      const previousOffset = visualAnchorOffsets.get('body')
      const preserveAnchorName = options.preserveVisualAnchor
        ?? getActionRegistrationAnchor(actionName)
      const preserveAnchor = previous
        ? getVisualAnchor(previous, preserveAnchorName, previousOffset, previousAction)
        : undefined
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

      const orderedTextures = getActionFrameOrder(actionName, textures.length)
        .map((index) => textures[index])
      const nextSprite = new AnimatedSprite(
        playback.reverse ? [...orderedTextures].reverse() : orderedTextures,
      )
      nextSprite.x = playback.x ?? 0
      nextSprite.y = playback.y ?? 0
      const targetAlpha = playback.alpha ?? 1
      nextSprite.alpha = targetAlpha
      nextSprite.rotation = playback.rotation ?? 0
      nextSprite.angle = playback.angle ?? nextSprite.angle
      nextSprite.visible = playback.visible ?? true
      nextSprite.animationSpeed = resolvedAnimationSpeed
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

      const visualScale = getActionVisualScale(actionName)
      const visualWidthScale = getActionVisualWidthScale(actionName)
      if (typeof playback.scale === 'number') {
        nextSprite.scale.set(
          playback.scale * visualScale * visualWidthScale,
          playback.scale * visualScale,
        )
      } else if (playback.scale) {
        nextSprite.scale.set(
          playback.scale.x * visualScale * visualWidthScale,
          playback.scale.y * visualScale,
        )
      } else {
        nextSprite.scale.set(visualScale * visualWidthScale, visualScale)
      }
      applyFacing(nextSprite, actionName)

      const shouldPreserveLoopPhase = Boolean(
        previous
        && previous.loop
        && nextSprite.loop
        && !options.restart
        && getAgentActionDefinition(previousAction).group === definition.group,
      )
      if (shouldPreserveLoopPhase && previous) {
        nextSprite.gotoAndStop(getPhaseAlignedFrame(
          previous.currentFrame,
          previous.totalFrames,
          nextSprite.totalFrames,
        ))
      }

      const authoredPosition = { x: nextSprite.x, y: nextSprite.y }
      const applyNextFrameCorrection = () => {
        const offset = getActionFrameBodyOffset(
          actionName,
          nextSprite.currentFrame,
          Boolean(playback.reverse),
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

      if (playback.autoplay ?? true) {
        nextSprite.play()
      }
      spriteLayer.addChild(nextSprite)
      spritesByLayer.set('body', nextSprite)
      applyCurrentFrameCorrection = applyNextFrameCorrection
      visualAnchorOffsets.set('body', nextOffset)
      currentTextureAction = actionName
      currentTargetAlpha = targetAlpha

      if (preserveAnchor) {
        const nextAnchor = getVisualAnchor(
          nextSprite,
          preserveAnchorName,
          nextOffset,
          actionName,
        )
        const alignment = getActionSwitchAlignment(preserveAnchor, nextAnchor)
        container.x += alignment.container.x * container.scale.x
        container.y += alignment.container.y * container.scale.y

        if (previous) {
          // The container shift aligns the incoming action, but it would also
          // drag the fading outgoing action to the new registration point.
          // Freeze and counter-shift the outgoing pose so both sprites remain
          // at the same world position for the entire cross-fade.
          previous.stop()
          previous.x += alignment.retiringSprite.x
          previous.y += alignment.retiringSprite.y
          const previousCorrection = frameBodyCorrections.get(previous) ?? { x: 0, y: 0 }
          frameBodyCorrections.set(previous, {
            x: previousCorrection.x + alignment.retiringSprite.x,
            y: previousCorrection.y + alignment.retiringSprite.y,
          })
        }
      }

      currentAction = actionName
      currentPlaybackSignature = signature
      if (previous && previousTextureAction) {
        startBodyTransition(
          previous,
          previousTextureAction,
          nextSprite,
          targetAlpha,
          options.transitionMs ?? getActionPairTransitionMs(previousAction, actionName),
        )
      } else {
        if (previous) {
          spriteLayer.removeChild(previous)
          frameBodyCorrections.delete(previous)
          previous.destroy()
        }
        if (previousTextureAction) {
          textureLoader.releaseActionTextures(previousTextureAction, textureOptions)
        }
        nextSprite.alpha = targetAlpha
      }
      options.onMounted?.()
      if (completed) await completed
    }

    function startBodyAnimation(): void {
      spritesByLayer.get('body')?.play()
    }

    function stopBodyAnimation(): void {
      spritesByLayer.get('body')?.stop()
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
      retiringBodies.forEach((body) => {
        applyFacing(body.sprite, body.actionName)
      })
      applyCurrentFrameCorrection?.()
      const nextAnchor = getVisualAnchorPosition('bottomCenter')
      container.x += previousAnchor.x - nextAnchor.x
      container.y += previousAnchor.y - nextAnchor.y
    }

    function setAnimationSpeed(value: number): void {
      fallbackAnimationSpeed = value
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
      if (disposed) {
        return lastVisualAnchorPositions.get(anchor) ?? {
          x: roleProfile.position.x,
          y: roleProfile.position.y,
        }
      }
      const sprite = spritesByLayer.get('body')
      if (!sprite) {
        const position = { x: container.x, y: container.y }
        lastVisualAnchorPositions.set(anchor, position)
        return position
      }

      const visualAnchor = getVisualAnchor(sprite, anchor, visualAnchorOffsets.get('body'))
      const position = {
        x: container.x + visualAnchor.x * container.scale.x,
        y: container.y + visualAnchor.y * container.scale.y,
      }
      lastVisualAnchorPositions.set(anchor, position)
      return position
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
      startBodyAnimation,
      stopBodyAnimation,
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
