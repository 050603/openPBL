import type { AgentActionName } from '@/assets/agent'

export const pixiResources = {
  workstationImageUrl: '/assets/img/workstation@2x.webp',
  workstationSheetUrl: '/assets/img/workstation@2x.webp.json',
  classroomFurnitureImageUrls: {
    desk: '/assets/img/classroom/student-computer-desk.png',
    chair: '/assets/img/classroom/student-chair.png',
  },
  studyZoneImageUrls: {
    library: '/assets/img/study-zones/study-library-shadow-complete.png',
    planning: '/assets/img/study-zones/study-planning-library-match.png',
    archive: '/assets/img/study-zones/study-archive-library-match.png',
    archiveClosed: '/assets/img/study-zones/study-archive-closed.png',
  },
  actionBaseUrl: '/assets/agent/',
  openPblActionBaseUrl: '/assets/openpbl-agent/',
} as const

const openPblActionAliases: Partial<Record<AgentActionName, string>> = {
  agreeing: 'agreeing',
  brainstorming: 'brainstorming',
  cheer_main: 'completed',
  cheer1_sub: 'completed',
  cheer2_sub: 'completed',
  completed: 'completed',
  error: 'error',
  fc_high_press: 'error',
  fc_walking_h: 'walking_horizontal',
  fc_walking_up: 'walking_up',
  leaving: 'leaving',
  listening: 'listening',
  off_chair: 'off_chair',
  sit_down: 'sit_down',
  organizing_files: 'organizing_files',
  planning_board: 'planning_board',
  peek: 'waiting_user',
  presenting: 'presenting',
  questioning: 'questioning',
  reading_book: 'reading_book',
  reviewing_work: 'reviewing_work',
  salute: 'selected',
  searching_info: 'searching_info',
  selected: 'selected',
  sleeping: 'standby',
  standby: 'standby',
  talking_on_seat: 'talking_on_seat',
  'talking_on_stand-0': 'talking_on_stand_a',
  'talking_on_stand-1': 'talking_on_stand_b',
  thinking: 'thinking',
  waiting_user: 'waiting_user',
  working: 'working',
  writing_notes: 'writing_notes',
}

const legacyActionAliases: Partial<Record<AgentActionName, string>> = {
  agreeing: 'cheer1_sub',
  brainstorming: 'working',
  completed: 'cheer1_sub',
  error: 'fc_high_press',
  leaving: 'fc_walking_h',
  listening: 'standby',
  planning_board: 'talking_on_stand-0',
  presenting: 'talking_on_stand-1',
  questioning: 'peek',
  reviewing_work: 'working',
  searching_info: 'working',
  selected: 'salute',
  thinking: 'standby',
  waiting_user: 'peek',
  writing_notes: 'working',
}

export function getActionResourceUrls(actionName: AgentActionName): {
  imageUrl: string
  sheetUrl: string
} {
  const legacyArt = process.env.NEXT_PUBLIC_AGENT_ART === 'legacy'
  const openPblAction = legacyArt
    ? undefined
    : openPblActionAliases[actionName]
  if (openPblAction) {
    return {
      imageUrl: `${pixiResources.openPblActionBaseUrl}${openPblAction}.webp`,
      sheetUrl: `${pixiResources.openPblActionBaseUrl}${openPblAction}.webp.json`,
    }
  }

  const legacyAction = legacyArt ? legacyActionAliases[actionName] ?? actionName : actionName
  return {
    imageUrl: `${pixiResources.actionBaseUrl}${legacyAction}.webp`,
    sheetUrl: `${pixiResources.actionBaseUrl}${legacyAction}.webp.json`,
  }
}
