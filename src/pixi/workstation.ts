import { AnimatedSprite, Container, Graphics, Rectangle, Text, Texture } from 'pixi.js'
import type { AgentActionName } from '@/assets/agent'
import { getAgentActionDefinition } from '@/assets/agent'
import type { AgentRoleProfile } from '@/assets/agent/roles'
import type { AgentId, PartnerState } from '@/domain/studio'
import { getRoleScreenAction, getStatePresentation, type ScreenActionName } from './status-presentation'
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
}

const roleScreenPositions = {
  x: 0,
  y: 15,
  scale: 0.45,
}

const deskIdleActionCycles: Record<AgentId, readonly AgentActionName[]> = {
  zhizhi: ['sleeping', 'working', 'standby', 'talking_on_seat'],
  wenwen: ['talking_on_seat', 'working', 'sleeping', 'peek', 'standby'],
  lingling: ['peek', 'working', 'standby', 'sleeping', 'talking_on_seat'],
  cece: ['talking_on_seat', 'working', 'standby', 'peek', 'sleeping'],
  pingping: ['sleeping', 'working', 'standby', 'talking_on_seat', 'peek'],
  jiji: ['talking_on_seat', 'working', 'peek', 'sleeping', 'standby'],
}

const deskIdleStartDelays: Record<AgentId, number> = {
  zhizhi: 2800,
  wenwen: 4500,
  lingling: 3600,
  cece: 5600,
  pingping: 6800,
  jiji: 3200,
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
}: WorkstationFactoryOptions) {
  const personFactory = createPersonFactory({ textureLoader })

  function createDeskGroup(role: AgentRoleProfile): { desk: Container; chair: Container } {
    const desk = new Container({ x: role.deskPosition.x, y: role.deskPosition.y })
    const chair = new Container({ x: role.deskPosition.x, y: role.deskPosition.y })
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
    const homeAnchor = person.getVisualAnchorPosition('bottomCenter')
    const screen = new AnimatedLayer(
      textureLoader,
      'screen',
      roleProfile.position.x + roleScreenPositions.x,
      roleProfile.position.y + roleScreenPositions.y,
      roleScreenPositions.scale,
    )
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
    const infoPanel = new Graphics()
      .roundRect(-92, 4, 184, 76, 12)
      .fill({ color: 0xfffdf8, alpha: 0.95 })
      .stroke({ width: 1, color: roleAccentNumber(roleProfile.accent), alpha: 0.36 })
    const nameLabel = new Text({
      text: roleProfile.name,
      style: {
        fill: '#18252d',
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
    const messageCenterX = roleProfile.deskPosition.x < 700 ? -240 : 240
    const messageTextX = messageCenterX - 126
    const messageTop = -180
    const messageTextTop = messageTop + 12
    const messageText = new Text({
      text: '',
      style: {
        fill: '#18252d',
        fontFamily: 'Avenir Next, PingFang SC, sans-serif',
        fontSize: 14,
        breakWords: true,
        wordWrap: true,
        wordWrapWidth: 252,
        lineHeight: 21,
      },
      x: messageTextX,
      y: messageTextTop,
    })
    const messageBubble = new Graphics()
    const messageViewport = new Container()
    const messageMask = new Graphics()
      .rect(messageCenterX - 128, messageTop + 10, 256, 126)
      .fill({ color: 0xffffff, alpha: 0.001 })
    messageViewport.addChild(messageText)
    messageViewport.mask = messageMask
    let currentState: PartnerState | null = null
    let selected = false
    let infoVisible = false
    let awayFromDesk = false
    let conversationActive = false
    let idleTimer: number | null = null
    let idleCycle = 0
    let idleRequest = 0
    let messageScrollFrame: number | null = null
    const messageBaseY = messageTextTop

    function stopMessageScroll(): void {
      if (messageScrollFrame !== null) {
        window.cancelAnimationFrame(messageScrollFrame)
        messageScrollFrame = null
      }
    }

    function startMessageScroll(): void {
      stopMessageScroll()
      const overflow = Math.max(0, messageText.height - 126)
      if (!overflow) return
      const startsAt = performance.now() + 1_200
      const tick = (now: number) => {
        const elapsed = Math.max(0, now - startsAt)
        const offset = Math.min(overflow, elapsed * 0.014)
        messageText.y = messageBaseY - offset
        if (offset < overflow && currentState === 'speaking') {
          messageScrollFrame = window.requestAnimationFrame(tick)
        } else {
          messageScrollFrame = null
        }
      }
      messageScrollFrame = window.requestAnimationFrame(tick)
    }

    function stopIdleActivity(): void {
      idleRequest += 1
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer)
        idleTimer = null
      }
    }

    function startIdleActivity(): void {
      stopIdleActivity()
      const request = idleRequest
      const actions = deskIdleActionCycles[roleProfile.id]

      const scheduleNext = (delay: number): void => {
        if (currentState !== 'idle' || awayFromDesk || conversationActive || request !== idleRequest) {
          return
        }

        idleTimer = window.setTimeout(() => {
          idleTimer = null
          if (currentState !== 'idle' || awayFromDesk || conversationActive || request !== idleRequest) {
            return
          }

          const action = actions[idleCycle % actions.length]
          idleCycle += 1
          void person.play(action, {
            loop: true,
            preserveVisualAnchor: 'bottomCenter',
          }).finally(() => {
            if (currentState !== 'idle' || awayFromDesk || conversationActive || request !== idleRequest) {
              return
            }
            if (action === 'working') {
              void screen.play(getRoleScreenAction(roleProfile.id))
            } else {
              screen.clear()
            }
            scheduleNext(3500 + (idleCycle % 3) * 900 + Math.round(Math.random() * 900))
          })
        }, delay)
      }

      scheduleNext(deskIdleStartDelays[roleProfile.id] + Math.round(Math.random() * 1200))
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

      const width = 282
      const height = 150
      const left = messageCenterX - width / 2
      const right = messageCenterX + width / 2
      const tailEdge = messageCenterX < 0 ? right : left
      const tailTip = messageCenterX < 0 ? -72 : 72
      messageBubble
        .roundRect(left, messageTop, width, height, 14)
        .fill({ color: 0xfffdf8, alpha: 0.96 })
        .stroke({ width: 2, color: roleAccentNumber(roleProfile.accent), alpha: 0.54 })
        .moveTo(tailEdge, -122)
        .lineTo(tailTip, -105)
        .lineTo(tailEdge, -88)
        .fill({ color: 0xfffdf8, alpha: 0.96 })
    }

    function applyStateVisuals(state: PartnerState): void {
      const presentation = getStatePresentation(roleProfile.id, state)
      stateLabel.text = `${roleProfile.title} · ${presentation.label}`
      stateLabel.style.fill = `#${presentation.tone.toString(16).padStart(6, '0')}`

      if (awayFromDesk) {
        screen.clear()
        effect.clear()
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
      if (state === 'speaking') startMessageScroll()
      else stopMessageScroll()
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

      let chairIndex = container.getChildIndex(chair)
      container.addChildAt(feedback, chairIndex)
      chairIndex = container.getChildIndex(chair)
      container.addChildAt(person.container, chairIndex)

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
        void person.play('standby', {
          loop: true,
          preserveVisualAnchor: 'bottomCenter',
        })
        startIdleActivity()
      }
    }

    function setMessage(message: string): void {
      messageText.text = message
      messageText.y = messageBaseY
      redrawMessage()
      if (currentState === 'speaking') startMessageScroll()
    }

    function setTask(task: string): void {
      taskLabel.text = task ? task.slice(0, 44) : ''
      redrawMessage()
    }

    syncFeedbackPosition()
    feedback.visible = false
    container.addChild(desk, screen.container, feedback, person.container, chair, effect.container)
    feedback.addChild(messageBubble, messageViewport, messageMask, infoPanel, nameLabel, stateLabel, taskLabel)

    const bounds = container.getLocalBounds()
    container.eventMode = 'static'
    container.cursor = 'pointer'
    container.hitArea = new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height)

    return {
      container,
      desk,
      chair,
      person,
      screen,
      effect,
      roleProfile,
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
        stopMessageScroll()
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
