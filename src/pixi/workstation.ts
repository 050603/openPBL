import { AnimatedSprite, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js'
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js'
import type { AgentActionName } from '@/assets/agent'
import { getAgentActionDefinition } from '@/assets/agent'
import type { AgentRoleProfile } from '@/assets/agent/roles'
import type { PartnerState } from '@/domain/studio'
import {
  getComputerFacingForAgent,
  getStatePresentation,
  isOwnComputerFacingAction,
  type ScreenActionName,
} from './status-presentation'
import type { ActionTextureLoader } from './action-textures'
import { classroomNavigationLaneXForSeat } from './navigation'
import { createPersonFactory, type PersonController } from './person'
import type { SpriteFactory } from './sprite-factory'

export type WorkstationController = {
  container: Container
  desk: Container
  chair: Container
  person: PersonController
  screen: WorkstationScreenController
  effect: WorkstationEffectController
  roleProfile: AgentRoleProfile
  seatAnchor: { x: number; y: number }
  seatExitAnchor: { x: number; y: number }
  conversationAnchor: { x: number; y: number }
  setState: (state: PartnerState, options?: { deferBodyActivity?: boolean }) => void
  refreshStateActivity: () => void
  setSelected: (selected: boolean) => void
  setInfoVisible: (visible: boolean) => void
  setConversationActive: (active: boolean) => void
  setAway: (away: boolean) => void
  setOccludedBy: (workstation: WorkstationController | null) => void
  setMessage: (message: string) => void
  setTask: (task: string) => void
  destroy: () => void
}

export type WorkstationScreenController = {
  container: Container
  play: (actionName: ScreenActionName) => Promise<void>
  clear: () => void
  destroy: () => void
}

export type WorkstationEffectController = {
  container: Container
  play: (actionName: Extract<AgentActionName, 'fc_ticket'>) => Promise<void>
  clear: () => void
  destroy: () => void
}

type WorkstationFactoryOptions = {
  spriteFactory: SpriteFactory
  textureLoader: ActionTextureLoader
  textures: Record<string, Texture>
  actorLayer: Container
  feedbackLayer: Container
  classroomTextures: {
    desk: Texture
    chair: Texture
  }
}

const roleScreenPositions = {
  x: 0,
  y: 15,
  scale: 0.45,
}

class AnimatedLayer implements WorkstationScreenController, WorkstationEffectController {
  readonly container: Container
  private readonly textureLoader: ActionTextureLoader
  private readonly layer: 'screen' | 'effect'
  private sprite: AnimatedSprite | null = null
  private currentAction: ScreenActionName | 'fc_ticket' | null = null
  private currentRequest = 0

  constructor(
    textureLoader: ActionTextureLoader,
    layer: 'screen' | 'effect',
    x: number,
    y: number,
    scale: number,
  ) {
    this.textureLoader = textureLoader
    this.layer = layer
    this.container = new Container({ x, y })
    this.container.scale.set(scale)
  }

  async play(actionName: ScreenActionName | 'fc_ticket'): Promise<void> {
    const definition = getAgentActionDefinition(actionName)

    if (definition.layer !== this.layer) {
      throw new Error(`Action ${actionName} cannot play in ${this.layer} layer`)
    }

    const request = ++this.currentRequest
    let textures: Texture[]
    try {
      textures = await this.textureLoader.loadActionTextures(actionName)
    } catch (error) {
      this.textureLoader.releaseActionTextures(actionName)
      throw error
    }
    if (request !== this.currentRequest) {
      this.textureLoader.releaseActionTextures(actionName)
      return
    }

    const next = new AnimatedSprite(textures)
    const playback = definition.playback ?? {}
    next.x = playback.x ?? 0
    next.y = playback.y ?? 0
    next.alpha = playback.alpha ?? 1
    next.animationSpeed = playback.animationSpeed ?? 0.35
    next.loop = actionName !== 'fc_ticket'
    if (typeof playback.scale === 'number') {
      next.scale.set(playback.scale)
    } else if (playback.scale) {
      next.scale.set(playback.scale.x, playback.scale.y)
    }
    next.play()
    this.container.addChild(next)

    if (this.sprite) {
      this.container.removeChild(this.sprite)
      this.sprite.destroy()
    }
    if (this.currentAction) {
      this.textureLoader.releaseActionTextures(this.currentAction)
    }

    this.sprite = next
    this.currentAction = actionName
  }

  clear(): void {
    this.currentRequest += 1
    if (!this.sprite) {
      return
    }

    this.container.removeChild(this.sprite)
    this.sprite.destroy()
    this.sprite = null
    if (this.currentAction) {
      this.textureLoader.releaseActionTextures(this.currentAction)
      this.currentAction = null
    }
  }

  destroy(): void {
    this.clear()
    this.container.destroy({ children: true })
  }
}

export function createWorkstationFactory({
  spriteFactory,
  textureLoader,
  textures,
  actorLayer,
  feedbackLayer,
  classroomTextures,
}: WorkstationFactoryOptions) {
  const personFactory = createPersonFactory({ textureLoader })
  const useClassroomFurniture = process.env.NEXT_PUBLIC_AGENT_ART !== 'legacy'

  function getClassroomDeskY(role: AgentRoleProfile): number {
    if (role.deskPosition.y < 150) return 128
    if (role.deskPosition.y < 500) return 389
    return 650
  }

  function createDeskGroup(role: AgentRoleProfile): { desk: Container; chair: Container } {
    const deskY = useClassroomFurniture ? getClassroomDeskY(role) : role.deskPosition.y
    const desk = new Container({ x: role.deskPosition.x, y: deskY })
    const chair = new Container({ x: role.deskPosition.x, y: deskY })

    if (useClassroomFurniture) {
      const deskShadow = new Graphics()
        .ellipse(0, 94, 112, 18)
        .fill({ color: 0x6f7c84, alpha: 0.1 })
      const deskSprite = new Sprite(classroomTextures.desk)
      deskSprite.anchor.set(0.5)
      deskSprite.scale.set(0.2)
      const chairSprite = new Sprite(classroomTextures.chair)
      chairSprite.anchor.set(0.5)
      chairSprite.position.set(0, 24)
      chairSprite.scale.set(0.1)

      desk.addChild(deskShadow, deskSprite)
      chair.addChild(chairSprite)
      return { desk, chair }
    }

    const isBoss = role.deskVariant === 'boss'
    const scale = 0.3

    desk.addChild(
      spriteFactory.createSprite(textures, {
        name: isBoss ? 'shadow_boss.png' : 'shadow.png',
        x: -216,
        y: isBoss ? 256 : 181,
        scale: 1,
        alpha: isBoss ? 0.8 : 0.72,
      }),
      spriteFactory.createSprite(textures, {
        name: isBoss ? 'desk_boss.png' : 'desk.png',
        x: 0,
        y: 0,
        scale: 1,
      }),
    )
    chair.addChild(
      spriteFactory.createSprite(textures, {
        name: isBoss ? 'chair_boss.png' : 'chair.png',
        x: isBoss ? 187 : 197,
        y: isBoss ? 257 : 187,
        scale: 1,
      }),
    )
    if (isBoss) {
      desk.addChild(
        spriteFactory.createSprite(textures, {
          name: 'screen.png',
          x: 184,
          y: -18,
          scale: 1,
        }),
      )
    }
    desk.addChild(
      spriteFactory.createSprite(textures, {
        name: isBoss ? 'screen_on.png' : 'screen.png',
        x: isBoss ? 190.8 : 184,
        y: isBoss ? -10.4 : -95,
        scale: 1,
      }),
    )
    desk.scale.set(scale)
    chair.scale.set(scale)
    return { desk, chair }
  }

  async function createWorkstation(roleProfile: AgentRoleProfile): Promise<WorkstationController> {
    const { desk, chair } = createDeskGroup(roleProfile)
    const person = await personFactory.createPerson(roleProfile)
    if (useClassroomFurniture) {
      const currentAnchor = person.getVisualAnchorPosition('bottomCenter')
      const seatedAnchor = {
        x: roleProfile.deskPosition.x,
        y: getClassroomDeskY(roleProfile) + 30,
      }
      person.container.x += seatedAnchor.x - currentAnchor.x
      person.container.y += seatedAnchor.y - currentAnchor.y
    }
    const seatAnchor = person.getVisualAnchorPosition('bottomCenter')
    const seatExitAnchor = useClassroomFurniture
      ? { x: classroomNavigationLaneXForSeat(seatAnchor.x), y: seatAnchor.y }
      : seatAnchor
    // Conversation is a distinct scene pose, not a navigation waiting point.
    // Keeping the visitor's feet close to the seated partner's authored
    // baseline makes their faces meet, while the x offset leaves the desk clear.
    const conversationAnchor = useClassroomFurniture
      ? { x: seatExitAnchor.x, y: seatAnchor.y + 14 }
      : seatAnchor
    const screen = new AnimatedLayer(
      textureLoader,
      'screen',
      roleProfile.position.x + roleScreenPositions.x,
      roleProfile.position.y + roleScreenPositions.y,
      roleScreenPositions.scale,
    )
    screen.container.visible = !useClassroomFurniture
    const effect = new AnimatedLayer(
      textureLoader,
      'effect',
      roleProfile.position.x,
      roleProfile.position.y,
      roleScreenPositions.scale,
    )
    const container = new Container()
    let disposed = false
    // Sprite frames use different canvas bounds, so labels must follow the
    // person's measured visual anchor instead of the nominal role position.
    const feedback = new Container()
    const accent = roleAccentNumber(roleProfile.accent)
    // The compact identity plaque is only shown for an explicitly selected
    // companion. During speech the bubble header becomes the sole identity,
    // avoiding the duplicated oversized card seen behind the desks.
    const infoPanel = new Graphics()
      .roundRect(-101, 8, 208, 66, 16)
      .fill({ color: 0x24343b, alpha: 0.08 })
      .roundRect(-104, 4, 208, 66, 16)
      .fill({ color: 0xfffdf9, alpha: 0.96 })
      .stroke({ color: accent, width: 1, alpha: 0.2 })
    const nameLabel = new Text({
      text: roleProfile.name,
      style: {
        fill: '#203238',
        fontFamily: 'Avenir Next, PingFang SC, sans-serif',
        fontSize: 17,
        fontWeight: '700',
      },
      x: -78,
      y: 12,
    })
    const stateLabel = new Text({
      text: '空闲等待',
      style: {
        fill: '#627278',
        fontFamily: 'Avenir Next, PingFang SC, sans-serif',
        fontSize: 10,
        fontWeight: '600',
      },
      x: -78,
      y: 35,
    })
    const taskLabel = new Text({
      text: '',
      style: {
        fill: '#899499',
        fontFamily: 'Avenir Next, PingFang SC, sans-serif',
        fontSize: 9,
      },
      x: -78,
      y: 52,
    })
    // Speech cards open toward the classroom centre. The previous outward
    // placement put right-column speech underneath the stage command card and
    // pushed the top row against the canvas edge.
    const isLeftColumn = roleProfile.deskPosition.x < 700
    const isTopRow = roleProfile.deskPosition.y < 150
    const directionToCentre = isLeftColumn ? 1 : -1
    const messageCenterX = directionToCentre * 252
    const messageWidth = 304
    const messageHeight = 144
    const messageViewportWidth = 264
    const messageViewportHeight = 82
    const messageTextX = messageCenterX - messageViewportWidth / 2
    // The first row has enough clear centre space beside the character; align
    // its card with the upper body instead of dropping it into the next row.
    const messageTop = isTopRow ? -92 : -190
    const messageTextTop = messageTop + 47
    const messageNameLabel = new Text({
      text: roleProfile.name,
      style: {
        fill: roleProfile.accent,
        fontFamily: 'Avenir Next, PingFang SC, sans-serif',
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.3,
      },
      x: messageCenterX - messageWidth / 2 + 18,
      y: messageTop + 12,
    })
    const messageMetaLabel = new Text({
      text: '正在发言',
      style: {
        fill: '#63747a',
        fontFamily: 'Avenir Next, PingFang SC, sans-serif',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.4,
      },
      anchor: { x: 1, y: 0 },
      x: messageCenterX + messageWidth / 2 - 18,
      y: messageTop + 15,
    })
    const messageText = new Text({
      text: '',
      style: {
        fill: '#18252d',
        fontFamily: 'Avenir Next, PingFang SC, sans-serif',
        fontSize: 15,
        breakWords: true,
        wordWrap: true,
        wordWrapWidth: messageViewportWidth,
        lineHeight: 22,
      },
      x: messageTextX,
      y: messageTextTop,
    })
    const messageConnector = new Graphics()
    const messageBubble = new Graphics()
    const messageViewport = new Container()
    const messageScrollbar = new Graphics()
    const messageScrollHint = new Text({
      text: '滚动查看',
      style: {
        fill: '#7b898f',
        fontFamily: 'Avenir Next, PingFang SC, sans-serif',
        fontSize: 9,
        fontWeight: '600',
        letterSpacing: 0.5,
      },
      anchor: { x: 1, y: 0 },
      x: messageCenterX + messageWidth / 2 - 18,
      y: messageTop + messageHeight - 17,
    })
    const messageMask = new Graphics()
      .rect(messageCenterX - messageViewportWidth / 2, messageTextTop, messageViewportWidth, messageViewportHeight)
      .fill({ color: 0xffffff, alpha: 0.001 })
    messageViewport.addChild(messageText)
    messageViewport.mask = messageMask
    const messageLayer = new Container()
    const infoLayer = new Container()
    let currentState: PartnerState | null = null
    let selected = false
    let infoVisible = false
    let awayFromDesk = false
    let conversationActive = false
    let occludingWorkstation: WorkstationController | null = null
    let idleRequest = 0
    let actionTimer: number | null = null
    let messageScrollOffset = 0
    let messageDragY: number | null = null
    const messageBaseY = messageTextTop

    function getMessageScrollLimit(): number {
      return Math.max(0, messageText.height - messageViewportHeight)
    }

    function redrawMessageScrollbar(): void {
      messageScrollbar.clear()
      const limit = getMessageScrollLimit()
      const hasOverflow = limit > 0
      messageScrollHint.visible = hasOverflow
      messageViewport.cursor = hasOverflow ? (messageDragY === null ? 'grab' : 'grabbing') : 'default'
      if (!hasOverflow) return

      const trackX = messageCenterX + messageViewportWidth / 2 + 7
      const thumbHeight = Math.max(18, messageViewportHeight * (messageViewportHeight / messageText.height))
      const thumbTravel = messageViewportHeight - thumbHeight
      const thumbY = messageTextTop + thumbTravel * (messageScrollOffset / limit)
      messageScrollbar
        .roundRect(trackX, messageTextTop, 2, messageViewportHeight, 1)
        .fill({ color: 0x738087, alpha: 0.16 })
        .roundRect(trackX - 1, thumbY, 4, thumbHeight, 2)
        .fill({ color: roleAccentNumber(roleProfile.accent), alpha: 0.58 })
    }

    function setMessageScrollOffset(nextOffset: number): void {
      messageScrollOffset = Math.max(0, Math.min(getMessageScrollLimit(), nextOffset))
      messageText.y = messageBaseY - messageScrollOffset
      redrawMessageScrollbar()
    }

    messageViewport.eventMode = 'static'
    messageViewport.hitArea = new Rectangle(
      messageCenterX - messageViewportWidth / 2,
      messageTextTop,
      messageViewportWidth,
      messageViewportHeight,
    )
    messageViewport.on('wheel', (event: FederatedWheelEvent) => {
      if (getMessageScrollLimit() <= 0) return
      event.stopPropagation()
      setMessageScrollOffset(messageScrollOffset + event.deltaY * 0.55)
    })
    messageViewport.on('pointerdown', (event: FederatedPointerEvent) => {
      if (getMessageScrollLimit() <= 0) return
      event.stopPropagation()
      messageDragY = event.global.y
      redrawMessageScrollbar()
    })
    messageViewport.on('pointermove', (event: FederatedPointerEvent) => {
      if (messageDragY === null) return
      event.stopPropagation()
      const nextY = event.global.y
      setMessageScrollOffset(messageScrollOffset + messageDragY - nextY)
      messageDragY = nextY
    })
    const endMessageDrag = () => {
      messageDragY = null
      redrawMessageScrollbar()
    }
    messageViewport.on('pointerup', endMessageDrag)
    messageViewport.on('pointerupoutside', endMessageDrag)

    function stopIdleActivity(): void {
      idleRequest += 1
      if (actionTimer !== null) {
        window.clearTimeout(actionTimer)
        actionTimer = null
      }
    }

    function startStateActivity(state: PartnerState): void {
      stopIdleActivity()
      const request = idleRequest
      if (currentState !== state || awayFromDesk || conversationActive) return
      const sequence = getStatePresentation(roleProfile.id, state).bodySequence
      let actionIndex = 0

      const playNext = async () => {
        if (
          request !== idleRequest
          || currentState !== state
          || awayFromDesk
          || conversationActive
        ) return
        const action = sequence[actionIndex % sequence.length]
        if (isOwnComputerFacingAction(action)) {
          person.setFacing(getComputerFacingForAgent(roleProfile.id))
        }
        await person.play(action, {
          loop: true,
          preserveVisualAnchor: 'bottomCenter',
        })
        if (request !== idleRequest) return
        syncFeedbackPosition()
        actionIndex += 1
        if (sequence.length <= 1) return
        actionTimer = window.setTimeout(
          () => void playNext(),
          3_200 + ((roleProfile.position.x + roleProfile.position.y + actionIndex * 173) % 900),
        )
      }

      void playNext()
    }

    function syncFeedbackPosition(): void {
      if (disposed) {
        return
      }
      const anchor = person.getVisualAnchorPosition('bottomCenter')
      feedback.position.set(anchor.x, anchor.y)
    }

    function redrawMessage(): void {
      messageConnector.clear()
      messageBubble.clear()
      if (!messageText.text) {
        return
      }

      const left = messageCenterX - messageWidth / 2
      const right = messageCenterX + messageWidth / 2
      const cardEdgeX = directionToCentre > 0 ? left : right
      const speakerOriginX = directionToCentre * 38
      const speakerOriginY = -82
      const cardAttachY = isTopRow ? messageTop + 34 : messageTop + messageHeight - 30
      const firstControlX = directionToCentre * 66
      const secondControlX = cardEdgeX - directionToCentre * 18

      // A halo-backed connector visibly begins at the character's shoulder and
      // curves into the inward-facing card. It remains legible above desks and
      // replaces the detached horizontal wedge used previously.
      messageConnector
        .moveTo(speakerOriginX, speakerOriginY)
        .bezierCurveTo(
          firstControlX,
          speakerOriginY,
          secondControlX,
          cardAttachY,
          cardEdgeX,
          cardAttachY,
        )
        .stroke({ color: 0xffffff, width: 8, alpha: 0.9 })
        .moveTo(speakerOriginX, speakerOriginY)
        .bezierCurveTo(
          firstControlX,
          speakerOriginY,
          secondControlX,
          cardAttachY,
          cardEdgeX,
          cardAttachY,
        )
        .stroke({ color: accent, width: 2.5, alpha: 0.72 })
        .circle(speakerOriginX, speakerOriginY, 7)
        .fill({ color: 0xffffff, alpha: 0.98 })
        .stroke({ color: accent, width: 2, alpha: 0.72 })
        .circle(speakerOriginX, speakerOriginY, 3)
        .fill({ color: accent, alpha: 0.92 })

      messageBubble
        .roundRect(left + 6, messageTop + 9, messageWidth, messageHeight, 22)
        .fill({ color: 0x24343b, alpha: 0.11 })
        .roundRect(left + 2, messageTop + 3, messageWidth, messageHeight, 22)
        .fill({ color: 0x7d9297, alpha: 0.05 })
        .roundRect(left, messageTop, messageWidth, messageHeight, 20)
        .fill({ color: 0xfffefa, alpha: 0.99 })
        .stroke({ color: accent, width: 1, alpha: 0.18 })
        .circle(right - 84, messageTop + 21, 3)
        .fill({ color: accent, alpha: 0.9 })
        .moveTo(left + 18, messageTop + 40)
        .lineTo(right - 18, messageTop + 40)
        .stroke({ color: 0x536970, width: 1, alpha: 0.12 })
    }

    function syncFeedbackVisibility(): void {
      const speechVisible = (
        currentState === 'speaking' || currentState === 'celebrating'
      ) && Boolean(messageText.text)
      const infoVisibleForSelection = selected && infoVisible && !speechVisible
      messageLayer.visible = speechVisible
      infoLayer.visible = infoVisibleForSelection
      feedback.visible = speechVisible || infoVisibleForSelection
    }

    function applyStateVisuals(
      state: PartnerState,
      options: { deferBodyActivity?: boolean } = {},
    ): void {
      const presentation = getStatePresentation(roleProfile.id, state)
      stateLabel.text = `${roleProfile.title} · ${presentation.label}`
      stateLabel.style.fill = '#627278'

      if (awayFromDesk) {
        screen.clear()
        effect.clear()
        // 行走中被发言打断：原地切换到站立发言动作，而不是直接跳过
        // body 动作切换。talking_on_seat 需要坐在座位上，离开座位时
        // 用 talking_on_stand-0 代替。其他状态保持原行为（不切换 body）。
        if (state === 'speaking' && !options.deferBodyActivity) {
          void person.play('talking_on_stand-0', {
            loop: true,
            preserveVisualAnchor: 'bottomCenter',
          }).then(syncFeedbackPosition)
        }
        return
      }

      if (!options.deferBodyActivity) {
        startStateActivity(state)
      }

      if (presentation.screen) {
        void screen.play(presentation.screen)
      } else {
        screen.clear()
      }

      if (state === 'waiting_user') {
        void effect.play('fc_ticket')
      } else {
        effect.clear()
      }
    }

    function setState(
      state: PartnerState,
      options: { deferBodyActivity?: boolean } = {},
    ): void {
      if (state === currentState) {
        return
      }

      currentState = state
      stopIdleActivity()
      applyStateVisuals(state, options)
      syncFeedbackVisibility()
    }

    function refreshStateActivity(): void {
      if (currentState) {
        applyStateVisuals(currentState)
      }
    }

    function setSelected(isSelected: boolean): void {
      selected = isSelected
      syncFeedbackPosition()
      if (!selected) {
        infoVisible = false
      }
      syncFeedbackVisibility()
    }

    function setInfoVisible(visible: boolean): void {
      infoVisible = visible
      syncFeedbackPosition()
      syncFeedbackVisibility()
    }

    function setAway(away: boolean): void {
      if (awayFromDesk === away) {
        return
      }
      awayFromDesk = away
      syncFeedbackVisibility()

      if (away) {
        occludingWorkstation = null
        actorLayer.addChild(person.container)
        feedbackLayer.addChild(feedback)
        syncFeedbackPosition()
        stopIdleActivity()
        screen.clear()
        effect.clear()
        return
      }

      occludingWorkstation = null
      if (useClassroomFurniture) {
        const deskIndex = container.getChildIndex(desk)
        container.addChildAt(person.container, deskIndex)
      } else {
        const chairIndex = container.getChildIndex(chair)
        container.addChildAt(person.container, chairIndex)
      }
      feedbackLayer.addChild(feedback)

      if (currentState) {
        applyStateVisuals(currentState)
      }
    }

    function setOccludedBy(workstation: WorkstationController | null): void {
      if (disposed) {
        return
      }
      if (occludingWorkstation === workstation) {
        return
      }
      occludingWorkstation = workstation

      if (workstation && useClassroomFurniture) {
        const deskIndex = workstation.container.getChildIndex(workstation.desk)
        workstation.container.addChildAt(person.container, deskIndex)
        feedbackLayer.addChild(feedback)
        syncFeedbackPosition()
        return
      }

      if (awayFromDesk) {
        actorLayer.addChild(person.container)
        feedbackLayer.addChild(feedback)
        syncFeedbackPosition()
      }
    }

    function setConversationActive(active: boolean): void {
      if (conversationActive === active) {
        return
      }
      conversationActive = active
      if (active) {
        stopIdleActivity()
        screen.clear()
        return
      }

      if (currentState && !awayFromDesk) {
        startStateActivity(currentState)
      }
    }

    function setMessage(message: string): void {
      const previousText = messageText.text
      // 流式追加检测：新消息以旧消息为前缀，说明是同一次发言的流式更新。
      // 此时不能重置滚动到 0，否则用户手动滑动后会被拉回顶部。
      const isAppending = previousText.length > 0 && message.startsWith(previousText)
      // 记录用户是否停留在底部（用于决定追加后是否跟随到新底部）
      const previousLimit = getMessageScrollLimit()
      const wasAtBottom = previousLimit > 0 && messageScrollOffset >= previousLimit

      messageText.text = message

      if (!isAppending) {
        // 新发言（或完全不同的消息）：重置到顶部
        setMessageScrollOffset(0)
      } else if (wasAtBottom) {
        // 流式追加且用户在底部：跟随到新底部，保持"自动滚到最新"
        setMessageScrollOffset(getMessageScrollLimit())
      } else {
        // 流式追加且用户在中间：保持当前滚动位置，只重绘滚动条
        // messageText.y 已经基于 messageScrollOffset 设置过，无需再改
        redrawMessageScrollbar()
      }
      redrawMessage()
      syncFeedbackVisibility()
    }

    function setTask(task: string): void {
      taskLabel.text = task ? task.slice(0, 18) : ''
    }

    syncFeedbackPosition()
    feedback.visible = false
    if (useClassroomFurniture) {
      container.addChild(chair, person.container, desk, screen.container, effect.container)
    } else {
      container.addChild(desk, screen.container, person.container, chair, effect.container)
    }
    messageLayer.addChild(messageConnector, messageBubble, messageNameLabel, messageMetaLabel, messageScrollHint, messageViewport, messageMask, messageScrollbar)
    infoLayer.addChild(infoPanel, nameLabel, stateLabel, taskLabel)
    feedback.addChild(messageLayer, infoLayer)
    feedbackLayer.addChild(feedback)
    syncFeedbackVisibility()

    // The workstation itself stays passive so the large desk bounds do not
    // swallow hover events intended for the smaller interactive character.
    container.eventMode = 'passive'

    return {
      container,
      desk,
      chair,
      person,
      screen,
      effect,
      roleProfile,
      seatAnchor,
      seatExitAnchor,
      conversationAnchor,
      setState,
      refreshStateActivity,
      setSelected,
      setInfoVisible,
      setConversationActive,
      setAway,
      setOccludedBy,
      setMessage,
      setTask,
      destroy: () => {
        disposed = true
        stopIdleActivity()
        messageDragY = null
        person.destroy()
        screen.clear()
        effect.clear()
        feedback.destroy({ children: true })
        container.destroy({ children: true })
      },
    }
  }

  return { createWorkstation }
}

function roleAccentNumber(accent: string): number {
  return Number.parseInt(accent.replace('#', ''), 16)
}
