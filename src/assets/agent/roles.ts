import type { AgentId } from './index'

type RoleIconFrame = {
  x: number
  y: number
  width: number
  height: number
}

export type AgentRolePosition = {
  x: number
  y: number
}

export type AgentRoleProfile = {
  id: AgentId
  name: string
  title: string
  subtitle: string
  intro: string
  skills: readonly string[]
  station: string
  stationNote: string
  position: AgentRolePosition
  deskPosition: AgentRolePosition
  deskVariant: 'boss' | 'app' | 'computer' | 'browser' | 'file' | 'search'
  scarfColor: string
  accent: string
  iconFrame: RoleIconFrame
}

export const agentRoles = [
  {
    id: 'zhizhi',
    name: '知知',
    title: '资料向导',
    subtitle: '知识解释 · 资料整理',
    intro: '把复杂概念讲清楚，帮你找到可信资料，并把零散信息整理成可以继续使用的证据。',
    skills: ['概念解释', '资料查找', '证据整理'],
    station: '资料角',
    stationNote: '检索资料、翻阅参考书、整理证据卡。',
    position: { x: 491, y: 55 },
    deskPosition: { x: 515, y: 66 },
    deskVariant: 'boss',
    scarfColor: '#e86d50',
    accent: '#e86d50',
    iconFrame: { x: 238, y: 642, width: 238, height: 277 },
  },
  {
    id: 'wenwen',
    name: '问问',
    title: '问题教练',
    subtitle: '提问 · 逻辑检查',
    intro: '用问题帮你看见假设、漏洞和还没有说清楚的地方，让方案更有根据。',
    skills: ['追问假设', '逻辑检查', '发现漏洞'],
    station: '问题桌',
    stationNote: '把模糊想法变成可以验证的问题。',
    position: { x: 842, y: 67 },
    deskPosition: { x: 866, y: 90 },
    deskVariant: 'browser',
    scarfColor: '#3c91d8',
    accent: '#3c91d8',
    iconFrame: { x: 1006, y: 640, width: 247, height: 277 },
  },
  {
    id: 'lingling',
    name: '灵灵',
    title: '灵感伙伴',
    subtitle: '创意 · 多种方案',
    intro: '从不同角度发散，帮你把一个想法变成几种有趣、可比较、可继续发展的方案。',
    skills: ['灵感发散', '方案比较', '换个角度'],
    station: '灵感墙',
    stationNote: '贴便利贴、画草图、展示方案。',
    position: { x: 491, y: 327 },
    deskPosition: { x: 515, y: 350 },
    deskVariant: 'computer',
    scarfColor: '#f1af3b',
    accent: '#f1af3b',
    iconFrame: { x: 1348, y: 640, width: 236, height: 277 },
  },
  {
    id: 'cece',
    name: '策策',
    title: '行动规划师',
    subtitle: '任务拆解 · 进度推动',
    intro: '把大目标拆成下一步能行动的小任务，帮小组看见顺序、依赖和当前进度。',
    skills: ['任务拆解', '步骤规划', '进度推动'],
    station: '任务看板',
    stationNote: '拆分任务、标记优先级、安排下一步。',
    position: { x: 842, y: 327 },
    deskPosition: { x: 866, y: 350 },
    deskVariant: 'app',
    scarfColor: '#62ad75',
    accent: '#62ad75',
    iconFrame: { x: 1710, y: 640, width: 242, height: 277 },
  },
  {
    id: 'pingping',
    name: '评评',
    title: '成果教练',
    subtitle: '检查成果 · 修改建议',
    intro: '像同伴一样看你的作品，指出亮点与不足，给出具体、可以落地的修改建议。',
    skills: ['标准检查', '作品评价', '修改建议'],
    station: '展示台',
    stationNote: '对照目标检查成果，让作品更清楚。',
    position: { x: 491, y: 627 },
    deskPosition: { x: 515, y: 650 },
    deskVariant: 'file',
    scarfColor: '#8a63c7',
    accent: '#8a63c7',
    iconFrame: { x: 624, y: 640, width: 254, height: 277 },
  },
  {
    id: 'jiji',
    name: '记记',
    title: '过程记录员',
    subtitle: '讨论整理 · 决定留痕',
    intro: '把讨论中的关键观点、决定和下一步保存下来，让项目过程成为可以回看的学习证据。',
    skills: ['讨论纪要', '关键决定', '过程留痕'],
    station: '过程档案',
    stationNote: '保存关键决定，形成小组的学习记录。',
    position: { x: 842, y: 627 },
    deskPosition: { x: 866, y: 650 },
    deskVariant: 'search',
    scarfColor: '#5b7ac8',
    accent: '#5b7ac8',
    iconFrame: { x: 2092, y: 640, width: 246, height: 277 },
  },
] as const satisfies readonly AgentRoleProfile[]

export const agentRoleById = Object.fromEntries(
  agentRoles.map((role) => [role.id, role]),
) as unknown as Record<AgentId, AgentRoleProfile>
