import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import type { FederatedPointerEvent } from 'pixi.js'
import type { AgentActionName } from '@/assets/agent'
import type { AgentId } from '@/domain/studio'

export type StudyZoneId = 'library' | 'planning' | 'archive'
export type StudyZonePosture = 'normal' | 'crouched'

export type StudyZoneDefinition = {
  id: StudyZoneId
  title: string
  subtitle: string
  position: { x: number; y: number }
  displayWidth: number
  approachPoint: { x: number; y: number }
  interactionPoint: { x: number; y: number }
  action: AgentActionName
  interactionActions: readonly AgentActionName[]
  posture: StudyZonePosture
  facing: 'left' | 'right'
  labelPosition: { x: number; y: number }
}

export const studyZoneDefinitions = {
  library: {
    id: 'library',
    title: '资料角',
    subtitle: '知知 · 翻阅参考资料与证据卡',
    // The source image is an L-shaped corner shelf. Its top run sits under the
    // scene header, while the return runs down the left edge of the room.
    position: { x: -52, y: 4 },
    displayWidth: 425,
    approachPoint: { x: 420, y: 242 },
    interactionPoint: { x: 282, y: 244 },
    action: 'reading_book',
    interactionActions: ['reading_book'],
    posture: 'normal',
    facing: 'left',
    labelPosition: { x: 22, y: 238 },
  },
  planning: {
    id: 'planning',
    title: '项目工作台',
    subtitle: '灵灵 × 策策 · 在白板前整理方案与步骤',
    position: { x: 46, y: 318 },
    displayWidth: 224,
    approachPoint: { x: 444, y: 510 },
    interactionPoint: { x: 294, y: 526 },
    action: 'talking_on_stand-0',
    interactionActions: ['talking_on_stand-0'],
    posture: 'normal',
    facing: 'left',
    labelPosition: { x: 48, y: 520 },
  },
  archive: {
    id: 'archive',
    title: '过程档案',
    subtitle: '记记 · 打开抽屉保存关键决定',
    position: { x: 12, y: 602 },
    displayWidth: 300,
    approachPoint: { x: 400, y: 754 },
    interactionPoint: { x: 195, y: 770 },
    action: 'organizing_files',
    interactionActions: ['organizing_files'],
    posture: 'normal',
    facing: 'left',
    labelPosition: { x: 12, y: 790 },
  },
} as const satisfies Record<StudyZoneId, StudyZoneDefinition>

export const studyZoneForAgent: Record<AgentId, StudyZoneId> = {
  zhizhi: 'library',
  wenwen: 'planning',
  lingling: 'planning',
  cece: 'planning',
  pingping: 'planning',
  jiji: 'archive',
}

export type StudyZoneController = {
  container: Container
  getDefinition: (zoneId: StudyZoneId) => StudyZoneDefinition
  getOccupant: (zoneId: StudyZoneId) => AgentId | null
  tryOccupy: (zoneId: StudyZoneId, agentId: AgentId) => boolean
  setAgentActive: (zoneId: StudyZoneId, agentId: AgentId, active: boolean) => void
  destroy: () => void
}

type StudyZoneFactoryOptions = {
  textures: Record<StudyZoneId, Texture>
  archiveClosedTexture: Texture
  onSelectZone: (zoneId: StudyZoneId, event: FederatedPointerEvent) => void
  onHoverZone: (zoneId: StudyZoneId | null, event?: FederatedPointerEvent) => void
}

export function createStudyZones({ textures, archiveClosedTexture, onSelectZone, onHoverZone }: StudyZoneFactoryOptions): StudyZoneController {
  const container = new Container()
  const occupants = new Map<StudyZoneId, AgentId | null>()
  let archiveOpenSprite: Sprite | null = null
  let archiveAnimationFrame: number | null = null

  Object.values(studyZoneDefinitions).forEach((definition) => {
    const texture = textures[definition.id]
    const imageHeight = definition.displayWidth * (texture.height / texture.width)
    const zone = new Container({ x: definition.position.x, y: definition.position.y })
    const sprite = new Sprite(definition.id === 'archive' ? archiveClosedTexture : texture)
    const hitTarget = new Graphics()
      .rect(0, 0, definition.displayWidth, imageHeight)
      .fill({ color: 0xffffff, alpha: 0.001 })

    // The user-provided renders contain their own white material, ambient
    // occlusion and contact shadows. Keep the full crop instead of keying out
    // the background, otherwise the soft shadows around the furniture vanish.
    sprite.scale.set(definition.displayWidth / sprite.texture.width)
    zone.addChild(sprite)
    if (definition.id === 'archive') {
      archiveOpenSprite = new Sprite(texture)
      archiveOpenSprite.scale.set(definition.displayWidth / texture.width)
      archiveOpenSprite.alpha = 0
      archiveOpenSprite.visible = false
      zone.addChild(archiveOpenSprite)
    }
    zone.addChild(hitTarget)
    hitTarget.eventMode = 'static'
    hitTarget.cursor = 'pointer'
    hitTarget.hitArea = new Rectangle(0, 0, definition.displayWidth, imageHeight)
    container.addChild(zone)

    occupants.set(definition.id, null)

    hitTarget.on('pointertap', (event) => {
      event.stopPropagation()
      onSelectZone(definition.id, event)
    })
    hitTarget.on('pointerenter', (event) => onHoverZone(definition.id, event))
    hitTarget.on('pointermove', (event) => onHoverZone(definition.id, event))
    hitTarget.on('pointerleave', () => onHoverZone(null))
  })

  const animateArchiveDrawer = (open: boolean) => {
    const openSprite = archiveOpenSprite
    if (!openSprite) {
      return
    }
    if (archiveAnimationFrame !== null) {
      cancelAnimationFrame(archiveAnimationFrame)
      archiveAnimationFrame = null
    }

    const from = openSprite.alpha
    const target = open ? 1 : 0
    if (Math.abs(from - target) < 0.001) {
      openSprite.alpha = target
      openSprite.visible = open
      return
    }

    const startedAt = performance.now()
    const duration = open ? 240 : 190
    openSprite.visible = true
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = progress * progress * (3 - 2 * progress)
      openSprite.alpha = from + (target - from) * eased
      if (progress < 1) {
        archiveAnimationFrame = requestAnimationFrame(tick)
      } else {
        archiveAnimationFrame = null
        openSprite.alpha = target
        openSprite.visible = open
      }
    }
    archiveAnimationFrame = requestAnimationFrame(tick)
  }

  return {
    container,
    getDefinition: (zoneId) => studyZoneDefinitions[zoneId],
    getOccupant: (zoneId) => occupants.get(zoneId) ?? null,
    tryOccupy: (zoneId, agentId) => {
      const occupant = occupants.get(zoneId)
      if (occupant && occupant !== agentId) {
        return false
      }
      occupants.set(zoneId, agentId)
      return true
    },
    setAgentActive: (zoneId, agentId, active) => {
      if (active) {
        const occupant = occupants.get(zoneId)
        if (!occupant || occupant === agentId) {
          occupants.set(zoneId, agentId)
          if (zoneId === 'archive') {
            animateArchiveDrawer(true)
          }
        }
      } else if (occupants.get(zoneId) === agentId) {
        occupants.set(zoneId, null)
        if (zoneId === 'archive') {
          animateArchiveDrawer(false)
        }
      }
    },
    destroy: () => {
      if (archiveAnimationFrame !== null) {
        cancelAnimationFrame(archiveAnimationFrame)
        archiveAnimationFrame = null
      }
    },
  }
}
