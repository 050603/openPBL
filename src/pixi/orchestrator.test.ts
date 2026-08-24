import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agentRoleById } from '@/assets/agent/roles'
import type { AgentId } from '@/domain/studio'
import { classroomNavigationLaneXForSeat } from './navigation'
import { createOfficeOrchestrator } from './orchestrator'
import { studyZoneDefinitions, type StudyZoneController } from './study-zones'
import type { WorkstationController } from './workstation'

const agentIds: AgentId[] = ['zhizhi', 'wenwen', 'lingling', 'cece', 'pingping', 'jiji']

type TimelineEvent = {
  agentId: AgentId
  kind: 'animation-start' | 'animation-stop' | 'conversation' | 'facing' | 'move' | 'place' | 'play'
  value: boolean | string | { x: number; y: number }
  at: number
}

function createWorkstations(timeline: TimelineEvent[]): Record<AgentId, WorkstationController> {
  return Object.fromEntries(agentIds.map((agentId, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const seatAnchor = { x: column === 0 ? 515 : 866, y: 158 + row * 261 }
    const seatExitAnchor = {
      x: classroomNavigationLaneXForSeat(seatAnchor.x),
      y: seatAnchor.y,
    }
    const conversationAnchor = { x: seatExitAnchor.x, y: seatAnchor.y + 14 }
    let anchor = { ...seatAnchor }

    const person = {
      play: vi.fn(async (action: string, options?: { onMounted?: () => void }) => {
        timeline.push({ agentId, kind: 'play', value: action, at: Date.now() })
        options?.onMounted?.()
      }),
      moveVisualAnchorTo: vi.fn(async (x: number, y: number) => {
        anchor = { x, y }
        timeline.push({ agentId, kind: 'move', value: { x, y }, at: Date.now() })
      }),
      placeVisualAnchorAt: vi.fn((x: number, y: number) => {
        anchor = { x, y }
        timeline.push({ agentId, kind: 'place', value: { x, y }, at: Date.now() })
      }),
      getVisualAnchorPosition: vi.fn(() => ({ ...anchor })),
      cancelMovement: vi.fn(),
      setFacing: vi.fn((facing: string) => {
        timeline.push({ agentId, kind: 'facing', value: facing, at: Date.now() })
      }),
      setPosture: vi.fn(),
      setAnimationSpeed: vi.fn(),
      startBodyAnimation: vi.fn(() => {
        timeline.push({ agentId, kind: 'animation-start', value: true, at: Date.now() })
      }),
      stopBodyAnimation: vi.fn(() => {
        timeline.push({ agentId, kind: 'animation-stop', value: true, at: Date.now() })
      }),
      moveTo: vi.fn(async () => undefined),
      destroy: vi.fn(),
      container: {},
      role: agentId,
      roleProfile: agentRoleById[agentId],
    }

    const workstation = {
      person,
      roleProfile: agentRoleById[agentId],
      seatAnchor,
      seatExitAnchor,
      conversationAnchor,
      setConversationActive: vi.fn((active: boolean) => {
        timeline.push({ agentId, kind: 'conversation', value: active, at: Date.now() })
      }),
      setState: vi.fn(),
      refreshStateActivity: vi.fn(),
      setSelected: vi.fn(),
      setInfoVisible: vi.fn(),
      setAway: vi.fn(),
      setOccludedBy: vi.fn(),
      setMessage: vi.fn(),
      setTask: vi.fn(),
      destroy: vi.fn(),
      container: {},
      desk: {},
      chair: {},
      screen: {},
      effect: {},
    }

    return [agentId, workstation as unknown as WorkstationController]
  })) as Record<AgentId, WorkstationController>
}

function createStudyZones(): StudyZoneController {
  const occupants = new Map<keyof typeof studyZoneDefinitions, AgentId>()
  return {
    getOccupant: vi.fn((zoneId: keyof typeof studyZoneDefinitions) => occupants.get(zoneId) ?? null),
    getDefinition: vi.fn((zoneId: keyof typeof studyZoneDefinitions) => studyZoneDefinitions[zoneId]),
    tryOccupy: vi.fn((zoneId: keyof typeof studyZoneDefinitions, agentId: AgentId) => {
      const occupant = occupants.get(zoneId)
      if (occupant && occupant !== agentId) return false
      occupants.set(zoneId, agentId)
      return true
    }),
    setAgentActive: vi.fn((zoneId: keyof typeof studyZoneDefinitions, agentId: AgentId, active: boolean) => {
      if (active) occupants.set(zoneId, agentId)
      else if (occupants.get(zoneId) === agentId) occupants.delete(zoneId)
    }),
  } as unknown as StudyZoneController
}

describe('office orchestrator partner conversations', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T08:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts and ends both talkers together, then commits the visitor to its chair', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.99,
      idleStartDelays: {
        zhizhi: 0,
        wenwen: 60_000,
        lingling: 60_000,
        cece: 60_000,
        pingping: 60_000,
        jiji: 60_000,
      },
    })

    agentIds.forEach((agentId) => office.setAgentState(agentId, 'idle'))
    await vi.advanceTimersByTimeAsync(2_200)

    const conversationStarts = timeline.filter(
      (event) => event.kind === 'conversation' && event.value === true,
    )
    expect(conversationStarts.map((event) => event.agentId)).toEqual(['zhizhi', 'wenwen'])
    expect(new Set(conversationStarts.map((event) => event.at)).size).toBe(1)

    const talkingStarts = timeline.filter(
      (event) => event.kind === 'play'
        && (event.value === 'talking_on_seat' || event.value === 'talking_on_stand-0'),
    )
    expect(talkingStarts.map((event) => [event.agentId, event.value])).toEqual([
      ['wenwen', 'talking_on_seat'],
      ['zhizhi', 'talking_on_stand-0'],
    ])
    expect(new Set(talkingStarts.map((event) => event.at)).size).toBe(1)
    const animationStarts = timeline.filter((event) => event.kind === 'animation-start')
    expect(animationStarts.map((event) => event.agentId)).toEqual(['wenwen', 'zhizhi'])
    expect(new Set(animationStarts.map((event) => event.at)).size).toBe(1)
    const conversationMove = timeline.find(
      (event) => event.agentId === 'zhizhi'
        && event.kind === 'move'
        && JSON.stringify(event.value) === JSON.stringify(workstations.wenwen.conversationAnchor),
    )
    expect(conversationMove).toBeTruthy()
    const arrivalIndex = timeline.findIndex(
      (event) => event.agentId === 'zhizhi'
        && event.kind === 'play'
        && event.value === 'turn_arrive',
    )
    const standingTalkIndex = timeline.findIndex(
      (event) => event.agentId === 'zhizhi'
        && event.kind === 'play'
        && event.value === 'talking_on_stand-0',
    )
    expect(arrivalIndex).toBeGreaterThan(-1)
    expect(standingTalkIndex).toBeGreaterThan(arrivalIndex)
    expect(workstations.wenwen.conversationAnchor.y - workstations.wenwen.seatAnchor.y).toBe(14)
    expect(workstations.zhizhi.setOccludedBy).toHaveBeenCalledWith(workstations.wenwen)
    const outboundMoves = timeline.slice(0, standingTalkIndex).filter(
      (event) => event.agentId === 'zhizhi' && event.kind === 'move',
    )
    const obsoleteDeskCorner = {
      x: workstations.zhizhi.seatExitAnchor.x,
      y: workstations.zhizhi.seatExitAnchor.y + 76,
    }
    expect(outboundMoves.some(
      (event) => JSON.stringify(event.value) === JSON.stringify(obsoleteDeskCorner),
    )).toBe(false)
    expect(outboundMoves.some(
      (event) => typeof event.value === 'object' && event.value.x === 690,
    )).toBe(false)

    await vi.advanceTimersByTimeAsync(10_000)

    const conversationEnds = timeline.filter(
      (event) => event.kind === 'conversation' && event.value === false,
    )
    expect(conversationEnds.map((event) => event.agentId)).toEqual(['zhizhi', 'wenwen'])
    expect(new Set(conversationEnds.map((event) => event.at)).size).toBe(1)
    const animationStops = timeline.filter((event) => event.kind === 'animation-stop')
    expect(animationStops.map((event) => event.agentId)).toEqual(['zhizhi', 'wenwen'])
    expect(new Set(animationStops.map((event) => event.at)).size).toBe(1)
    expect(workstations.zhizhi.setOccludedBy).toHaveBeenLastCalledWith(null)

    const finalPlacement = timeline.filter(
      (event) => event.agentId === 'zhizhi' && event.kind === 'place',
    ).at(-1)
    expect(finalPlacement?.value).toEqual(workstations.zhizhi.seatAnchor)
    expect(workstations.zhizhi.person.getVisualAnchorPosition('bottomCenter'))
      .toEqual(workstations.zhizhi.seatAnchor)

    const sittingActionIndex = timeline.findIndex(
      (event) => event.agentId === 'zhizhi' && event.kind === 'play' && event.value === 'sit_down',
    )
    const returnStartIndex = timeline.findIndex(
      (event) => event.agentId === 'zhizhi'
        && event.kind === 'conversation'
        && event.value === false,
    )
    const chairSideArrivalIndex = timeline.findIndex(
      (event, index) => index > returnStartIndex
        && event.agentId === 'zhizhi'
        && event.kind === 'move'
        && JSON.stringify(event.value) === JSON.stringify(workstations.zhizhi.seatExitAnchor),
    )
    expect(chairSideArrivalIndex).toBeGreaterThan(returnStartIndex)
    expect(sittingActionIndex).toBeGreaterThan(chairSideArrivalIndex)
    expect(timeline.slice(chairSideArrivalIndex, sittingActionIndex).some(
      (event) => event.agentId === 'zhizhi'
        && event.kind === 'play'
        && event.value === 'turn_arrive',
    )).toBe(false)
    expect(timeline.slice(returnStartIndex, sittingActionIndex).some(
      (event) => event.agentId === 'zhizhi'
        && event.kind === 'move'
        && JSON.stringify(event.value) === JSON.stringify(obsoleteDeskCorner),
    )).toBe(false)
    const chairMoveIndex = timeline.findIndex(
      (event, index) => index > sittingActionIndex
        && event.agentId === 'zhizhi'
        && event.kind === 'move'
        && JSON.stringify(event.value) === JSON.stringify(workstations.zhizhi.seatAnchor),
    )
    expect(sittingActionIndex).toBeGreaterThan(-1)
    expect(chairMoveIndex).toBeGreaterThan(sittingActionIndex)

    office.destroy()
  })

  it('mounts a single archive action once and pins it to the archive anchor', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.5,
    })

    await office.goToStudyZone('jiji', 'archive')
    await vi.advanceTimersByTimeAsync(10_000)

    const archiveActions = timeline.filter(
      (event) => event.agentId === 'jiji'
        && event.kind === 'play'
        && event.value === 'organizing_files',
    )
    expect(archiveActions).toHaveLength(1)
    expect(workstations.jiji.person.play).toHaveBeenCalledWith(
      'organizing_files',
      expect.objectContaining({ loop: true, restart: true }),
    )
    expect(workstations.jiji.person.placeVisualAnchorAt).toHaveBeenCalledWith(
      studyZoneDefinitions.archive.actionAnchorPoint.x,
      studyZoneDefinitions.archive.actionAnchorPoint.y,
      'bodyCore',
    )
    expect(workstations.jiji.person.getVisualAnchorPosition('bodyCore'))
      .toEqual(studyZoneDefinitions.archive.actionAnchorPoint)

    office.destroy()
  })

  it('releases shared navigation after arrival so independent workbench actions run concurrently', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.5,
    })
    let finishArchiveAction: (() => void) | undefined
    const archiveAction = new Promise<void>((resolve) => {
      finishArchiveAction = resolve
    })

    vi.mocked(workstations.jiji.person.play).mockImplementation(async (action, options) => {
      timeline.push({ agentId: 'jiji', kind: 'play', value: action, at: Date.now() })
      options?.onMounted?.()
      if (action === 'organizing_files') await archiveAction
    })

    const firstVisit = office.goToStudyZone('jiji', 'archive')
    await vi.advanceTimersByTimeAsync(0)
    expect(timeline.some(
      (event) => event.agentId === 'jiji' && event.kind === 'play' && event.value === 'organizing_files',
    )).toBe(true)

    const secondVisit = office.goToStudyZone('wenwen', 'library')
    await vi.advanceTimersByTimeAsync(0)

    expect(timeline.some(
      (event) => event.agentId === 'wenwen' && event.kind === 'move',
    )).toBe(true)
    expect(timeline.some(
      (event) => event.agentId === 'wenwen' && event.kind === 'play' && event.value === 'reading_book',
    )).toBe(true)

    finishArchiveAction?.()
    await Promise.all([firstVisit, secondVisit])
    office.destroy()
  })

  it('leaves each desk through the chair side without stepping toward the old lower corner', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.5,
    })

    await office.goToStudyZone('zhizhi', 'archive')
    await office.goToStudyZone('wenwen', 'planning')

    for (const agentId of ['zhizhi', 'wenwen'] as const) {
      const seatExit = workstations[agentId].seatExitAnchor
      const exitMoveIndex = timeline.findIndex(
        (event) => event.agentId === agentId
          && event.kind === 'move'
          && JSON.stringify(event.value) === JSON.stringify(seatExit),
      )
      const firstRouteMoveIndex = timeline.findIndex(
        (event, index) => index > exitMoveIndex
          && event.agentId === agentId
          && event.kind === 'move',
      )
      const firstRouteMove = timeline[firstRouteMoveIndex]
      const expectedExitFacing = seatExit.x > workstations[agentId].seatAnchor.x
        ? 'right'
        : 'left'

      expect(exitMoveIndex).toBeGreaterThan(-1)
      expect(timeline.slice(0, exitMoveIndex).findLast(
        (event) => event.agentId === agentId && event.kind === 'facing',
      )?.value).toBe(expectedExitFacing)
      expect(firstRouteMove?.value).toEqual(expect.objectContaining({ x: seatExit.x }))
      expect(timeline.slice(exitMoveIndex + 1, firstRouteMoveIndex).some(
        (event) => event.agentId === agentId && event.kind === 'facing',
      )).toBe(false)
      expect(timeline.some(
        (event) => event.agentId === agentId
          && event.kind === 'move'
          && JSON.stringify(event.value) === JSON.stringify({
            x: seatExit.x,
            y: seatExit.y + 76,
          }),
      )).toBe(false)
    }

    office.destroy()
  })

  it('returns from a study zone straight to the chair side and sits without an arrival pause', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.5,
    })

    for (const agentId of ['lingling', 'wenwen'] as const) {
      await office.goToStudyZone(agentId, 'planning')
      timeline.length = 0
      await office.returnAgentToDesk(agentId)

      const seatExit = workstations[agentId].seatExitAnchor
      const seat = workstations[agentId].seatAnchor
      const chairSideMoveIndex = timeline.findIndex(
        (event) => event.agentId === agentId
          && event.kind === 'move'
          && JSON.stringify(event.value) === JSON.stringify(seatExit),
      )
      const sitDownIndex = timeline.findIndex(
        (event) => event.agentId === agentId
          && event.kind === 'play'
          && event.value === 'sit_down',
      )
      const expectedSitFacing = seat.x > seatExit.x ? 'right' : 'left'

      expect(chairSideMoveIndex).toBeGreaterThan(-1)
      expect(sitDownIndex).toBeGreaterThan(chairSideMoveIndex)
      expect(timeline.slice(chairSideMoveIndex + 1, sitDownIndex).filter(
        (event) => event.agentId === agentId && event.kind === 'facing',
      ).map((event) => event.value)).toEqual([expectedSitFacing])
      expect(timeline.slice(chairSideMoveIndex, sitDownIndex).some(
        (event) => event.kind === 'play' && event.value === 'turn_arrive',
      )).toBe(false)
      expect(timeline.slice(chairSideMoveIndex + 1, sitDownIndex).some(
        (event) => event.kind === 'move',
      )).toBe(false)
      expect(timeline.some(
        (event) => event.kind === 'move'
          && JSON.stringify(event.value) === JSON.stringify({
            x: seatExit.x,
            y: seatExit.y + 76,
          }),
      )).toBe(false)
      expect(workstations[agentId].person.getVisualAnchorPosition('bottomCenter'))
        .toEqual(seat)
    }

    office.destroy()
  })

  it('returns Zhizhi to the desk before continuing a newly assigned work task', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.5,
    })

    await office.goToStudyZone('zhizhi', 'library')
    timeline.length = 0
    office.setAgentState('zhizhi', 'working')
    // Repeated React/Pixi state synchronization must not restart the route.
    office.setAgentState('zhizhi', 'working')
    await vi.runAllTimersAsync()

    const sitDownIndex = timeline.findIndex(
      (event) => event.agentId === 'zhizhi' && event.kind === 'play' && event.value === 'sit_down',
    )
    expect(sitDownIndex).toBeGreaterThan(-1)
    expect(workstations.zhizhi.person.getVisualAnchorPosition('bottomCenter'))
      .toEqual(workstations.zhizhi.seatAnchor)
    expect(workstations.zhizhi.refreshStateActivity).toHaveBeenCalled()

    office.destroy()
  })

  it('takes ownership of Zhizhi when a task arrives during the off-chair transition', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), { random: () => 0.5 })
    let releaseOffChair: (() => void) | undefined
    const offChairBlocked = new Promise<void>((resolve) => { releaseOffChair = resolve })
    vi.mocked(workstations.zhizhi.person.play).mockImplementationOnce(async (action) => {
      timeline.push({ agentId: 'zhizhi', kind: 'play', value: action, at: Date.now() })
      await offChairBlocked
    })

    const roaming = office.goToStudyZone('zhizhi', 'library')
    await vi.advanceTimersByTimeAsync(0)
    office.setAgentState('zhizhi', 'working')

    expect(workstations.zhizhi.setAway).toHaveBeenCalledWith(true)
    releaseOffChair?.()
    await roaming
    await vi.runAllTimersAsync()
    expect(timeline.some((event) => event.agentId === 'zhizhi' && event.kind === 'play' && event.value === 'sit_down'))
      .toBe(true)
    expect(workstations.zhizhi.person.getVisualAnchorPosition('bottomCenter'))
      .toEqual(workstations.zhizhi.seatAnchor)

    office.destroy()
  })

  it('moves the left and right classroom lanes concurrently while keeping each lane ordered', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.5,
    })
    let releaseLeftDeparture: (() => void) | undefined
    const blockedLeftDeparture = new Promise<void>((resolve) => {
      releaseLeftDeparture = resolve
    })

    vi.mocked(workstations.zhizhi.person.moveVisualAnchorTo).mockImplementationOnce(async (x, y) => {
      timeline.push({ agentId: 'zhizhi', kind: 'move', value: { x, y }, at: Date.now() })
      await blockedLeftDeparture
    })

    const firstLeftRoute = office.goToStudyZone('zhizhi', 'library')
    await vi.advanceTimersByTimeAsync(0)
    expect(timeline.some((event) => event.agentId === 'zhizhi' && event.kind === 'move')).toBe(true)

    const rightRoute = office.goToStudyZone('wenwen', 'planning')
    await vi.advanceTimersByTimeAsync(0)
    expect(timeline.some((event) => event.agentId === 'wenwen' && event.kind === 'move')).toBe(true)
    expect(timeline.some(
      (event) => event.agentId === 'wenwen'
        && event.kind === 'play'
        && ['planning_board', 'board_listening', 'screen_pointing'].includes(String(event.value)),
    )).toBe(true)

    const secondLeftRoute = office.goToStudyZone('lingling', 'archive')
    await vi.advanceTimersByTimeAsync(0)
    expect(timeline.some((event) => event.agentId === 'lingling' && event.kind === 'move')).toBe(false)

    releaseLeftDeparture?.()
    await Promise.all([firstLeftRoute, rightRoute, secondLeftRoute])
    expect(timeline.some((event) => event.agentId === 'lingling' && event.kind === 'move')).toBe(true)
    expect(timeline.some(
      (event) => event.agentId === 'lingling'
        && event.kind === 'move'
        && typeof event.value === 'object'
        && event.value.x === 640,
    )).toBe(true)
    expect(timeline.some(
      (event) => event.agentId === 'wenwen'
        && event.kind === 'move'
        && typeof event.value === 'object'
        && event.value.x === 756,
    )).toBe(true)
    office.destroy()
  })

  it('plays one workbench action for one visit, then sends the companion back', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.75,
    })

    const interaction = office.interactWithStudyZone('lingling', 'planning')
    await vi.advanceTimersByTimeAsync(6_000)
    await interaction

    const planningActions = timeline.filter(
      (event) => event.agentId === 'lingling'
        && event.kind === 'play'
        && ['planning_board', 'board_listening', 'screen_pointing'].includes(String(event.value)),
    )
    expect(planningActions).toHaveLength(1)
    expect(workstations.lingling.person.play).toHaveBeenCalledWith(
      'screen_pointing',
      expect.objectContaining({ loop: true, restart: true }),
    )
    expect(workstations.lingling.person.getVisualAnchorPosition('bottomCenter'))
      .toEqual(workstations.lingling.seatAnchor)

    office.destroy()
  })

  it('lets independent agents use all three study zones at the same time', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const studyZones = createStudyZones()
    const office = createOfficeOrchestrator(workstations, studyZones, {
      random: () => 0.6,
      idleStartDelays: {
        zhizhi: 0,
        wenwen: 0,
        lingling: 0,
        cece: 60_000,
        pingping: 60_000,
        jiji: 60_000,
      },
    })

    agentIds.forEach((agentId) => office.setAgentState(agentId, 'idle'))
    await vi.advanceTimersByTimeAsync(1_500)

    expect(studyZones.getOccupant('archive')).toBe('zhizhi')
    expect(studyZones.getOccupant('library')).toBe('wenwen')
    expect(studyZones.getOccupant('planning')).toBe('lingling')
    expect(timeline.filter((event) => event.kind === 'conversation' && event.value === true))
      .toHaveLength(0)

    office.destroy()
  })

  it('keeps autonomous conversations to one two-person pair', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0,
      idleStartDelays: Object.fromEntries(agentIds.map((agentId) => [agentId, 0])),
    })

    agentIds.forEach((agentId) => office.setAgentState(agentId, 'idle'))
    await vi.advanceTimersByTimeAsync(2_000)

    const conversationStarts = timeline.filter(
      (event) => event.kind === 'conversation' && event.value === true,
    )
    expect(conversationStarts).toHaveLength(2)
    expect(new Set(conversationStarts.map((event) => event.agentId)).size).toBe(2)
    expect(new Set(conversationStarts.map((event) => event.at)).size).toBe(1)

    office.destroy()
  })

  it('keeps a conversation lane reserved until the visitor has cleared the aisle', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.99,
      idleStartDelays: {
        zhizhi: 0,
        wenwen: 60_000,
        lingling: 60_000,
        cece: 60_000,
        pingping: 60_000,
        jiji: 60_000,
      },
    })

    agentIds.forEach((agentId) => office.setAgentState(agentId, 'idle'))
    await vi.advanceTimersByTimeAsync(2_200)
    expect(timeline.some(
      (event) => event.agentId === 'zhizhi'
        && event.kind === 'conversation'
        && event.value === true,
    )).toBe(true)

    const queuedRoute = office.goToStudyZone('lingling', 'archive')
    await vi.advanceTimersByTimeAsync(0)
    expect(timeline.some(
      (event) => event.agentId === 'lingling' && event.kind === 'move',
    )).toBe(false)

    await vi.advanceTimersByTimeAsync(10_000)
    await queuedRoute
    expect(timeline.some(
      (event) => event.agentId === 'lingling' && event.kind === 'move',
    )).toBe(true)

    const conversationEndedAt = timeline.findIndex(
      (event) => event.agentId === 'zhizhi'
        && event.kind === 'conversation'
        && event.value === false,
    )
    const visitorClearedAt = timeline.findIndex(
      (event, index) => index > conversationEndedAt
        && event.agentId === 'zhizhi'
        && event.kind === 'move'
        && JSON.stringify(event.value) === JSON.stringify(workstations.zhizhi.seatExitAnchor),
    )
    const queuedRouteStartedAt = timeline.findIndex(
      (event) => event.agentId === 'lingling' && event.kind === 'move',
    )
    expect(visitorClearedAt).toBeGreaterThan(-1)
    expect(queuedRouteStartedAt).toBeGreaterThan(visitorClearedAt)

    office.destroy()
  })

  it('does not touch destroyed workstations when an idle conversation settles late', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.99,
      idleStartDelays: {
        zhizhi: 0,
        wenwen: 60_000,
        lingling: 60_000,
        cece: 60_000,
        pingping: 60_000,
        jiji: 60_000,
      },
    })

    agentIds.forEach((agentId) => office.setAgentState(agentId, 'idle'))
    await vi.advanceTimersByTimeAsync(2_200)
    expect(timeline.some((event) => event.kind === 'conversation' && event.value === true)).toBe(true)

    office.destroy()
    const eventsAtDestroy = timeline.length
    await vi.advanceTimersByTimeAsync(20_000)

    expect(timeline).toHaveLength(eventsAtDestroy)
  })

  it('keeps a speaker still until the finish action completes, then applies the latest state and route', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    let resolveSpeechFinish = () => {}
    const speechFinish = new Promise<void>((resolve) => {
      resolveSpeechFinish = resolve
    })
    vi.mocked(workstations.zhizhi.person.play).mockImplementation(async (action) => {
      timeline.push({ agentId: 'zhizhi', kind: 'play', value: action, at: Date.now() })
      if (action === 'completed') {
        await speechFinish
      }
    })
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.5,
    })

    office.setAgentState('zhizhi', 'speaking')
    await office.goToStudyZone('zhizhi', 'library')
    office.setAgentState('zhizhi', 'celebrating')
    office.setAgentState('zhizhi', 'working')
    office.setAgentState('zhizhi', 'idle')
    await Promise.resolve()

    expect(workstations.zhizhi.person.play).toHaveBeenCalledWith(
      'completed',
      expect.objectContaining({ loop: false, restart: true }),
    )
    expect(timeline.filter((event) => event.kind === 'move')).toHaveLength(0)
    expect(workstations.zhizhi.setState).toHaveBeenNthCalledWith(1, 'speaking')
    expect(workstations.zhizhi.setState).toHaveBeenNthCalledWith(
      2,
      'celebrating',
      { deferBodyActivity: true },
    )
    expect(workstations.zhizhi.setState).not.toHaveBeenCalledWith('working')
    expect(workstations.zhizhi.setState).not.toHaveBeenCalledWith('idle')

    resolveSpeechFinish()
    await vi.advanceTimersByTimeAsync(0)

    expect(workstations.zhizhi.setState).toHaveBeenCalledWith('idle')
    expect(timeline.some((event) => event.kind === 'move')).toBe(true)
    expect(workstations.zhizhi.person.play).toHaveBeenCalledWith(
      'reading_book',
      expect.anything(),
    )

    office.destroy()
  })

  it('turns an interrupted walk into a standing speech before applying the speaking state', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    let releaseOffChairMove = () => {}
    const offChairMove = new Promise<void>((resolve) => {
      releaseOffChairMove = resolve
    })
    vi.mocked(workstations.zhizhi.person.moveVisualAnchorTo).mockImplementationOnce(async () => {
      await offChairMove
    })
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.5,
    })

    const route = office.goToStudyZone('zhizhi', 'library')
    await Promise.resolve()
    await Promise.resolve()
    vi.mocked(workstations.zhizhi.person.cancelMovement).mockClear()

    office.setAgentState('zhizhi', 'speaking')

    expect(workstations.zhizhi.person.cancelMovement).toHaveBeenCalledOnce()
    expect(workstations.zhizhi.setAway).toHaveBeenCalledWith(true)
    expect(workstations.zhizhi.person.setPosture).toHaveBeenCalledWith('normal')
    expect(workstations.zhizhi.person.setFacing).toHaveBeenCalledWith('left')
    expect(workstations.zhizhi.setState).toHaveBeenCalledWith('speaking')
    expect(vi.mocked(workstations.zhizhi.setAway).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(workstations.zhizhi.setState).mock.invocationCallOrder[0])

    releaseOffChairMove()
    await route
    office.destroy()
  })

  it('stops study-zone action rotation for the full speaking turn', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.5,
    })

    await office.goToStudyZone('lingling', 'planning')
    const actionsBeforeSpeech = timeline.filter(
      (event) => event.agentId === 'lingling'
        && event.kind === 'play'
        && ['planning_board', 'board_listening', 'screen_pointing'].includes(String(event.value)),
    )
    expect(actionsBeforeSpeech).toHaveLength(1)

    office.setAgentState('lingling', 'speaking')
    await vi.advanceTimersByTimeAsync(10_000)

    const actionsDuringSpeech = timeline.filter(
      (event) => event.agentId === 'lingling'
        && event.kind === 'play'
        && ['planning_board', 'board_listening', 'screen_pointing'].includes(String(event.value)),
    )
    expect(actionsDuringSpeech).toHaveLength(1)

    office.destroy()
  })

  it('gives every idle companion both off-desk movement and a new ambient action', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0.5,
      idleStartDelays: Object.fromEntries(agentIds.map((agentId) => [agentId, 0])),
    })

    agentIds.forEach((agentId) => office.setAgentState(agentId, 'idle'))
    await vi.advanceTimersByTimeAsync(120_000)

    const newAmbientActions = new Set([
      'looking_around',
      'slacking',
      'stretching',
      'napping',
    ])
    agentIds.forEach((agentId) => {
      expect(timeline.some(
        (event) => event.agentId === agentId && event.kind === 'move',
      ), `${agentId} should leave the desk`).toBe(true)
      expect(timeline.some(
        (event) => event.agentId === agentId
          && event.kind === 'play'
          && newAmbientActions.has(String(event.value)),
      ), `${agentId} should use a new ambient action`).toBe(true)
    })

    office.destroy()
  })

  it('lets a ready knowledge companion leave its desk while waiting for the student', async () => {
    const timeline: TimelineEvent[] = []
    const workstations = createWorkstations(timeline)
    const office = createOfficeOrchestrator(workstations, createStudyZones(), {
      random: () => 0,
      idleStartDelays: {
        zhizhi: 0,
        wenwen: 60_000,
        lingling: 60_000,
        cece: 60_000,
        pingping: 60_000,
        jiji: 60_000,
      },
    })

    agentIds.filter((agentId) => agentId !== 'zhizhi')
      .forEach((agentId) => office.setAgentState(agentId, 'working'))
    office.setAgentState('zhizhi', 'waiting_user')
    await vi.advanceTimersByTimeAsync(2_000)

    expect(timeline.some(
      (event) => event.agentId === 'zhizhi' && event.kind === 'move',
    )).toBe(true)

    office.destroy()
  })
})
