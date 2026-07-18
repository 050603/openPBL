import { getRoleActionName, type AgentActionName } from '@/assets/agent'
import type { AgentId, PartnerState } from '@/domain/studio'
import {
  studyZoneForAgent,
  type StudyZoneController,
  type StudyZoneId,
} from './study-zones'
import type { WorkstationController } from './workstation'
import {
  compactNavigationRoute,
  walkingDuration,
  type NavigationPoint,
} from './navigation'

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
    zhizhi: 3200,
    wenwen: 5000,
    lingling: 4100,
    cece: 6100,
    pingping: 7200,
    jiji: 4600,
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
    return Math.random()
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

  function pickIdleActivity(agentId: AgentId): IdleActivity {
    const available = idleActivityMenus[agentId].filter((activity) => (
      activity.kind !== 'zone' || studyZones.getOccupant(activity.zoneId) === null
    ))
    const menu = available.length > 0 ? available : idleActivityMenus[agentId].filter((activity) => activity.kind === 'chat')
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
      if (activeIdleActivities.size >= 2) {
        scheduleIdleRoaming(agentId, 2200 + Math.round(nextIdleRandom(agentId) * 1800))
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
    if (Math.abs(x - current.x) > 8) {
      person.setFacing(x > current.x ? 'right' : 'left')
    }
    await person.moveVisualAnchorTo(x, y, {
      duration: walkingDuration(current, { x, y }),
      anchor: 'bottomCenter',
    })
  }

  async function playWalk(agentId: AgentId): Promise<void> {
    await workstations[agentId].person.play(getRoleActionName(agentId, 'walk'), {
      loop: true,
      animationSpeed: 0.22,
      preserveVisualAnchor: 'bottomCenter',
    })
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

    await playWalk(agentId)
    if (!isCurrentMotion(agentId, request)) return false

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

      workstations[agentId].person.setFacing(definition.facing)
      await workstations[agentId].person.play(actions[actionIndex % actions.length], {
        loop: true,
        reverse: actionIndex % 2 === 1,
        preserveVisualAnchor: 'bottomCenter',
      })
      actionIndex += 1
      if (!isCurrentZoneInteraction(agentId, zoneId, request)) {
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
    if (engagedAgents.has(agentId) || engagedAgents.has(targetAgentId)) {
      return false
    }

    engagedAgents.add(agentId)
    engagedAgents.add(targetAgentId)
    chatPartnerByAgent.set(agentId, targetAgentId)
    chatPartnerByAgent.set(targetAgentId, agentId)
    stopIdleRoaming(targetAgentId)
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
    target.person.setFacing('left')
    target.setConversationActive(false)
    if (stateByAgent.get(targetAgentId) === 'idle') {
      scheduleIdleRoaming(targetAgentId, 3800 + Math.round(nextIdleRandom(targetAgentId) * 2800))
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
    const targetAnchor = target.person.getVisualAnchorPosition('bottomCenter')
    const sourceAnchor = workstation.person.getVisualAnchorPosition('bottomCenter')
    const side = sourceAnchor.x <= targetAnchor.x ? -1 : 1
    const chatPoint = { x: targetAnchor.x + side * 132, y: targetAnchor.y + 4 }
    const request = nextMotionRequest(agentId)

    movingAgents.add(agentId)
    awayAgents.add(agentId)
    workstation.setAway(true)
    workstation.person.setPosture('normal')

    try {
      // A partner conversation is a direct, readable goal. Routing every actor
      // through the left-side study aisle caused the visible step-left/reverse
      // bug when the target was sitting to the right.
      if (!await walkRoute(agentId, request, [chatPoint])) return
      if (!isCurrentIdleRequest(agentId, idleRequest)) return

      workstation.person.setFacing(side < 0 ? 'right' : 'left')
      target.person.setFacing(side < 0 ? 'left' : 'right')
      await target.person.play('talking_on_seat', {
        loop: true,
        preserveVisualAnchor: 'bottomCenter',
      })
      await playBody(agentId, 'talking_on_stand-0')
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
      if (activity.kind === 'zone') {
        await goToStudyZone(agentId, activity.zoneId)
        if (isCurrentIdleRoam(agentId, idleRequest) && currentZoneByAgent.get(agentId) === activity.zoneId) {
          const canContinue = await waitForIdleRoam(agentId, idleRequest, 3200 + Math.round(nextIdleRandom(agentId) * 1800))
          if (canContinue) {
            await returnAgentToDesk(agentId)
          }
        }
      } else {
        const targetAgentId = findChatTarget(agentId, activity.targetAgentId)
        if (targetAgentId) {
          await moveToChatPartner(agentId, targetAgentId, idleRequest)
          if (isCurrentIdleRoam(agentId, idleRequest)) {
            const canContinue = await waitForIdleRoam(agentId, idleRequest, 2800 + Math.round(nextIdleRandom(agentId) * 1600))
            if (canContinue) {
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
        scheduleIdleRoaming(agentId, 4200 + Math.round(nextIdleRandom(agentId) * 3200))
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

    awayAgents.add(agentId)
    workstation.setAway(true)

    if (previousZone === zoneId && !movingAgents.has(agentId)) {
      workstation.person.setPosture(definition.posture)
      await startZoneInteraction(agentId, zoneId)
      return
    }

    movingAgents.add(agentId)
    workstation.person.setPosture('normal')

    try {
      if (!await walkRoute(agentId, request, [
        definition.approachPoint,
        definition.interactionPoint,
      ])) return

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
        ? [previousZoneDefinition.approachPoint, workstation.homeAnchor]
        : [workstation.homeAnchor]
      if (!await walkRoute(agentId, request, route)) return

      workstation.person.setFacing('left')
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
    workstations[agentId].setState(state)

    if (previousState === state) {
      return
    }

    if (previousState === 'idle' && wasAwayFromDesk) {
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
