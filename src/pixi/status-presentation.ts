import type { AgentActionName } from '@/assets/agent'
import { agentRoleById } from '@/assets/agent/roles'
import type { AgentId, PartnerState } from '@/domain/studio'

export type ScreenActionName = Extract<
  AgentActionName,
  | 'fc_screen_working_apk_use'
  | 'fc_screen_working_file_use'
  | 'fc_screen_working_main'
  | 'fc_screen_working_search_or_browser_use'
  | 'fc_screen_working_win_use'
>

export type StatePresentation = {
  body: AgentActionName
  bodySequence: readonly AgentActionName[]
  screen?: ScreenActionName
  label: string
  tone: number
  ring: number
}

const roleScreenActions: Record<AgentId, ScreenActionName> = {
  zhizhi: 'fc_screen_working_main',
  wenwen: 'fc_screen_working_search_or_browser_use',
  lingling: 'fc_screen_working_win_use',
  cece: 'fc_screen_working_apk_use',
  pingping: 'fc_screen_working_file_use',
  jiji: 'fc_screen_working_search_or_browser_use',
}

const ownComputerFacingActions = new Set<AgentActionName>([
  'computer_typing_left',
  'computer_browsing_left',
  'computer_thinking_left',
  'screen_pointing',
  'comparing_materials',
])

export function isOwnComputerFacingAction(action: AgentActionName): boolean {
  return ownComputerFacingActions.has(action)
}

export function getComputerFacingForAgent(agentId: AgentId): 'left' | 'right' {
  void agentId
  // Every classroom workstation places its task computer on the character's
  // right-hand side, regardless of which scene column the desk occupies.
  return 'right'
}

export function getRoleScreenAction(agentId: AgentId): ScreenActionName {
  return roleScreenActions[agentId]
}

export const statePresentationByState: Record<PartnerState, Omit<StatePresentation, 'screen'>> = {
  idle: { body: 'working', bodySequence: ['working'], label: '在座位上学习', tone: 0x718087, ring: 0x718087 },
  selected: { body: 'selected', bodySequence: ['selected', 'raising_hand', 'agreeing'], label: '已选择', tone: 0x2c9b91, ring: 0x2c9b91 },
  working: { body: 'computer_typing_left', bodySequence: ['computer_typing_left', 'computer_thinking_left'], label: '正在处理', tone: 0x2c9b91, ring: 0x2c9b91 },
  speaking: { body: 'talking_on_seat', bodySequence: ['talking_on_seat'], label: '正在发言', tone: 0xe6a53b, ring: 0xe6a53b },
  celebrating: { body: 'completed', bodySequence: ['completed', 'agreeing'], label: '发言完成', tone: 0x48a56a, ring: 0x48a56a },
  waiting_user: { body: 'waiting_user', bodySequence: ['waiting_user', 'raising_hand', 'listening'], label: '等待你确认', tone: 0x6f7fd3, ring: 0x6f7fd3 },
  completed: { body: 'completed', bodySequence: ['completed', 'agreeing'], label: '已完成', tone: 0x48a56a, ring: 0x48a56a },
  error: { body: 'error', bodySequence: ['error', 'questioning'], label: '任务失败', tone: 0xd55d56, ring: 0xd55d56 },
}

export function getStatePresentation(agentId: AgentId, state: PartnerState): StatePresentation {
  const presentation = statePresentationByState[state]
  const workingLabelByAgent: Record<AgentId, string> = {
    zhizhi: '正在查找资料',
    wenwen: '正在检查逻辑',
    lingling: '正在整理灵感',
    cece: '正在规划步骤',
    pingping: '正在审阅成果',
    jiji: '正在整理记录',
  }
  const roleWorkActions: Record<AgentId, AgentActionName> = {
    zhizhi: 'searching_info',
    wenwen: 'questioning',
    lingling: 'brainstorming',
    cece: 'screen_pointing',
    pingping: 'reviewing_work',
    jiji: 'comparing_materials',
  }

  return {
    ...presentation,
    bodySequence: state === 'working'
      ? [
          'computer_typing_left',
          roleWorkActions[agentId],
          'computer_browsing_left',
          'computer_thinking_left',
        ]
      : presentation.bodySequence,
    label: state === 'working' ? workingLabelByAgent[agentId] : presentation.label,
    screen: state === 'working' ? roleScreenActions[agentId] : undefined,
  }
}

export function getRoleAccent(agentId: AgentId): number {
  return Number.parseInt(agentRoleById[agentId].accent.slice(1), 16)
}
