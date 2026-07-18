import type { AgentId } from '@/domain/studio'

export type { AgentId } from '@/domain/studio'

export const agentActionNames = [
  'cheer_main',
  'cheer1_sub',
  'cheer2_sub',
  'fc_high_press',
  'fc_screen_working_apk_use',
  'fc_screen_working_file_use',
  'fc_screen_working_main',
  'fc_screen_working_search_or_browser_use',
  'fc_screen_working_win_use',
  'fc_ticket',
  'fc_walking_h',
  'fc_walking_up',
  'off_chair',
  'organizing_files',
  'peek',
  'reading_book',
  'salute',
  'sleeping',
  'standby',
  'talking_on_seat',
  'talking_on_stand-0',
  'talking_on_stand-1',
  'working',
] as const

export type AgentActionName = (typeof agentActionNames)[number]
export type RoleActionSlot = 'default' | 'work' | 'walk'
export type AgentActionGroup = 'base' | 'move' | 'work' | 'talk' | 'emotion' | 'complete'
export type AgentActionLayer = 'body' | 'screen' | 'effect'

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
  base: ['sleeping', 'standby', 'working'],
  move: ['fc_walking_h', 'fc_walking_up', 'off_chair'],
  work: [
    'reading_book',
    'organizing_files',
    'fc_screen_working_main',
    'fc_screen_working_file_use',
    'fc_screen_working_search_or_browser_use',
    'fc_screen_working_win_use',
    'fc_screen_working_apk_use',
    'fc_ticket',
  ],
  talk: ['talking_on_seat', 'talking_on_stand-0', 'talking_on_stand-1'],
  emotion: ['peek', 'fc_high_press', 'salute'],
  complete: ['cheer_main', 'cheer1_sub', 'cheer2_sub'],
}

const actionDefinitionOverrides: Partial<
  Record<AgentActionName, Partial<Omit<AgentActionDefinition, 'name' | 'group'>>>
> = {
  working: { playback: { x: -8 } },
  talking_on_seat: { playback: { x: -8 } },
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
