import { getRoleActionName, type AgentActionName } from '@/assets/agent'
import type { AgentId, PartnerState } from '@/domain/studio'
import {
  studyZoneForAgent,
  type StudyZoneController,
  type StudyZoneId,
} from './study-zones'
import type { WorkstationController } from './workstation'
import {
  classroomAisleRoute,
  compactNavigationRoute,
  walkingDuration,
  type NavigationPoint,
} from './navigation'

const classroomMainAisleX = 690

type OfficeOrchestratorOptions = {
  random?: () => number
  idleStartDelays?: Partial<Record<AgentId, number>>
}

export type PixiOfficeController = {
  wait: (ms: number) => Promise<void>
  sequence: (...steps: Array<() => Promise<void>>) => Promise<void>
  parallel: (...steps: Array<() => Promise<void>>) => Promise<void>
  destroy: () => void
  setAgentState: (agentId: AgentId, state: PartnerState) => void
  selectAgent: (agentId: AgentId | null) => void
  setAgentMessage: (agentId: AgentId, message: string) => void
  assignTask: (agentId: AgentId, task: string) => void
  completeTask: (agentId: AgentId, result: string) => void
  failTask: (agentId: AgentId, error: string) => void
  goToStudyZone: (agentId: AgentId, zoneId?: StudyZoneId) => Promise<void>
  interactWithStudyZone: (agentId: AgentId, zoneId?: StudyZoneId) => Promise<void>
  returnAgentToDesk: (agentId: AgentId) => Promise<void>
  resetAgent: (agentId: AgentId) => void
  resetAllAgents: () => void
}

export function createOfficeOrchestrator(
  workstations: Record<AgentId, WorkstationController>,
  studyZones: StudyZoneController,
  options: OfficeOrchestratorOptions = {},
): PixiOfficeController {
  const stateByAgent = new Map<AgentId, PartnerState>()
  const motionRequests = new Map<AgentId, number>()
  const currentZoneByAgent = new Map<AgentId, StudyZoneId>()
  const movingAgents = new Set<AgentId>()
  const awayAgents = new Set<AgentId>()
  const engagedAgents = new Set<AgentId>()
  const chatPartnerByAgent = new Map<AgentId, AgentId>()
  const idleRoamTimers = new Map<AgentId, number>()
  const idleRoamWaiters = new Map<AgentId, { timerId: number; resolve: (active: boolean) => void }>()
  const idleRoamRequests = new Map<AgentId, number>()
  const previousIdleActivities = new Map<AgentId, string>()
  const activeIdleActivities = new Set<AgentId>()
  const zoneInteractionTimers = new Map<AgentId, number>()
  const zoneInteractionRequests = new Map<AgentId, number>()

  type IdleActivity =
    | { kind: 'zone'; zoneId: StudyZoneId }
    | { kind: 'chat'; targetAgentId: AgentId }

  const idleActivityMenus: Record<AgentId, readonly IdleActivity[]> = {
    zhizhi: [
      { kind: 'zone', zoneId: 'library' },
      { kind: 'zone', zoneId: 'planning' },
      { kind: 'zone', zoneId: 'archive' },
      { kind: 'chat', targetAgentId: 'wenwen' },
    ],
    wenwen: [
      { kind: 'chat', targetAgentId: 'zhizhi' },
      { kind: 'zone', zoneId: 'library' },
      { kind: 'zone', zoneId: 'planning' },
      { kind: 'zone', zoneId: 'archive' },
    ],
    lingling: [
      { kind: 'chat', targetAgentId: 'cece' },
      { kind: 'zone', zoneId: 'library' },
      { kind: 'zone', zoneId: 'planning' },
      { kind: 'zone', zoneId: 'archive' },
    ],
    cece: [
      { kind: 'chat', targetAgentId: 'lingling' },
      { kind: 'zone', zoneId: 'library' },
      { kind: 'zone', zoneId: 'planning' },
      { kind: 'zone', zoneId: 'archive' },
    ],
    pingping: [
      { kind: 'chat', targetAgentId: 'wenwen' },
      { kind: 'zone', zoneId: 'library' },
      { kind: 'zone', zoneId: 'planning' },
      { kind: 'zone', zoneId: 'archive' },
    ],
    jiji: [
      { kind: 'chat', targetAgentId: 'cece' },
      { kind: 'zone', zoneId: 'library' },
      { kind: 'zone', zoneId: 'planning' },
      { kind: 'zone', zoneId: 'archive' },
    ],
  }

  const idleStartDelays: Record<AgentId, number> = {
    zhizhi: 9_000,
    wenwen: 13_000,
    lingling: 17_000,
    cece: 11_000,
    pingping: 19_000,
    jiji: 15_000,
    ...options.idleStartDelays,
  }

  function nextMotionRequest(agentId: AgentId): number {
    workstations[agentId].person.cancelMovement()
    const request = (motionRequests.get(agentId) ?? 0) + 1
    motionRequests.set(agentId, request)
    return request
  }

  function isCurrentMotion(agentId: AgentId, request: number): boolean {
    return motionRequests.get(agentId) === request
  }

  function nextIdleRandom(agentId: AgentId): number {
    void agentId
    return options.random?.() ?? Math.random()
  }

  function isCurrentIdleRequest(agentId: AgentId, request: number): boolean {
    return stateByAgent.get(agentId) === 'idle'
      && idleRoamRequests.get(agentId) === request
  }

  function isCurrentIdleRoam(agentId: AgentId, request: number): boolean {
    return isCurrentIdleRequest(agentId, request) && !movingAgents.has(agentId)
  }

  function stopIdleRoaming(agentId: AgentId): void {
    idleRoamRequests.set(agentId, (idleRoamRequests.get(agentId) ?? 0) + 1)
    const timerId = idleRoamTimers.get(agentId)
    if (timerId !== undefined) {
      window.clearTimeout(timerId)
      idleRoamTimers.delete(agentId)
    }

    const waiter = idleRoamWaiters.get(agentId)
    if (waiter) {
      window.clearTimeout(waiter.timerId)
      idleRoamWaiters.delete(agentId)
      waiter.resolve(false)
    }
  }

  function waitForIdleRoam(agentId: AgentId, request: number, duration: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timerId = window.setTimeout(() => {
        idleRoamWaiters.delete(agentId)
        resolve(isCurrentIdleRoam(agentId, request))
      }, duration)
      idleRoamWaiters.set(agentId, { timerId, resolve })
    })
  }

  function pickIdleActivity(agentId: AgentId): IdleActivity | null {
    const available = idleActivityMenus[agentId].filter((activity) => (
      activity.kind === 'zone'
        ? studyZones.getOccupant(activity.zoneId) === null
        : engagedAgents.size === 0
    ))
    if (available.length === 0) return null
    const menu = available
    const previousKey = previousIdleActivities.get(agentId)
    const alternatives = menu.filter((activity) => idleActivityKey(activity) !== previousKey)
    const candidates = alternatives.length > 0 ? alternatives : menu
    const activity = candidates[Math.floor(nextIdleRandom(agentId) * candidates.length)]
    previousIdleActivities.set(agentId, idleActivityKey(activity))
    return activity
  }

  function idleActivityKey(activity: IdleActivity): string {
    return activity.kind === 'zone' ? `zone:${activity.zoneId}` : `chat:${activity.targetAgentId}`
  }

  function scheduleIdleRoaming(agentId: AgentId, delay = idleStartDelays[agentId]): void {
    if (
      stateByAgent.get(agentId) !== 'idle'
      || movingAgents.has(agentId)
      || awayAgents.has(agentId)
      || engagedAgents.has(agentId)
      || currentZoneByAgent.has(agentId)
    ) {
      return
    }

    const previousTimerId = idleRoamTimers.get(agentId)
    if (previousTimerId !== undefined) {
      window.clearTimeout(previousTimerId)
    }

    if (!idleRoamRequests.has(agentId)) {
      idleRoamRequests.set(agentId, 0)
    }
    const request = idleRoamRequests.get(agentId) ?? 0
    const timerId = window.setTimeout(() => {
      idleRoamTimers.delete(agentId)
      if (!isCurrentIdleRoam(agentId, request)) {
        return
      }
      void runIdleActivity(agentId, request).catch((error: unknown) => {
        console.error(`Idle activity failed for ${agentId}`, error)
      })
    }, delay + Math.round(nextIdleRandom(agentId) * 2200))
    idleRoamTimers.set(agentId, timerId)
  }

  async function playBody(agentId: AgentId, action: AgentActionName, loop = true): Promise<void> {
    await workstations[agentId].person.play(action, {
      loop,
      preserveVisualAnchor: 'bottomCenter',
    })
  }

  async function walkVisualAnchorTo(agentId: AgentId, x: number, y: number): Promise<void> {
    const person = workstations[agentId].person
    const current = person.getVisualAnchorPosition('bottomCenter')
    const deltaX = x - current.x
    const deltaY = y - current.y
    if (Math.abs(x - current.x) > 8) {
      person.setFacing(x > current.x ? 'right' : 'left')
    }
    const walkAction: AgentActionName = deltaY < -8 && Math.abs(deltaY) > Math.abs(deltaX) * 0.72
      ? 'fc_walking_up'
      : getRoleActionName(agentId, 'walk')
    await person.play(walkAction, {
      loop: true,
      animationSpeed: walkAction === 'fc_walking_up' ? 0.12 : 0.14,
      preserveVisualAnchor: 'bottomCenter',
    })
    await person.moveVisualAnchorTo(x, y, {
      duration: walkingDuration(current, { x, y }),
      anchor: 'bottomCenter',
    })
  }

  async function riseFromDesk(agentId: AgentId, request: number): Promise<boolean> {
    const workstation = workstations[agentId]
    const exitFacing = workstation.seatExitAnchor.x > workstation.seatAnchor.x ? 'right' : 'left'
    workstation.person.setFacing(exitFacing)
    await Promise.all([
      workstation.person.play('off_chair', {
        loop: false,
        animationSpeed: 0.09,
        preserveVisualAnchor: 'bottomCenter',
      }),
      workstation.person.moveVisualAnchorTo(
        workstation.seatExitAnchor.x,
        workstation.seatExitAnchor.y,
        { duration: 980, anchor: 'bottomCenter' },
      ),
    ])
    if (!isCurrentMotion(agentId, request)) return false
    awayAgents.add(agentId)
    workstation.setAway(true)
    await walkVisualAnchorTo(agentId, workstation.homeAnchor.x, workstation.homeAnchor.y)
    if (!isCurrentMotion(agentId, request)) return false
    return true
  }

  async function sitAtDesk(agentId: AgentId, request: number): Promise<boolean> {
    const workstation = workstations[agentId]
    // Move behind the furniture before approaching the chair so the desk keeps
    // its natural foreground occlusion throughout the whole seating motion.
    workstation.setAway(false)
    await walkVisualAnchorTo(
      agentId,
      workstation.seatExitAnchor.x,
      workstation.seatExitAnchor.y,
    )
    if (!isCurrentMotion(agentId, request)) return false
    workstation.person.setFacing(workstation.seatAnchor.x > workstation.seatExitAnchor.x ? 'right' : 'left')

    // Mount the authored sitting strip before calculating the chair tween.
    // Starting both operations together lets the walking sprite's old local
    // anchor leak into the new strip and can send the actor toward a different
    // workstation before it snaps back to its own chair.
    await workstation.person.play('sit_down', {
      loop: true,
      animationSpeed: 0.09,
      preserveVisualAnchor: 'bottomCenter',
    })
    workstation.person.placeVisualAnchorAt(
      workstation.seatExitAnchor.x,
      workstation.seatExitAnchor.y,
    )
    await workstation.person.moveVisualAnchorTo(
      workstation.seatAnchor.x,
      workstation.seatAnchor.y,
      { duration: 1_040, anchor: 'bottomCenter' },
    )
    if (!isCurrentMotion(agentId, request)) return false

    // Commit the chair anchor after the transition. The off-chair and seated
    // strips have different frame bounds, so the tween endpoint alone is not
    // a reliable final resting position.
    workstation.person.placeVisualAnchorAt(
      workstation.seatAnchor.x,
      workstation.seatAnchor.y,
    )
    await workstation.person.play('working', {
      loop: true,
      preserveVisualAnchor: 'bottomCenter',
    })
    workstation.person.placeVisualAnchorAt(
      workstation.seatAnchor.x,
      workstation.seatAnchor.y,
    )
    return isCurrentMotion(agentId, request)
  }

  async function walkRoute(
    agentId: AgentId,
    request: number,
    points: readonly NavigationPoint[],
  ): Promise<boolean> {
    const person = workstations[agentId].person
    const route = compactNavigationRoute(
      person.getVisualAnchorPosition('bottomCenter'),
      points,
    )
    if (route.length === 0) {
      return isCurrentMotion(agentId, request)
    }

    for (const point of route) {
      await walkVisualAnchorTo(agentId, point.x, point.y)
      if (!isCurrentMotion(agentId, request)) return false
    }
    return true
  }

  function stopZoneInteraction(agentId: AgentId): void {
    zoneInteractionRequests.set(agentId, (zoneInteractionRequests.get(agentId) ?? 0) + 1)
    const timerId = zoneInteractionTimers.get(agentId)
    if (timerId !== undefined) {
      window.clearTimeout(timerId)
      zoneInteractionTimers.delete(agentId)
    }
  }

  function isCurrentZoneInteraction(
    agentId: AgentId,
    zoneId: StudyZoneId,
    request: number,
  ): boolean {
    return zoneInteractionRequests.get(agentId) === request
      && currentZoneByAgent.get(agentId) === zoneId
  }

  async function startZoneInteraction(agentId: AgentId, zoneId: StudyZoneId): Promise<void> {
    stopZoneInteraction(agentId)
    const request = zoneInteractionRequests.get(agentId) ?? 0
    const definition = studyZones.getDefinition(zoneId)
    const actions = definition.interactionActions
    let actionIndex = 0

    const playNext = async (): Promise<void> => {
      if (!isCurrentZoneInteraction(agentId, zoneId, request)) {
        return
      }

      const person = workstations[agentId].person
      person.setFacing(definition.facing)
      await person.play(actions[actionIndex % actions.length], {
        loop: true,
        reverse: actions.length > 1 && actionIndex % 2 === 1,
        preserveVisualAnchor: 'bottomCenter',
      })
      // Interaction strips may have different transparent canvas margins. Keep
      // their world-space feet fixed on the authored interaction point.
      person.placeVisualAnchorAt(
        definition.interactionPoint.x,
        definition.interactionPoint.y,
      )
      actionIndex += 1
      if (!isCurrentZoneInteraction(agentId, zoneId, request)) {
        return
      }

      // A single action is already looping in Pixi. Re-mounting it on a timer
      // caused the archive-reading pose to visibly reset and jump every cycle.
      if (actions.length === 1) {
        return
      }

      const timerId = window.setTimeout(() => {
        zoneInteractionTimers.delete(agentId)
        void playNext().catch((error: unknown) => {
          console.error(`Zone interaction failed for ${agentId}`, error)
          stopZoneInteraction(agentId)
        })
      }, 1700 + Math.round(nextIdleRandom(agentId) * 650))
      zoneInteractionTimers.set(agentId, timerId)
    }

    await playNext()
  }

  function findChatTarget(agentId: AgentId, preferredTarget?: AgentId): AgentId | null {
    if (engagedAgents.size > 0) {
      return null
    }
    const candidates = Object.keys(workstations).filter((candidateId) => {
      const targetId = candidateId as AgentId
      return targetId !== agentId
        && stateByAgent.get(targetId) === 'idle'
        && !movingAgents.has(targetId)
        && !awayAgents.has(targetId)
        && !engagedAgents.has(targetId)
        && !activeIdleActivities.has(targetId)
        && !currentZoneByAgent.has(targetId)
    }) as AgentId[]

    if (candidates.length === 0) {
      return null
    }

    if (preferredTarget && candidates.includes(preferredTarget)) {
      return preferredTarget
    }

    return candidates[Math.floor(nextIdleRandom(agentId) * candidates.length)]
  }

  function beginConversation(agentId: AgentId, targetAgentId: AgentId): boolean {
    if (engagedAgents.size > 0 || engagedAgents.has(agentId) || engagedAgents.has(targetAgentId)) {
      return false
    }

    engagedAgents.add(agentId)
    engagedAgents.add(targetAgentId)
    chatPartnerByAgent.set(agentId, targetAgentId)
    chatPartnerByAgent.set(targetAgentId, agentId)
    stopIdleRoaming(targetAgentId)
    workstations[agentId].setConversationActive(true)
    workstations[targetAgentId].setConversationActive(true)
    return true
  }

  function endConversation(agentId: AgentId): void {
    const targetAgentId = chatPartnerByAgent.get(agentId)
    if (!targetAgentId) {
      return
    }

    chatPartnerByAgent.delete(agentId)
    chatPartnerByAgent.delete(targetAgentId)
    engagedAgents.delete(agentId)
    engagedAgents.delete(targetAgentId)
    const target = workstations[targetAgentId]
    workstations[agentId].setConversationActive(false)
    target.person.setFacing('left')
    target.setConversationActive(false)
    if (stateByAgent.get(targetAgentId) === 'idle') {
      scheduleIdleRoaming(targetAgentId, 14_000 + Math.round(nextIdleRandom(targetAgentId) * 8_000))
    }
  }

  async function moveToChatPartner(
    agentId: AgentId,
    targetAgentId: AgentId,
    idleRequest: number,
  ): Promise<void> {
    if (!beginConversation(agentId, targetAgentId)) {
      return
    }
    stopZoneInteraction(agentId)
    const workstation = workstations[agentId]
    const target = workstations[targetAgentId]
    const targetExitDirection = target.homeAnchor.x > target.seatAnchor.x ? 1 : -1
    const chatPoint = { ...target.homeAnchor }
    const request = nextMotionRequest(agentId)

    movingAgents.add(agentId)
    workstation.person.setPosture('normal')

    try {
      if (!await riseFromDesk(agentId, request)) return
      const route = classroomAisleRoute(
        workstation.person.getVisualAnchorPosition('bottomCenter'),
        chatPoint,
        classroomMainAisleX,
      )
      if (!await walkRoute(agentId, request, route)) return
      if (!isCurrentIdleRequest(agentId, idleRequest)) return

      workstation.person.setFacing(targetExitDirection > 0 ? 'left' : 'right')
      target.person.setFacing(targetExitDirection > 0 ? 'right' : 'left')
      await Promise.all([
        target.person.play('talking_on_seat', {
          loop: true,
          preserveVisualAnchor: 'bottomCenter',
        }),
        playBody(agentId, 'talking_on_stand-0'),
      ])
    } finally {
      if (isCurrentMotion(agentId, request)) {
        movingAgents.delete(agentId)
      }
    }
  }

  async function runIdleActivity(agentId: AgentId, idleRequest: number): Promise<void> {
    if (!isCurrentIdleRoam(agentId, idleRequest)) {
      return
    }

    activeIdleActivities.add(agentId)
    const activity = pickIdleActivity(agentId)
    try {
      if (!activity) {
        return
      }
      if (activity.kind === 'zone') {
        await goToStudyZone(agentId, activity.zoneId)
        if (isCurrentIdleRoam(agentId, idleRequest) && currentZoneByAgent.get(agentId) === activity.zoneId) {
          const canContinue = await waitForIdleRoam(agentId, idleRequest, 8_000 + Math.round(nextIdleRandom(agentId) * 4_000))
          if (canContinue) {
            await returnAgentToDesk(agentId)
          }
        }
      } else {
        const targetAgentId = findChatTarget(agentId, activity.targetAgentId)
        if (targetAgentId) {
          await moveToChatPartner(agentId, targetAgentId, idleRequest)
          if (isCurrentIdleRoam(agentId, idleRequest)) {
            const canContinue = await waitForIdleRoam(agentId, idleRequest, 6_500 + Math.round(nextIdleRandom(agentId) * 2_500))
            if (canContinue) {
              endConversation(agentId)
              await returnAgentToDesk(agentId)
            }
          }
        }
      }
    } finally {
      endConversation(agentId)
      activeIdleActivities.delete(agentId)
      if (
        stateByAgent.get(agentId) === 'idle'
        && !movingAgents.has(agentId)
        && !awayAgents.has(agentId)
        && !currentZoneByAgent.has(agentId)
      ) {
        scheduleIdleRoaming(agentId, 14_000 + Math.round(nextIdleRandom(agentId) * 8_000))
      }
    }
  }

  async function goToStudyZone(agentId: AgentId, requestedZone?: StudyZoneId): Promise<void> {
    const workstation = workstations[agentId]
    const zoneId = requestedZone ?? studyZoneForAgent[agentId]
    const definition = studyZones.getDefinition(zoneId)
    const request = nextMotionRequest(agentId)
    const previousZone = currentZoneByAgent.get(agentId)
    stopZoneInteraction(agentId)

    if (previousZone !== zoneId && !studyZones.tryOccupy(zoneId, agentId)) {
      return
    }

    if (previousZone === zoneId) {
      studyZones.tryOccupy(zoneId, agentId)
    }

    if (previousZone && previousZone !== zoneId) {
      studyZones.setAgentActive(previousZone, agentId, false)
      currentZoneByAgent.delete(agentId)
    }

    if (previousZone === zoneId && !movingAgents.has(agentId)) {
      workstation.person.setPosture(definition.posture)
      await startZoneInteraction(agentId, zoneId)
      return
    }

    movingAgents.add(agentId)
    workstation.person.setPosture('normal')

    try {
      if (!awayAgents.has(agentId) && !await riseFromDesk(agentId, request)) return
      const current = workstation.person.getVisualAnchorPosition('bottomCenter')
      const route = [
        ...classroomAisleRoute(current, definition.approachPoint, classroomMainAisleX),
        definition.interactionPoint,
      ]
      if (!await walkRoute(agentId, request, route)) return

      currentZoneByAgent.set(agentId, zoneId)
      studyZones.setAgentActive(zoneId, agentId, true)
      workstation.person.setPosture(definition.posture)
      workstation.person.setFacing(definition.facing)
      await startZoneInteraction(agentId, zoneId)
    } finally {
      if (isCurrentMotion(agentId, request)) {
        movingAgents.delete(agentId)
      }
      if (currentZoneByAgent.get(agentId) !== zoneId && studyZones.getOccupant(zoneId) === agentId) {
        studyZones.setAgentActive(zoneId, agentId, false)
      }
    }
  }

  async function interactWithStudyZone(agentId: AgentId, requestedZone?: StudyZoneId): Promise<void> {
    stopIdleRoaming(agentId)
    const zoneId = requestedZone ?? studyZoneForAgent[agentId]
    await goToStudyZone(agentId, zoneId)
    if (currentZoneByAgent.get(agentId) !== zoneId) {
      return
    }

  }

  async function returnAgentToDesk(agentId: AgentId): Promise<void> {
    const workstation = workstations[agentId]
    const request = nextMotionRequest(agentId)
    const previousZone = currentZoneByAgent.get(agentId)
    const previousZoneDefinition = previousZone
      ? studyZones.getDefinition(previousZone)
      : null
    const wasAway = awayAgents.has(agentId) || Boolean(previousZone) || movingAgents.has(agentId)
    stopZoneInteraction(agentId)

    if (previousZone) {
      studyZones.setAgentActive(previousZone, agentId, false)
      currentZoneByAgent.delete(agentId)
    }

    if (!wasAway) {
      workstation.person.setPosture('normal')
      workstation.person.setFacing('left')
      awayAgents.delete(agentId)
      workstation.setAway(false)
      if (stateByAgent.get(agentId) === 'idle') {
        scheduleIdleRoaming(agentId)
      }
      return
    }

    movingAgents.add(agentId)
    try {
      workstation.person.setPosture('normal')
      const route = previousZoneDefinition
        ? [
            previousZoneDefinition.approachPoint,
            ...classroomAisleRoute(
              previousZoneDefinition.approachPoint,
              workstation.homeAnchor,
              classroomMainAisleX,
            ),
          ]
        : [workstation.homeAnchor]
      if (!await walkRoute(agentId, request, route)) return

      workstation.person.setFacing('left')
      if (!await sitAtDesk(agentId, request)) return
      awayAgents.delete(agentId)
      workstation.setAway(false)
    } finally {
      if (isCurrentMotion(agentId, request)) {
        movingAgents.delete(agentId)
        if (stateByAgent.get(agentId) === 'idle') {
          scheduleIdleRoaming(agentId)
        }
      }
    }
  }

  function setAgentState(agentId: AgentId, state: PartnerState): void {
    const previousState = stateByAgent.get(agentId)
    const wasAwayFromDesk = awayAgents.has(agentId)
      || currentZoneByAgent.has(agentId)
      || movingAgents.has(agentId)
    stateByAgent.set(agentId, state)
    if (state !== 'idle') {
      stopIdleRoaming(agentId)
      if (engagedAgents.has(agentId)) {
        endConversation(agentId)
      }
    }

    // 行走中被发言打断：立即取消行走 tween，原地停下。
    // nextMotionRequest 会调用 person.cancelMovement() 让进行中的
    // walkRoute 立即退出（isCurrentMotion 返回 false）。但
    // returnAgentToDesk 的 finally 块因为 isCurrentMotion 为 false
    // 不会清理 movingAgents，所以这里手动删除。发言结束后由下方
    // idle/completed/error 分支的 returnAgentToDesk 处理回座。
    if (state === 'speaking' && movingAgents.has(agentId)) {
      nextMotionRequest(agentId)
      movingAgents.delete(agentId)
    }

    workstations[agentId].setState(state)

    if (previousState === state) {
      return
    }

    // speaking 时不触发返回座位 —— 让 agent 原地站着发言。
    // 发言结束（state 变 idle/completed/error）时下方分支会处理回座。
    if (previousState === 'idle' && wasAwayFromDesk && state !== 'speaking') {
      void returnAgentToDesk(agentId)
    }

    if (state === 'working') {
      const currentZone = currentZoneByAgent.get(agentId)
      if (currentZone) {
        void startZoneInteraction(agentId, currentZone)
      }
      return
    }

    const currentZone = currentZoneByAgent.get(agentId)
    if ((state === 'speaking' || state === 'waiting_user') && currentZone) {
      void startZoneInteraction(agentId, currentZone)
      return
    }

    if (state === 'idle' || state === 'completed' || state === 'error') {
      void returnAgentToDesk(agentId)
    }

    if (
      state === 'idle'
      && !awayAgents.has(agentId)
      && !currentZoneByAgent.has(agentId)
      && !movingAgents.has(agentId)
    ) {
      scheduleIdleRoaming(agentId)
    }
  }

  function resetAgent(agentId: AgentId): void {
    stopIdleRoaming(agentId)
    const previousState = stateByAgent.get(agentId)
    setAgentState(agentId, 'idle')
    if (previousState === 'idle') {
      void returnAgentToDesk(agentId)
    }
    workstations[agentId].setTask('')
    workstations[agentId].setMessage('')
    workstations[agentId].setSelected(false)
  }

  return {
    wait: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
    sequence: async (...steps) => {
      for (const step of steps) {
        await step()
      }
    },
    parallel: async (...steps) => {
      await Promise.all(steps.map((step) => step()))
    },
    destroy: () => {
      Object.keys(workstations).forEach((agentId) => {
        stopIdleRoaming(agentId as AgentId)
        stopZoneInteraction(agentId as AgentId)
        nextMotionRequest(agentId as AgentId)
      })
      idleRoamTimers.clear()
      idleRoamWaiters.clear()
      zoneInteractionTimers.clear()
      zoneInteractionRequests.clear()
      activeIdleActivities.clear()
      awayAgents.clear()
      engagedAgents.clear()
      chatPartnerByAgent.clear()
      previousIdleActivities.clear()
    },
    setAgentState,
    selectAgent: (agentId) => {
      Object.entries(workstations).forEach(([id, workstation]) => {
        workstation.setSelected(id === agentId)
      })
    },
    setAgentMessage: (agentId, message) => workstations[agentId].setMessage(message),
    assignTask: (agentId, task) => workstations[agentId].setTask(task),
    completeTask: (agentId, result) => {
      workstations[agentId].setTask('已完成 · 结果已回收')
      workstations[agentId].setMessage(result)
      setAgentState(agentId, 'completed')
    },
    failTask: (agentId, error) => {
      workstations[agentId].setTask('需要重新拆解')
      workstations[agentId].setMessage(error)
      setAgentState(agentId, 'error')
    },
    goToStudyZone,
    interactWithStudyZone,
    returnAgentToDesk,
    resetAgent,
    resetAllAgents: () => {
      Object.keys(workstations).forEach((agentId) => resetAgent(agentId as AgentId))
    },
  }
}
