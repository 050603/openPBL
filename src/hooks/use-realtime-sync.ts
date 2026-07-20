"use client";

// useRealtimeSync — React hook that wires a component to the realtime
// session sync (Stage 4). Calling it with a courseId automatically connects
// (or re-subscribes) the shared WebSocket to that course's room; calling
// it with undefined disconnects.
//
// Returns the current connection state so components can surface a
// "live / syncing" indicator to the user.
//
// This hook depends on SessionProvider for the underlying WebSocket
// connection (single shared socket per browser tab).

import { useEffect } from "react";
import { useSession } from "@/lib/session/store";

export interface RealtimeSyncState {
  /** True when the WebSocket is open and subscribed to a course room. */
  connected: boolean;
  /** Current sync mode: "websocket" when live, "polling" when degraded. */
  mode: "websocket" | "polling";
}

export function useRealtimeSync(courseId: string | undefined): RealtimeSyncState {
  const { connectWebSocket, disconnectWebSocket, realtimeMode } = useSession();

  useEffect(() => {
    connectWebSocket(courseId);
    return () => {
      // Don't fully disconnect on courseId change — the SessionProvider
      // manages the socket lifecycle. Disconnect only when the consuming
      // component unmounts AND there's no other course we'd want to stay
      // subscribed to. For simplicity we leave teardown to the provider.
    };
  }, [courseId, connectWebSocket]);

  // Allow callers to force-disconnect (e.g. when leaving a classroom view).
  useEffect(() => {
    return () => {
      if (!courseId) disconnectWebSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    connected: realtimeMode === "websocket",
    mode: realtimeMode,
  };
}
