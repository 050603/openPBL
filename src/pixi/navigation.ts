import {
  getAgentActionDefinition,
  type AgentActionName,
} from '@/assets/agent'

export type NavigationPoint = { x: number; y: number }
export type WalkingActionName =
  | 'fc_walking_h'
  | 'fc_walking_up'
  | 'fc_walking_down'
export type NavigationTrafficLease = {
  release: () => void
}
export type NavigationTrafficController = {
  acquire: (isActive?: () => boolean) => Promise<NavigationTrafficLease | null>
}

const arrivalTolerance = 6
const verticalDirectionRatio = 0.72
const deskExitCommitRatio = 0.5

export function compactNavigationRoute(
  from: NavigationPoint,
  points: readonly NavigationPoint[],
): NavigationPoint[] {
  const route: NavigationPoint[] = []
  let cursor = from

  points.forEach((point) => {
    if (distanceBetween(cursor, point) <= arrivalTolerance) {
      return
    }

    const previous = route.at(-1)
    const beforePrevious = route.at(-2) ?? from
    if (previous && isCollinear(beforePrevious, previous, point)) {
      route[route.length - 1] = point
    } else {
      route.push(point)
    }
    cursor = point
  })

  return route
}

export function walkingDuration(
  from: NavigationPoint,
  to: NavigationPoint,
  speed = 140,
): number {
  return Math.max(180, Math.round((distanceBetween(from, to) / speed) * 1000))
}

export function walkingActionForVector(
  deltaX: number,
  deltaY: number,
): WalkingActionName {
  const verticalTravel = Math.abs(deltaY)
  const horizontalTravel = Math.abs(deltaX)
  if (verticalTravel > 8 && verticalTravel > horizontalTravel * verticalDirectionRatio) {
    return deltaY < 0 ? 'fc_walking_up' : 'fc_walking_down'
  }

  return 'fc_walking_h'
}

export function walkingSpeedForAction(actionName: WalkingActionName): number {
  const definition = getAgentActionDefinition(actionName as AgentActionName)
  const frameCount = definition.frameCount
  const authoredFps = definition.authoredFps
  const pixelsPerCycle = definition.pixelsPerCycle
  if (!frameCount || !authoredFps || !pixelsPerCycle) {
    throw new Error(`Walking action is missing cadence metadata: ${actionName}`)
  }

  return (pixelsPerCycle * authoredFps) / frameCount
}

export function walkingDurationForAction(
  from: NavigationPoint,
  to: NavigationPoint,
  actionName: WalkingActionName,
): number {
  return walkingDuration(from, to, walkingSpeedForAction(actionName))
}

export function classroomAisleRoute(
  from: NavigationPoint,
  to: NavigationPoint,
  aisleX: number,
): NavigationPoint[] {
  const isSameRow = Math.abs(to.y - from.y) <= 24
  if (isSameRow) {
    return compactNavigationRoute(from, [to])
  }

  return compactNavigationRoute(from, [
    { x: aisleX, y: from.y },
    { x: aisleX, y: to.y },
    to,
  ])
}

/**
 * Returns the forward clearance point only when it advances toward the
 * destination. Same-row and upward trips leave directly through the side of
 * the desk instead of walking down and immediately doubling back.
 */
export function deskDepartureWaypoint(
  seatExit: NavigationPoint,
  forwardClearance: NavigationPoint,
  destination: NavigationPoint,
): NavigationPoint | null {
  const clearanceVector = {
    x: forwardClearance.x - seatExit.x,
    y: forwardClearance.y - seatExit.y,
  }
  const clearanceLength = Math.hypot(clearanceVector.x, clearanceVector.y)
  if (clearanceLength <= arrivalTolerance) {
    return null
  }

  const destinationVector = {
    x: destination.x - seatExit.x,
    y: destination.y - seatExit.y,
  }
  const progressTowardClearance = (
    destinationVector.x * clearanceVector.x
    + destinationVector.y * clearanceVector.y
  ) / clearanceLength

  return progressTowardClearance >= clearanceLength * deskExitCommitRatio
    ? forwardClearance
    : null
}

/**
 * Serialises the narrow shared aisle without blocking independent actions at
 * desks or study zones. A queued movement may be cancelled before its turn;
 * releasing a lease is idempotent so interrupted routes cannot deadlock the
 * following agent.
 */
export function createNavigationTrafficController(): NavigationTrafficController {
  let tail = Promise.resolve()

  return {
    acquire: async (isActive = () => true) => {
      let released = false
      let releaseTurn = () => {}
      const turn = new Promise<void>((resolve) => {
        releaseTurn = resolve
      })
      const previous = tail
      tail = previous.then(() => turn)
      await previous

      const release = () => {
        if (released) return
        released = true
        releaseTurn()
      }
      if (!isActive()) {
        release()
        return null
      }

      return { release }
    },
  }
}

function distanceBetween(from: NavigationPoint, to: NavigationPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

function isCollinear(
  from: NavigationPoint,
  middle: NavigationPoint,
  to: NavigationPoint,
): boolean {
  const cross = (middle.x - from.x) * (to.y - middle.y)
    - (middle.y - from.y) * (to.x - middle.x)
  if (Math.abs(cross) > 1) {
    return false
  }

  const firstDirection = {
    x: Math.sign(middle.x - from.x),
    y: Math.sign(middle.y - from.y),
  }
  const secondDirection = {
    x: Math.sign(to.x - middle.x),
    y: Math.sign(to.y - middle.y),
  }
  return firstDirection.x === secondDirection.x && firstDirection.y === secondDirection.y
}
