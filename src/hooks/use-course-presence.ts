"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  onlineStudentIds,
  type PresenceMember,
  type PresenceSnapshot,
} from "@/lib/presence";

const SNAPSHOT_INTERVAL_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
type CoursePresenceSnapshot = PresenceSnapshot & { courseId?: string };
const EMPTY_MEMBERS: PresenceMember[] = [];

export function useCoursePresence({
  courseId,
  role,
  enabled = true,
  heartbeat = false,
}: {
  courseId?: string;
  role: "teacher" | "student";
  enabled?: boolean;
  heartbeat?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<CoursePresenceSnapshot>({ members: [] });

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!courseId || !enabled) return;
    const response = await fetch(
      `/api/courses/${encodeURIComponent(courseId)}/presence`,
      {
        headers: { "X-OpenPBL-Role": role },
        cache: "no-store",
        signal,
      },
    );
    if (!response.ok) throw new Error(`Presence request failed: ${response.status}`);
    setSnapshot({
      ...((await response.json()) as PresenceSnapshot),
      courseId,
    });
  }, [courseId, enabled, role]);

  useEffect(() => {
    if (!courseId || !enabled) {
      return;
    }

    const controller = new AbortController();
    const updateSnapshot = () => {
      void refresh(controller.signal).catch(() => {
        // Keep the last valid snapshot during a transient network failure.
      });
    };
    updateSnapshot();
    const intervalId = window.setInterval(updateSnapshot, SNAPSHOT_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [courseId, enabled, refresh]);

  useEffect(() => {
    if (!courseId || !enabled || !heartbeat || role !== "student") return;

    const sendHeartbeat = () => {
      void fetch(`/api/courses/${encodeURIComponent(courseId)}/presence`, {
        method: "PUT",
        headers: { "X-OpenPBL-Role": "student" },
        keepalive: true,
      })
        .then(() => refresh())
        .catch(() => {
          // A later heartbeat or snapshot refresh will recover automatically.
        });
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [courseId, enabled, heartbeat, refresh, role]);

  const visibleMembers = enabled && snapshot.courseId === courseId
    ? snapshot.members
    : EMPTY_MEMBERS;
  const studentIds = useMemo(
    () => onlineStudentIds(visibleMembers),
    [visibleMembers],
  );

  return {
    members: visibleMembers,
    onlineStudentIds: studentIds,
    onlineCount: studentIds.size,
    degraded: snapshot.degraded === true,
    source: snapshot.source,
    refresh,
  };
}
