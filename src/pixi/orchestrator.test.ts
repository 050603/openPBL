import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agentRoleById } from '@/assets/agent/roles'
import type { AgentId } from '@/domain/studio'
import { createOfficeOrchestrator } from './orchestrator'
import { studyZoneDefinitions, type StudyZoneController } from './study-zones'
import type { WorkstationController } from './workstation'

const agentIds: AgentId[] = ['zhizhi', 'wenwen', 'lingling', 'cece', 'pingping', 'jiji']

type TimelineEvent = {
  agentId: AgentId
  kind: 'conversation' | 'move' | 'place' | 'play'
  value: boolean | string | { x: number; y: number }
  at: number
}

function createWorkstations(timeline: TimelineEvent[]): Record<AgentId, WorkstationController> {
  return Object.fromEntries(agentIds.map((agentId, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const seatAnchor = { x: column === 0 ? 515 : 866, y: 158 + row * 261 }
    const seatExitAnchor = { x: seatAnchor.x + (column === 0 ? 138 : -138), y: seatAnchor.y }
    const homeAnchor = { x: seatExitAnchor.x, y: seatExitAnchor.y + 76 }
    let anchor = { ...seatAnchor }

    const person = {
      play: vi.fn(async (action: string) => {
        timeline.push({ agentId, kind: 'play', value: action, at: Date.now() })
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
      setFacing: vi.fn(),
      setPosture: vi.fn(),
      setAnimationSpeed: vi.fn(),
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
      homeAnchor,
      setConversationActive: vi.fn((active: boolean) => {
        timeline.push({ agentId, kind: 'conversation', value: active, at: Date.now() })
      }),
      setState: vi.fn(),
      setSelected: vi.fn(),
      setInfoVisible: vi.fn(),
      setAway: vi.fn(),
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

    await vi.advanceTimersByTimeAsync(10_000)

    const conversationEnds = timeline.filter(
      (event) => event.kind === 'conversation' && event.value === false,
    )
    expect(conversationEnds.map((event) => event.agentId)).toEqual(['zhizhi', 'wenwen'])
    expect(new Set(conversationEnds.map((event) => event.at)).size).toBe(1)

    const finalPlacement = timeline.filter(
      (event) => event.agentId === 'zhizhi' && event.kind === 'place',
    ).at(-1)
    expect(finalPlacement?.value).toEqual(workstations.zhizhi.seatAnchor)
    expect(workstations.zhizhi.person.getVisualAnchorPosition('bottomCenter'))
      .toEqual(workstations.zhizhi.seatAnchor)

    const sittingActionIndex = timeline.findIndex(
      (event) => event.agentId === 'zhizhi' && event.kind === 'play' && event.value === 'sit_down',
    )
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
    expect(workstations.jiji.person.getVisualAnchorPosition('bottomCenter'))
      .toEqual(studyZoneDefinitions.archive.interactionPoint)

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
    await vi.advanceTimersByTimeAsync(2_000)

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
})
