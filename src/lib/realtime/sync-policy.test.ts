import { describe, expect, it } from "vitest";
import {
  COURSE_EVENT_POLL_INTERVAL_MS,
  latestEventCursor,
} from "./sync-policy";

describe("realtime synchronization policy", () => {
  it("keeps durable cursor reconciliation enabled with WebSocket connected", () => {
    expect(COURSE_EVENT_POLL_INTERVAL_MS.websocket).toBeGreaterThan(0);
    expect(COURSE_EVENT_POLL_INTERVAL_MS.websocket).toBeGreaterThanOrEqual(
      COURSE_EVENT_POLL_INTERVAL_MS.polling,
    );
  });

  it("never moves a course event cursor backwards", () => {
    expect(latestEventCursor("18", "21", "19")).toBe("21");
    expect(latestEventCursor("7", undefined, "invalid")).toBe("7");
  });
});
