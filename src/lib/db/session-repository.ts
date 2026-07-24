// Session repository — bridges in-memory SessionState and the Prisma database.
//
// Design:
// - `loadSessionState()` returns the full SessionState (all courses + nested data)
//   for backward compatibility with existing API routes that read the whole state.
// - `saveCourse(course)` upserts a Course and ALL its nested children in a single
//   transaction. The strategy is "delete children → re-insert" because:
//     1. It avoids complex diffing logic for ~30 child collections.
//     2. The Course aggregate is treated as a consistency boundary.
//     3. Prisma transactions make this atomic.
//   This is acceptable because course updates are not high-frequency.
// - `dispatchAction(action)` loads the current state, applies the pure
//   `applySessionAction` reducer, and persists the diff. For now it persists
//   the affected course(s). Request identity is never stored globally.
// - Write coordination: aggregate read-modify-write actions acquire a
//   PostgreSQL advisory lock before replacing child collections.

import { prisma } from "./client";
import { Prisma } from "@prisma/client";
import { decrementRef } from "@/lib/uploads/reference-tracker";
import { cleanupCourseFiles } from "@/lib/uploads/cleanup";
import { applyCourseUpdate } from "@/lib/session/course-update";
import { normalizeFacilitationScaffolds } from "@/lib/teacher-resources/facilitation-scaffolds";
import type {
  Course,
  Student,
  CourseContent,
  Stage,
  ClassroomSubmission,
  TeacherFeedback,
  RubricScore,
  ReflectionRecord,
  ActivityRecord,
  CourseAnnouncement,
  CourseTodo,
  CourseResource,
  ProjectGroup,
  GroupAnnouncement,
  WorkPlanItem,
  WhiteboardNode,
  GroupBoard,
  CourseUpload,
  TeamContribution,
  AiSupportRecord,
  TeacherIntervention,
  StageTransitionRecord,
  EvaluationRecord,
  LearningEvent,
  CompanionThread,
  CompanionTask,
  CompanionConfirmation,
  CompanionProcessRecord,
  LearningSignal,
  ClassCommonIssue,
  TeacherAgentDirective,
  OfflineInterventionRecord,
  DynamicFacilitationScaffold,
} from "@/lib/session/types";
import type {
  SessionAction,
  SessionState,
} from "@/lib/session/actions";
import { applySessionAction, initialSessionState } from "@/lib/session/actions";

// ============================================================================
// Errors
// ============================================================================

export class CourseNotFoundError extends Error {
  constructor(public readonly courseId: string) {
    super(`Course not found: ${courseId}`);
    this.name = "CourseNotFoundError";
  }
}

// ============================================================================
// Type coercion helpers (Prisma Json → domain types)
// ============================================================================

function asJson(value: unknown): Prisma.InputJsonValue {
  // Prisma's InputJsonValue rejects `undefined` and `null`; replace with empty
  // array/object so callers don't have to special-case.
  if (value === undefined || value === null) {
    return [] as unknown as Prisma.InputJsonValue;
  }
  return value as Prisma.InputJsonValue;
}

function asNullableJson(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// ============================================================================
// Course → Prisma row mappers
// ============================================================================

type CourseRowCreate = Prisma.CourseCreateInput;
type CourseRowUpdate = Prisma.CourseUpdateInput;

function courseToCreateInput(course: Course): CourseRowCreate {
  return {
    id: course.id,
    name: course.name,
    subject: course.subject,
    grade: course.grade,
    hours: course.hours,
    summary: course.summary,
    drivingQuestion: course.drivingQuestion,
    learningObjectives: asNullableJson(course.learningObjectives ?? null),
    expectedOutcome: course.expectedOutcome ?? null,
    learnerProfile: asNullableJson(course.learnerProfile ?? null),
    status: course.status,
    currentStageIndex: course.currentStageIndex,
    inviteCode: course.inviteCode ?? null,
    coverImageUrl: course.coverImageUrl ?? null,
    presentingGroupId: course.presentingGroupId ?? null,
    classConfig: asNullableJson(course.classConfig ?? null),
    pblConfig: asNullableJson(course.pblConfig ?? null),
    stageWorkspacePolicies: asNullableJson(course.stageWorkspacePolicies ?? null),
    content: asNullableJson(course.content ?? null),
    stages: asNullableJson(course.stages ?? null),
    uiState: asNullableJson(course.uiState ?? null),
    aiLearningProgress: asNullableJson(course.aiLearningProgress ?? null),
    aiLearningClassroomId: course.aiLearningClassroomId ?? null,
    teacherClassroomId: course.teacherClassroomId ?? null,
    resolvedInterventionSignalIds: asNullableJson(
      course.resolvedInterventionSignalIds ?? null,
    ),
    createdAt: new Date(course.createdAt ?? Date.now()),
    updatedAt: new Date(course.updatedAt ?? Date.now()),
    version: 1,
  };
}

// ============================================================================
// Prisma row → Course domain type
// ============================================================================

type CourseWithRelations = Prisma.CourseGetPayload<{
  include: {
    students: true;
    submissions: true;
    feedback: true;
    rubricScores: true;
    reflections: true;
    activityLog: true;
    announcements: true;
    todos: true;
    resources: true;
    groups: true;
    groupAnnouncements: true;
    workPlan: true;
    whiteboard: true;
    boards: true;
    uploads: true;
    teamContributions: true;
    aiSupports: true;
    teacherInterventions: true;
    stageTransitions: true;
    evaluations: true;
    learningEvents: true;
    companionThreads: true;
    companionTasks: true;
    companionConfirmations: true;
    companionProcessRecords: true;
    learningSignals: true;
    classCommonIssues: true;
    teacherAgentDirectives: true;
    offlineInterventions: true;
    dynamicFacilitationScaffolds: true;
  };
}>;

function rowToCourse(row: CourseWithRelations): Course {
  const course: Course = {
    id: row.id,
    name: row.name,
    subject: row.subject,
    grade: row.grade,
    hours: row.hours,
    summary: row.summary,
    drivingQuestion: row.drivingQuestion,
    learningObjectives: (row.learningObjectives as string[] | null) ?? undefined,
    expectedOutcome: row.expectedOutcome ?? undefined,
    learnerProfile: (row.learnerProfile as Course["learnerProfile"]) ?? undefined,
    status: row.status as Course["status"],
    currentStageIndex: row.currentStageIndex,
    content: (row.content as CourseContent) ?? ({} as CourseContent),
    pblConfig: (row.pblConfig as Course["pblConfig"]) ?? undefined,
    stageWorkspacePolicies:
      (row.stageWorkspacePolicies as Course["stageWorkspacePolicies"]) ?? undefined,
    classConfig: (row.classConfig as Course["classConfig"]) ?? undefined,
    inviteCode: row.inviteCode ?? undefined,
    coverImageUrl: row.coverImageUrl ?? undefined,
    students: row.students.map(rowToStudent),
    submissions: row.submissions.map(rowToSubmission),
    feedback: row.feedback.map(rowToFeedback),
    rubricScores: row.rubricScores.map(rowToRubricScore),
    reflections: row.reflections.map(rowToReflection),
    activityLog: row.activityLog.map(rowToActivity),
    presentingGroupId: row.presentingGroupId ?? undefined,
    announcements: row.announcements.map(rowToAnnouncement),
    todos: row.todos.map(rowToTodo),
    resources: row.resources.map(rowToResource),
    groups: row.groups.map(rowToGroup),
    groupAnnouncements: row.groupAnnouncements.map(rowToGroupAnnouncement),
    workPlan: row.workPlan.map(rowToWorkPlanItem),
    whiteboard: row.whiteboard.map(rowToWhiteboardNode),
    boards: row.boards.map(rowToGroupBoard),
    uploads: row.uploads.map(rowToUpload),
    teamContributions: row.teamContributions.map(rowToTeamContribution),
    aiSupports: row.aiSupports.map(rowToAiSupport),
    teacherInterventions: row.teacherInterventions.map(rowToTeacherIntervention),
    resolvedInterventionSignalIds:
      (row.resolvedInterventionSignalIds as string[] | null) ?? undefined,
    stageTransitions: row.stageTransitions.map(rowToStageTransition),
    evaluations: row.evaluations.map(rowToEvaluation),
    uiState: (row.uiState as Course["uiState"]) ?? undefined,
    aiLearningClassroomId: row.aiLearningClassroomId ?? undefined,
    teacherClassroomId: row.teacherClassroomId ?? undefined,
    aiLearningProgress:
      (row.aiLearningProgress as Course["aiLearningProgress"]) ?? undefined,
    learningEvents: row.learningEvents.map(rowToLearningEvent),
    companionThreads: row.companionThreads.map(rowToCompanionThread),
    companionTasks: row.companionTasks.map(rowToCompanionTask),
    companionConfirmations: row.companionConfirmations.map(rowToCompanionConfirmation),
    companionProcessRecords: row.companionProcessRecords.map(rowToCompanionProcessRecord),
    learningSignals: row.learningSignals.map(rowToLearningSignal),
    classCommonIssues: row.classCommonIssues.map(rowToClassCommonIssue),
    teacherAgentDirectives: row.teacherAgentDirectives.map(rowToTeacherAgentDirective),
    offlineInterventions: row.offlineInterventions.map(rowToOfflineIntervention),
    dynamicFacilitationScaffolds: row.dynamicFacilitationScaffolds.map(
      rowToDynamicFacilitationScaffold,
    ),
    stages: (row.stages as Stage[] | null) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return course;
}

// ============================================================================
// Row → domain type mappers (one per child entity)
// ============================================================================

function rowToStudent(row: Prisma.StudentGetPayload<Record<string, never>>): Student {
  const stageProgress =
    (row.progress as Record<string, number> | null) ?? {};
  return {
    id: row.id,
    name: row.name,
    joinedAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt ?? undefined,
    stageProgress,
  };
}

function rowToSubmission(
  row: Prisma.ClassroomSubmissionGetPayload<Record<string, never>>,
): ClassroomSubmission {
  // Domain type fields: id, courseId, studentId?, studentName?, groupId?,
  // stageKey, type, title, content, files?, createdAt, updatedAt.
  // Prisma stores `type/title/content/files` in JSONB columns; the row spread
  // covers the common fields and we cast the JSONB payload to the domain shape.
  return {
    id: row.id,
    courseId: row.courseId,
    studentId: row.studentId ?? undefined,
    studentName: row.studentName ?? undefined,
    stageKey: row.stageKey,
    groupId: row.groupId ?? undefined,
    type: (row.payload as ClassroomSubmission["type"]) ?? "document",
    title: asString((row.payload as { title?: unknown } | null)?.title),
    content: asString((row.payload as { content?: unknown } | null)?.content),
    files: (row.payload as { files?: ClassroomSubmission["files"] } | null)?.files,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as ClassroomSubmission;
}

function rowToFeedback(
  row: Prisma.TeacherFeedbackGetPayload<Record<string, never>>,
): TeacherFeedback {
  // Domain type fields: id, courseId, targetType, targetId, stageKey, kind,
  // content, sourceRole?, sourceName?, evidence?, status?, createdAt.
  return {
    id: row.id,
    courseId: row.courseId,
    targetType: (row.payload as TeacherFeedback["targetType"]) ?? "student",
    targetId: asString((row.payload as { targetId?: unknown } | null)?.targetId),
    stageKey: asString(row.stageKey),
    kind: (row.payload as TeacherFeedback["kind"]) ?? "comment",
    content: row.content,
    sourceRole: (row.payload as { sourceRole?: TeacherFeedback["sourceRole"] } | null)?.sourceRole,
    sourceName: (row.payload as { sourceName?: string } | null)?.sourceName,
    evidence: (row.payload as { evidence?: string[] } | null)?.evidence,
    status: (row.payload as { status?: TeacherFeedback["status"] } | null)?.status,
    createdAt: row.createdAt.toISOString(),
  } as TeacherFeedback;
}

function rowToRubricScore(
  row: Prisma.RubricScoreGetPayload<Record<string, never>>,
): RubricScore {
  // Domain type fields: id, courseId, groupId, stageKey, dimensionScores,
  // teacherTotal?, aiDimensionScores?, aiTotal?, finalTotal?, scoringMode?,
  // comment, total, status, createdAt, updatedAt.
  return {
    id: row.id,
    courseId: row.courseId,
    groupId: row.groupId ?? "",
    stageKey: asString(row.stageKey),
    dimensionScores: (row.criteria as RubricScore["dimensionScores"]) ?? {},
    teacherTotal: (row.criteria as { teacherTotal?: number } | null)?.teacherTotal,
    aiDimensionScores: (row.criteria as { aiDimensionScores?: RubricScore["aiDimensionScores"] } | null)?.aiDimensionScores,
    aiTotal: (row.criteria as { aiTotal?: number | null } | null)?.aiTotal ?? undefined,
    finalTotal: (row.criteria as { finalTotal?: number } | null)?.finalTotal,
    scoringMode: (row.criteria as { scoringMode?: RubricScore["scoringMode"] } | null)?.scoringMode,
    comment: asString((row.criteria as { comment?: unknown } | null)?.comment),
    total: row.total,
    status: (row.criteria as { status?: RubricScore["status"] } | null)?.status ?? "draft",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as RubricScore;
}

function rowToReflection(
  row: Prisma.ReflectionRecordGetPayload<Record<string, never>>,
): ReflectionRecord {
  // Domain type fields: id, courseId, studentId, studentName, content,
  // improvementPlan?, createdAt, updatedAt.
  return {
    id: row.id,
    courseId: row.courseId,
    studentId: row.studentId,
    studentName: row.studentName,
    content: row.content as string,
    improvementPlan: (row.content as { improvementPlan?: string } | null)?.improvementPlan,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as ReflectionRecord;
}

function rowToActivity(
  row: Prisma.ActivityRecordGetPayload<Record<string, never>>,
): ActivityRecord {
  // Domain type fields: id, actor, action, detail?, createdAt.
  // Schema column is `occurredAt`; domain type calls it `createdAt`.
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    detail: row.detail ?? undefined,
    createdAt: row.occurredAt.toISOString(),
  } as ActivityRecord;
}

function rowToAnnouncement(
  row: Prisma.CourseAnnouncementGetPayload<Record<string, never>>,
): CourseAnnouncement {
  // Domain type fields: id, title, content, createdAt, updatedAt, pinned?, replies.
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    pinned: row.pinned ?? undefined,
    replies: (row.replies as CourseAnnouncement["replies"]) ?? [],
  } as CourseAnnouncement;
}

function rowToTodo(
  row: Prisma.CourseTodoGetPayload<Record<string, never>>,
): CourseTodo {
  // Domain type fields: id, title, description, stageKey?, completedBy.
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    stageKey: row.stageKey ?? undefined,
    completedBy: (row.completedBy as string[]) ?? [],
  } as CourseTodo;
}

function rowToResource(
  row: Prisma.CourseResourceGetPayload<Record<string, never>>,
): CourseResource {
  // Domain type fields: id, title, type, size, description?, url?, downloadedBy.
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    size: row.size,
    description: row.description ?? undefined,
    url: row.url ?? undefined,
    downloadedBy: (row.downloadedBy as string[]) ?? [],
  } as CourseResource;
}

function rowToGroup(
  row: Prisma.ProjectGroupGetPayload<Record<string, never>>,
): ProjectGroup {
  // Domain type fields: id, name, topic, goal?, keywords, selectedForms,
  // members, proposal?, teacherApproval?, createdAt, updatedAt.
  return {
    id: row.id,
    name: row.name,
    topic: row.topic,
    goal: row.goal ?? undefined,
    keywords: (row.keywords as string[]) ?? [],
    selectedForms: (row.selectedForms as string[]) ?? [],
    members: (row.members as ProjectGroup["members"]) ?? [],
    proposal: (row.proposal as ProjectGroup["proposal"]) ?? undefined,
    teacherApproval:
      (row.teacherApproval as ProjectGroup["teacherApproval"]) ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as ProjectGroup;
}

function rowToGroupAnnouncement(
  row: Prisma.GroupAnnouncementGetPayload<Record<string, never>>,
): GroupAnnouncement {
  // Domain type fields: id, groupId, title, content, actor, createdAt.
  return {
    id: row.id,
    groupId: row.groupId,
    title: row.title,
    content: row.content,
    actor: row.actor,
    createdAt: row.createdAt.toISOString(),
  } as GroupAnnouncement;
}

function rowToWorkPlanItem(
  row: Prisma.WorkPlanItemGetPayload<Record<string, never>>,
): WorkPlanItem {
  // Domain type fields: id, groupId, role, memberName, task, progress.
  return {
    id: row.id,
    groupId: row.groupId,
    role: row.role,
    memberName: row.memberName,
    task: row.task,
    progress: row.progress,
  } as WorkPlanItem;
}

function rowToWhiteboardNode(
  row: Prisma.WhiteboardNodeGetPayload<Record<string, never>>,
): WhiteboardNode {
  // Domain type fields: id, groupId, label, note?, x, y, color, parentId?.
  return {
    id: row.id,
    groupId: row.groupId,
    label: row.label,
    note: row.note ?? undefined,
    x: row.x,
    y: row.y,
    color: row.color as WhiteboardNode["color"],
    parentId: row.parentId ?? undefined,
  } as WhiteboardNode;
}

function rowToGroupBoard(
  row: Prisma.GroupBoardGetPayload<Record<string, never>>,
): GroupBoard {
  return {
    groupId: row.groupId,
    snapshot: row.snapshot,
    updatedAt: row.updatedAt.toISOString(),
    mode: row.mode as GroupBoard["mode"],
  };
}

function rowToUpload(
  row: Prisma.CourseUploadGetPayload<Record<string, never>>,
): CourseUpload {
  return {
    id: row.id,
    courseId: row.courseId,
    groupId: row.groupId ?? undefined,
    studentId: row.studentId ?? undefined,
    studentName: row.studentName ?? undefined,
    stageKey: row.stageKey,
    category: row.category as CourseUpload["category"],
    title: row.title,
    fileName: row.fileName,
    fileType: row.fileType,
    size: row.size,
    url: row.url,
    createdAt: row.createdAt.toISOString(),
  };
}

function rowToTeamContribution(
  row: Prisma.TeamContributionGetPayload<Record<string, never>>,
): TeamContribution {
  return {
    id: row.id,
    courseId: row.courseId,
    groupId: row.groupId,
    studentId: row.studentId ?? undefined,
    studentName: row.studentName,
    percent: row.percent,
    note: row.note ?? undefined,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToAiSupport(
  row: Prisma.AiSupportRecordGetPayload<Record<string, never>>,
): AiSupportRecord {
  return {
    id: row.id,
    courseId: row.courseId,
    stageKey: row.stageKey,
    targetType: row.targetType as AiSupportRecord["targetType"],
    targetId: row.targetId,
    groupId: row.groupId ?? undefined,
    studentId: row.studentId ?? undefined,
    studentName: row.studentName ?? undefined,
    kind: row.kind as AiSupportRecord["kind"],
    trigger: row.trigger,
    inputSummary: row.inputSummary,
    diagnosis: row.diagnosis,
    suggestions: (row.suggestions as string[]) ?? [],
    evidence: (row.evidence as string[]) ?? [],
    status: row.status as AiSupportRecord["status"],
    source: (row.source as AiSupportRecord["source"]) ?? undefined,
    editedContent: row.editedContent ?? undefined,
    structuredPayload: row.structuredPayload ?? undefined,
    adoption: (row.adoption as AiSupportRecord["adoption"]) ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToTeacherIntervention(
  row: Prisma.TeacherInterventionGetPayload<Record<string, never>>,
): TeacherIntervention {
  // Domain type fields: id, stageKey, scope, targetIds, reason, evidence,
  // action, instruction, severity, status, signalId?, teacherName,
  // createdAt, resolvedAt?.
  return {
    id: row.id,
    stageKey: asString(row.stageKey),
    scope: (row.payload as TeacherIntervention["scope"]) ?? "course",
    targetIds: (row.payload as { targetIds?: string[] } | null)?.targetIds ?? [],
    reason: asString((row.payload as { reason?: unknown } | null)?.reason),
    evidence: (row.payload as { evidence?: string[] } | null)?.evidence ?? [],
    action: (row.payload as TeacherIntervention["action"]) ?? "notice",
    instruction: row.content,
    severity: (row.payload as { severity?: TeacherIntervention["severity"] } | null)?.severity ?? "notice",
    status: (row.payload as { status?: TeacherIntervention["status"] } | null)?.status ?? "open",
    signalId: (row.payload as { signalId?: string } | null)?.signalId,
    teacherName: asString(row.createdBy),
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.updatedAt ? row.updatedAt.toISOString() : undefined,
  } as TeacherIntervention;
}

function rowToStageTransition(
  row: Prisma.StageTransitionRecordGetPayload<Record<string, never>>,
): StageTransitionRecord {
  return {
    id: row.id,
    fromStageKey: row.fromStageKey,
    toStageKey: row.toStageKey,
    gateStatus: row.gateStatus as StageTransitionRecord["gateStatus"],
    blockers: (row.blockers as string[]) ?? [],
    warnings: (row.warnings as string[]) ?? [],
    overrideReason: row.overrideReason ?? undefined,
    actor: row.actor,
    createdAt: row.createdAt.toISOString(),
  };
}

function rowToEvaluation(
  row: Prisma.EvaluationRecordGetPayload<Record<string, never>>,
): EvaluationRecord {
  // Domain type fields: id, courseId, stageKey, sourceRole, targetType,
  // targetId, score?, comment, evidence, status, createdAt, updatedAt.
  return {
    id: row.id,
    courseId: row.courseId,
    stageKey: asString(row.stageKey),
    sourceRole: (row.payload as EvaluationRecord["sourceRole"]) ?? "ai",
    targetType: (row.payload as { targetType?: EvaluationRecord["targetType"] } | null)?.targetType ?? "student",
    targetId: asString((row.payload as { targetId?: unknown } | null)?.targetId),
    score: (row.payload as { score?: number } | null)?.score,
    comment: row.content,
    evidence: (row.payload as { evidence?: string[] } | null)?.evidence ?? [],
    status: (row.payload as { status?: EvaluationRecord["status"] } | null)?.status ?? "draft",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as EvaluationRecord;
}

function rowToLearningEvent(
  row: Prisma.LearningEventGetPayload<Record<string, never>>,
): LearningEvent {
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    courseId: row.courseId,
    studentId: row.studentId,
    stageKey: row.stageKey,
    sceneId: row.sceneId ?? undefined,
    type: row.type as LearningEvent["type"],
    occurredAt: row.occurredAt.toISOString(),
    durationMs: row.durationMs ?? undefined,
    expectedDurationSec: row.expectedDurationSec ?? undefined,
    ttsDurationSec: row.ttsDurationSec ?? undefined,
    plannedStudentActivitySec: row.plannedStudentActivitySec ?? undefined,
    visible: row.visible ?? undefined,
    progressMarker: row.progressMarker ?? undefined,
    content: (row.content as LearningEvent["content"]) ?? undefined,
    metadata:
      (row.metadata as LearningEvent["metadata"]) ?? undefined,
  };
}

function rowToCompanionThread(
  row: Prisma.CompanionThreadGetPayload<Record<string, never>>,
): CompanionThread {
  return {
    id: row.id,
    courseId: row.courseId,
    studentId: row.studentId,
    stageKey: row.stageKey,
    messages: (row.messages as CompanionThread["messages"]) ?? [],
    openingSentAt: row.openingSentAt ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToCompanionTask(
  row: Prisma.CompanionTaskGetPayload<Record<string, never>>,
): CompanionTask {
  return {
    id: row.id,
    courseId: row.courseId,
    studentId: row.studentId,
    stageKey: row.stageKey,
    companionId: row.companionId ?? undefined,
    kind: row.kind as CompanionTask["kind"],
    title: row.title,
    request: row.request,
    status: row.status as CompanionTask["status"],
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    confirmationId: row.confirmationId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToCompanionConfirmation(
  row: Prisma.CompanionConfirmationGetPayload<Record<string, never>>,
): CompanionConfirmation {
  return {
    id: row.id,
    courseId: row.courseId,
    studentId: row.studentId,
    stageKey: row.stageKey,
    action: row.action as CompanionConfirmation["action"],
    title: row.title,
    summary: row.summary,
    taskId: row.taskId ?? undefined,
    payload: (row.payload as CompanionConfirmation["payload"]) ?? undefined,
    status: row.status as CompanionConfirmation["status"],
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString(),
  };
}

function rowToCompanionProcessRecord(
  row: Prisma.CompanionProcessRecordGetPayload<Record<string, never>>,
): CompanionProcessRecord {
  return {
    id: row.id,
    courseId: row.courseId,
    studentId: row.studentId,
    stageKey: row.stageKey,
    title: row.title,
    summary: row.summary,
    source: row.source as CompanionProcessRecord["source"],
    companionId: row.companionId ?? undefined,
    taskId: row.taskId ?? undefined,
    evidenceIds: (row.evidenceIds as string[]) ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}

function rowToLearningSignal(
  row: Prisma.LearningSignalGetPayload<Record<string, never>>,
): LearningSignal {
  return {
    id: row.id,
    courseId: row.courseId,
    studentId: row.studentId,
    stageKey: row.stageKey,
    sceneId: row.sceneId ?? undefined,
    kind: row.kind as LearningSignal["kind"],
    severity: row.severity as LearningSignal["severity"],
    status: row.status as LearningSignal["status"],
    title: row.title,
    summary: row.summary,
    content: (row.content as LearningSignal["content"]) ?? undefined,
    normalizedIssueKey: row.normalizedIssueKey,
    evidenceEventIds: (row.evidenceEventIds as string[]) ?? [],
    aiInterventionAttempts: row.aiInterventionAttempts,
    firstDetectedAt: row.firstDetectedAt.toISOString(),
    lastDetectedAt: row.lastDetectedAt.toISOString(),
    handledAt: row.handledAt?.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString(),
  } as LearningSignal;
}

function rowToClassCommonIssue(
  row: Prisma.ClassCommonIssueGetPayload<Record<string, never>>,
): ClassCommonIssue {
  // Domain type fields: id, courseId, stageKey, normalizedIssueKey, title,
  // summary, content?, severity, studentIds, signalIds, affectedStudents?,
  // status, firstDetectedAt, lastDetectedAt, handledAt?, resolvedAt?.
  return {
    id: row.id,
    courseId: row.courseId,
    stageKey: row.stageKey,
    normalizedIssueKey: asString((row.payload as { normalizedIssueKey?: unknown } | null)?.normalizedIssueKey),
    title: row.title,
    summary: row.summary,
    content: (row.payload as { content?: ClassCommonIssue["content"] } | null)?.content,
    severity: (row.payload as { severity?: ClassCommonIssue["severity"] } | null)?.severity ?? "warning",
    studentIds: (row.affectedStudentIds as string[]) ?? [],
    signalIds: (row.payload as { signalIds?: string[] } | null)?.signalIds ?? [],
    affectedStudents: (row.payload as { affectedStudents?: ClassCommonIssue["affectedStudents"] } | null)?.affectedStudents,
    status: (row.payload as { status?: ClassCommonIssue["status"] } | null)?.status ?? "open",
    firstDetectedAt: row.thresholdMetAt.toISOString(),
    lastDetectedAt: row.thresholdMetAt.toISOString(),
    handledAt: (row.payload as { handledAt?: string } | null)?.handledAt,
    resolvedAt: row.resolvedAt?.toISOString(),
  } as ClassCommonIssue;
}

function rowToTeacherAgentDirective(
  row: Prisma.TeacherAgentDirectiveGetPayload<Record<string, never>>,
): TeacherAgentDirective {
  // Domain type fields: id, courseId, stageKey, targetStudentIds, targetScope,
  // goal, instruction, successCriteria, status, teacherName, createdAt,
  // updatedAt, completedAt?, revokedAt?.
  return {
    id: row.id,
    courseId: row.courseId,
    stageKey: asString(row.stageKey),
    targetStudentIds: (row.payload as { targetStudentIds?: string[] } | null)?.targetStudentIds ?? [],
    targetScope: (row.scope as TeacherAgentDirective["targetScope"]) ?? "course",
    goal: row.goal,
    instruction: asString(row.content),
    successCriteria: (row.constraints as { successCriteria?: string[] } | null)?.successCriteria ?? [],
    status: (row.payload as { status?: TeacherAgentDirective["status"] } | null)?.status ?? "active",
    teacherName: asString(row.issuedBy),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: (row.payload as { completedAt?: string } | null)?.completedAt,
    revokedAt: (row.payload as { revokedAt?: string } | null)?.revokedAt,
  } as TeacherAgentDirective;
}

function rowToOfflineIntervention(
  row: Prisma.OfflineInterventionRecordGetPayload<Record<string, never>>,
): OfflineInterventionRecord {
  // Domain type fields: id, courseId, stageKey, kind, targetStudentIds,
  // signalIds, note?, teacherName, createdAt.
  return {
    id: row.id,
    courseId: row.courseId,
    stageKey: asString(row.stageKey),
    kind: (row.kind as OfflineInterventionRecord["kind"]) ?? "patrol",
    targetStudentIds: (row.payload as { targetStudentIds?: string[] } | null)?.targetStudentIds ?? [],
    signalIds: (row.payload as { signalIds?: string[] } | null)?.signalIds ?? [],
    note: row.content || undefined,
    teacherName: asString(row.teacherName),
    createdAt: row.createdAt.toISOString(),
  } as OfflineInterventionRecord;
}

function rowToDynamicFacilitationScaffold(
  row: Prisma.DynamicFacilitationScaffoldGetPayload<Record<string, never>>,
): DynamicFacilitationScaffold {
  // Domain type fields: id, courseId, stageKey, kind, title, sections, status,
  // filledContent?, evidenceIds, generatedAt, updatedAt, confirmedAt?.
  return {
    id: row.id,
    courseId: row.courseId,
    stageKey: row.stageKey,
    kind: (row.framework as { kind?: DynamicFacilitationScaffold["kind"] } | null)?.kind ?? "common-issue",
    title: asString((row.framework as { title?: unknown } | null)?.title),
    sections: (row.framework as { sections?: DynamicFacilitationScaffold["sections"] } | null)?.sections ?? [],
    status: (row.framework as { status?: DynamicFacilitationScaffold["status"] } | null)?.status ?? "template",
    filledContent: (row.framework as { filledContent?: string } | null)?.filledContent,
    evidenceIds: (row.evidence as string[]) ?? [],
    generatedAt: row.createdAt.toISOString(),
    updatedAt: row.createdAt.toISOString(),
    confirmedAt: (row.framework as { confirmedAt?: string } | null)?.confirmedAt,
  } as DynamicFacilitationScaffold;
}

// ============================================================================
// Course → child-row creators (used by saveCourse)
// ============================================================================

function extractStudentProgress(student: Student): Record<string, number> {
  return Object.fromEntries(
    Object.entries(student.stageProgress ?? {}).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

// ============================================================================
// Public repository API
// ============================================================================

const FULL_INCLUDE = {
  students: true,
  submissions: true,
  feedback: true,
  rubricScores: true,
  reflections: true,
  activityLog: true,
  announcements: true,
  todos: true,
  resources: true,
  groups: true,
  groupAnnouncements: true,
  workPlan: true,
  whiteboard: true,
  boards: true,
  uploads: true,
  teamContributions: true,
  aiSupports: true,
  teacherInterventions: true,
  stageTransitions: true,
  evaluations: true,
  learningEvents: true,
  companionThreads: true,
  companionTasks: true,
  companionConfirmations: true,
  companionProcessRecords: true,
  learningSignals: true,
  classCommonIssues: true,
  teacherAgentDirectives: true,
  offlineInterventions: true,
  dynamicFacilitationScaffolds: true,
} satisfies Prisma.CourseInclude;

export type CourseInclude = typeof FULL_INCLUDE;

/**
 * Load the full session state from the database.
 * Returns an empty state if no courses exist yet.
 */
export async function loadSessionState(): Promise<SessionState> {
  const courses = await prisma.course.findMany({
    include: FULL_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });

  const meta = await prisma.sessionMeta.findUnique({
    where: { id: "singleton" },
  });

  return {
    ...initialSessionState(),
    courses: courses.map(rowToCourse),
    // Identity is request-local and comes from the signed JWT. Persisting it
    // in a singleton row made one browser overwrite every other user's role.
    joinedCourseId: undefined,
    user: { role: "teacher", name: "教师" },
    studentId: undefined,
    studentName: undefined,
    hydrated: true,
    updatedAt:
      courses.reduce<Date | undefined>(
        (latest, course) =>
          !latest || course.updatedAt > latest ? course.updatedAt : latest,
        meta?.updatedAt,
      )?.toISOString() ?? new Date(0).toISOString(),
  };
}

/**
 * Load a single course by id, including all nested children.
 */
export async function loadCourse(courseId: string): Promise<Course | undefined> {
  const row = await prisma.course.findUnique({
    where: { id: courseId },
    include: FULL_INCLUDE,
  });
  if (!row) return undefined;
  return rowToCourse(row);
}

/**
 * Load a course by invite code (used by student join flow).
 */
export async function loadCourseByInviteCode(
  inviteCode: string,
): Promise<Course | undefined> {
  const row = await prisma.course.findFirst({
    where: { inviteCode },
    include: FULL_INCLUDE,
  });
  if (!row) return undefined;
  return rowToCourse(row);
}

/**
 * Persist a complete Course aggregate.
 *
 * Strategy: within a transaction, delete all existing child rows for this
 * courseId, then re-insert the course + children. This avoids diffing logic
 * for ~30 collections while remaining atomic.
 *
 * Uses upsert for the Course row so it works for both create and update.
 */
export async function saveCourse(course: Course): Promise<Course> {
  return prisma.$transaction(async (tx) => {
    // Delete existing child rows (cascade-style manual delete for safety)
    await tx.student.deleteMany({ where: { courseId: course.id } });
    await tx.classroomSubmission.deleteMany({ where: { courseId: course.id } });
    await tx.teacherFeedback.deleteMany({ where: { courseId: course.id } });
    await tx.rubricScore.deleteMany({ where: { courseId: course.id } });
    await tx.reflectionRecord.deleteMany({ where: { courseId: course.id } });
    await tx.activityRecord.deleteMany({ where: { courseId: course.id } });
    await tx.courseAnnouncement.deleteMany({ where: { courseId: course.id } });
    await tx.courseTodo.deleteMany({ where: { courseId: course.id } });
    await tx.courseResource.deleteMany({ where: { courseId: course.id } });
    await tx.projectGroup.deleteMany({ where: { courseId: course.id } });
    await tx.groupAnnouncement.deleteMany({ where: { courseId: course.id } });
    await tx.workPlanItem.deleteMany({ where: { courseId: course.id } });
    await tx.whiteboardNode.deleteMany({ where: { courseId: course.id } });
    await tx.groupBoard.deleteMany({ where: { courseId: course.id } });
    await tx.courseUpload.deleteMany({ where: { courseId: course.id } });
    await tx.teamContribution.deleteMany({ where: { courseId: course.id } });
    await tx.aiSupportRecord.deleteMany({ where: { courseId: course.id } });
    await tx.teacherIntervention.deleteMany({ where: { courseId: course.id } });
    await tx.stageTransitionRecord.deleteMany({ where: { courseId: course.id } });
    await tx.evaluationRecord.deleteMany({ where: { courseId: course.id } });
    await tx.learningEvent.deleteMany({ where: { courseId: course.id } });
    await tx.companionThread.deleteMany({ where: { courseId: course.id } });
    await tx.companionTask.deleteMany({ where: { courseId: course.id } });
    await tx.companionConfirmation.deleteMany({ where: { courseId: course.id } });
    await tx.companionProcessRecord.deleteMany({ where: { courseId: course.id } });
    await tx.learningSignal.deleteMany({ where: { courseId: course.id } });
    await tx.classCommonIssue.deleteMany({ where: { courseId: course.id } });
    await tx.teacherAgentDirective.deleteMany({ where: { courseId: course.id } });
    await tx.offlineInterventionRecord.deleteMany({ where: { courseId: course.id } });
    await tx.dynamicFacilitationScaffold.deleteMany({ where: { courseId: course.id } });

    // Upsert Course row (preserves createdAt on update)
    const existing = await tx.course.findUnique({ where: { id: course.id } });
    if (existing) {
      await tx.course.update({
        where: { id: course.id },
        data: courseToUpdateInput(course),
      });
    } else {
      await tx.course.create({
        data: courseToCreateInput(course),
      });
    }

    // Re-insert children
    if (course.students.length > 0) {
      for (const s of course.students) {
        await tx.student.upsert({
          where: { courseId_id: { courseId: course.id, id: s.id } },
          create: {
            id: s.id,
            courseId: course.id,
            name: s.name,
            lastSeenAt: s.lastSeenAt ?? null,
            progress: asNullableJson(extractStudentProgress(s)),
          },
          update: {
            name: s.name,
            lastSeenAt: s.lastSeenAt ?? null,
            progress: asNullableJson(extractStudentProgress(s)),
          },
        });
      }
    }

    if (course.submissions?.length) {
      await tx.classroomSubmission.createMany({
        data: course.submissions.map((s) => ({
          id: s.id,
          courseId: course.id,
          studentId: s.studentId ?? "",
          studentName: s.studentName ?? "",
          stageKey: s.stageKey,
          groupId: s.groupId ?? null,
          payload: asJson({
            type: s.type,
            title: s.title,
            content: s.content,
            files: s.files,
          }),
          createdAt: new Date(s.createdAt ?? Date.now()),
          updatedAt: new Date(s.updatedAt ?? Date.now()),
        })),
      });
    }

    if (course.feedback?.length) {
      await tx.teacherFeedback.createMany({
        data: course.feedback.map((f) => ({
          id: f.id,
          courseId: course.id,
          stageKey: f.stageKey ?? null,
          authorName: f.sourceName ?? "teacher",
          content: f.content,
          payload: asJson({
            targetType: f.targetType,
            targetId: f.targetId,
            kind: f.kind,
            sourceRole: f.sourceRole,
            sourceName: f.sourceName,
            evidence: f.evidence,
            status: f.status,
          }),
          createdAt: new Date(f.createdAt ?? Date.now()),
        })),
      });
    }

    if (course.rubricScores?.length) {
      await tx.rubricScore.createMany({
        data: course.rubricScores.map((r) => ({
          id: r.id,
          courseId: course.id,
          studentId: "",
          groupId: r.groupId ?? null,
          stageKey: r.stageKey ?? null,
          criteria: asJson({
            dimensionScores: r.dimensionScores,
            teacherTotal: r.teacherTotal,
            aiDimensionScores: r.aiDimensionScores,
            aiTotal: r.aiTotal,
            finalTotal: r.finalTotal,
            scoringMode: r.scoringMode,
            comment: r.comment,
            status: r.status,
          }),
          total: r.total,
          createdAt: new Date(r.createdAt ?? Date.now()),
          updatedAt: new Date(r.updatedAt ?? Date.now()),
        })),
      });
    }

    if (course.reflections?.length) {
      await tx.reflectionRecord.createMany({
        data: course.reflections.map((r) => ({
          id: r.id,
          courseId: course.id,
          studentId: r.studentId,
          studentName: r.studentName,
          stageKey: "",
          content: asJson({ content: r.content, improvementPlan: r.improvementPlan }),
          createdAt: new Date(r.createdAt ?? Date.now()),
          updatedAt: new Date(r.updatedAt ?? Date.now()),
        })),
      });
    }

    if (course.activityLog?.length) {
      await tx.activityRecord.createMany({
        data: course.activityLog.map((a) => ({
          id: a.id,
          courseId: course.id,
          actor: a.actor,
          action: a.action,
          detail: a.detail ?? null,
          occurredAt: new Date(a.createdAt ?? Date.now()),
        })),
      });
    }

    if (course.announcements?.length) {
      await tx.courseAnnouncement.createMany({
        data: course.announcements.map((a) => ({
          id: a.id,
          courseId: course.id,
          title: a.title,
          content: a.content,
          pinned: a.pinned ?? false,
          replies: asJson(a.replies ?? []),
          createdAt: new Date(a.createdAt ?? Date.now()),
          updatedAt: new Date(a.updatedAt ?? Date.now()),
        })),
      });
    }

    if (course.todos?.length) {
      await tx.courseTodo.createMany({
        data: course.todos.map((t) => ({
          id: t.id,
          courseId: course.id,
          title: t.title,
          description: t.description ?? null,
          stageKey: t.stageKey ?? null,
          completedBy: asJson(t.completedBy ?? []),
        })),
      });
    }

    if (course.resources?.length) {
      await tx.courseResource.createMany({
        data: course.resources.map((r) => ({
          id: r.id,
          courseId: course.id,
          title: r.title,
          type: r.type,
          size: r.size,
          description: r.description ?? null,
          url: r.url ?? null,
          downloadedBy: asJson(r.downloadedBy ?? []),
        })),
      });
    }

    if (course.groups?.length) {
      await tx.projectGroup.createMany({
        data: course.groups.map((g) => ({
          id: g.id,
          courseId: course.id,
          name: g.name,
          topic: g.topic,
          goal: g.goal ?? null,
          keywords: asJson(g.keywords ?? []),
          selectedForms: asJson(g.selectedForms ?? []),
          members: asJson(g.members ?? []),
          proposal: asNullableJson(g.proposal ?? null),
          teacherApproval: asNullableJson(g.teacherApproval ?? null),
          createdAt: new Date(g.createdAt ?? Date.now()),
          updatedAt: new Date(g.updatedAt ?? Date.now()),
        })),
      });
    }

    if (course.groupAnnouncements?.length) {
      await tx.groupAnnouncement.createMany({
        data: course.groupAnnouncements.map((a) => ({
          id: a.id,
          courseId: course.id,
          groupId: a.groupId,
          title: a.title,
          content: a.content,
          actor: a.actor,
          createdAt: new Date(a.createdAt ?? Date.now()),
        })),
      });
    }

    if (course.workPlan?.length) {
      await tx.workPlanItem.createMany({
        data: course.workPlan.map((w) => ({
          id: w.id,
          courseId: course.id,
          groupId: w.groupId,
          role: w.role,
          memberName: w.memberName,
          task: w.task,
          progress: w.progress,
        })),
      });
    }

    if (course.whiteboard?.length) {
      await tx.whiteboardNode.createMany({
        data: course.whiteboard.map((n) => ({
          id: n.id,
          courseId: course.id,
          groupId: n.groupId,
          label: n.label,
          note: n.note ?? null,
          x: n.x,
          y: n.y,
          color: n.color,
          parentId: n.parentId ?? null,
        })),
      });
    }

    if (course.boards?.length) {
      await tx.groupBoard.createMany({
        data: course.boards.map((b) => ({
          courseId: course.id,
          groupId: b.groupId,
          snapshot: asJson(b.snapshot),
          mode: b.mode,
          updatedAt: new Date(b.updatedAt ?? Date.now()),
        })),
      });
    }

    if (course.uploads?.length) {
      await tx.courseUpload.createMany({
        data: course.uploads.map((u) => ({
          id: u.id,
          courseId: course.id,
          groupId: u.groupId ?? null,
          studentId: u.studentId ?? null,
          studentName: u.studentName ?? null,
          stageKey: u.stageKey,
          category: u.category,
          title: u.title,
          fileName: u.fileName,
          fileType: u.fileType,
          size: u.size,
          url: u.url,
          createdAt: new Date(u.createdAt ?? Date.now()),
        })),
      });
    }

    if (course.teamContributions?.length) {
      await tx.teamContribution.createMany({
        data: course.teamContributions.map((c) => ({
          id: c.id,
          courseId: course.id,
          groupId: c.groupId,
          studentId: c.studentId ?? null,
          studentName: c.studentName,
          percent: c.percent,
          note: c.note ?? null,
          updatedAt: new Date(c.updatedAt ?? Date.now()),
        })),
      });
    }

    if (course.aiSupports?.length) {
      await tx.aiSupportRecord.createMany({
        data: course.aiSupports.map((a) => ({
          id: a.id,
          courseId: course.id,
          stageKey: a.stageKey,
          targetType: a.targetType,
          targetId: a.targetId,
          groupId: a.groupId ?? null,
          studentId: a.studentId ?? null,
          studentName: a.studentName ?? null,
          kind: a.kind,
          trigger: a.trigger,
          inputSummary: a.inputSummary,
          diagnosis: a.diagnosis,
          suggestions: asJson(a.suggestions ?? []),
          evidence: asJson(a.evidence ?? []),
          status: a.status,
          source: a.source ?? null,
          editedContent: a.editedContent ?? null,
          structuredPayload: asNullableJson(a.structuredPayload ?? null),
          adoption: asNullableJson(a.adoption ?? null),
          createdAt: new Date(a.createdAt ?? Date.now()),
          updatedAt: new Date(a.updatedAt ?? Date.now()),
        })),
      });
    }

    if (course.teacherInterventions?.length) {
      await tx.teacherIntervention.createMany({
        data: course.teacherInterventions.map((t) => ({
          id: t.id,
          courseId: course.id,
          stageKey: t.stageKey ?? null,
          kind: t.action,
          content: t.instruction,
          createdBy: t.teacherName,
          payload: asJson({
            scope: t.scope,
            targetIds: t.targetIds,
            reason: t.reason,
            evidence: t.evidence,
            action: t.action,
            severity: t.severity,
            status: t.status,
            signalId: t.signalId,
            resolvedAt: t.resolvedAt,
          }),
          createdAt: new Date(t.createdAt ?? Date.now()),
          updatedAt: new Date(t.resolvedAt ?? t.createdAt ?? Date.now()),
        })),
      });
    }

    if (course.stageTransitions?.length) {
      await tx.stageTransitionRecord.createMany({
        data: course.stageTransitions.map((s) => ({
          id: s.id,
          courseId: course.id,
          fromStageKey: s.fromStageKey,
          toStageKey: s.toStageKey,
          gateStatus: s.gateStatus,
          blockers: asJson(s.blockers ?? []),
          warnings: asJson(s.warnings ?? []),
          overrideReason: s.overrideReason ?? null,
          actor: s.actor,
          createdAt: new Date(s.createdAt ?? Date.now()),
        })),
      });
    }

    if (course.evaluations?.length) {
      await tx.evaluationRecord.createMany({
        data: course.evaluations.map((e) => ({
          id: e.id,
          courseId: course.id,
          stageKey: e.stageKey ?? null,
          kind: e.sourceRole,
          result: asJson({
            score: e.score,
            evidence: e.evidence,
          }),
          content: e.comment,
          payload: asJson({
            sourceRole: e.sourceRole,
            targetType: e.targetType,
            targetId: e.targetId,
            score: e.score,
            evidence: e.evidence,
            status: e.status,
          }),
          createdAt: new Date(e.createdAt ?? Date.now()),
          updatedAt: new Date(e.updatedAt ?? Date.now()),
        })),
      });
    }

    if (course.learningEvents?.length) {
      await tx.learningEvent.createMany({
        data: course.learningEvents.map((e) => ({
          id: e.id,
          idempotencyKey: e.idempotencyKey,
          courseId: course.id,
          studentId: e.studentId,
          stageKey: e.stageKey,
          sceneId: e.sceneId ?? null,
          type: e.type,
          occurredAt: new Date(e.occurredAt ?? Date.now()),
          durationMs: e.durationMs ?? null,
          expectedDurationSec: e.expectedDurationSec ?? null,
          ttsDurationSec: e.ttsDurationSec ?? null,
          plannedStudentActivitySec: e.plannedStudentActivitySec ?? null,
          visible: e.visible ?? null,
          progressMarker: e.progressMarker ?? null,
          content: asNullableJson(e.content ?? null),
          metadata: asNullableJson(e.metadata ?? null),
        })),
      });
    }

    if (course.companionThreads?.length) {
      await tx.companionThread.createMany({
        data: course.companionThreads.map((t) => ({
          id: t.id,
          courseId: course.id,
          studentId: t.studentId,
          stageKey: t.stageKey,
          messages: asJson(t.messages ?? []),
          openingSentAt: t.openingSentAt ?? null,
          createdAt: new Date(t.createdAt ?? Date.now()),
          updatedAt: new Date(t.updatedAt ?? Date.now()),
        })),
      });
    }

    if (course.companionTasks?.length) {
      await tx.companionTask.createMany({
        data: course.companionTasks.map((t) => ({
          id: t.id,
          courseId: course.id,
          studentId: t.studentId,
          stageKey: t.stageKey,
          companionId: t.companionId ?? null,
          kind: t.kind,
          title: t.title,
          request: t.request,
          status: t.status,
          result: t.result ?? null,
          error: t.error ?? null,
          confirmationId: t.confirmationId ?? null,
          createdAt: new Date(t.createdAt ?? Date.now()),
          updatedAt: new Date(t.updatedAt ?? Date.now()),
        })),
      });
    }

    if (course.companionConfirmations?.length) {
      await tx.companionConfirmation.createMany({
        data: course.companionConfirmations.map((c) => ({
          id: c.id,
          courseId: course.id,
          studentId: c.studentId,
          stageKey: c.stageKey,
          action: c.action,
          title: c.title,
          summary: c.summary,
          taskId: c.taskId ?? null,
          payload: asNullableJson(c.payload ?? null),
          status: c.status,
          createdAt: new Date(c.createdAt ?? Date.now()),
          resolvedAt: c.resolvedAt ? new Date(c.resolvedAt) : null,
        })),
      });
    }

    if (course.companionProcessRecords?.length) {
      await tx.companionProcessRecord.createMany({
        data: course.companionProcessRecords.map((r) => ({
          id: r.id,
          courseId: course.id,
          studentId: r.studentId,
          stageKey: r.stageKey,
          title: r.title,
          summary: r.summary,
          source: r.source,
          companionId: r.companionId ?? null,
          taskId: r.taskId ?? null,
          evidenceIds: asJson(r.evidenceIds ?? []),
          createdAt: new Date(r.createdAt ?? Date.now()),
        })),
      });
    }

    if (course.learningSignals?.length) {
      await tx.learningSignal.createMany({
        data: course.learningSignals.map((s) => ({
          id: s.id,
          courseId: course.id,
          studentId: s.studentId,
          stageKey: s.stageKey,
          sceneId: s.sceneId ?? null,
          kind: s.kind,
          severity: s.severity,
          status: s.status,
          title: s.title,
          summary: s.summary,
          content: asNullableJson(s.content ?? null),
          normalizedIssueKey: s.normalizedIssueKey,
          evidenceEventIds: asJson(s.evidenceEventIds ?? []),
          aiInterventionAttempts: s.aiInterventionAttempts,
          firstDetectedAt: new Date(s.firstDetectedAt ?? Date.now()),
          lastDetectedAt: new Date(s.lastDetectedAt ?? Date.now()),
          handledAt: s.handledAt ? new Date(s.handledAt) : null,
          resolvedAt: s.resolvedAt ? new Date(s.resolvedAt) : null,
        })),
      });
    }

    if (course.classCommonIssues?.length) {
      await tx.classCommonIssue.createMany({
        data: course.classCommonIssues.map((i) => ({
          id: i.id,
          courseId: course.id,
          stageKey: i.stageKey,
          kind: i.severity,
          title: i.title,
          summary: i.summary,
          affectedStudentIds: asJson(i.studentIds ?? []),
          thresholdMetAt: new Date(i.firstDetectedAt ?? Date.now()),
          resolvedAt: i.resolvedAt ? new Date(i.resolvedAt) : null,
          payload: asJson({
            normalizedIssueKey: i.normalizedIssueKey,
            content: i.content,
            severity: i.severity,
            signalIds: i.signalIds,
            affectedStudents: i.affectedStudents,
            status: i.status,
            lastDetectedAt: i.lastDetectedAt,
            handledAt: i.handledAt,
          }),
        })),
      });
    }

    if (course.teacherAgentDirectives?.length) {
      await tx.teacherAgentDirective.createMany({
        data: course.teacherAgentDirectives.map((d) => ({
          id: d.id,
          courseId: course.id,
          stageKey: d.stageKey ?? null,
          scope: d.targetScope,
          goal: d.goal,
          content: d.instruction,
          constraints: asJson({ successCriteria: d.successCriteria }),
          issuedBy: d.teacherName,
          payload: asJson({
            targetStudentIds: d.targetStudentIds,
            status: d.status,
            completedAt: d.completedAt,
            revokedAt: d.revokedAt,
          }),
          createdAt: new Date(d.createdAt ?? Date.now()),
          updatedAt: new Date(d.updatedAt ?? Date.now()),
        })),
      });
    }

    if (course.offlineInterventions?.length) {
      await tx.offlineInterventionRecord.createMany({
        data: course.offlineInterventions.map((i) => ({
          id: i.id,
          courseId: course.id,
          stageKey: i.stageKey,
          kind: i.kind,
          content: i.note ?? "",
          teacherName: i.teacherName,
          occurredAt: new Date(i.createdAt ?? Date.now()),
          payload: asJson({
            targetStudentIds: i.targetStudentIds,
            signalIds: i.signalIds,
          }),
          createdAt: new Date(i.createdAt ?? Date.now()),
        })),
      });
    }

    const facilitationScaffolds = normalizeFacilitationScaffolds(
      (course.dynamicFacilitationScaffolds ?? []).map((scaffold) => ({
        ...scaffold,
        courseId: course.id,
      })),
    );
    if (facilitationScaffolds.length) {
      await tx.dynamicFacilitationScaffold.createMany({
        data: facilitationScaffolds.map((s) => ({
          id: s.id,
          courseId: course.id,
          stageKey: s.stageKey,
          framework: asJson({
            kind: s.kind,
            title: s.title,
            sections: s.sections,
            status: s.status,
            filledContent: s.filledContent,
            confirmedAt: s.confirmedAt,
          }),
          evidence: asJson(s.evidenceIds ?? []),
          createdAt: new Date(s.generatedAt ?? Date.now()),
        })),
      });
    }

    // Reload and return the persisted course
    const refreshed = await tx.course.findUnique({
      where: { id: course.id },
      include: FULL_INCLUDE,
    });
    if (!refreshed) {
      throw new CourseNotFoundError(course.id);
    }
    return rowToCourse(refreshed);
  });
}

function courseToUpdateInput(course: Course): CourseRowUpdate {
  return {
    name: course.name,
    subject: course.subject,
    grade: course.grade,
    hours: course.hours,
    summary: course.summary,
    drivingQuestion: course.drivingQuestion,
    learningObjectives: asNullableJson(course.learningObjectives ?? null),
    expectedOutcome: course.expectedOutcome ?? null,
    learnerProfile: asNullableJson(course.learnerProfile ?? null),
    status: course.status,
    currentStageIndex: course.currentStageIndex,
    inviteCode: course.inviteCode ?? null,
    coverImageUrl: course.coverImageUrl ?? null,
    presentingGroupId: course.presentingGroupId ?? null,
    classConfig: asNullableJson(course.classConfig ?? null),
    pblConfig: asNullableJson(course.pblConfig ?? null),
    stageWorkspacePolicies: asNullableJson(course.stageWorkspacePolicies ?? null),
    content: asNullableJson(course.content ?? null),
    stages: asNullableJson(course.stages ?? null),
    uiState: asNullableJson(course.uiState ?? null),
    aiLearningProgress: asNullableJson(course.aiLearningProgress ?? null),
    aiLearningClassroomId: course.aiLearningClassroomId ?? null,
    teacherClassroomId: course.teacherClassroomId ?? null,
    resolvedInterventionSignalIds: asNullableJson(
      course.resolvedInterventionSignalIds ?? null,
    ),
    updatedAt: new Date(course.updatedAt ?? Date.now()),
    version: { increment: 1 },
  };
}

/**
 * Delete a course and all its children (cascade).
 */
export async function deleteCourse(courseId: string): Promise<void> {
  await prisma.course.delete({ where: { id: courseId } });
}

/**
 * Stage 6 side effect for DELETE_UPLOAD: locate the UploadFile row whose
 * `referencedBy` array contains `uploadId` and drop that reference. When the
 * refCount reaches 0 the underlying disk file is removed by `decrementRef`.
 *
 * The lookup is done in JS rather than via a Prisma JSON filter because the
 * `referencedBy` column is typed `Json` (not a relation scalar list), so
 * `array_contains` is awkward to type safely. The candidate set is bounded
 * by `refCount > 0` so the scan is cheap in practice.
 */
async function handleDeleteUploadSideEffects(uploadId: string): Promise<void> {
  const candidates = await prisma.uploadFile.findMany({
    where: { refCount: { gt: 0 } },
    select: { id: true, referencedBy: true },
  });
  for (const candidate of candidates) {
    const refs = Array.isArray(candidate.referencedBy)
      ? candidate.referencedBy.filter((r): r is string => typeof r === "string")
      : [];
    if (!refs.includes(uploadId)) continue;
    try {
      await decrementRef(candidate.id, uploadId);
    } catch (err) {
      console.error("[dispatchAction] decrementRef failed:", err);
    }
    return;
  }
}

/**
 * Handle RESTART_TEACHING: archive current classroom data to a CourseSession
 * row, clear all child tables, issue a new invite code, then run the reducer
 * to sync the in-memory state and persist SessionMeta.
 *
 * If the course has no classroom data yet (e.g. status === "draft" and no
 * students/submissions), archiving is skipped — only the invite code and
 * status are updated.
 */
async function dispatchRestartTeaching(
  action: Extract<SessionAction, { type: "RESTART_TEACHING" }>,
): Promise<SessionState> {
  const { id: courseId, newInviteCode } = action.payload;
  const current = await loadCourse(courseId);
  if (!current) {
    throw new CourseNotFoundError(courseId);
  }

  const hasClassroomData =
    (current.students?.length ?? 0) > 0 ||
    (current.submissions?.length ?? 0) > 0 ||
    (current.groups?.length ?? 0) > 0 ||
    current.status === "teaching" ||
    current.status === "finished";

  if (hasClassroomData) {
    const startedAt = current.createdAt;
    const endedAt = new Date().toISOString();
    await archiveAndClearCourseSession(courseId, newInviteCode, startedAt, endedAt);
  } else {
    // Empty course — just update invite code + status in DB.
    await prisma.course.update({
      where: { id: courseId },
      data: {
        status: "teaching",
        currentStageIndex: 0,
        inviteCode: newInviteCode,
        presentingGroupId: null,
        version: { increment: 1 },
      },
    });
  }

  // Reload state after archiving (child tables cleared, Course updated) and
  // run the reducer so in-memory state matches DB. The reducer is idempotent
  // here — it sets the same fields archiveAndClearCourseSession already wrote.
  const afterArchive = await loadSessionState();
  const next = applySessionAction(afterArchive, action);

  return next;
}

/**
 * Apply a session action atomically.
 *
 * Loads the current state, applies the pure `applySessionAction` reducer,
 * persists the affected course(s), and returns the new state.
 *
 * Note: For action types that only touch a single course (e.g. UPSERT_SUBMISSION),
 * we only persist that course. Identity-only actions remain request-local.
 * For CREATE_COURSE we save the new course. For DELETE_COURSE we delete it.
 */
async function dispatchActionUnlocked(
  action: SessionAction,
): Promise<SessionState> {
  // RESTART_TEACHING must archive the current classroom data to a
  // CourseSession row, clear all child tables, and issue a new invite code
  // before the reducer syncs the in-memory state. This cannot live in the
  // pure reducer because archiving is a DB write.
  if (action.type === "RESTART_TEACHING") {
    return dispatchRestartTeaching(action);
  }

  // High-frequency presence/progress updates must not rewrite the complete
  // course aggregate. Persist only the affected Student row and touch the
  // parent course so polling clients observe a stable updatedAt change.
  if (action.type === "HEARTBEAT") {
    const { courseId, studentId, lastSeenAt } = action.payload;
    const result = await prisma.student.updateMany({
      where: { courseId, id: studentId },
      data: { lastSeenAt, version: { increment: 1 } },
    });
    if (result.count === 0) return loadSessionState();
    await touchCourse(courseId);
    return loadSessionState();
  }

  if (action.type === "MARK_STUDENTS_OFFLINE") {
    const { courseId, studentIds } = action.payload;
    if (studentIds.length > 0) {
      const result = await prisma.student.updateMany({
        where: { courseId, id: { in: studentIds } },
        data: { lastSeenAt: null, version: { increment: 1 } },
      });
      if (result.count > 0) await touchCourse(courseId);
    }
    return loadSessionState();
  }

  if (action.type === "UPDATE_STUDENT_PROGRESS") {
    const { courseId, studentId, stageKey, value } = action.payload;
    const student = await prisma.student.findUnique({
      where: { courseId_id: { courseId, id: studentId } },
      select: { progress: true },
    });
    if (!student) throw new CourseNotFoundError(courseId);
    const progress =
      (student.progress as Record<string, number> | null) ?? {};
    await prisma.student.update({
      where: { courseId_id: { courseId, id: studentId } },
      data: {
        progress: asNullableJson({ ...progress, [stageKey]: value }),
        version: { increment: 1 },
      },
    });
    await touchCourse(courseId);
    return loadSessionState();
  }

  // Stage 6: file-management side effects. The pure reducer in
  // `applySessionAction` cannot perform async DB writes, so disk/DB cleanup
  // for uploads happens here alongside the state transition.
  if (action.type === "DELETE_UPLOAD") {
    await handleDeleteUploadSideEffects(action.payload.uploadId);
  }

  const current = await loadSessionState();
  const next = applySessionAction(current, action);

  // Determine which courses changed and persist them.
  // Simple approach: persist any course whose updatedAt changed or that
  // exists in `next` but not `current` (new course). For DELETE_COURSE the
  // course is already gone in `next`.
  const currentCourseIds = new Set(current.courses.map((c) => c.id));
  const nextCourseIds = new Set(next.courses.map((c) => c.id));

  // Deleted courses — also cascade-delete associated upload files (disk + DB).
  for (const id of currentCourseIds) {
    if (!nextCourseIds.has(id)) {
      await deleteCourse(id);
      try {
        await cleanupCourseFiles(id);
      } catch (err) {
        console.error("[dispatchAction] cleanupCourseFiles failed:", err);
      }
    }
  }

  // New or updated courses
  for (const nextCourse of next.courses) {
    const prev = current.courses.find((c) => c.id === nextCourse.id);
    if (!prev || prev.updatedAt !== nextCourse.updatedAt) {
      await saveCourse(nextCourse);
    }
  }

  return next;
}

async function touchCourse(courseId: string): Promise<void> {
  const result = await prisma.course.updateMany({
    where: { id: courseId },
    data: {
      updatedAt: new Date(),
      version: { increment: 1 },
    },
  });
  if (result.count === 0) throw new CourseNotFoundError(courseId);
}

/**
 * Serialize aggregate read-modify-write actions across app processes.
 *
 * `saveCourse` replaces the child collections of a course, so two concurrent
 * reducers must not both read the same snapshot and then overwrite each other.
 * A PostgreSQL transaction-level advisory lock provides that coordination
 * without storing user identity or lock state in application tables.
 */
export async function dispatchAction(
  action: SessionAction,
): Promise<SessionState> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(824674211)`;
      return dispatchActionUnlocked(action);
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
}

/**
 * Update a single course via an updater function.
 * Loads the course, applies the updater, persists it.
 */
async function updateCourseUnlocked(
  courseId: string,
  updater: (course: Course) => Course,
): Promise<SessionState> {
  const course = await loadCourse(courseId);
  if (!course) throw new CourseNotFoundError(courseId);
  const updated = applyCourseUpdate(course, updater);
  await saveCourse(updated);
  return loadSessionState();
}

export async function updateCourse(
  courseId: string,
  updater: (course: Course) => Course,
): Promise<SessionState> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(824674211)`;
      return updateCourseUnlocked(courseId, updater);
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
}

/**
 * Archive the current classroom data of a course to a CourseSession record,
 * then clear all classroom data and generate a new invite code.
 *
 * Used by the RESTART_TEACHING action.
 */
export async function archiveAndClearCourseSession(
  courseId: string,
  newInviteCode: string,
  sessionStartedAt?: string,
  sessionEndedAt?: string,
): Promise<{ archivedSessionId: string; newInviteCode: string }> {
  const course = await loadCourse(courseId);
  if (!course) throw new CourseNotFoundError(courseId);

  const now = new Date();
  const startedAt = sessionStartedAt ? new Date(sessionStartedAt) : course.updatedAt ? new Date(course.updatedAt) : now;
  const endedAt = sessionEndedAt ? new Date(sessionEndedAt) : now;

  // Build archive snapshot — everything except course resources that survive restart
  const archivedData = {
    students: course.students,
    submissions: course.submissions ?? [],
    feedback: course.feedback ?? [],
    rubricScores: course.rubricScores ?? [],
    reflections: course.reflections ?? [],
    activityLog: course.activityLog ?? [],
    groups: course.groups ?? [],
    groupAnnouncements: course.groupAnnouncements ?? [],
    workPlan: course.workPlan ?? [],
    whiteboard: course.whiteboard ?? [],
    boards: course.boards ?? [],
    uploads: course.uploads ?? [],
    teamContributions: course.teamContributions ?? [],
    aiSupports: course.aiSupports ?? [],
    teacherInterventions: course.teacherInterventions ?? [],
    resolvedInterventionSignalIds: course.resolvedInterventionSignalIds ?? [],
    stageTransitions: course.stageTransitions ?? [],
    evaluations: course.evaluations ?? [],
    uiState: course.uiState ?? null,
    presentingGroupId: course.presentingGroupId ?? null,
    currentStageIndex: course.currentStageIndex,
    aiLearningProgress: course.aiLearningProgress ?? {},
    learningEvents: course.learningEvents ?? [],
    companionThreads: course.companionThreads ?? [],
    companionTasks: course.companionTasks ?? [],
    companionConfirmations: course.companionConfirmations ?? [],
    companionProcessRecords: course.companionProcessRecords ?? [],
    learningSignals: course.learningSignals ?? [],
    classCommonIssues: course.classCommonIssues ?? [],
    teacherAgentDirectives: course.teacherAgentDirectives ?? [],
    offlineInterventions: course.offlineInterventions ?? [],
    dynamicFacilitationScaffolds: course.dynamicFacilitationScaffolds ?? [],
  };

  const archivedSession = await prisma.courseSession.create({
    data: {
      courseId,
      inviteCode: course.inviteCode ?? "",
      startedAt,
      endedAt,
      archivedData: asJson(archivedData),
      studentCount: course.students.length,
      submissionCount: course.submissions?.length ?? 0,
    },
  });

  // Clear classroom data on the course (preserve content/stages/pblConfig/etc.)
  await prisma.$transaction(async (tx) => {
    // Delete all child rows
    await tx.student.deleteMany({ where: { courseId } });
    await tx.classroomSubmission.deleteMany({ where: { courseId } });
    await tx.teacherFeedback.deleteMany({ where: { courseId } });
    await tx.rubricScore.deleteMany({ where: { courseId } });
    await tx.reflectionRecord.deleteMany({ where: { courseId } });
    await tx.activityRecord.deleteMany({ where: { courseId } });
    await tx.courseAnnouncement.deleteMany({ where: { courseId } });
    await tx.courseTodo.deleteMany({ where: { courseId } });
    await tx.courseResource.deleteMany({ where: { courseId } });
    await tx.projectGroup.deleteMany({ where: { courseId } });
    await tx.groupAnnouncement.deleteMany({ where: { courseId } });
    await tx.workPlanItem.deleteMany({ where: { courseId } });
    await tx.whiteboardNode.deleteMany({ where: { courseId } });
    await tx.groupBoard.deleteMany({ where: { courseId } });
    await tx.courseUpload.deleteMany({ where: { courseId } });
    await tx.teamContribution.deleteMany({ where: { courseId } });
    await tx.aiSupportRecord.deleteMany({ where: { courseId } });
    await tx.teacherIntervention.deleteMany({ where: { courseId } });
    await tx.stageTransitionRecord.deleteMany({ where: { courseId } });
    await tx.evaluationRecord.deleteMany({ where: { courseId } });
    await tx.learningEvent.deleteMany({ where: { courseId } });
    await tx.companionThread.deleteMany({ where: { courseId } });
    await tx.companionTask.deleteMany({ where: { courseId } });
    await tx.companionConfirmation.deleteMany({ where: { courseId } });
    await tx.companionProcessRecord.deleteMany({ where: { courseId } });
    await tx.learningSignal.deleteMany({ where: { courseId } });
    await tx.classCommonIssue.deleteMany({ where: { courseId } });
    await tx.teacherAgentDirective.deleteMany({ where: { courseId } });
    await tx.offlineInterventionRecord.deleteMany({ where: { courseId } });
    await tx.dynamicFacilitationScaffold.deleteMany({ where: { courseId } });

    // Reset course-level classroom state, keep resources
    await tx.course.update({
      where: { id: courseId },
      data: {
        status: "teaching",
        currentStageIndex: 0,
        inviteCode: newInviteCode,
        presentingGroupId: null,
        uiState: { teacherResourceProjection: null } as Prisma.InputJsonValue,
        aiLearningProgress: Prisma.JsonNull,
        resolvedInterventionSignalIds: Prisma.JsonNull,
        version: { increment: 1 },
      },
    });
  });

  return {
    archivedSessionId: archivedSession.id,
    newInviteCode,
  };
}

/**
 * List archived sessions for a course (newest first).
 */
export async function listCourseSessions(courseId: string) {
  return prisma.courseSession.findMany({
    where: { courseId },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      inviteCode: true,
      startedAt: true,
      endedAt: true,
      studentCount: true,
      submissionCount: true,
      createdAt: true,
    },
  });
}

/**
 * Get a single archived session with full snapshot data.
 */
export async function getCourseSession(sessionId: string) {
  return prisma.courseSession.findUnique({
    where: { id: sessionId },
  });
}
