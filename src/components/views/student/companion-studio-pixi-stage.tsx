'use client'

import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { Application } from 'pixi.js'
import { agentRoleById } from '@/assets/agent/roles'
import { type AgentId, type PartnerRuntime } from '@/domain/studio'
import { createScene, type SceneController, type SceneHoverTarget } from '@/pixi/scene'
import type { PixiOfficeController } from '@/pixi/orchestrator'
import { studyZoneDefinitions, type StudyZoneId } from '@/pixi/study-zones'

export type StudyZoneCommand = {
  agentId: AgentId
  zoneId: StudyZoneId
  token: number
}

type PixiStageProps = {
  agentStates: Record<AgentId, PartnerRuntime>
  selectedAgentId: AgentId | null
  onSelectAgent: (agentId: AgentId) => void
  onSelectStudyZone: (zoneId: StudyZoneId) => void
  onClearSelection: () => void
  studyZoneCommand: StudyZoneCommand | null
}

export default function PixiStage({
  agentStates,
  selectedAgentId,
  onSelectAgent,
  onSelectStudyZone,
  onClearSelection,
  studyZoneCommand,
}: PixiStageProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const sceneRef = useRef<SceneController | null>(null)
  const controllerRef = useRef<PixiOfficeController | null>(null)
  const initPromiseRef = useRef<Promise<void> | null>(null)
  const destroyTimerRef = useRef<number | null>(null)
  const cancelledRef = useRef(false)
  const onSelectAgentRef = useRef(onSelectAgent)
  const onSelectStudyZoneRef = useRef(onSelectStudyZone)
  const onClearSelectionRef = useRef(onClearSelection)
  const agentStatesRef = useRef(agentStates)
  const selectedAgentIdRef = useRef(selectedAgentId)
  const studyZoneCommandRef = useRef<StudyZoneCommand | null>(studyZoneCommand)
  const lastStudyZoneCommandRef = useRef<number | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [hoverTarget, setHoverTarget] = useState<SceneHoverTarget | null>(null)
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 })

  useEffect(() => {
    onSelectAgentRef.current = onSelectAgent
  }, [onSelectAgent])

  useEffect(() => {
    onSelectStudyZoneRef.current = onSelectStudyZone
  }, [onSelectStudyZone])

  useEffect(() => {
    onClearSelectionRef.current = onClearSelection
  }, [onClearSelection])

  useEffect(() => {
    agentStatesRef.current = agentStates
    selectedAgentIdRef.current = selectedAgentId
    const controller = controllerRef.current
    if (controller) {
      syncController(controller, agentStates, selectedAgentId)
    }
  }, [agentStates, selectedAgentId])

  useEffect(() => {
    studyZoneCommandRef.current = studyZoneCommand
    const controller = controllerRef.current
    if (!controller || !studyZoneCommand || lastStudyZoneCommandRef.current === studyZoneCommand.token) {
      return
    }

    lastStudyZoneCommandRef.current = studyZoneCommand.token
    void controller.interactWithStudyZone(studyZoneCommand.agentId, studyZoneCommand.zoneId)
  }, [studyZoneCommand])

  useEffect(() => {
    const mountNode = mountRef.current
    if (!mountNode) {
      return undefined
    }

    cancelledRef.current = false
    if (destroyTimerRef.current !== null) {
      window.clearTimeout(destroyTimerRef.current)
      destroyTimerRef.current = null
    }

    if (!appRef.current && !initPromiseRef.current) {
      const initialise = async () => {
        const app = new Application()
        await app.init({
          antialias: true,
          background: '#f2f4f5',
          width: Math.max(1, mountNode.clientWidth),
          height: Math.max(1, mountNode.clientHeight),
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        })

        if (cancelledRef.current) {
          // Assets is a process-wide cache. Destroying shared textures here makes
          // a Strict Mode remount reuse invalid GPU resources, leaving an empty
          // canvas after a refresh.
          destroyApplicationSafely(app)
          return
        }

        appRef.current = app
        mountNode.replaceChildren(app.canvas)

        const scene = await createScene({
          onLoadProgress: (progress) => setLoadingProgress(Math.round(progress * 100)),
          onSelectAgent: (agentId, anchor) => {
            void anchor
            onSelectAgentRef.current(agentId)
          },
          onSelectStudyZone: (zoneId, anchor) => {
            void anchor
            onSelectStudyZoneRef.current(zoneId)
          },
          onHoverTarget: setHoverTarget,
          onClearSelection: () => {
            onClearSelectionRef.current()
          },
        })

        if (cancelledRef.current) {
          scene.destroy()
          destroyApplicationSafely(app)
          appRef.current = null
          return
        }

        sceneRef.current = scene
        controllerRef.current = scene.officeController
        app.stage.addChild(scene.container)
        syncController(scene.officeController, agentStatesRef.current, selectedAgentIdRef.current)
        const command = studyZoneCommandRef.current
        if (command && lastStudyZoneCommandRef.current !== command.token) {
          lastStudyZoneCommandRef.current = command.token
          void scene.officeController.interactWithStudyZone(command.agentId, command.zoneId)
        }
        resizeScene(mountNode, app, scene)

        const resizeObserver = new ResizeObserver(() => {
          resizeScene(mountNode, app, scene)
          setStageSize({ width: mountNode.clientWidth, height: mountNode.clientHeight })
        })
        resizeObserver.observe(mountNode)
        setStageSize({ width: mountNode.clientWidth, height: mountNode.clientHeight })
        ;(scene as SceneController & { resizeObserver?: ResizeObserver }).resizeObserver = resizeObserver
      }

      setLoadingError(null)
      const promise = initialise()
        .catch((error: unknown) => {
          console.error('Pixi scene initialisation failed', error)
          destroyPixiScene(mountNode, appRef, sceneRef, controllerRef)
          setLoadingError(error instanceof Error ? error.message : '场景加载失败')
        })
        .finally(() => {
          initPromiseRef.current = null
        })
      initPromiseRef.current = promise
    }

    return () => {
      cancelledRef.current = true
      destroyTimerRef.current = window.setTimeout(() => {
        destroyTimerRef.current = null
        destroyPixiScene(mountNode, appRef, sceneRef, controllerRef)
      }, 0)
    }
  }, [])

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#f2f4f5]">
      <div ref={mountRef} className="pixi-stage absolute inset-0" aria-label="AI 伴学工作室场景" />
      {hoverTarget && <SceneHoverLabel target={hoverTarget} stageSize={stageSize} />}
      {(loadingProgress < 100 || loadingError) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f2f4f5]/95 p-6">
          <div className="w-full max-w-xs rounded-2xl border border-[#18252d]/10 bg-[#fffdf8] p-5 shadow-[0_12px_40px_rgba(24,37,45,0.12)]">
            <div className="mb-4 flex items-center justify-between text-xs font-bold uppercase tracking-[0.18em] text-[#718087]">
              <span>STUDIO / PIXI</span>
              <span>{loadingError ? 'ERROR' : `${loadingProgress}%`}</span>
            </div>
            <h2 className="font-serif text-xl font-bold text-[#18252d]">正在铺开学习空间</h2>
            <p className="mt-2 text-sm leading-6 text-[#526068]">
              {loadingError ?? '正在加载角色、工位和项目学习区域…'}
            </p>
            {!loadingError && (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e9e2d7]">
                <div className="h-full rounded-full bg-[#0a8d84] transition-[width] duration-300" style={{ width: `${loadingProgress}%` }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SceneHoverLabel({
  target,
  stageSize,
}: {
  target: SceneHoverTarget
  stageSize: { width: number; height: number }
}) {
  const label = target.kind === 'agent'
    ? agentRoleById[target.id].name
    : studyZoneDefinitions[target.id].title
  const summary = target.kind === 'agent'
    ? agentRoleById[target.id].title
    : studyZoneDefinitions[target.id].subtitle
  const accent = target.kind === 'agent' ? agentRoleById[target.id].accent : '#0a8d84'
  const width = Math.max(118, Math.min(230, Math.max(label.length * 17, summary.length * 12) + 30))
  const left = Math.max(width / 2 + 10, Math.min(stageSize.width - width / 2 - 10, target.x))
  const preferredTop = target.kind === 'agent' ? target.y - 42 : target.y + 16
  const top = Math.max(12, Math.min(stageSize.height - 38, preferredTop))

  return (
    <div
      className="pointer-events-none absolute z-20 flex -translate-x-1/2 items-start justify-center gap-2 px-1 py-1 text-slate-700"
      style={{ left, top, width }}
    >
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full shadow-[0_0_0_3px_rgba(255,255,255,0.9)]" style={{ backgroundColor: accent }} />
      <span className="min-w-0 text-left [text-shadow:-1px_-1px_0_#fff,1px_-1px_0_#fff,-1px_1px_0_#fff,1px_1px_0_#fff,0_2px_10px_rgba(24,37,45,0.22)]">
        <strong className="block text-[12px] font-bold tracking-[0.08em] text-slate-800">{label}</strong>
        <small className="mt-0.5 block truncate text-[10px] font-medium tracking-[0.03em] text-slate-600">{summary}</small>
      </span>
    </div>
  )
}

function syncController(
  controller: PixiOfficeController,
  agentStates: Record<AgentId, PartnerRuntime>,
  selectedAgentId: AgentId | null,
): void {
  Object.entries(agentStates).forEach(([agentId, runtime]) => {
    const id = agentId as AgentId
    controller.setAgentState(id, runtime.state)
    controller.setAgentMessage(id, runtime.message)
    controller.assignTask(id, runtime.task)
  })
  controller.selectAgent(selectedAgentId)
}

function resizeScene(mountNode: HTMLDivElement, app: Application, scene: SceneController): void {
  const width = Math.max(1, mountNode.clientWidth)
  const height = Math.max(1, mountNode.clientHeight)
  app.renderer.resize(width, height)
  scene.layout(width, height)
}

function destroyPixiScene(
  mountNode: HTMLDivElement,
  appRef: MutableRefObject<Application | null>,
  sceneRef: MutableRefObject<SceneController | null>,
  controllerRef: MutableRefObject<PixiOfficeController | null>,
): void {
  const scene = sceneRef.current
  const app = appRef.current
  const resizeObserver = (scene as SceneController & { resizeObserver?: ResizeObserver } | null)?.resizeObserver

  resizeObserver?.disconnect()
  scene?.destroy()
  controllerRef.current = null
  sceneRef.current = null

  if (app) {
    destroyApplicationSafely(app)
  }

  appRef.current = null
  mountNode.replaceChildren()
}

function destroyApplicationSafely(app: Application): void {
  const resizeAwareApp = app as Application & { _cancelResize?: (() => void) | null }
  // Pixi's ResizePlugin can be only partially initialised when a Next.js route
  // redirects while app.init() is still resolving. Its destroy hook assumes
  // _cancelResize exists, so make the teardown idempotent for that short-lived
  // application without touching process-wide cached textures.
  if (resizeAwareApp._cancelResize == null) {
    resizeAwareApp._cancelResize = () => undefined
  }
  try {
    app.destroy(true, { children: true, texture: false })
  } catch (error) {
    console.warn('Pixi application teardown was incomplete', error)
  }
}
