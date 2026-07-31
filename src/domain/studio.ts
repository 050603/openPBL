export const partnerIds = [
  'zhizhi',
  'wenwen',
  'lingling',
  'cece',
  'pingping',
  'jiji',
] as const

export type AgentId = (typeof partnerIds)[number]

export type PartnerState =
  | 'idle'
  | 'selected'
  | 'working'
  | 'speaking'
  | 'celebrating'
  | 'waiting_user'
  | 'completed'
  | 'error'

export const partnerStateLabels: Record<PartnerState, string> = {
  idle: '空闲等待',
  selected: '已选择',
  working: '正在处理',
  speaking: '正在发言',
  celebrating: '发言完成',
  waiting_user: '等待你确认',
  completed: '已完成',
  error: '任务失败',
}

export type StudentMessage = {
  id: string
  text: string
  createdAt: string
  audience: 'team' | AgentId
}

export type PartnerMessage = {
  id: string
  agentId: AgentId
  text: string
  createdAt: string
  kind: 'insight' | 'question' | 'idea' | 'plan' | 'review' | 'record'
}

export type PartnerTask = {
  id: string
  title: string
  description: string
  assignedTo: AgentId[]
  createdAt: string
  status: 'queued' | 'in_progress' | 'waiting_user' | 'completed' | 'error'
  result?: string
  error?: string
}

export type StudioEvent = {
  id: string
  label: string
  detail: string
  createdAt: string
  tone: 'teal' | 'coral' | 'sun' | 'ink'
}

export type ProcessRecord = {
  id: string
  title: string
  summary: string
  sourceAgentId: AgentId
  createdAt: string
}

export type PendingAction = {
  id: string
  label: string
  description: string
  taskId: string
  kind: 'confirm' | 'revise'
}

export type PartnerRuntime = {
  state: PartnerState
  message: string
  task: string
  result: string
  accentNote: string
}

export const learningPhases = [
  { id: 'launch', label: '项目启动', index: '01' },
  { id: 'know', label: 'AI 授知', index: '02' },
  { id: 'idea', label: '方案构思', index: '03' },
  { id: 'make', label: '项目实践', index: '04' },
  { id: 'share', label: '成果汇报', index: '05' },
  { id: 'reflect', label: '学习反思', index: '06' },
] as const

export const studioProject = {
  name: '校园雨水花园计划',
  code: 'PBL-2026-07',
  stage: '方案构思',
  stageIndex: '03 / 06',
  goal: '把“校园积水”变成一个可观察、可验证、能被同学参与的雨水花园方案。',
  nextStep: '先确认问题证据，再决定花园的空间与植物组合。',
}

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function formatClock(date = new Date()): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
