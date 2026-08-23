export type RealtimeTransportMode = "websocket" | "polling";

/**
 * WebSocket is the low-latency path. The durable database cursor remains the
 * correctness path so a client cannot become permanently stale when an API
 * request and its socket are handled by different server instances.
 */
export const COURSE_EVENT_POLL_INTERVAL_MS: Record<RealtimeTransportMode, number> = {
  websocket: 3_000,
  polling: 2_000,
};

export const COURSE_SYNC_FAILURE_NOTICE_THRESHOLD = 3;

export function latestEventCursor(
  ...values: Array<string | undefined>
): string {
  let latest = "0";
  for (const value of values) {
    if (!value || !/^\d+$/.test(value)) continue;
    const cursor = value.replace(/^0+(?=\d)/, "");
    if (
      cursor.length > latest.length
      || (cursor.length === latest.length && cursor > latest)
    ) {
      latest = cursor;
    }
  }
  return latest;
}
