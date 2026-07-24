import { dispatchSessionAction } from "@/lib/session/server-store";
import type { SessionAction } from "@/lib/session/actions";
import {
  getRequestedAuthRole,
  readAuthFromRequest,
  isAuthConfigured,
} from "@/lib/auth/session";
import { isActionAllowed, isStudentActionForSelf } from "@/lib/auth/action-permissions";
import { scopeSessionStateForAuth } from "@/lib/auth/session-state";
import {
  apiLimiter,
  getClientIp,
  rateLimitKey,
  rateLimitedResponse,
} from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Known action types whitelist. 必须与 `src/lib/session/actions.ts` 中
// `SessionAction` union 的 `type` 字面量保持完全一致；新增 action 时同步更新。
// 为防止遗漏，下方数组使用 `SessionAction["type"][]` 类型注解，缺失或拼写
// 错误会在编译期被 TypeScript 检测出来。
import type { SessionAction as Action } from "@/lib/session/actions";
const ALL_ACTION_TYPES: Action["type"][] = [
  "HYDRATE", "SET_USER", "CREATE_COURSE", "UPDATE_COURSE", "DELETE_COURSE",
  "SET_COURSE_CONTENT", "SET_COURSE_STAGES", "PUBLISH_COURSE", "START_TEACHING",
  "RESTART_TEACHING", "END_TEACHING", "ADVANCE_STAGE", "SET_STAGE",
  "JOIN_CLASS", "LEAVE_CLASS", "HEARTBEAT", "MARK_STUDENTS_OFFLINE",
  "UPDATE_STUDENT_PROGRESS",
  "UPSERT_SUBMISSION", "ADD_FEEDBACK", "UPSERT_RUBRIC_SCORE", "UPSERT_REFLECTION",
  "ADD_ACTIVITY", "SET_PRESENTING_GROUP", "UPSERT_ANNOUNCEMENT", "DELETE_ANNOUNCEMENT",
  "ADD_ANNOUNCEMENT_REPLY", "UPSERT_TODO", "SET_STUDENT_TODO_COMPLETION", "UPSERT_GROUP", "LEAVE_GROUP",
  "SET_GROUP_TOPIC", "UPSERT_GROUP_ANNOUNCEMENT", "UPSERT_WORK_PLAN_ITEM", "DELETE_WORK_PLAN_ITEM",
  "UPSERT_WHITEBOARD_NODE", "DELETE_WHITEBOARD_NODE", "UPSERT_GROUP_BOARD",
  "UPSERT_UPLOAD", "DELETE_UPLOAD", "SET_PREVIEW_UPLOAD", "UPSERT_TEAM_CONTRIBUTION",
  "UPSERT_AI_SUPPORT", "ADD_OFFLINE_INTERVENTION", "RESOLVE_INTERVENTION_SIGNALS",
  "UPSERT_TEACHER_AGENT_DIRECTIVE", "UPSERT_COMPANION_TASK",
  "UPSERT_COMPANION_CONFIRMATION", "RESOLVE_COMPANION_CONFIRMATION",
  "ADD_COMPANION_PROCESS_RECORD", "SET_UI_STATE",
  "JOIN_GROUP", "MARK_RESOURCE_DOWNLOADED",
];
const KNOWN_ACTION_TYPES = new Set<string>(ALL_ACTION_TYPES);

// 编译期完整性校验：如果 actions.ts 新增了 action type 但本文件未同步，
// 下面这行会报 TS 错误（因为 ALL_ACTION_TYPES[number] 缺少新成员）。
type _AssertAllActionsCovered<T extends Action["type"] = typeof ALL_ACTION_TYPES[number]> =
  [T] extends [Action["type"]] ? ([Action["type"]] extends [T] ? true : "missing_action_in_whitelist") : "extra_action_in_whitelist";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _Check = _AssertAllActionsCovered;

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
    const claims = await readAuthFromRequest(req, getRequestedAuthRole(req));
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
    if (
      role === "student" &&
      !isStudentActionForSelf(action, claims.studentId, claims.courseId)
    ) {
      return Response.json(
        { error: "FORBIDDEN", message: "不能操作其他学生的数据" },
        { status: 403 },
      );
    }
  }

  try {
    const state = await dispatchSessionAction(action);
    if (isAuthConfigured()) {
      const claims = await readAuthFromRequest(req, getRequestedAuthRole(req));
      if (!claims) {
        return Response.json(
          { error: "UNAUTHORIZED", message: "登录状态已失效" },
          { status: 401 },
        );
      }
      return Response.json(scopeSessionStateForAuth(state, claims));
    }
    return Response.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "处理失败";
    console.error("[session/actions] dispatch failed:", message);
    return Response.json(
      { error: "ACTION_FAILED", message },
      { status: 500 },
    );
  }
}
