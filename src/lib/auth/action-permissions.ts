// Action permission matrix — defines which SessionAction types each role can dispatch.
// Used by API routes to reject unauthorized actions before processing.

import type { SessionAction } from "@/lib/session/actions";

type ActionType = SessionAction["type"];

const TEACHER_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  "CREATE_COURSE",
  "UPDATE_COURSE",
  "DELETE_COURSE",
  "SET_COURSE_CONTENT",
  "SET_COURSE_STAGES",
  "PUBLISH_COURSE",
  "START_TEACHING",
  "RESTART_TEACHING",
  "END_TEACHING",
  "ADVANCE_STAGE",
  "SET_STAGE",
  "ADD_FEEDBACK",
  "UPSERT_RUBRIC_SCORE",
  "SET_PRESENTING_GROUP",
  "UPSERT_ANNOUNCEMENT",
  "DELETE_ANNOUNCEMENT",
  "ADD_ANNOUNCEMENT_REPLY",
  "UPSERT_TODO",
  "UPSERT_GROUP",
  "SET_GROUP_TOPIC",
  "UPSERT_GROUP_ANNOUNCEMENT",
  "DELETE_WORK_PLAN_ITEM",
  "UPSERT_TEAM_CONTRIBUTION",
  "ADD_OFFLINE_INTERVENTION",
  "RESOLVE_INTERVENTION_SIGNALS",
  "UPSERT_TEACHER_AGENT_DIRECTIVE",
  "RESOLVE_COMPANION_CONFIRMATION",
  "SET_UI_STATE",
  "UPSERT_AI_SUPPORT",
  "UPSERT_WHITEBOARD_NODE",
  "DELETE_WHITEBOARD_NODE",
  "UPSERT_GROUP_BOARD",
]);

const STUDENT_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  "JOIN_CLASS",
  "LEAVE_CLASS",
  "HEARTBEAT",
  "UPDATE_STUDENT_PROGRESS",
  "UPSERT_SUBMISSION",
  "UPSERT_REFLECTION",
  "UPSERT_WHITEBOARD_NODE",
  "DELETE_WHITEBOARD_NODE",
  "UPSERT_GROUP_BOARD",
  "MARK_RESOURCE_DOWNLOADED",
  "JOIN_GROUP",
  "LEAVE_GROUP",
  "UPSERT_WORK_PLAN_ITEM",
]);

const SYSTEM_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  "HYDRATE",
  "MARK_STUDENTS_OFFLINE",
  "SET_USER",
]);

export type AuthRole = "teacher" | "student" | "system";

export function isActionAllowed(role: AuthRole, actionType: ActionType): boolean {
  if (SYSTEM_ACTIONS.has(actionType)) return role === "system";
  if (role === "teacher") return TEACHER_ACTIONS.has(actionType);
  if (role === "student") return STUDENT_ACTIONS.has(actionType);
  return false;
}

/**
 * For student actions that target a specific student (e.g., UPSERT_SUBMISSION),
 * verify the action's studentId matches the JWT's studentId.
 */
export function isStudentActionForSelf(
  action: SessionAction,
  studentId: string,
): boolean {
  const actionAny = action as unknown as Record<string, unknown>;
  // Actions carrying studentId field must match
  if (typeof actionAny.studentId === "string") {
    return actionAny.studentId === studentId;
  }
  // Actions without studentId (e.g., HEARTBEAT, JOIN_GROUP) are allowed
  return true;
}
