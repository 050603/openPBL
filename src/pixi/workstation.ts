import { AnimatedSprite, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js'
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js'
import type { AgentActionName } from '@/assets/agent'
import { getAgentActionDefinition } from '@/assets/agent'
import type { AgentRoleProfile } from '@/assets/agent/roles'
import type { PartnerState } from '@/domain/studio'
import { getStatePresentation, type ScreenActionName } from './status-presentation'
import type { ActionTextureLoader } from './action-textures'
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
  homeAnchor: { x: number; y: number }
  setState: (state: PartnerState) => void
  setSelected: (selected: boolean) => void
  setInfoVisible: (visible: boolean) => void
  setConversationActive: (active: boolean) => void
  setAway: (away: boolean) => void
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
    const exitDirection = roleProfile.deskPosition.x < 700 ? 1 : -1
    const seatExitAnchor = useClassroomFurniture
      ? { x: seatAnchor.x + exitDirection * 138, y: seatAnchor.y }
      : seatAnchor
    const homeAnchor = useClassroomFurniture
      ? { x: seatExitAnchor.x, y: seatExitAnchor.y + 76 }
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
    // Sprite frames use different canvas bounds, so labels must follow the
    // person's measured visual anchor instead of the nominal role position.
    const feedback = new Container()
    // 角色提示框：圆角暖白背景，去掉原来的左侧竖条装饰。
    // 角色色彩改由 nameLabel 的彩色文字体现，更柔和也更符合场景风格。
    const infoPanel = new Graphics()
      .roundRect(-104, 2, 208, 72, 12)
      .fill({ color: 0xfffdf9, alpha: 0.85 })
    const nameLabel = new Text({
      text: roleProfile.name,
      style: {
        fill: roleProfile.accent,
        fontFamily: 'Avenir Next, PingFang SC, sans-serif',
        fontSize: 22,
        fontWeight: '700',
      },
      anchor: 0.5,
      x: 0,
      y: 14,
    })
    const stateLabel = new Text({
      text: '空闲等待',
      style: {
        fill: '#53636a',
        fontFamily: 'Avenir Next, PingFang SC, sans-serif',
        fontSize: 14,
        fontWeight: '600',
      },
      anchor: 0.5,
      x: 0,
      y: 38,
    })
    const taskLabel = new Text({
      text: '',
      style: {
        fill: '#53636a',
        fontFamily: 'Avenir Next, PingFang SC, sans-serif',
        fontSize: 12,
        wordWrap: true,
        wordWrapWidth: 144,
        align: 'center',
      },
      anchor: 0.5,
      x: 0,
      y: 59,
    })
    const messageCenterX = roleProfile.deskPosition.x < 700 ? -220 : 220
    const messageWidth = 256
    const messageHeight = 124
    const messageViewportWidth = 222
    const messageViewportHeight = 78
    const messageTextX = messageCenterX - messageViewportWidth / 2
    const messageTop = -166
    const messageTextTop = messageTop + 35
    const messageNameLabel = new Text({
      text: roleProfile.name,
      style: {
        fill: '#ffffff',
        fontFamily: 'Avenir Next, PingFang SC, sans-serif',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
      },
      x: messageCenterX - messageViewportWidth / 2,
      y: messageTop + 11,
    })
    const messageText = new Text({
      text: '',
      style: {
        fill: '#18252d',
        fontFamily: 'Avenir Next, PingFang SC, sans-serif',
        fontSize: 14,
        breakWords: true,
        wordWrap: true,
        wordWrapWidth: messageViewportWidth,
        lineHeight: 20,
      },
      x: messageTextX,
      y: messageTextTop,
    })
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
      x: messageCenterX + messageViewportWidth / 2,
      y: messageTop + 12,
    })
    const messageMask = new Graphics()
      .rect(messageCenterX - messageViewportWidth / 2, messageTextTop, messageViewportWidth, messageViewportHeight)
      .fill({ color: 0xffffff, alpha: 0.001 })
    messageViewport.addChild(messageText)
    messageViewport.mask = messageMask
    let currentState: PartnerState | null = null
    let selected = false
    let infoVisible = false
    let awayFromDesk = false
    let conversationActive = false
    let idleRequest = 0
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
    }

    function startIdleActivity(): void {
      stopIdleActivity()
      const request = idleRequest
      if (currentState !== 'idle' || awayFromDesk || conversationActive) return
      void person.play('working', {
        loop: true,
        preserveVisualAnchor: 'bottomCenter',
      }).then(() => {
        if (request === idleRequest) syncFeedbackPosition()
      })
    }

    function syncFeedbackPosition(): void {
      const anchor = person.getVisualAnchorPosition('bottomCenter')
      feedback.position.set(anchor.x, anchor.y)
    }

    function redrawMessage(): void {
      messageBubble.clear()
      if (!messageText.text) {
        return
      }

      const left = messageCenterX - messageWidth / 2
      const right = messageCenterX + messageWidth / 2
      const tailEdge = messageCenterX < 0 ? right : left
      const tailTip = messageCenterX < 0 ? -68 : 68
      // 角色名药丸：测量文字宽度后画一个彩色圆角背景，白色文字浮在上面。
      // 替代原来气泡左侧的彩色竖条装饰，更柔和也更符合场景风格。
      const namePillPadX = 9
      const namePillWidth = messageNameLabel.width + namePillPadX * 2
      const namePillHeight = 20
      const namePillX = messageNameLabel.x - namePillPadX
      const namePillY = messageTop + 7
      messageBubble
        .roundRect(left + 3, messageTop + 5, messageWidth, messageHeight, 16)
        .fill({ color: 0x24343b, alpha: 0.08 })
        .roundRect(left, messageTop, messageWidth, messageHeight, 16)
        .fill({ color: 0xfffdf9, alpha: 0.97 })
        .roundRect(namePillX, namePillY, namePillWidth, namePillHeight, 10)
        .fill({ color: roleAccentNumber(roleProfile.accent), alpha: 0.92 })
        .moveTo(tailEdge, messageTop + messageHeight - 47)
        .lineTo(tailTip, messageTop + messageHeight - 30)
        .lineTo(tailEdge, messageTop + messageHeight - 17)
        .fill({ color: 0xfffdf9, alpha: 0.97 })
    }

    function applyStateVisuals(state: PartnerState): void {
      const presentation = getStatePresentation(roleProfile.id, state)
      stateLabel.text = `${roleProfile.title} · ${presentation.label}`
      stateLabel.style.fill = `#${presentation.tone.toString(16).padStart(6, '0')}`

      if (awayFromDesk) {
        screen.clear()
        effect.clear()
        // 行走中被发言打断：原地切换到站立发言动作，而不是直接跳过
        // body 动作切换。talking_on_seat 需要坐在座位上，离开座位时
        // 用 talking_on_stand-0 代替。其他状态保持原行为（不切换 body）。
        if (state === 'speaking') {
          void person.play('talking_on_stand-0', {
            loop: true,
            preserveVisualAnchor: 'bottomCenter',
          }).then(syncFeedbackPosition)
        }
        return
      }

      void person.play(presentation.body, {
        loop: state !== 'completed' && state !== 'celebrating',
        preserveVisualAnchor: 'bottomCenter',
      }).then(syncFeedbackPosition)

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

    function setState(state: PartnerState): void {
      if (state === currentState) {
        return
      }

      currentState = state
      stopIdleActivity()
      applyStateVisuals(state)
      feedback.visible = state === 'speaking' || state === 'celebrating' || (selected && infoVisible)
      if (state === 'idle' && !awayFromDesk) {
        startIdleActivity()
      }
    }

    function setSelected(isSelected: boolean): void {
      selected = isSelected
      syncFeedbackPosition()
      if (!selected) {
        infoVisible = false
      }
      feedback.visible = currentState === 'speaking' || currentState === 'celebrating' || (selected && infoVisible)
    }

    function setInfoVisible(visible: boolean): void {
      infoVisible = visible
      syncFeedbackPosition()
      feedback.visible = currentState === 'speaking' || currentState === 'celebrating' || (selected && infoVisible)
    }

    function setAway(away: boolean): void {
      if (awayFromDesk === away) {
        return
      }
      awayFromDesk = away
      feedback.visible = currentState === 'speaking' || currentState === 'celebrating' || (selected && infoVisible)

      if (away) {
        actorLayer.addChild(person.container, feedback)
        syncFeedbackPosition()
        stopIdleActivity()
        screen.clear()
        effect.clear()
        return
      }

      if (useClassroomFurniture) {
        const deskIndex = container.getChildIndex(desk)
        container.addChildAt(person.container, deskIndex)
        const effectIndex = container.getChildIndex(effect.container)
        container.addChildAt(feedback, effectIndex)
      } else {
        let chairIndex = container.getChildIndex(chair)
        container.addChildAt(feedback, chairIndex)
        chairIndex = container.getChildIndex(chair)
        container.addChildAt(person.container, chairIndex)
      }

      if (currentState) {
        applyStateVisuals(currentState)
        if (currentState === 'idle') {
          startIdleActivity()
        }
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

      if (currentState === 'idle' && !awayFromDesk) {
        void person.play('working', {
          loop: true,
          preserveVisualAnchor: 'bottomCenter',
        })
        startIdleActivity()
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
    }

    function setTask(task: string): void {
      taskLabel.text = task ? task.slice(0, 44) : ''
      redrawMessage()
    }

    syncFeedbackPosition()
    feedback.visible = false
    if (useClassroomFurniture) {
      container.addChild(chair, person.container, desk, screen.container, feedback, effect.container)
    } else {
      container.addChild(desk, screen.container, feedback, person.container, chair, effect.container)
    }
    feedback.addChild(messageBubble, messageNameLabel, messageScrollHint, messageViewport, messageMask, messageScrollbar, infoPanel, nameLabel, stateLabel, taskLabel)

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
      homeAnchor,
      setState,
      setSelected,
      setInfoVisible,
      setConversationActive,
      setAway,
      setMessage,
      setTask,
      destroy: () => {
        stopIdleActivity()
        messageDragY = null
        person.destroy()
        screen.clear()
        effect.clear()
        container.destroy({ children: true })
      },
    }
  }

  return { createWorkstation }
}

function roleAccentNumber(accent: string): number {
  return Number.parseInt(accent.replace('#', ''), 16)
}
