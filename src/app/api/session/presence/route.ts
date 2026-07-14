import { dispatchSessionAction, readSessionState } from "@/lib/session/server-store";
import {
  getStaleStudentIds,
  HEARTBEAT_TIMEOUT_MS,
} from "@/lib/session/actions";
import type { SessionAction } from "@/lib/session/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Presence / heartbeat endpoint.
 *
 * POST /api/session/presence
 *   body: { courseId, studentId }
 *   - Records a heartbeat (updates lastSeenAt) for the student.
 *   - Also sweeps all courses for stale students and marks them offline.
 *   - Returns { ok: true, online: boolean }.
 *
 * DELETE /api/session/presence?courseId=...&studentId=...
 *   - Marks the student offline (clears lastSeenAt). Called on page unload.
 *
 * POST /api/session/presence?courseId=...&studentId=...
 *   - Also marks the student offline. This supports navigator.sendBeacon,
 *     which cannot reliably send DELETE during unload.
 *
 * The sweep ensures that even if a student's browser closes without sending
 * a DELETE (e.g. process kill, network drop), the teacher's view will still
 * converge to "offline" within HEARTBEAT_TIMEOUT_MS because other students'
 * heartbeats trigger the sweep.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const queryCourseId = url.searchParams.get("courseId");
  const queryStudentId = url.searchParams.get("studentId");
  if (queryCourseId && queryStudentId) {
    return markStudentOffline(queryCourseId, queryStudentId);
  }

  let body: { courseId?: string; studentId?: string };
  try {
    body = (await req.json()) as { courseId?: string; studentId?: string };
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const { courseId, studentId } = body;
  if (!courseId || !studentId) {
    return Response.json(
      { error: "MISSING_PARAMS", message: "courseId and studentId are required" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  // 1) Record this student's heartbeat.
  const heartbeatAction: SessionAction = {
    type: "HEARTBEAT",
    payload: { courseId, studentId, lastSeenAt: now },
  };
  await dispatchSessionAction(heartbeatAction);

  // 2) Sweep all teaching courses for stale students and mark them offline.
  //    This is the key mechanism that handles abnormal disconnects (browser
  //    crash, network drop, etc.) — other students' heartbeats keep the sweep
  //    running, so even a student who never sends a DELETE will be marked
  //    offline within HEARTBEAT_TIMEOUT_MS.
  await sweepStaleStudents();

  // 3) Read back the student's online status to return to the caller.
  const state = await readSessionState();
  const course = state.courses.find((c) => c.id === courseId);
  const student = course?.students.find((s) => s.id === studentId);
  const online = Boolean(student?.lastSeenAt);

  return Response.json({ ok: true, online, lastSeenAt: now });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId");
  const studentId = url.searchParams.get("studentId");
  if (!courseId || !studentId) {
    return Response.json(
      { error: "MISSING_PARAMS", message: "courseId and studentId query params are required" },
      { status: 400 },
    );
  }

  return markStudentOffline(courseId, studentId);
}

async function markStudentOffline(courseId: string, studentId: string) {
  const markOfflineAction: SessionAction = {
    type: "MARK_STUDENTS_OFFLINE",
    payload: { courseId, studentIds: [studentId] },
  };
  await dispatchSessionAction(markOfflineAction);

  return Response.json({ ok: true });
}

/**
 * Sweeps all teaching courses and marks students whose heartbeats have
 * expired as offline. This is called on every heartbeat POST so that
 * stale students are cleaned up promptly.
 */
async function sweepStaleStudents() {
  try {
    const state = await readSessionState();
    const now = Date.now();
    for (const course of state.courses) {
      if (course.status !== "teaching") continue;
      const staleIds = getStaleStudentIds(course, now);
      if (staleIds.length === 0) continue;
      const action: SessionAction = {
        type: "MARK_STUDENTS_OFFLINE",
        payload: { courseId: course.id, studentIds: staleIds },
      };
      await dispatchSessionAction(action);
      console.log(
        `[presence] swept ${staleIds.length} stale students in course ${course.id}`,
      );
    }
  } catch (err) {
    // Sweep failures should not break the heartbeat response.
    console.error("[presence] sweepStaleStudents error:", err);
  }
}

// Re-export for tests / other consumers.
export { HEARTBEAT_TIMEOUT_MS };
