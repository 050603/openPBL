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

export function getRoleScreenAction(agentId: AgentId): ScreenActionName {
  return roleScreenActions[agentId]
}

export const statePresentationByState: Record<PartnerState, Omit<StatePresentation, 'screen'>> = {
  idle: { body: 'working', label: '在座位上学习', tone: 0x718087, ring: 0x718087 },
  selected: { body: 'working', label: '已选择', tone: 0x2c9b91, ring: 0x2c9b91 },
  working: { body: 'working', label: '正在处理', tone: 0x2c9b91, ring: 0x2c9b91 },
  speaking: { body: 'talking_on_seat', label: '正在发言', tone: 0xe6a53b, ring: 0xe6a53b },
  celebrating: { body: 'cheer1_sub', label: '发言完成', tone: 0x48a56a, ring: 0x48a56a },
  waiting_user: { body: 'working', label: '等待你确认', tone: 0x6f7fd3, ring: 0x6f7fd3 },
  completed: { body: 'cheer1_sub', label: '已完成', tone: 0x48a56a, ring: 0x48a56a },
  error: { body: 'standby', label: '任务失败', tone: 0xd55d56, ring: 0xd55d56 },
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

  return {
    ...presentation,
    label: state === 'working' ? workingLabelByAgent[agentId] : presentation.label,
    screen: state === 'working' ? roleScreenActions[agentId] : undefined,
  }
}

export function getRoleAccent(agentId: AgentId): number {
  return Number.parseInt(agentRoleById[agentId].accent.slice(1), 16)
}
