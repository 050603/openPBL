import type { AgentActionName } from '@/assets/agent'

export type DeskAmbientActionName = Extract<
  AgentActionName,
  'looking_around' | 'slacking' | 'stretching' | 'napping'
>

export type DeskAmbientBehavior = {
  action: DeskAmbientActionName
  weight: number
  minIdleMs: number
  minDurationMs: number
  maxDurationMs: number
  noticeableRest: boolean
}

export const deskAmbientBehaviors: readonly DeskAmbientBehavior[] = [
  {
    action: 'looking_around',
    weight: 5,
    minIdleMs: 10_000,
    minDurationMs: 4_500,
    maxDurationMs: 6_500,
    noticeableRest: false,
  },
  {
    action: 'slacking',
    weight: 2,
    minIdleMs: 22_000,
    minDurationMs: 5_500,
    maxDurationMs: 7_500,
    noticeableRest: true,
  },
  {
    action: 'stretching',
    weight: 1.25,
    minIdleMs: 34_000,
    minDurationMs: 4_500,
    maxDurationMs: 6_000,
    noticeableRest: true,
  },
  {
    action: 'napping',
    weight: 0.45,
    minIdleMs: 60_000,
    minDurationMs: 8_000,
    maxDurationMs: 11_500,
    noticeableRest: true,
  },
]

type EligibilityOptions = {
  idleMs: number
  noticeableRestActive: boolean
  previousAction: DeskAmbientActionName | null
}

export function eligibleDeskAmbientBehaviors({
  idleMs,
  noticeableRestActive,
  previousAction,
}: EligibilityOptions): DeskAmbientBehavior[] {
  const eligible = deskAmbientBehaviors.filter((behavior) => (
    idleMs >= behavior.minIdleMs
    && (!noticeableRestActive || !behavior.noticeableRest)
  ))
  const alternatives = eligible.filter((behavior) => behavior.action !== previousAction)
  return alternatives.length > 0 ? alternatives : eligible
}

export function pickWeightedDeskAmbientBehavior(
  randomValue: number,
  behaviors: readonly DeskAmbientBehavior[],
): DeskAmbientBehavior | null {
  if (behaviors.length === 0) return null
  const totalWeight = behaviors.reduce((sum, behavior) => sum + behavior.weight, 0)
  const boundedRandom = Math.min(0.999_999_999, Math.max(0, randomValue))
  let threshold = boundedRandom * totalWeight
  for (const behavior of behaviors) {
    threshold -= behavior.weight
    if (threshold < 0) return behavior
  }

  return behaviors.at(-1) ?? null
}

export function deskAmbientDuration(
  behavior: DeskAmbientBehavior,
  randomValue: number,
): number {
  const boundedRandom = Math.min(1, Math.max(0, randomValue))
  return Math.round(
    behavior.minDurationMs
    + (behavior.maxDurationMs - behavior.minDurationMs) * boundedRandom,
  )
}
