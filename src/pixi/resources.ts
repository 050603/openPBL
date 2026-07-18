import type { AgentActionName } from '@/assets/agent'

export const pixiResources = {
  workstationImageUrl: '/assets/img/workstation@2x.webp',
  workstationSheetUrl: '/assets/img/workstation@2x.webp.json',
  studyZoneImageUrls: {
    library: '/assets/img/study-zones/study-library-shadow-complete.png',
    planning: '/assets/img/study-zones/study-planning-library-match.png',
    archive: '/assets/img/study-zones/study-archive-library-match.png',
    archiveClosed: '/assets/img/study-zones/study-archive-closed.png',
  },
  actionBaseUrl: '/assets/agent/',
} as const

export function getActionResourceUrls(actionName: AgentActionName): {
  imageUrl: string
  sheetUrl: string
} {
  return {
    imageUrl: `${pixiResources.actionBaseUrl}${actionName}.webp`,
    sheetUrl: `${pixiResources.actionBaseUrl}${actionName}.webp.json`,
  }
}
