import { Container } from 'pixi.js'
import type { FederatedPointerEvent } from 'pixi.js'
import { describe, expect, it, vi } from 'vitest'
import { bindAgentPointerSelection, getAgentHitArea, getSceneCameraLayout, resolveAgentPointerTarget } from './scene'

describe('getSceneCameraLayout', () => {
  it('keeps the complete classroom visible on desktop', () => {
    expect(getSceneCameraLayout(1440, 1000)).toEqual({
      pivotX: 600,
      pivotY: 450,
      scale: (1000 / 900) * 0.98,
    })
  })

  it('zooms portrait screens into the six-person collaboration area', () => {
    const layout = getSceneCameraLayout(390, 844)
    expect(layout.pivotX).toBe(700)
    expect(layout.pivotY).toBe(450)
    expect(layout.scale).toBeCloseTo((390 / 560) * 0.98)
    expect(layout.scale).toBeGreaterThan(0.65)
  })
})

describe('agent pointer selection', () => {
  it('adds click tolerance around animated character bounds', () => {
    expect(getAgentHitArea({ x: 10, y: 20, width: 40, height: 70 })).toMatchObject({
      x: -2,
      y: 8,
      width: 64,
      height: 94,
    })
  })

  it('selects on pointer down so moving seated animation frames cannot cancel the click', () => {
    const container = new Container()
    const onSelect = vi.fn()
    const stopPropagation = vi.fn()
    bindAgentPointerSelection(container, 'cece', onSelect)

    container.emit('pointerdown', {
      global: { x: 320, y: 240 },
      stopPropagation,
    } as unknown as FederatedPointerEvent)

    expect(stopPropagation).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('cece', { x: 320, y: 240 })
  })

  it('keeps the hovered seated agent selectable when the foreground desk receives the pointer', () => {
    expect(resolveAgentPointerTarget('wenwen', [], { x: 410, y: 360 })).toBe('wenwen')
  })

  it('falls back to the current animated global bounds when hover changes during pointer down', () => {
    expect(resolveAgentPointerTarget(null, [
      { id: 'zhizhi', bounds: { x: 100, y: 120, width: 60, height: 90 } },
      { id: 'lingling', bounds: { x: 260, y: 120, width: 60, height: 90 } },
    ], { x: 251, y: 155 })).toBe('lingling')
  })
})
