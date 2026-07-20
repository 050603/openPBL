import { dispatchSessionAction } from "@/lib/session/server-store";
import type { SessionAction } from "@/lib/session/actions";
import { readAuthFromRequest, isAuthConfigured } from "@/lib/auth/session";
import { isActionAllowed, isStudentActionForSelf } from "@/lib/auth/action-permissions";
import {
  apiLimiter,
  getClientIp,
  rateLimitKey,
  rateLimitedResponse,
} from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Known action types whitelist (mirrors actions.ts union). Any other type is
// rejected with 400 UNKNOWN_ACTION_TYPE.
import type { SessionAction as Action } from "@/lib/session/actions";
const KNOWN_ACTION_TYPES = new Set<string>([
  "HYDRATE", "SET_USER", "CREATE_COURSE", "UPDATE_COURSE", "DELETE_COURSE",
  "SET_COURSE_CONTENT", "SET_COURSE_STAGES", "PUBLISH_COURSE", "START_TEACHING",
  "RESTART_TEACHING", "END_TEACHING", "ADVANCE_STAGE", "SET_STAGE",
  "JOIN_CLASS", "LEAVE_CLASS", "HEARTBEAT", "UPDATE_STUDENT_PROGRESS",
  "UPSERT_SUBMISSION", "UPSERT_REFLECTION", "ADD_FEEDBACK", "UPSERT_RUBRIC_SCORE",
  "SET_PRESENTING_GROUP", "UPSERT_ANNOUNCEMENT", "DELETE_ANNOUNCEMENT",
  "ADD_ANNOUNCEMENT_REPLY", "UPSERT_TODO", "UPSERT_GROUP", "SET_GROUP_TOPIC",
  "UPSERT_GROUP_ANNOUNCEMENT", "UPSERT_WORK_PLAN_ITEM", "DELETE_WORK_PLAN_ITEM",
  "UPSERT_WHITEBOARD_NODE", "DELETE_WHITEBOARD_NODE", "UPSERT_GROUP_BOARD",
  "MARK_RESOURCE_DOWNLOADED", "JOIN_GROUP", "LEAVE_GROUP", "UPSERT_TEAM_CONTRIBUTION",
  "UPSERT_UPLOAD", "DELETE_UPLOAD", "UPSERT_AI_SUPPORT",
  "ADD_OFFLINE_INTERVENTION", "RESOLVE_INTERVENTION_SIGNALS",
  "UPSERT_TEACHER_AGENT_DIRECTIVE", "RESOLVE_COMPANION_CONFIRMATION",
  "UPSERT_COMPANION_TASK", "UPSERT_COMPANION_CONFIRMATION",
  "UPSERT_COMPANION_PROCESS_RECORD", "UPSERT_LEARNING_SIGNAL",
  "UPSERT_CLASS_COMMON_ISSUE", "UPSERT_TEACHER_INTERVENTION",
  "UPSERT_EVALUATION", "SET_UI_STATE", "MARK_STUDENTS_OFFLINE",
  "UPSERT_LEARNING_EVENT", "UPSERT_STAGE_TRANSITION",
  "UPSERT_DYNAMIC_FACILITATION_SCAFFOLD", "UPSERT_OFFLINE_INTERVENTION",
]);

export async function POST(req: Request) {
  // Rate limit (only enforced when auth configured)
  if (isAuthConfigured()) {
    const ip = getClientIp(req);
    const rl = apiLimiter.check(rateLimitKey(req, ip));
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);
  }

  let action: SessionAction;
  try {
    action = (await req.json()) as SessionAction;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (!action || typeof action.type !== "string") {
    return Response.json({ error: "INVALID_ACTION" }, { status: 400 });
  }

  if (!KNOWN_ACTION_TYPES.has(action.type)) {
    return Response.json(
      { error: "UNKNOWN_ACTION_TYPE", message: `未知的 action 类型: ${action.type}` },
      { status: 400 },
    );
  }

  // Permission check (only when auth configured)
  if (isAuthConfigured()) {
    const claims = await readAuthFromRequest(req);
    if (!claims) {
      return Response.json(
        { error: "UNAUTHORIZED", message: "请先登录" },
        { status: 401 },
      );
    }
    const role = claims.role;
    if (!isActionAllowed(role, action.type as Action["type"])) {
      return Response.json(
        {
          error: "FORBIDDEN_ACTION",
          message: `当前身份(${role})无权执行 ${action.type}`,
        },
        { status: 403 },
      );
    }
    // For students, ensure actions target themselves
    if (role === "student" && !isStudentActionForSelf(action, claims.studentId)) {
      return Response.json(
        { error: "FORBIDDEN", message: "不能操作其他学生的数据" },
        { status: 403 },
      );
    }
  }

  try {
    const state = await dispatchSessionAction(action);
    return Response.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "处理失败";
    return Response.json(
      { error: "ACTION_FAILED", message },
      { status: 500 },
    );
  }
}
