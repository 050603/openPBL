import { randomUUID } from "node:crypto";
import { createClient } from "redis";
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
  at: string;
  payload?: {
    actionType?: SessionAction["type"];
    [key: string]: unknown;
  };
}

export type RealtimeEventHandler = (event: RealtimeEvent) => void;

const CHANNEL = "openpbl:realtime:v1";
const instanceId = randomUUID();
const subscribersByCourse = new Map<string, Set<RealtimeEventHandler>>();
interface ManagedRedisClient {
  isOpen: boolean;
  quit(): Promise<string>;
}

interface PublishingRedisClient extends ManagedRedisClient {
  isReady: boolean;
  publish(channel: string, message: string): Promise<number>;
}

let publisher: PublishingRedisClient | null = null;
let subscriber: ManagedRedisClient | null = null;
let initialization: Promise<void> | null = null;

type RedisEnvelope = {
  origin: string;
  event: RealtimeEvent;
};

function dispatchLocal(event: RealtimeEvent): void {
  const handlers = subscribersByCourse.get(event.courseId);
  if (!handlers) return;
  for (const handler of [...handlers]) {
    try {
      handler(event);
    } catch (error) {
      console.error("[event-bus] subscriber failed:", error);
    }
  }
}

export async function initializeEventBus(): Promise<void> {
  if (initialization) return initialization;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return;

  initialization = (async () => {
    const pub = createClient({ url });
    const sub = pub.duplicate();
    pub.on("error", (error) => console.error("[event-bus] Redis publisher error:", error));
    sub.on("error", (error) => console.error("[event-bus] Redis subscriber error:", error));
    await Promise.all([pub.connect(), sub.connect()]);
    await sub.subscribe(CHANNEL, (message) => {
      try {
        const envelope = JSON.parse(message) as RedisEnvelope;
        if (envelope.origin !== instanceId && envelope.event?.courseId) {
          dispatchLocal(envelope.event);
        }
      } catch (error) {
        console.error("[event-bus] invalid Redis message:", error);
      }
    });
    publisher = pub;
    subscriber = sub;
    console.info("[event-bus] Redis cross-instance pub/sub connected");
  })().catch((error) => {
    initialization = null;
    console.error("[event-bus] Redis unavailable; local delivery remains active:", error);
  });

  return initialization;
}

export async function publishCourseEvent(
  courseId: string,
  event: RealtimeEvent,
): Promise<void> {
  if (!courseId) return;
  dispatchLocal(event);
  if (!publisher?.isReady) return;
  const envelope: RedisEnvelope = { origin: instanceId, event };
  await publisher.publish(CHANNEL, JSON.stringify(envelope));
}

export function subscribeCourseEvents(
  courseId: string,
  handler: RealtimeEventHandler,
): RealtimeEventHandler {
  if (!courseId) return handler;
  const handlers = subscribersByCourse.get(courseId) ?? new Set();
  handlers.add(handler);
  subscribersByCourse.set(courseId, handlers);
  return handler;
}

export function unsubscribeCourseEvents(
  courseId: string,
  handler: RealtimeEventHandler,
): void {
  const handlers = subscribersByCourse.get(courseId);
  if (!handlers) return;
  handlers.delete(handler);
  if (handlers.size === 0) subscribersByCourse.delete(courseId);
}

export async function closeEventBus(): Promise<void> {
  const clients: ManagedRedisClient[] = [];
  if (subscriber) clients.push(subscriber);
  if (publisher) clients.push(publisher);
  subscriber = null;
  publisher = null;
  initialization = null;
  await Promise.all(
    clients.map(async (client) => {
      if (client.isOpen) await client.quit();
    }),
  );
}

export function __resetEventBusForTests(): void {
  subscribersByCourse.clear();
}
