import { Assets, Container, Graphics, Rectangle, Spritesheet, Texture } from 'pixi.js'
import type { FederatedPointerEvent, SpritesheetData } from 'pixi.js'
import { agentRoles } from '@/assets/agent/roles'
import type { AgentId } from '@/domain/studio'
import { createActionTextureLoader } from './action-textures'
import { createOfficeOrchestrator, type PixiOfficeController } from './orchestrator'
import { pixiResources } from './resources'
import { createSpriteFactory } from './sprite-factory'
import { createStudyZones, type StudyZoneController } from './study-zones'
import { createWorkstationFactory, type WorkstationController } from './workstation'
import { pixiAssetLoadOptions, retryAssetLoad } from './asset-loading'

export const sceneWidth = 1200
export const sceneHeight = 900

export type SceneCameraLayout = {
  pivotX: number
  pivotY: number
  scale: number
}

export type SceneController = {
  container: Container
  viewport: Container
  workstations: Record<AgentId, WorkstationController>
  studyZones: StudyZoneController
  officeController: PixiOfficeController
  layout: (width: number, height: number) => void
  destroy: () => void
}

export type SceneClickAnchor = { x: number; y: number }
export type SceneHoverTarget = SceneClickAnchor & (
  | { kind: 'agent'; id: AgentId }
  | { kind: 'zone'; id: import('./study-zones').StudyZoneId }
)

type SceneOptions = {
  onLoadProgress?: (progress: number) => void
  onSelectAgent: (agentId: AgentId, anchor: SceneClickAnchor) => void
  onSelectStudyZone: (zoneId: import('./study-zones').StudyZoneId, anchor: SceneClickAnchor) => void
  onHoverTarget: (target: SceneHoverTarget | null) => void
  onClearSelection: () => void
}

const agentHitPadding = 12

export function getAgentHitArea(bounds: { x: number; y: number; width: number; height: number }): Rectangle {
  return new Rectangle(
    bounds.x - agentHitPadding,
    bounds.y - agentHitPadding,
    bounds.width + agentHitPadding * 2,
    bounds.height + agentHitPadding * 2,
  )
}

export function bindAgentPointerSelection(
  container: Container,
  agentId: AgentId,
  onSelectAgent: SceneOptions['onSelectAgent'],
): void {
  container.on('pointerdown', (event: FederatedPointerEvent) => {
    event.stopPropagation()
    onSelectAgent(agentId, { x: event.global.x, y: event.global.y })
  })
}

type AgentPointerCandidate = {
  id: AgentId
  bounds: { x: number; y: number; width: number; height: number }
}

export function resolveAgentPointerTarget(
  hoveredAgentId: AgentId | null,
  candidates: AgentPointerCandidate[],
  point: SceneClickAnchor,
): AgentId | null {
  if (hoveredAgentId) return hoveredAgentId
  return candidates.find(({ bounds }) => (
    point.x >= bounds.x - agentHitPadding
    && point.x <= bounds.x + bounds.width + agentHitPadding
    && point.y >= bounds.y - agentHitPadding
    && point.y <= bounds.y + bounds.height + agentHitPadding
  ))?.id ?? null
}

export async function createScene({ onLoadProgress, onSelectAgent, onSelectStudyZone, onHoverTarget, onClearSelection }: SceneOptions): Promise<SceneController> {
  reportProgress(onLoadProgress, 0)
  const [
    workstationTexture,
    workstationSheet,
    libraryTexture,
    planningTexture,
    archiveTexture,
    archiveClosedTexture,
    classroomDeskTexture,
    classroomChairTexture,
  ] = await Promise.all([
    Assets.load<Texture>(pixiResources.workstationImageUrl, pixiAssetLoadOptions),
    fetchSheet(pixiResources.workstationSheetUrl),
    Assets.load<Texture>(pixiResources.studyZoneImageUrls.library, pixiAssetLoadOptions),
    Assets.load<Texture>(pixiResources.studyZoneImageUrls.planning, pixiAssetLoadOptions),
    Assets.load<Texture>(pixiResources.studyZoneImageUrls.archive, pixiAssetLoadOptions),
    Assets.load<Texture>(pixiResources.studyZoneImageUrls.archiveClosed, pixiAssetLoadOptions),
    Assets.load<Texture>(pixiResources.classroomFurnitureImageUrls.desk, pixiAssetLoadOptions),
    Assets.load<Texture>(pixiResources.classroomFurnitureImageUrls.chair, pixiAssetLoadOptions),
  ])
  reportProgress(onLoadProgress, 0.25)

  const workstationSpritesheet = new Spritesheet(workstationTexture, workstationSheet)
  await workstationSpritesheet.parse()
  const textures = workstationSpritesheet.textures as Record<string, Texture>
  const textureLoader = createActionTextureLoader()
  const spriteFactory = createSpriteFactory()
  const actorLayer = new Container()
  const feedbackLayer = new Container()
  const workstationFactory = createWorkstationFactory({
    spriteFactory,
    textureLoader,
    textures,
    actorLayer,
    feedbackLayer,
    classroomTextures: {
      desk: classroomDeskTexture,
      chair: classroomChairTexture,
    },
  })

  const workstationResults = await Promise.allSettled(
    agentRoles.map((role) => workstationFactory.createWorkstation(role)),
  )
  const failedWorkstation = workstationResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  if (failedWorkstation) {
    workstationResults.forEach((result) => {
      if (result.status === 'fulfilled') result.value.destroy()
    })
    textureLoader.clearCache()
    throw failedWorkstation.reason
  }
  const createdWorkstations = workstationResults
    .filter((result): result is PromiseFulfilledResult<WorkstationController> => (
      result.status === 'fulfilled'
    ))
    .map((result) => result.value)
  const workstations = Object.fromEntries(
    createdWorkstations.map((workstation) => [workstation.roleProfile.id, workstation]),
  ) as Record<AgentId, WorkstationController>
  reportProgress(onLoadProgress, 0.82)

  const root = new Container()
  const viewport = new Container()
  const studyZones = createStudyZones({
    textures: {
      library: libraryTexture,
      planning: planningTexture,
      archive: archiveTexture,
    },
    archiveClosedTexture,
    onSelectZone: (zoneId, event) => onSelectStudyZone(zoneId, { x: event.global.x, y: event.global.y }),
    onHoverZone: (zoneId, event) => onHoverTarget(zoneId && event
      ? { kind: 'zone', id: zoneId, x: event.global.x, y: event.global.y }
      : null),
  })
  const background = createStudioBackground(studyZones)
  const workstationLayer = new Container()
  let hoveredAgentId: AgentId | null = null

  agentRoles.forEach((role) => {
    const workstation = workstations[role.id]
    workstation.person.container.eventMode = 'static'
    workstation.person.container.cursor = 'pointer'
    const personBounds = workstation.person.container.getLocalBounds()
    workstation.person.container.hitArea = getAgentHitArea(personBounds)
    bindAgentPointerSelection(workstation.person.container, role.id, onSelectAgent)
    workstation.person.container.on('pointerenter', (event: FederatedPointerEvent) => {
      hoveredAgentId = role.id
      onHoverTarget({ kind: 'agent', id: role.id, x: event.global.x, y: event.global.y })
    })
    workstation.person.container.on('pointermove', (event: FederatedPointerEvent) => {
      hoveredAgentId = role.id
      onHoverTarget({ kind: 'agent', id: role.id, x: event.global.x, y: event.global.y })
    })
    workstation.person.container.on('pointerleave', () => {
      if (hoveredAgentId === role.id) hoveredAgentId = null
      onHoverTarget(null)
    })
    workstationLayer.addChild(workstation.container)
  })

  // Speech and identity UI must stay above every desk, chair, workstation
  // effect, and roaming character, regardless of which workstation owns it.
  viewport.addChild(background, workstationLayer, actorLayer, feedbackLayer)
  root.addChild(viewport)
  root.eventMode = 'static'
  root.hitArea = new Rectangle(0, 0, sceneWidth, sceneHeight)
  root.on('pointerdown', (event: FederatedPointerEvent) => {
    const point = { x: event.global.x, y: event.global.y }
    const agentId = resolveAgentPointerTarget(
      hoveredAgentId,
      [...agentRoles].reverse().map((role) => ({
        id: role.id,
        bounds: workstations[role.id].person.container.getBounds(),
      })),
      point,
    )
    if (agentId) {
      event.stopPropagation()
      onSelectAgent(agentId, point)
      return
    }
    onClearSelection()
  })

  const officeController = createOfficeOrchestrator(workstations, studyZones)
  const sceneController: SceneController = {
    container: root,
    viewport,
    workstations,
    studyZones,
    officeController,
    layout: (width, height) => layoutScene(viewport, width, height),
    destroy: () => {
      officeController.destroy()
      studyZones.destroy()
      Object.values(workstations).forEach((workstation) => workstation.destroy())
      textureLoader.clearCache()
      root.destroy({ children: true })
    },
  }

  reportProgress(onLoadProgress, 1)
  return sceneController
}

async function fetchSheet(url: string): Promise<SpritesheetData> {
  const response = await retryAssetLoad(async () => {
    const result = await fetch(url, { cache: 'force-cache' })
    if (!result.ok) {
      throw new Error(`Unable to load spritesheet data: ${url}`)
    }
    return result
  })
  return (await response.json()) as SpritesheetData
}

function reportProgress(callback: ((progress: number) => void) | undefined, progress: number): void {
  callback?.(Math.max(0, Math.min(1, progress)))
}

export function getSceneCameraLayout(width: number, height: number): SceneCameraLayout {
  const isPortraitClassroom = width < 640 && height > width * 1.25
  if (isPortraitClassroom) {
    // Portrait screens prioritize the six-person collaboration area. Peripheral
    // study zones remain available from the compact "小组动态" navigation.
    return {
      pivotX: 700,
      pivotY: 450,
      scale: Math.min(width / 560, height / 820) * 0.98,
    }
  }

  return {
    pivotX: sceneWidth / 2,
    pivotY: sceneHeight / 2,
    scale: Math.min(width / sceneWidth, height / sceneHeight) * 0.98,
  }
}

function layoutScene(viewport: Container, width: number, height: number): void {
  if (width <= 0 || height <= 0) {
    return
  }

  const camera = getSceneCameraLayout(width, height)
  viewport.pivot.set(camera.pivotX, camera.pivotY)
  viewport.scale.set(camera.scale)
  viewport.position.set(width / 2, height / 2)
}

function createStudioBackground(studyZones: StudyZoneController): Container {
  const background = new Container()
  const paper = new Graphics()
  // Keep the room floor as one uninterrupted color. Previous decorative
  // white bays, aisle and top strip read as empty UI cards behind the scene.
  paper.rect(0, 0, sceneWidth, sceneHeight).fill({ color: 0xf2f4f5 })
  background.addChild(paper)
  background.addChild(studyZones.container)
  return background
}
