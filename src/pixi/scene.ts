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

export const sceneWidth = 1200
export const sceneHeight = 900

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

export async function createScene({ onLoadProgress, onSelectAgent, onSelectStudyZone, onHoverTarget, onClearSelection }: SceneOptions): Promise<SceneController> {
  reportProgress(onLoadProgress, 0)
  const [
    workstationTexture,
    workstationSheet,
    libraryTexture,
    planningTexture,
    archiveTexture,
    archiveClosedTexture,
  ] = await Promise.all([
    Assets.load<Texture>(pixiResources.workstationImageUrl),
    fetchSheet(pixiResources.workstationSheetUrl),
    Assets.load<Texture>(pixiResources.studyZoneImageUrls.library),
    Assets.load<Texture>(pixiResources.studyZoneImageUrls.planning),
    Assets.load<Texture>(pixiResources.studyZoneImageUrls.archive),
    Assets.load<Texture>(pixiResources.studyZoneImageUrls.archiveClosed),
  ])
  reportProgress(onLoadProgress, 0.25)

  const workstationSpritesheet = new Spritesheet(workstationTexture, workstationSheet)
  await workstationSpritesheet.parse()
  const textures = workstationSpritesheet.textures as Record<string, Texture>
  const textureLoader = createActionTextureLoader()
  const spriteFactory = createSpriteFactory()
  const actorLayer = new Container()
  const workstationFactory = createWorkstationFactory({
    spriteFactory,
    textureLoader,
    textures,
    actorLayer,
  })

  const createdWorkstations = await Promise.all(
    agentRoles.map((role) => workstationFactory.createWorkstation(role)),
  )
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

  agentRoles.forEach((role) => {
    const workstation = workstations[role.id]
    workstation.container.on('pointertap', (event: FederatedPointerEvent) => {
      event.stopPropagation()
      onSelectAgent(role.id, { x: event.global.x, y: event.global.y })
    })
    workstation.person.container.eventMode = 'static'
    workstation.person.container.cursor = 'pointer'
    workstation.person.container.on('pointertap', (event: FederatedPointerEvent) => {
      event.stopPropagation()
      onSelectAgent(role.id, { x: event.global.x, y: event.global.y })
    })
    workstation.person.container.on('pointerenter', (event: FederatedPointerEvent) => {
      onHoverTarget({ kind: 'agent', id: role.id, x: event.global.x, y: event.global.y })
    })
    workstation.person.container.on('pointermove', (event: FederatedPointerEvent) => {
      onHoverTarget({ kind: 'agent', id: role.id, x: event.global.x, y: event.global.y })
    })
    workstation.person.container.on('pointerleave', () => onHoverTarget(null))
    workstationLayer.addChild(workstation.container)
  })

  viewport.addChild(background, workstationLayer, actorLayer)
  root.addChild(viewport)
  root.eventMode = 'static'
  root.hitArea = new Rectangle(0, 0, sceneWidth, sceneHeight)
  root.on('pointertap', onClearSelection)

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
  const response = await fetch(url, { cache: 'force-cache' })
  if (!response.ok) {
    throw new Error(`Unable to load spritesheet data: ${url}`)
  }
  return (await response.json()) as SpritesheetData
}

function reportProgress(callback: ((progress: number) => void) | undefined, progress: number): void {
  callback?.(Math.max(0, Math.min(1, progress)))
}

function layoutScene(viewport: Container, width: number, height: number): void {
  if (width <= 0 || height <= 0) {
    return
  }

  const scale = Math.min(width / sceneWidth, height / sceneHeight) * 0.98
  viewport.pivot.set(sceneWidth / 2, sceneHeight / 2)
  viewport.scale.set(scale)
  viewport.position.set(width / 2, height / 2)
}

function createStudioBackground(studyZones: StudyZoneController): Container {
  const background = new Container()
  const paper = new Graphics()
  // A cool, almost-white gray keeps the study furniture grounded while the
  // white materials and their contact shadows remain readable.
  paper.rect(0, 0, sceneWidth, sceneHeight).fill({ color: 0xf2f4f5 })
  paper.rect(0, 0, sceneWidth, 15).fill({ color: 0xffffff, alpha: 0.98 })
  paper.rect(0, 15, sceneWidth, 3).fill({ color: 0xe4e8ea, alpha: 0.9 })
  background.addChild(paper)
  background.addChild(studyZones.container)
  return background
}
