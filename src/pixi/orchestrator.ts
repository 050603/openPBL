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
  createNavigationTrafficController,
  deskDepartureWaypoint,
  walkingActionForVector,
  walkingDurationForAction,
  type NavigationTrafficLease,
  type NavigationPoint,
} from './navigation'
import {
  deskAmbientBehaviors,
  deskAmbientDuration,
  eligibleDeskAmbientBehaviors,
  pickWeightedDeskAmbientBehavior,
  type DeskAmbientActionName,
  type DeskAmbientBehavior,
} from './ambient-behavior'

const classroomMainAisleX = 690

type OfficeOrchestratorOptions = {
  random?: () => number
  now?: () => number
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
  setAmbientMotion: (enabled: boolean) => void
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
  const idleActivityBags = new Map<AgentId, Set<string>>()
  const idleSinceByAgent = new Map<AgentId, number>()
  const previousDeskActions = new Map<AgentId, DeskAmbientActionName>()
  const deskAmbientBags = new Map<AgentId, Set<DeskAmbientActionName>>()
  const activeIdleActivities = new Set<AgentId>()
  const noticeableRestAgents = new Set<AgentId>()
  const nappingAgents = new Set<AgentId>()
  const zoneInteractionTimers = new Map<AgentId, number>()
  const zoneInteractionRequests = new Map<AgentId, number>()
  const zoneActionPlayedForVisit = new Map<AgentId, StudyZoneId>()
  const navigationTraffic = createNavigationTrafficController()
  const speechLockedAgents = new Set<AgentId>()
  const speechFinishingAgents = new Set<AgentId>()
  const speechFinishRequests = new Map<AgentId, number>()
  const pendingPostSpeechStates = new Map<AgentId, PartnerState>()
  const pendingPostSpeechMovements = new Map<
    AgentId,
    { kind: 'zone'; zoneId?: StudyZoneId } | { kind: 'return' }
  >()
  let ambientMotionEnabled = true
  let destroyed = false

  type IdleActivity =
    | { kind: 'zone'; zoneId: StudyZoneId }
    | { kind: 'chat'; targetAgentId: AgentId }
    | { kind: 'desk' }

  const idleActivityMenus: Record<AgentId, readonly IdleActivity[]> = {
    zhizhi: [
      { kind: 'desk' },
      { kind: 'zone', zoneId: 'library' },
      { kind: 'zone', zoneId: 'planning' },
      { kind: 'zone', zoneId: 'archive' },
      { kind: 'chat', targetAgentId: 'wenwen' },
    ],
    wenwen: [
      { kind: 'desk' },
      { kind: 'chat', targetAgentId: 'zhizhi' },
      { kind: 'zone', zoneId: 'library' },
      { kind: 'zone', zoneId: 'planning' },
      { kind: 'zone', zoneId: 'archive' },
    ],
    lingling: [
      { kind: 'desk' },
      { kind: 'chat', targetAgentId: 'cece' },
      { kind: 'zone', zoneId: 'library' },
      { kind: 'zone', zoneId: 'planning' },
      { kind: 'zone', zoneId: 'archive' },
    ],
    cece: [
      { kind: 'desk' },
      { kind: 'chat', targetAgentId: 'lingling' },
      { kind: 'zone', zoneId: 'library' },
      { kind: 'zone', zoneId: 'planning' },
      { kind: 'zone', zoneId: 'archive' },
    ],
    pingping: [
      { kind: 'desk' },
      { kind: 'chat', targetAgentId: 'wenwen' },
      { kind: 'zone', zoneId: 'library' },
      { kind: 'zone', zoneId: 'planning' },
      { kind: 'zone', zoneId: 'archive' },
    ],
    jiji: [
      { kind: 'desk' },
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

  function currentTime(): number {
    return options.now?.() ?? Date.now()
  }

  function isAmbientActivityState(state: PartnerState | undefined): boolean {
    return state === 'idle' || state === 'waiting_user' || state === 'completed'
  }

  function isCurrentIdleRequest(agentId: AgentId, request: number): boolean {
    return isAmbientActivityState(stateByAgent.get(agentId))
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
    const menu = idleActivityMenus[agentId]
    const available = menu.filter((activity) => (
      activity.kind === 'zone'
        ? studyZones.getOccupant(activity.zoneId) === null
        : activity.kind === 'chat'
          ? engagedAgents.size === 0
          : eligibleDeskAmbientBehaviors({
              idleMs: currentTime() - (idleSinceByAgent.get(agentId) ?? currentTime()),
              noticeableRestActive: noticeableRestAgents.size > 0,
              previousAction: previousDeskActions.get(agentId) ?? null,
            }).length > 0
    ))
    if (available.length === 0) return null
    const offDeskMenu = menu.filter((activity) => activity.kind !== 'desk')
    let activeBag: Set<string>
    const existingBag = idleActivityBags.get(agentId)
    if (existingBag) {
      activeBag = existingBag
    } else {
      activeBag = new Set(offDeskMenu.map(idleActivityKey))
      idleActivityBags.set(agentId, activeBag)
    }
    let unplayedOffDesk = available.filter(
      (activity) => activity.kind !== 'desk' && activeBag.has(idleActivityKey(activity)),
    )
    const availableOffDesk = available.filter((activity) => activity.kind !== 'desk')
    if (unplayedOffDesk.length === 0 && availableOffDesk.length > 0) {
      const refreshedBag = new Set(offDeskMenu.map(idleActivityKey))
      idleActivityBags.set(agentId, refreshedBag)
      activeBag = refreshedBag
      unplayedOffDesk = availableOffDesk.filter(
        (activity) => refreshedBag.has(idleActivityKey(activity)),
      )
    }
    const previousKey = previousIdleActivities.get(agentId)
    const availableDesk = available.filter((activity) => activity.kind === 'desk')
    const candidates = previousKey && previousKey !== 'desk' && availableDesk.length > 0
      ? availableDesk
      : unplayedOffDesk.length > 0
        ? unplayedOffDesk
        : availableDesk
    if (candidates.length === 0) return null
    const activity = candidates[Math.floor(nextIdleRandom(agentId) * candidates.length)]
    const activityKey = idleActivityKey(activity)
    if (activity.kind !== 'desk') {
      activeBag.delete(activityKey)
    }
    previousIdleActivities.set(agentId, activityKey)
    return activity
  }

  function idleActivityKey(activity: IdleActivity): string {
    if (activity.kind === 'zone') return `zone:${activity.zoneId}`
    if (activity.kind === 'chat') return `chat:${activity.targetAgentId}`
    return 'desk'
  }

  function scheduleIdleRoaming(agentId: AgentId, delay = idleStartDelays[agentId]): void {
    if (
      !ambientMotionEnabled
      ||
      !isAmbientActivityState(stateByAgent.get(agentId))
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

  async function walkVisualAnchorTo(agentId: AgentId, x: number, y: number): Promise<void> {
    const person = workstations[agentId].person
    const current = person.getVisualAnchorPosition('bottomCenter')
    const deltaX = x - current.x
    const deltaY = y - current.y
    if (Math.abs(x - current.x) > 8) {
      person.setFacing(x > current.x ? 'right' : 'left')
    }
    const walkAction = walkingActionForVector(deltaX, deltaY)
    await person.play(walkAction, {
      loop: true,
      preserveVisualAnchor: 'bottomCenter',
    })
    await person.moveVisualAnchorTo(x, y, {
      duration: walkingDurationForAction(current, { x, y }, walkAction),
      anchor: 'bottomCenter',
    })
  }

  async function riseFromDesk(
    agentId: AgentId,
    request: number,
    destination: NavigationPoint,
  ): Promise<boolean> {
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
    const departureWaypoint = deskDepartureWaypoint(
      workstation.seatExitAnchor,
      workstation.homeAnchor,
      destination,
    )
    if (departureWaypoint) {
      await walkVisualAnchorTo(agentId, departureWaypoint.x, departureWaypoint.y)
      if (!isCurrentMotion(agentId, request)) return false
    }
    return true
  }

  async function acquireNavigationTraffic(
    agentId: AgentId,
    request: number,
  ): Promise<NavigationTrafficLease | null> {
    return navigationTraffic.acquire(
      () => !destroyed && isCurrentMotion(agentId, request),
    )
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
    await person.play('turn_arrive', {
      loop: false,
      preserveVisualAnchor: 'bottomCenter',
    })
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
    if (zoneActionPlayedForVisit.get(agentId) === zoneId) {
      return
    }
    stopZoneInteraction(agentId)
    zoneActionPlayedForVisit.set(agentId, zoneId)
    const request = zoneInteractionRequests.get(agentId) ?? 0
    const definition = studyZones.getDefinition(zoneId)
    const actions = definition.interactionActions
    const actionIndex = Math.min(
      actions.length - 1,
      Math.floor(nextIdleRandom(agentId) * actions.length),
    )
    const action = actions[actionIndex]
    const person = workstations[agentId].person
    const actionAnchor = definition.actionAnchor ?? 'bottomCenter'
    const actionAnchorPoint = definition.actionAnchorPoint ?? definition.interactionPoint

    person.setFacing(definition.facing)
    await person.play(action, {
      loop: false,
      restart: true,
      preserveVisualAnchor: 'bottomCenter',
      onMounted: () => {
        if (!isCurrentZoneInteraction(agentId, zoneId, request)) return
        // Props and hands are not stable registration points. Mount the chosen
        // one-shot action once, then pin its authored body anchor for the full
        // cycle so a workbench visit cannot jump or drift.
        person.placeVisualAnchorAt(
          actionAnchorPoint.x,
          actionAnchorPoint.y,
          actionAnchor,
        )
      },
    })
  }

  function findChatTarget(agentId: AgentId, preferredTarget?: AgentId): AgentId | null {
    if (engagedAgents.size > 0) {
      return null
    }
    const candidates = Object.keys(workstations).filter((candidateId) => {
      const targetId = candidateId as AgentId
      return targetId !== agentId
        && isAmbientActivityState(stateByAgent.get(targetId))
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
    return true
  }

  function endConversation(agentId: AgentId): void {
    if (destroyed) {
      return
    }
    const targetAgentId = chatPartnerByAgent.get(agentId)
    if (!targetAgentId) {
      return
    }

    chatPartnerByAgent.delete(agentId)
    chatPartnerByAgent.delete(targetAgentId)
    engagedAgents.delete(agentId)
    engagedAgents.delete(targetAgentId)
    const workstation = workstations[agentId]
    const target = workstations[targetAgentId]
    // Stop both talk cycles in the same synchronous turn. Their next poses may
    // load at different speeds, but neither participant can keep talking after
    // the shared conversation has ended.
    workstation.person.stopBodyAnimation()
    target.person.stopBodyAnimation()
    workstation.setOccludedBy(null)
    target.setOccludedBy(null)
    workstation.setConversationActive(false)
    target.person.setFacing('left')
    target.setConversationActive(false)
    if (isAmbientActivityState(stateByAgent.get(targetAgentId))) {
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
    const chatPoint = { ...target.conversationAnchor }
    const request = nextMotionRequest(agentId)
    let trafficLease: NavigationTrafficLease | null = null

    movingAgents.add(agentId)
    workstation.person.setPosture('normal')

    try {
      trafficLease = await acquireNavigationTraffic(agentId, request)
      if (!trafficLease) return
      if (!await riseFromDesk(agentId, request, chatPoint)) return
      const route = classroomAisleRoute(
        workstation.person.getVisualAnchorPosition('bottomCenter'),
        chatPoint,
        classroomMainAisleX,
      )
      if (!await walkRoute(agentId, request, route)) return
      if (!isCurrentIdleRequest(agentId, idleRequest)) return

      // The standing visitor is on the far side of the target workstation.
      // Mount only its body behind the desk so the monitor naturally occludes
      // part of it while the dialogue bubble remains unobstructed.
      workstation.setOccludedBy(target)
      workstation.person.setFacing(targetExitDirection > 0 ? 'left' : 'right')
      target.person.setFacing(targetExitDirection > 0 ? 'right' : 'left')
      workstation.setConversationActive(true)
      target.setConversationActive(true)
      await Promise.all([
        target.person.play('talking_on_seat', {
          autoplay: false,
          loop: true,
          preserveVisualAnchor: 'bottomCenter',
          restart: true,
        }),
        workstation.person.play('talking_on_stand-0', {
          autoplay: false,
          loop: true,
          preserveVisualAnchor: 'bottomCenter',
          restart: true,
        }),
      ])
      if (
        chatPartnerByAgent.get(agentId) !== targetAgentId
        || !isCurrentIdleRequest(agentId, idleRequest)
      ) return
      // Both sprites are mounted and paused on frame zero before either starts.
      target.person.startBodyAnimation()
      workstation.person.startBodyAnimation()
    } finally {
      trafficLease?.release()
      if (isCurrentMotion(agentId, request)) {
        movingAgents.delete(agentId)
      }
    }
  }

  function pickDeskAmbientBehavior(agentId: AgentId): DeskAmbientBehavior | null {
    const idleSince = idleSinceByAgent.get(agentId) ?? currentTime()
    const eligible = eligibleDeskAmbientBehaviors({
      idleMs: currentTime() - idleSince,
      noticeableRestActive: noticeableRestAgents.size > 0,
      previousAction: previousDeskActions.get(agentId) ?? null,
    })
    if (eligible.length === 0) {
      return null
    }
    let bag = deskAmbientBags.get(agentId)
    if (!bag) {
      bag = new Set(deskAmbientBehaviors.map((behavior) => behavior.action))
      deskAmbientBags.set(agentId, bag)
    }
    const currentBag = bag
    let unplayed = eligible.filter((behavior) => currentBag.has(behavior.action))
    if (unplayed.length === 0) {
      const refreshedBag = new Set(deskAmbientBehaviors.map((behavior) => behavior.action))
      deskAmbientBags.set(agentId, refreshedBag)
      bag = refreshedBag
      unplayed = eligible.filter((behavior) => refreshedBag.has(behavior.action))
    }
    const behavior = pickWeightedDeskAmbientBehavior(
      nextIdleRandom(agentId),
      unplayed,
    )
    if (behavior) {
      bag.delete(behavior.action)
    }
    return behavior
  }

  async function runDeskAmbientActivity(
    agentId: AgentId,
    idleRequest: number,
  ): Promise<void> {
    const behavior = pickDeskAmbientBehavior(agentId)
    if (!behavior || !isCurrentIdleRoam(agentId, idleRequest)) return

    previousDeskActions.set(agentId, behavior.action)
    if (behavior.noticeableRest) {
      noticeableRestAgents.add(agentId)
    }
    if (behavior.action === 'napping') {
      nappingAgents.add(agentId)
    }

    try {
      const person = workstations[agentId].person
      person.setFacing('left')
      await person.play(behavior.action, {
        loop: true,
        preserveVisualAnchor: 'bodyCore',
      })
      const canContinue = await waitForIdleRoam(
        agentId,
        idleRequest,
        deskAmbientDuration(behavior, nextIdleRandom(agentId)),
      )
      if (canContinue) {
        await person.play('working', {
          loop: true,
          preserveVisualAnchor: 'bodyCore',
        })
      }
    } finally {
      noticeableRestAgents.delete(agentId)
      nappingAgents.delete(agentId)
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
      if (activity.kind === 'desk') {
        await runDeskAmbientActivity(agentId, idleRequest)
      } else if (activity.kind === 'zone') {
        await goToStudyZone(agentId, activity.zoneId)
        if (isCurrentIdleRoam(agentId, idleRequest) && currentZoneByAgent.get(agentId) === activity.zoneId) {
          const canContinue = await waitForIdleRoam(
            agentId,
            idleRequest,
            450 + Math.round(nextIdleRandom(agentId) * 350),
          )
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
        !destroyed
        && isAmbientActivityState(stateByAgent.get(agentId))
        && !movingAgents.has(agentId)
        && !awayAgents.has(agentId)
        && !currentZoneByAgent.has(agentId)
      ) {
        scheduleIdleRoaming(agentId, 14_000 + Math.round(nextIdleRandom(agentId) * 8_000))
      }
    }
  }

  async function goToStudyZone(agentId: AgentId, requestedZone?: StudyZoneId): Promise<void> {
    if (speechLockedAgents.has(agentId)) {
      pendingPostSpeechMovements.set(agentId, {
        kind: 'zone',
        zoneId: requestedZone,
      })
      return
    }

    const workstation = workstations[agentId]
    const zoneId = requestedZone ?? studyZoneForAgent[agentId]
    const definition = studyZones.getDefinition(zoneId)
    const request = nextMotionRequest(agentId)
    const previousZone = currentZoneByAgent.get(agentId)
    stopZoneInteraction(agentId)

    if (previousZone !== zoneId && !studyZones.tryOccupy(zoneId, agentId)) {
      return
    }
    if (previousZone !== zoneId) {
      zoneActionPlayedForVisit.delete(agentId)
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
    let trafficLease: NavigationTrafficLease | null = null

    try {
      trafficLease = await acquireNavigationTraffic(agentId, request)
      if (!trafficLease) return
      if (
        !awayAgents.has(agentId)
        && !await riseFromDesk(agentId, request, definition.approachPoint)
      ) {
        return
      }
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
      trafficLease?.release()
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
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 550)
    })
    if (currentZoneByAgent.get(agentId) === zoneId) {
      await returnAgentToDesk(agentId)
    }
  }

  async function returnAgentToDesk(agentId: AgentId): Promise<void> {
    if (speechLockedAgents.has(agentId)) {
      pendingPostSpeechMovements.set(agentId, { kind: 'return' })
      return
    }

    const workstation = workstations[agentId]
    const request = nextMotionRequest(agentId)
    const previousZone = currentZoneByAgent.get(agentId)
    const previousZoneDefinition = previousZone
      ? studyZones.getDefinition(previousZone)
      : null
    const wasAway = awayAgents.has(agentId) || Boolean(previousZone) || movingAgents.has(agentId)
    stopZoneInteraction(agentId)
    zoneActionPlayedForVisit.delete(agentId)

    if (previousZone) {
      studyZones.setAgentActive(previousZone, agentId, false)
      currentZoneByAgent.delete(agentId)
    }

    if (!wasAway) {
      workstation.person.setPosture('normal')
      workstation.person.setFacing('left')
      awayAgents.delete(agentId)
      workstation.setAway(false)
      if (isAmbientActivityState(stateByAgent.get(agentId))) {
        scheduleIdleRoaming(agentId)
      }
      return
    }

    movingAgents.add(agentId)
    let trafficLease: NavigationTrafficLease | null = null
    try {
      trafficLease = await acquireNavigationTraffic(agentId, request)
      if (!trafficLease) return
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
      trafficLease?.release()
      if (isCurrentMotion(agentId, request)) {
        movingAgents.delete(agentId)
        if (isAmbientActivityState(stateByAgent.get(agentId))) {
          scheduleIdleRoaming(agentId)
        }
      }
    }
  }

  function applyAgentState(agentId: AgentId, state: PartnerState): void {
    const previousState = stateByAgent.get(agentId)
    const wasAmbientActivityState = isAmbientActivityState(previousState)
    const ambientActivityState = isAmbientActivityState(state)
    const wasNapping = nappingAgents.has(agentId)
    const wasAwayFromDesk = awayAgents.has(agentId)
      || currentZoneByAgent.has(agentId)
      || movingAgents.has(agentId)
    stateByAgent.set(agentId, state)
    if (ambientActivityState) {
      if (!wasAmbientActivityState) {
        idleSinceByAgent.set(agentId, currentTime())
      }
    } else {
      idleSinceByAgent.delete(agentId)
    }
    if (!ambientActivityState) {
      stopIdleRoaming(agentId)
      if (engagedAgents.has(agentId)) {
        endConversation(agentId)
      }
    }
    if (state === 'speaking') {
      stopZoneInteraction(agentId)
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

    const shouldPlayWakeUp = wasNapping && state !== 'idle'
    if (shouldPlayWakeUp) {
      workstations[agentId].setState(state, { deferBodyActivity: true })
    } else {
      workstations[agentId].setState(state)
    }
    if (shouldPlayWakeUp) {
      nappingAgents.delete(agentId)
      noticeableRestAgents.delete(agentId)
      void workstations[agentId].person.play('waking_up', {
        loop: false,
        restart: true,
        preserveVisualAnchor: 'bodyCore',
      }).then(() => {
        if (stateByAgent.get(agentId) === state) {
          workstations[agentId].refreshStateActivity()
        }
      }).catch((error: unknown) => {
        console.error(`Wake-up transition failed for ${agentId}`, error)
        if (stateByAgent.get(agentId) === state) {
          workstations[agentId].refreshStateActivity()
        }
      })
    }

    if (previousState === state) {
      return
    }

    // speaking 时不触发返回座位 —— 让 agent 原地站着发言。
    // 发言结束（state 变 idle/completed/error）时下方分支会处理回座。
    if (wasAmbientActivityState && !ambientActivityState && wasAwayFromDesk && state !== 'speaking') {
      void returnAgentToDesk(agentId)
      return
    }

    if (state === 'working') {
      const currentZone = currentZoneByAgent.get(agentId)
      if (currentZone) {
        void startZoneInteraction(agentId, currentZone)
      }
      return
    }

    if (ambientActivityState && !wasAmbientActivityState && wasAwayFromDesk) {
      void returnAgentToDesk(agentId)
      return
    }

    if (state === 'error') {
      void returnAgentToDesk(agentId)
      return
    }

    if (
      ambientActivityState
      && !awayAgents.has(agentId)
      && !currentZoneByAgent.has(agentId)
      && !movingAgents.has(agentId)
    ) {
      scheduleIdleRoaming(agentId)
    }
  }

  function applyPendingPostSpeechMovement(
    agentId: AgentId,
    nextState: PartnerState,
  ): void {
    const movement = pendingPostSpeechMovements.get(agentId)
    pendingPostSpeechMovements.delete(agentId)
    if (!movement) {
      return
    }

    // These states already request the same return inside applyAgentState.
    if (
      movement.kind === 'return'
      && (nextState === 'idle' || nextState === 'completed' || nextState === 'error')
    ) {
      return
    }
    if (movement.kind === 'zone') {
      void goToStudyZone(agentId, movement.zoneId)
    } else {
      void returnAgentToDesk(agentId)
    }
  }

  function settleSpeechFinish(
    agentId: AgentId,
    request: number,
  ): void {
    if (
      destroyed
      || speechFinishRequests.get(agentId) !== request
      || !speechFinishingAgents.has(agentId)
    ) {
      return
    }

    speechFinishingAgents.delete(agentId)
    speechLockedAgents.delete(agentId)
    const nextState = pendingPostSpeechStates.get(agentId) ?? 'celebrating'
    pendingPostSpeechStates.delete(agentId)
    applyAgentState(agentId, nextState)
    if (nextState === 'celebrating') {
      // setState received celebrating before the finish action, so refresh
      // explicitly when celebrating remains the final requested state.
      workstations[agentId].refreshStateActivity()
    }
    applyPendingPostSpeechMovement(agentId, nextState)
  }

  function finishSpeech(agentId: AgentId): void {
    if (speechFinishingAgents.has(agentId)) {
      return
    }

    speechFinishingAgents.add(agentId)
    const request = (speechFinishRequests.get(agentId) ?? 0) + 1
    speechFinishRequests.set(agentId, request)
    const workstation = workstations[agentId]

    // Update the label immediately, but mount one explicit non-looping finish
    // action. Until it completes, navigation and all later body states remain
    // queued behind speechLockedAgents.
    workstation.setState('celebrating', { deferBodyActivity: true })
    void workstation.person.play('completed', {
      loop: false,
      restart: true,
      preserveVisualAnchor: 'bottomCenter',
    }).then(() => {
      settleSpeechFinish(agentId, request)
    }).catch((error: unknown) => {
      console.error(`Speech finish transition failed for ${agentId}`, error)
      settleSpeechFinish(agentId, request)
    })
  }

  function setAgentState(agentId: AgentId, state: PartnerState): void {
    if (state === 'speaking') {
      speechFinishRequests.set(agentId, (speechFinishRequests.get(agentId) ?? 0) + 1)
      speechFinishingAgents.delete(agentId)
      pendingPostSpeechStates.delete(agentId)
      speechLockedAgents.add(agentId)
      applyAgentState(agentId, state)
      return
    }

    if (speechLockedAgents.has(agentId)) {
      pendingPostSpeechStates.set(agentId, state)
      finishSpeech(agentId)
      return
    }

    applyAgentState(agentId, state)
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
      destroyed = true
      Object.keys(workstations).forEach((agentId) => {
        stopIdleRoaming(agentId as AgentId)
        stopZoneInteraction(agentId as AgentId)
        nextMotionRequest(agentId as AgentId)
      })
      idleRoamTimers.clear()
      idleRoamWaiters.clear()
      zoneInteractionTimers.clear()
      zoneInteractionRequests.clear()
      zoneActionPlayedForVisit.clear()
      activeIdleActivities.clear()
      awayAgents.clear()
      engagedAgents.clear()
      chatPartnerByAgent.clear()
      previousIdleActivities.clear()
      idleActivityBags.clear()
      previousDeskActions.clear()
      deskAmbientBags.clear()
      idleSinceByAgent.clear()
      noticeableRestAgents.clear()
      nappingAgents.clear()
      speechLockedAgents.clear()
      speechFinishingAgents.clear()
      speechFinishRequests.clear()
      pendingPostSpeechStates.clear()
      pendingPostSpeechMovements.clear()
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
    setAmbientMotion: (enabled) => {
      if (ambientMotionEnabled === enabled) return
      ambientMotionEnabled = enabled
      Object.keys(workstations).forEach((id) => {
        const agentId = id as AgentId
        if (enabled) {
          if (stateByAgent.get(agentId) === 'idle') scheduleIdleRoaming(agentId, 4_000)
          return
        }
        stopIdleRoaming(agentId)
        if (stateByAgent.get(agentId) === 'idle') {
          endConversation(agentId)
          void returnAgentToDesk(agentId)
        }
      })
    },
  }
}
