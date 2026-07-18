export type NavigationPoint = { x: number; y: number }

const arrivalTolerance = 6

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
  speed = 185,
): number {
  return Math.max(180, Math.round((distanceBetween(from, to) / speed) * 1000))
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
