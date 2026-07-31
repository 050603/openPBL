import type { AgentId } from '@/domain/studio'

export type { AgentId } from '@/domain/studio'

export const agentActionNames = [
  'agreeing',
  'brainstorming',
  'cheer_main',
  'cheer1_sub',
  'cheer2_sub',
  'completed',
  'error',
  'fc_high_press',
  'fc_screen_working_apk_use',
  'fc_screen_working_file_use',
  'fc_screen_working_main',
  'fc_screen_working_search_or_browser_use',
  'fc_screen_working_win_use',
  'fc_ticket',
  'fc_walking_down',
  'fc_walking_h',
  'fc_walking_up',
  'turn_arrive',
  'computer_typing_left',
  'computer_browsing_left',
  'computer_thinking_left',
  'screen_pointing',
  'raising_hand',
  'board_listening',
  'comparing_materials',
  'looking_around',
  'slacking',
  'stretching',
  'napping',
  'waking_up',
  'leaving',
  'listening',
  'off_chair',
  'sit_down',
  'organizing_files',
  'planning_board',
  'peek',
  'presenting',
  'questioning',
  'reading_book',
  'reviewing_work',
  'salute',
  'searching_info',
  'selected',
  'sleeping',
  'standby',
  'talking_on_seat',
  'talking_on_stand-0',
  'talking_on_stand-1',
  'thinking',
  'waiting_user',
  'working',
  'writing_notes',
] as const

export type AgentActionName = (typeof agentActionNames)[number]
export type RoleActionSlot = 'default' | 'work' | 'walk'
export type AgentActionGroup = 'base' | 'move' | 'work' | 'talk' | 'emotion' | 'rest' | 'complete'
export type AgentActionLayer = 'body' | 'screen' | 'effect'
export type AgentActionFacing = 'left' | 'right'
export type AgentActionRegistrationAnchor = 'bottomCenter' | 'bodyCore'

export type AgentActionPlaybackOptions = {
  x?: number
  y?: number
  alpha?: number
  rotation?: number
  angle?: number
  visible?: boolean
  animationSpeed?: number
  loop?: boolean
  reverse?: boolean
  scale?: number | { x: number; y: number }
}

export interface ActionAsset {
  sheetName: string
  imagePath: string
  jsonPath: string
  prefix: string
}

export interface AgentSpriteAction extends ActionAsset {
  name: AgentActionName
}

export interface AgentActionDefinition {
  name: AgentActionName
  group: AgentActionGroup
  layer: AgentActionLayer
  playback?: AgentActionPlaybackOptions
  /**
   * Direction used when the source art was authored. Runtime mirroring is
   * derived from this value rather than guessed from the action name.
   */
  authoredFacing?: AgentActionFacing
  /**
   * Authored texture cadence. Pixi converts this to animationSpeed by
   * dividing by its 60 Hz ticker, so render FPS and pose FPS stay separate.
   */
  authoredFps?: number
  /**
   * Expected source-frame count. It is also used to calibrate locomotion and
   * must match the QA-approved atlas.
   */
  frameCount?: number
  /**
   * Logical scene pixels covered by one complete gait cycle.
   */
  pixelsPerCycle?: number
  /**
   * Registration point held fixed while switching actions.
   */
  registrationAnchor?: AgentActionRegistrationAnchor
  /**
   * Cross-fade time used for interruptible body-action transitions.
   */
  transitionMs?: number
  /**
   * Runtime correction for source strips whose visible character was authored
   * smaller than the 192 px canonical body height.
   */
  visualScale?: number
  /**
   * Horizontal-only silhouette correction for a directional view that was
   * authored visibly too narrow.
   */
  visualWidthScale?: number
  /**
   * Optional source-frame order used to omit structurally broken poses or
   * create a smooth ping-pong loop without editing the source atlas.
   */
  frameOrder?: readonly number[]
  /**
   * Stable torso reference in source pixels. It is measured at the scarf root
   * and upper-body junction, never from hands, props, or transparent bounds.
   */
  bodyCoreAnchor?: { x: number; y: number }
  /**
   * Per-playback-frame source-pixel corrections measured from bodyCoreAnchor.
   * These must not be derived from hands, props, or full alpha bounds.
   */
  frameBodyOffsets?: readonly { x: number; y: number }[]
}

export interface RoleSpriteActions {
  id: AgentId
  default: AgentActionName
  work: AgentActionName
  walk: AgentActionName
  actions: readonly AgentActionName[]
}

export function createAgentActionAsset(name: AgentActionName): AgentSpriteAction {
  return {
    name,
    sheetName: name,
    imagePath: `agent/${name}@2x.webp`,
    jsonPath: `agent/${name}@2x.webp.json`,
    prefix: name,
  }
}

export const agentActions = Object.fromEntries(
  agentActionNames.map((name) => [name, createAgentActionAsset(name)]),
) as Record<AgentActionName, AgentSpriteAction>

const actionGroups: Record<AgentActionGroup, readonly AgentActionName[]> = {
  base: ['sleeping', 'standby', 'working', 'thinking', 'waiting_user'],
  move: [
    'fc_walking_h',
    'fc_walking_up',
    'fc_walking_down',
    'turn_arrive',
    'off_chair',
    'sit_down',
    'leaving',
  ],
  work: [
    'brainstorming',
    'computer_typing_left',
    'computer_browsing_left',
    'computer_thinking_left',
    'screen_pointing',
    'raising_hand',
    'board_listening',
    'comparing_materials',
    'reading_book',
    'organizing_files',
    'planning_board',
    'presenting',
    'reviewing_work',
    'searching_info',
    'writing_notes',
    'fc_screen_working_main',
    'fc_screen_working_file_use',
    'fc_screen_working_search_or_browser_use',
    'fc_screen_working_win_use',
    'fc_screen_working_apk_use',
    'fc_ticket',
  ],
  talk: ['talking_on_seat', 'talking_on_stand-0', 'talking_on_stand-1', 'listening', 'questioning'],
  emotion: ['peek', 'fc_high_press', 'salute', 'error', 'selected', 'looking_around'],
  rest: ['slacking', 'stretching', 'napping', 'waking_up'],
  complete: ['cheer_main', 'cheer1_sub', 'cheer2_sub', 'agreeing', 'completed'],
}

const actionDefinitionOverrides: Partial<
  Record<AgentActionName, Partial<Omit<AgentActionDefinition, 'name' | 'group'>>>
> = {
  sleeping: { playback: { animationSpeed: 0.08 } },
  standby: { playback: { animationSpeed: 0.1 } },
  working: { playback: { animationSpeed: 0.11 } },
  thinking: { playback: { animationSpeed: 0.1 } },
  waiting_user: { playback: { animationSpeed: 0.11 } },
  selected: { playback: { animationSpeed: 0.12 } },
  listening: {
    playback: { animationSpeed: 0.1 },
    visualScale: 192 / 188,
  },
  agreeing: {
    playback: { animationSpeed: 0.12 },
    visualScale: 192 / 191,
  },
  questioning: {
    playback: { animationSpeed: 0.12 },
    visualScale: 192 / 190,
  },
  completed: {
    playback: { animationSpeed: 0.12 },
    visualScale: 192 / 179,
  },
  error: { playback: { animationSpeed: 0.1 } },
  leaving: { playback: { animationSpeed: 0.13 } },
  off_chair: {
    playback: { animationSpeed: 0.11, loop: false },
    visualScale: 192 / 190,
  },
  sit_down: { playback: { animationSpeed: 0.11 } },
  brainstorming: { playback: { animationSpeed: 0.11 } },
  reading_book: { playback: { animationSpeed: 0.11 } },
  presenting: {
    playback: { animationSpeed: 0.12 },
    visualScale: 192 / 190,
  },
  reviewing_work: { playback: { animationSpeed: 0.11 } },
  searching_info: { playback: { animationSpeed: 0.11 } },
  writing_notes: { playback: { animationSpeed: 0.11 } },
  organizing_files: {
    playback: { animationSpeed: 0.1 },
    visualScale: 192 / 178,
    // Source frames 0 and 3 contain the reported anatomical discontinuity:
    // frame 0 shifts the head/belly relative to the scarf, while frame 3 pulls
    // the hand about 10 px away from the stable shoulder connection. Keep one
    // coherent batch but play only its structurally stable poses.
    frameOrder: [1, 2, 4, 2],
    bodyCoreAnchor: { x: 109, y: 127 },
    frameBodyOffsets: [
      { x: 0, y: 0 },
      { x: -1, y: 1 },
      { x: 0, y: 0 },
      { x: -1, y: 1 },
    ],
  },
  planning_board: {
    playback: { animationSpeed: 0.11 },
    visualScale: 192 / 175,
    // Frames 1 and 2 move the complete lower body about 19 px to the right.
    // Keep the feet aligned and let only the arm gesture toward the board.
    frameBodyOffsets: [
      { x: 0, y: 0 },
      { x: -19, y: 0 },
      { x: -19, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ],
  },
  talking_on_seat: { playback: { animationSpeed: 0.12 } },
  'talking_on_stand-0': { playback: { animationSpeed: 0.12 } },
  'talking_on_stand-1': { playback: { animationSpeed: 0.12 } },
  peek: { playback: { animationSpeed: 0.1 } },
  cheer_main: { playback: { animationSpeed: 0.12 } },
  cheer1_sub: { playback: { animationSpeed: 0.12 } },
  cheer2_sub: { playback: { animationSpeed: 0.12 } },
  fc_high_press: { playback: { animationSpeed: 0.1 } },
  fc_walking_h: {
    authoredFacing: 'right',
    authoredFps: 10,
    frameCount: 8,
    pixelsPerCycle: 72,
    registrationAnchor: 'bottomCenter',
    transitionMs: 120,
    bodyCoreAnchor: { x: 96, y: 110 },
  },
  fc_walking_up: {
    authoredFacing: 'left',
    authoredFps: 10,
    frameCount: 8,
    pixelsPerCycle: 68,
    registrationAnchor: 'bottomCenter',
    transitionMs: 120,
    bodyCoreAnchor: { x: 96, y: 110 },
    // Rear view averages 111.4 px wide versus 123.8 px for the front view.
    // Correct width only so height and the foot baseline remain unchanged.
    visualWidthScale: 10 / 9,
  },
  fc_walking_down: {
    authoredFacing: 'left',
    authoredFps: 10,
    frameCount: 8,
    pixelsPerCycle: 68,
    registrationAnchor: 'bottomCenter',
    transitionMs: 120,
    bodyCoreAnchor: { x: 96, y: 110 },
  },
  turn_arrive: {
    authoredFacing: 'left',
    authoredFps: 8,
    frameCount: 6,
    frameOrder: [0, 1, 2, 3, 4, 5, 5],
    registrationAnchor: 'bottomCenter',
    transitionMs: 140,
    bodyCoreAnchor: { x: 96, y: 110 },
  },
  computer_typing_left: {
    authoredFacing: 'left',
    authoredFps: 8,
    frameCount: 8,
    registrationAnchor: 'bodyCore',
    transitionMs: 160,
    bodyCoreAnchor: { x: 96, y: 116 },
  },
  computer_browsing_left: {
    authoredFacing: 'left',
    authoredFps: 7.5,
    frameCount: 6,
    registrationAnchor: 'bodyCore',
    transitionMs: 160,
    bodyCoreAnchor: { x: 96, y: 116 },
  },
  computer_thinking_left: {
    authoredFacing: 'left',
    authoredFps: 7,
    frameCount: 6,
    registrationAnchor: 'bodyCore',
    transitionMs: 160,
    bodyCoreAnchor: { x: 96, y: 116 },
  },
  screen_pointing: {
    authoredFacing: 'left',
    authoredFps: 8,
    frameCount: 6,
    registrationAnchor: 'bodyCore',
    transitionMs: 160,
    bodyCoreAnchor: { x: 96, y: 112 },
    visualScale: 192 / 183,
  },
  raising_hand: {
    authoredFacing: 'left',
    authoredFps: 8,
    frameCount: 6,
    registrationAnchor: 'bodyCore',
    transitionMs: 150,
    bodyCoreAnchor: { x: 96, y: 108 },
  },
  board_listening: {
    authoredFacing: 'left',
    authoredFps: 7,
    frameCount: 5,
    registrationAnchor: 'bodyCore',
    transitionMs: 160,
    bodyCoreAnchor: { x: 96, y: 108 },
  },
  comparing_materials: {
    authoredFacing: 'left',
    authoredFps: 7.5,
    frameCount: 7,
    registrationAnchor: 'bodyCore',
    transitionMs: 160,
    bodyCoreAnchor: { x: 96, y: 116 },
  },
  looking_around: {
    authoredFacing: 'left',
    authoredFps: 7,
    frameCount: 6,
    registrationAnchor: 'bodyCore',
    transitionMs: 150,
    bodyCoreAnchor: { x: 96, y: 108 },
  },
  slacking: {
    authoredFacing: 'left',
    authoredFps: 6,
    frameCount: 7,
    registrationAnchor: 'bodyCore',
    transitionMs: 170,
    bodyCoreAnchor: { x: 96, y: 116 },
  },
  stretching: {
    authoredFacing: 'left',
    authoredFps: 7,
    frameCount: 7,
    registrationAnchor: 'bodyCore',
    transitionMs: 170,
    bodyCoreAnchor: { x: 96, y: 112 },
  },
  napping: {
    authoredFacing: 'left',
    authoredFps: 4.5,
    frameCount: 6,
    registrationAnchor: 'bodyCore',
    transitionMs: 180,
    bodyCoreAnchor: { x: 96, y: 120 },
  },
  waking_up: {
    authoredFacing: 'left',
    authoredFps: 7,
    frameCount: 6,
    registrationAnchor: 'bodyCore',
    transitionMs: 160,
    bodyCoreAnchor: { x: 96, y: 118 },
  },
  fc_screen_working_main: {
    layer: 'screen',
    // Keep the previous bottom edge fixed while expanding into the monitor
    // bezel: 120x59 source, old bottom = 15 + 59 * 1.2.
    playback: { x: 180.4, y: 11.46, scale: 1.26 },
  },
  fc_screen_working_file_use: {
    layer: 'screen',
    playback: { x: 176.4, y: -43.54, scale: 1.34 },
  },
  fc_screen_working_search_or_browser_use: {
    layer: 'screen',
    playback: { x: 176.4, y: -43.54, scale: 1.34 },
  },
  fc_screen_working_win_use: {
    layer: 'screen',
    playback: { x: 176.4, y: -43.54, scale: 1.34 },
  },
  fc_screen_working_apk_use: {
    layer: 'screen',
    playback: { x: 176.4, y: -43.54, scale: 1.34 },
  },
  fc_ticket: { layer: 'effect' },
}

function getAgentActionGroup(name: AgentActionName): AgentActionGroup {
  const entry = Object.entries(actionGroups).find(([, actions]) => actions.includes(name))

  if (!entry) {
    throw new Error(`Missing agent action group: ${name}`)
  }

  return entry[0] as AgentActionGroup
}

function getDefaultAgentActionLayer(name: AgentActionName): AgentActionLayer {
  if (name.startsWith('fc_screen_')) {
    return 'screen'
  }

  if (name === 'fc_ticket') {
    return 'effect'
  }

  return 'body'
}

export const agentActionDefinitions = Object.fromEntries(
  agentActionNames.map((name) => {
    const override = actionDefinitionOverrides[name]
    return [name, {
      name,
      group: getAgentActionGroup(name),
      layer: override?.layer ?? getDefaultAgentActionLayer(name),
      playback: override?.playback,
      authoredFacing: override?.authoredFacing,
      authoredFps: override?.authoredFps,
      frameCount: override?.frameCount,
      pixelsPerCycle: override?.pixelsPerCycle,
      registrationAnchor: override?.registrationAnchor,
      transitionMs: override?.transitionMs,
      visualScale: override?.visualScale,
      visualWidthScale: override?.visualWidthScale,
      frameOrder: override?.frameOrder,
      bodyCoreAnchor: override?.bodyCoreAnchor,
      frameBodyOffsets: override?.frameBodyOffsets,
    } satisfies AgentActionDefinition]
  }),
) as Record<AgentActionName, AgentActionDefinition>

export const roleSpriteActions = {
  zhizhi: {
    id: 'zhizhi',
    default: 'standby',
    work: 'working',
    walk: 'fc_walking_h',
    actions: agentActionNames,
  },
  wenwen: {
    id: 'wenwen',
    default: 'standby',
    work: 'working',
    walk: 'fc_walking_h',
    actions: agentActionNames,
  },
  lingling: {
    id: 'lingling',
    default: 'standby',
    work: 'working',
    walk: 'fc_walking_h',
    actions: agentActionNames,
  },
  cece: {
    id: 'cece',
    default: 'standby',
    work: 'working',
    walk: 'fc_walking_h',
    actions: agentActionNames,
  },
  pingping: {
    id: 'pingping',
    default: 'standby',
    work: 'working',
    walk: 'fc_walking_h',
    actions: agentActionNames,
  },
  jiji: {
    id: 'jiji',
    default: 'standby',
    work: 'working',
    walk: 'fc_walking_h',
    actions: agentActionNames,
  },
} as const satisfies Record<AgentId, RoleSpriteActions>

export function getAgentActionAsset(name: AgentActionName): AgentSpriteAction {
  return agentActions[name]
}

export function getAgentActionDefinition(name: AgentActionName): AgentActionDefinition {
  return agentActionDefinitions[name]
}

export function getRoleActionName(role: AgentId, slot: RoleActionSlot): AgentActionName {
  return roleSpriteActions[role][slot]
}
