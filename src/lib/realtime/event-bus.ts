// Internal pub/sub event bus for realtime session updates.
//
// When REDIS_URL is configured, callers can swap in a Redis-backed adapter
// (left as a future extension) to broadcast across multiple server instances.
// Without REDIS_URL, a process-local Map of handlers is used — sufficient for
// single-instance deployments and for local development.
//
// The bus is intentionally tiny: it routes typed RealtimeEvent objects from
// the session store to whoever is subscribed for a given courseId (typically
// the WebSocket server's per-course room).

import type { SessionAction } from "@/lib/session/actions";

export type RealtimeEventType =
  | "course-updated"
  | "stage-changed"
  | "student-joined"
  | "student-left"
  | "submission-updated"
  | "feedback-added"
  | "companion-message"
  | "projection-changed"
  | "presence-update";

export interface RealtimeEvent {
  type: RealtimeEventType;
  courseId: string;
  /** ISO timestamp when the event was generated. */
  at: string;
  /** Optional payload (e.g. affected entity id, action shape). */
  payload?: {
    actionType?: SessionAction["type"];
    [key: string]: unknown;
  };
}

export type RealtimeEventHandler = (event: RealtimeEvent) => void;

type CourseHandlers = Set<RealtimeEventHandler>;

const subscribersByCourse = new Map<string, CourseHandlers>();

/**
 * Publish an event for a specific course. All handlers subscribed to that
 * courseId (in the current process) will be invoked synchronously.
 */
export function publishCourseEvent(courseId: string, event: RealtimeEvent): void {
  if (!courseId) return;
  const handlers = subscribersByCourse.get(courseId);
  if (!handlers || handlers.size === 0) return;
  // Iterate over a copy so handlers may unsubscribe during dispatch.
  for (const handler of Array.from(handlers)) {
    try {
      handler(event);
    } catch (err) {
      // A misbehaving handler must not break other subscribers.
      console.error("[event-bus] handler threw:", err);
    }
  }
}

/**
 * Subscribe to all events for a given courseId. Returns the handler so it
 * can be passed back to unsubscribeCourseEvents.
 */
export function subscribeCourseEvents(
  courseId: string,
  handler: RealtimeEventHandler,
): RealtimeEventHandler {
  if (!courseId) return handler;
  let handlers = subscribersByCourse.get(courseId);
  if (!handlers) {
    handlers = new Set();
    subscribersByCourse.set(courseId, handlers);
  }
  handlers.add(handler);
  return handler;
}

/**
 * Remove a previously-registered handler. Safe to call even if the handler
 * was never subscribed.
 */
export function unsubscribeCourseEvents(
  courseId: string,
  handler: RealtimeEventHandler,
): void {
  if (!courseId) return;
  const handlers = subscribersByCourse.get(courseId);
  if (!handlers) return;
  handlers.delete(handler);
  if (handlers.size === 0) {
    subscribersByCourse.delete(courseId);
  }
}

/**
 * Test-only helper: clears all subscriptions. Not exported via the public
 * surface area; used by unit tests to isolate state between cases.
 */
export function __resetEventBusForTests(): void {
  subscribersByCourse.clear();
}
