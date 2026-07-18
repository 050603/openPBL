import type {
  ActivityRecord,
  AiSupportRecord,
  ClassConfig,
  ClassroomSubmission,
  CompanionConfirmation,
  CompanionProcessRecord,
  CompanionTask,
  Course,
  CourseAnnouncement,
  CourseContent,
  CourseStatus,
  CourseTodo,
  CourseUiState,
  CourseUpload,
  GroupAnnouncement,
  GroupBoard,
  OfflineInterventionRecord,
  ProjectGroup,
  ReflectionRecord,
  RubricScore,
  Stage,
  Student,
  TeacherFeedback,
  TeamContribution,
  TeacherAgentDirective,
  WhiteboardNode,
  WorkPlanItem,
} from "./types";
import { DEFAULT_EVALUATION_FLOWS } from "./types";
import { DEFAULT_STAGES } from "./types";
import { normalizePblCourseConfig } from "@/lib/pbl-course-config";

export type SessionState = {
  courses: Course[];
  joinedCourseId?: string;
  user: { role: "teacher" | "student"; name: string };
  studentId?: string;
  studentName?: string;
  hydrated: boolean;
  updatedAt?: string;
};

export type SessionAction =
  | { type: "HYDRATE"; payload: SessionState }
  | { type: "SET_USER"; payload: SessionState["user"] }
  | { type: "CREATE_COURSE"; payload: Course }
  | { type: "UPDATE_COURSE"; payload: { id: string; patch: Partial<Course> } }
  | { type: "DELETE_COURSE"; payload: { id: string } }
  | { type: "SET_COURSE_CONTENT"; payload: { id: string; content: CourseContent } }
  | { type: "SET_COURSE_STAGES"; payload: { id: string; stages: Stage[] } }
  | { type: "PUBLISH_COURSE"; payload: { id: string } }
  | {
      type: "START_TEACHING";
      payload: { id: string; classConfig: ClassConfig; inviteCode: string };
    }
  | { type: "END_TEACHING"; payload: { id: string } }
  | { type: "ADVANCE_STAGE"; payload: { id: string; direction: 1 | -1 } }
  | { type: "SET_STAGE"; payload: { id: string; index: number } }
  | { type: "JOIN_CLASS"; payload: { courseId: string; student: Student } }
  | { type: "LEAVE_CLASS"; payload: { courseId: string; studentId: string } }
  | { type: "HEARTBEAT"; payload: { courseId: string; studentId: string; lastSeenAt: string } }
  | { type: "MARK_STUDENTS_OFFLINE"; payload: { courseId: string; studentIds: string[] } }
  | {
      type: "UPDATE_STUDENT_PROGRESS";
      payload: { courseId: string; studentId: string; stageKey: string; value: number };
    }
  | { type: "UPSERT_SUBMISSION"; payload: { courseId: string; submission: ClassroomSubmission } }
  | { type: "ADD_FEEDBACK"; payload: { courseId: string; feedback: TeacherFeedback } }
  | { type: "UPSERT_RUBRIC_SCORE"; payload: { courseId: string; score: RubricScore } }
  | { type: "UPSERT_REFLECTION"; payload: { courseId: string; reflection: ReflectionRecord } }
  | { type: "ADD_ACTIVITY"; payload: { courseId: string; activity: ActivityRecord } }
  | { type: "SET_PRESENTING_GROUP"; payload: { courseId: string; groupId: string } }
  | { type: "UPSERT_ANNOUNCEMENT"; payload: { courseId: string; announcement: CourseAnnouncement } }
  | { type: "DELETE_ANNOUNCEMENT"; payload: { courseId: string; announcementId: string } }
  | {
      type: "ADD_ANNOUNCEMENT_REPLY";
      payload: { courseId: string; announcementId: string; reply: CourseAnnouncement["replies"][number] };
    }
  | { type: "UPSERT_TODO"; payload: { courseId: string; todo: CourseTodo } }
  | {
      type: "MARK_RESOURCE_DOWNLOADED";
      payload: { courseId: string; resourceId: string; studentId: string; studentName: string };
    }
  | { type: "UPSERT_GROUP"; payload: { courseId: string; group: ProjectGroup } }
  | {
      type: "JOIN_GROUP";
      payload: {
        courseId: string;
        groupId: string;
        studentId: string;
        studentName: string;
        role?: string;
      };
    }
  | { type: "LEAVE_GROUP"; payload: { courseId: string; groupId: string; studentId: string } }
  | { type: "SET_GROUP_TOPIC"; payload: { courseId: string; groupId: string; patch: Partial<ProjectGroup> } }
  | {
      type: "UPSERT_GROUP_ANNOUNCEMENT";
      payload: { courseId: string; announcement: GroupAnnouncement };
    }
  | { type: "UPSERT_WORK_PLAN_ITEM"; payload: { courseId: string; item: WorkPlanItem } }
  | { type: "DELETE_WORK_PLAN_ITEM"; payload: { courseId: string; itemId: string } }
  | { type: "UPSERT_WHITEBOARD_NODE"; payload: { courseId: string; node: WhiteboardNode } }
  | { type: "DELETE_WHITEBOARD_NODE"; payload: { courseId: string; nodeId: string } }
  | { type: "UPSERT_GROUP_BOARD"; payload: { courseId: string; board: GroupBoard } }
  | { type: "UPSERT_UPLOAD"; payload: { courseId: string; upload: CourseUpload } }
  | { type: "DELETE_UPLOAD"; payload: { courseId: string; uploadId: string } }
  | { type: "SET_PREVIEW_UPLOAD"; payload: { courseId: string; uploadId?: string } }
  | { type: "UPSERT_TEAM_CONTRIBUTION"; payload: { courseId: string; contribution: TeamContribution } }
  | { type: "UPSERT_AI_SUPPORT"; payload: { courseId: string; support: AiSupportRecord } }
  | { type: "ADD_OFFLINE_INTERVENTION"; payload: { courseId: string; intervention: OfflineInterventionRecord } }
  | { type: "RESOLVE_INTERVENTION_SIGNALS"; payload: { courseId: string; signalIds: string[] } }
  | { type: "UPSERT_TEACHER_AGENT_DIRECTIVE"; payload: { courseId: string; directive: TeacherAgentDirective } }
  | { type: "UPSERT_COMPANION_TASK"; payload: { courseId: string; task: CompanionTask } }
  | { type: "UPSERT_COMPANION_CONFIRMATION"; payload: { courseId: string; confirmation: CompanionConfirmation } }
  | { type: "RESOLVE_COMPANION_CONFIRMATION"; payload: { courseId: string; confirmationId: string; status: CompanionConfirmation["status"]; resolvedAt: string } }
  | { type: "ADD_COMPANION_PROCESS_RECORD"; payload: { courseId: string; record: CompanionProcessRecord } }
  | { type: "SET_UI_STATE"; payload: { courseId: string; patch: Partial<CourseUiState> } };

export function initialSessionState(): SessionState {
  return {
    courses: [],
    user: { role: "teacher", name: "教师" },
    hydrated: false,
  };
}

export function applySessionAction(
  state: SessionState,
  action: SessionAction,
): SessionState {
  const touchedAt = new Date().toISOString();
  switch (action.type) {
    case "HYDRATE":
      return { ...action.payload, courses: action.payload.courses.map(normalizeCourse), hydrated: true };
    case "SET_USER":
      return { ...state, user: action.payload, updatedAt: touchedAt };
    case "CREATE_COURSE":
      return {
        ...state,
        courses: [normalizeCourse(action.payload), ...state.courses],
        updatedAt: touchedAt,
      };
    case "UPDATE_COURSE": {
      const { id, patch } = action.payload;
      return {
        ...state,
        courses: state.courses.map((c) =>
          c.id === id ? normalizeCourse({ ...c, ...patch, updatedAt: touchedAt }) : c,
        ),
        updatedAt: touchedAt,
      };
    }
    case "DELETE_COURSE":
      return {
        ...state,
        courses: state.courses.filter((c) => c.id !== action.payload.id),
        updatedAt: touchedAt,
      };
    case "SET_COURSE_CONTENT": {
      const { id, content } = action.payload;
      return {
        ...state,
        courses: state.courses.map((c) =>
          c.id === id
            ? normalizeCourse({
                ...c,
                content,
                status: c.status === "draft" ? ("preparing" as CourseStatus) : c.status,
                updatedAt: touchedAt,
              })
            : c,
        ),
        updatedAt: touchedAt,
      };
    }
    case "SET_COURSE_STAGES": {
      const { id, stages } = action.payload;
      return {
        ...state,
        courses: state.courses.map((c) =>
          c.id === id
            ? normalizeCourse({
                ...c,
                stages,
                currentStageIndex: Math.min(c.currentStageIndex, stages.length - 1),
                updatedAt: touchedAt,
              })
            : c,
        ),
        updatedAt: touchedAt,
      };
    }
    case "PUBLISH_COURSE":
      return updateCourse(state, action.payload.id, {
        status: "ready",
        updatedAt: touchedAt,
      });
    case "START_TEACHING": {
      const { id, classConfig, inviteCode } = action.payload;
      const course = state.courses.find((item) => item.id === id);
      return updateCourse(state, id, {
        status: "teaching",
        classConfig,
        inviteCode,
        currentStageIndex: 0,
        uiState: {
          ...(course?.uiState ?? {}),
          teacherResourceProjection: null,
        },
        // A new class starts with no project spaces. Each student receives one
        // private personal-project space when joining; no real student grouping occurs.
        groups: [],
        workPlan: [],
        whiteboard: [],
        groupAnnouncements: [],
        updatedAt: touchedAt,
      });
    }
    case "END_TEACHING": {
      const course = state.courses.find((item) => item.id === action.payload.id);
      return updateCourse(state, action.payload.id, {
        status: "finished",
        uiState: {
          ...(course?.uiState ?? {}),
          teacherResourceProjection: null,
        },
        updatedAt: touchedAt,
      });
    }
    case "ADVANCE_STAGE": {
      const { id, direction } = action.payload;
      return {
        ...state,
        courses: state.courses.map((c) => {
          if (c.id !== id) return c;
          const next = Math.max(0, Math.min(c.stages.length - 1, c.currentStageIndex + direction));
          return normalizeCourse({
            ...c,
            currentStageIndex: next,
            uiState:
              next === c.currentStageIndex
                ? c.uiState
                : { ...(c.uiState ?? {}), teacherResourceProjection: null },
            updatedAt: touchedAt,
          });
        }),
        updatedAt: touchedAt,
      };
    }
    case "SET_STAGE": {
      const { id, index } = action.payload;
      return {
        ...state,
        courses: state.courses.map((c) => {
          if (c.id !== id) return c;
          const next = Math.max(0, Math.min(c.stages.length - 1, index));
          return normalizeCourse({
            ...c,
            currentStageIndex: next,
            uiState:
              next === c.currentStageIndex
                ? c.uiState
                : { ...(c.uiState ?? {}), teacherResourceProjection: null },
            updatedAt: touchedAt,
          });
        }),
        updatedAt: touchedAt,
      };
    }
    case "JOIN_CLASS": {
      const { courseId, student } = action.payload;
      return {
        ...state,
        joinedCourseId: courseId,
        studentId: student.id,
        studentName: student.name,
        courses: state.courses.map((c) => {
          if (c.id !== courseId) return c;
          // Keep the legacy ProjectGroup container only as the storage key for
          // one student's private project. It is never presented as a group.
          const alreadyInGroup = (c.groups ?? []).some((g) =>
            g.members.some((m) => m.studentId === student.id),
          );
          const groups = !alreadyInGroup
            ? [
                ...(c.groups ?? []),
                {
                  id: `grp-${student.id}`,
                  name: `${student.name}的个人项目`,
                  topic: "待确定选题方向",
                  goal: "",
                  keywords: [],
                  selectedForms: [],
                  members: [{ studentId: student.id, name: student.name, role: "项目负责人" }],
                  createdAt: touchedAt,
                  updatedAt: touchedAt,
                },
              ]
            : c.groups;
          return normalizeCourse({
            ...c,
            students: dedupeStudents([...c.students, student]),
            groups,
            activityLog: addActivity(c.activityLog, activity(student.name, "加入课堂", "通过邀请码进入课堂", touchedAt)),
            updatedAt: touchedAt,
          });
        }),
        updatedAt: touchedAt,
      };
    }
    case "LEAVE_CLASS": {
      const { courseId, studentId } = action.payload;
      return {
        ...state,
        joinedCourseId: state.joinedCourseId === courseId ? undefined : state.joinedCourseId,
        studentId: state.studentId === studentId ? undefined : state.studentId,
        studentName: state.studentId === studentId ? undefined : state.studentName,
        courses: state.courses.map((c) =>
          c.id === courseId
            ? normalizeCourse({
                ...c,
                students: c.students.filter((s) => s.id !== studentId),
                groups: (c.groups ?? []).map((g) => ({
                  ...g,
                  members: g.members.filter((m) => m.studentId !== studentId),
                })),
                updatedAt: touchedAt,
              })
            : c,
        ),
        updatedAt: touchedAt,
      };
    }
    case "HEARTBEAT": {
      const { courseId, studentId, lastSeenAt } = action.payload;
      return {
        ...state,
        courses: state.courses.map((c) =>
          c.id === courseId
            ? normalizeCourse({
                ...c,
                students: c.students.map((s) =>
                  s.id === studentId ? { ...s, lastSeenAt } : s,
                ),
                updatedAt: touchedAt,
              })
            : c,
        ),
        updatedAt: touchedAt,
      };
    }
    case "MARK_STUDENTS_OFFLINE": {
      const { courseId, studentIds } = action.payload;
      if (studentIds.length === 0) return state;
      const idSet = new Set(studentIds);
      return {
        ...state,
        courses: state.courses.map((c) =>
          c.id === courseId
            ? normalizeCourse({
                ...c,
                students: c.students.map((s) =>
                  idSet.has(s.id) ? { ...s, lastSeenAt: undefined } : s,
                ),
                updatedAt: touchedAt,
              })
            : c,
        ),
        updatedAt: touchedAt,
      };
    }
    case "UPDATE_STUDENT_PROGRESS": {
      const { courseId, studentId, stageKey, value } = action.payload;
      return {
        ...state,
        courses: state.courses.map((c) =>
          c.id === courseId
            ? normalizeCourse({
                ...c,
                students: c.students.map((s) =>
                  s.id === studentId
                    ? { ...s, stageProgress: { ...s.stageProgress, [stageKey]: value } }
                    : s,
                ),
                updatedAt: touchedAt,
              })
            : c,
        ),
        updatedAt: touchedAt,
      };
    }
    case "UPSERT_SUBMISSION": {
      const { courseId, submission } = action.payload;
      return updateCourseRecord(state, courseId, touchedAt, (c) => ({
        submissions: upsertById(c.submissions ?? [], submission),
        activityLog: addActivity(c.activityLog, activity(submission.studentName || "学生", `提交 ${submission.title}`, submission.content.slice(0, 60), touchedAt)),
      }));
    }
    case "ADD_FEEDBACK": {
      const { courseId, feedback } = action.payload;
      return updateCourseRecord(state, courseId, touchedAt, (c) => ({
        feedback: [feedback, ...(c.feedback ?? [])],
        activityLog: addActivity(c.activityLog, activity("教师", "发布反馈", feedback.content.slice(0, 60), touchedAt)),
      }));
    }
    case "UPSERT_RUBRIC_SCORE": {
      const { courseId, score } = action.payload;
      return updateCourseRecord(state, courseId, touchedAt, (c) => ({
        rubricScores: upsertById(c.rubricScores ?? [], score),
        activityLog: addActivity(c.activityLog, activity("教师", "提交评分", `${score.groupId}：${score.total} 分`, touchedAt)),
      }));
    }
    case "UPSERT_REFLECTION": {
      const { courseId, reflection } = action.payload;
      return updateCourseRecord(state, courseId, touchedAt, (c) => ({
        reflections: upsertById(c.reflections ?? [], reflection),
        activityLog: addActivity(c.activityLog, activity(reflection.studentName, "保存反思", reflection.content.slice(0, 60), touchedAt)),
      }));
    }
    case "ADD_ACTIVITY": {
      const { courseId, activity: nextActivity } = action.payload;
      return updateCourseRecord(state, courseId, touchedAt, (c) => ({
        activityLog: addActivity(c.activityLog, nextActivity),
      }));
    }
    case "SET_PRESENTING_GROUP":
      return updateCourse(state, action.payload.courseId, {
        presentingGroupId: action.payload.groupId,
        updatedAt: touchedAt,
      });
    case "UPSERT_ANNOUNCEMENT": {
      const { courseId, announcement } = action.payload;
      return updateCourseRecord(state, courseId, touchedAt, (c) => ({
        announcements: upsertById(c.announcements ?? [], announcement),
        activityLog: addActivity(c.activityLog, activity("教师", "发布课堂公告", announcement.title, touchedAt)),
      }));
    }
    case "DELETE_ANNOUNCEMENT":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        announcements: (c.announcements ?? []).filter((a) => a.id !== action.payload.announcementId),
      }));
    case "ADD_ANNOUNCEMENT_REPLY": {
      const { courseId, announcementId, reply } = action.payload;
      return updateCourseRecord(state, courseId, touchedAt, (c) => ({
        announcements: (c.announcements ?? []).map((a) =>
          a.id === announcementId ? { ...a, replies: [reply, ...a.replies], updatedAt: touchedAt } : a,
        ),
        activityLog: addActivity(c.activityLog, activity(reply.studentName, "回复公告", reply.content.slice(0, 60), touchedAt)),
      }));
    }
    case "UPSERT_TODO":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        todos: upsertById(c.todos ?? [], action.payload.todo),
      }));
    case "MARK_RESOURCE_DOWNLOADED": {
      const { courseId, resourceId, studentId, studentName } = action.payload;
      return updateCourseRecord(state, courseId, touchedAt, (c) => ({
        resources: (c.resources ?? []).map((r) =>
          r.id === resourceId
            ? { ...r, downloadedBy: Array.from(new Set([...(r.downloadedBy ?? []), studentId])) }
            : r,
        ),
        activityLog: addActivity(c.activityLog, activity(studentName, "下载资源", resourceId, touchedAt)),
      }));
    }
    case "UPSERT_GROUP": {
      const { courseId, group } = action.payload;
      return updateCourseRecord(state, courseId, touchedAt, (c) => ({
        groups: upsertById(c.groups ?? [], group),
        activityLog: addActivity(c.activityLog, activity("教师", "更新分组", group.name, touchedAt)),
      }));
    }
    case "JOIN_GROUP": {
      const { courseId, groupId, studentId, studentName, role } = action.payload;
      return updateCourseRecord(state, courseId, touchedAt, (c) => ({
        groups: (c.groups ?? []).map((g) => {
          const members = g.members.filter((m) => m.studentId !== studentId);
          if (g.id !== groupId) return { ...g, members };
          return {
            ...g,
            members: upsertMember(members, { studentId, name: studentName, role }),
            updatedAt: touchedAt,
          };
        }),
        activityLog: addActivity(c.activityLog, activity(studentName, "加入小组", groupId, touchedAt)),
      }));
    }
    case "LEAVE_GROUP":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        groups: (c.groups ?? []).map((g) =>
          g.id === action.payload.groupId
            ? { ...g, members: g.members.filter((m) => m.studentId !== action.payload.studentId), updatedAt: touchedAt }
            : g,
        ),
      }));
    case "SET_GROUP_TOPIC": {
      const { courseId, groupId, patch } = action.payload;
      return updateCourseRecord(state, courseId, touchedAt, (c) => ({
        groups: (c.groups ?? []).map((g) =>
          g.id === groupId ? { ...g, ...patch, updatedAt: touchedAt } : g,
        ),
        activityLog: addActivity(c.activityLog, activity("小组", "更新选题方向", patch.topic ?? patch.goal ?? groupId, touchedAt)),
      }));
    }
    case "UPSERT_GROUP_ANNOUNCEMENT":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        groupAnnouncements: upsertById(c.groupAnnouncements ?? [], action.payload.announcement),
        activityLog: addActivity(c.activityLog, activity(action.payload.announcement.actor, "发布组内公告", action.payload.announcement.title, touchedAt)),
      }));
    case "UPSERT_WORK_PLAN_ITEM":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        workPlan: upsertById(c.workPlan ?? [], action.payload.item),
      }));
    case "DELETE_WORK_PLAN_ITEM":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        workPlan: (c.workPlan ?? []).filter((item) => item.id !== action.payload.itemId),
      }));
    case "UPSERT_WHITEBOARD_NODE":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        whiteboard: upsertById(c.whiteboard ?? [], action.payload.node),
      }));
    case "DELETE_WHITEBOARD_NODE":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        whiteboard: (c.whiteboard ?? []).filter((node) => node.id !== action.payload.nodeId),
      }));
    case "UPSERT_GROUP_BOARD": {
      const { courseId, board } = action.payload;
      return updateCourseRecord(state, courseId, touchedAt, (c) => {
        const existing = c.boards ?? [];
        const next = existing.some((b) => b.groupId === board.groupId)
          ? existing.map((b) => (b.groupId === board.groupId ? board : b))
          : [...existing, board];
        return { boards: next };
      });
    }
    case "UPSERT_UPLOAD":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        uploads: upsertById(c.uploads ?? [], action.payload.upload),
        activityLog: addActivity(c.activityLog, activity(action.payload.upload.studentName || "学生", "上传文件", action.payload.upload.title, touchedAt)),
      }));
    case "DELETE_UPLOAD":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        uploads: (c.uploads ?? []).filter((u) => u.id !== action.payload.uploadId),
        uiState: c.uiState?.previewUploadId === action.payload.uploadId ? { ...c.uiState, previewUploadId: undefined } : c.uiState,
      }));
    case "SET_PREVIEW_UPLOAD":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        uiState: { ...(c.uiState ?? {}), previewUploadId: action.payload.uploadId },
      }));
    case "UPSERT_TEAM_CONTRIBUTION":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        teamContributions: upsertById(c.teamContributions ?? [], action.payload.contribution),
      }));
    case "UPSERT_AI_SUPPORT": {
      const { support } = action.payload;
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        aiSupports: upsertById(c.aiSupports ?? [], support),
        activityLog: addActivity(
          c.activityLog,
          activity(
            support.studentName ?? support.groupId ?? "AI助教",
            `AI支架：${support.trigger}`,
            support.diagnosis.slice(0, 80),
            touchedAt,
          ),
        ),
      }));
    }
    case "ADD_OFFLINE_INTERVENTION":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        offlineInterventions: [action.payload.intervention, ...(c.offlineInterventions ?? [])],
      }));
    case "RESOLVE_INTERVENTION_SIGNALS": {
      const resolvedIds = new Set(action.payload.signalIds);
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        resolvedInterventionSignalIds: [
          ...new Set([...(c.resolvedInterventionSignalIds ?? []), ...action.payload.signalIds]),
        ],
        learningSignals: (c.learningSignals ?? []).map((signal) =>
          resolvedIds.has(signal.id)
            ? { ...signal, status: "resolved", resolvedAt: touchedAt, handledAt: signal.handledAt ?? touchedAt }
            : signal,
        ),
        classCommonIssues: (c.classCommonIssues ?? []).map((issue) =>
          issue.signalIds.length > 0 && issue.signalIds.every((id) => resolvedIds.has(id))
            ? { ...issue, status: "resolved", resolvedAt: touchedAt, lastDetectedAt: touchedAt }
            : issue,
        ),
        teacherInterventions: (c.teacherInterventions ?? []).map((intervention) =>
          intervention.signalId && resolvedIds.has(intervention.signalId)
            ? { ...intervention, status: "resolved", resolvedAt: touchedAt }
            : intervention,
        ),
      }));
    }
    case "UPSERT_TEACHER_AGENT_DIRECTIVE":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        teacherAgentDirectives: upsertById(c.teacherAgentDirectives ?? [], action.payload.directive),
      }));
    case "UPSERT_COMPANION_TASK":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        companionTasks: upsertById(c.companionTasks ?? [], action.payload.task),
      }));
    case "UPSERT_COMPANION_CONFIRMATION":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        companionConfirmations: upsertById(c.companionConfirmations ?? [], action.payload.confirmation),
      }));
    case "RESOLVE_COMPANION_CONFIRMATION":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        companionConfirmations: (c.companionConfirmations ?? []).map((confirmation) =>
          confirmation.id === action.payload.confirmationId
            ? { ...confirmation, status: action.payload.status, resolvedAt: action.payload.resolvedAt }
            : confirmation,
        ),
      }));
    case "ADD_COMPANION_PROCESS_RECORD":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        companionProcessRecords: [action.payload.record, ...(c.companionProcessRecords ?? [])].slice(0, 160),
      }));
    case "SET_UI_STATE":
      return updateCourseRecord(state, action.payload.courseId, touchedAt, (c) => ({
        uiState: { ...(c.uiState ?? {}), ...action.payload.patch },
      }));
    default:
      return state;
  }
}

export function makeRecordId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function updateCourse(
  state: SessionState,
  id: string,
  patch: Partial<Course>,
): SessionState {
  return {
    ...state,
    courses: state.courses.map((c) => (c.id === id ? normalizeCourse({ ...c, ...patch }) : c)),
    updatedAt: new Date().toISOString(),
  };
}

function updateCourseRecord(
  state: SessionState,
  id: string,
  touchedAt: string,
  derivePatch: (course: Course) => Partial<Course>,
): SessionState {
  return {
    ...state,
    courses: state.courses.map((c) =>
      c.id === id
        ? normalizeCourse({
            ...c,
            ...derivePatch(normalizeCourse(c)),
            updatedAt: touchedAt,
          })
        : c,
    ),
    updatedAt: touchedAt,
  };
}

function dedupeStudents(list: Student[]): Student[] {
  // Dedupe by id, and also by name (case-insensitive) as a safety net.
  // When a student with the same name joins again, we keep the existing
  // account and merge the new record into it (preserving stageProgress etc.).
  const map = new Map<string, Student>();
  for (const s of list) {
    const key = s.id;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, s);
    } else {
      // Merge: prefer the newer lastSeenAt and keep existing stageProgress.
      map.set(key, {
        ...existing,
        ...s,
        stageProgress: { ...existing.stageProgress, ...s.stageProgress },
        lastSeenAt: s.lastSeenAt ?? existing.lastSeenAt,
      });
    }
  }
  return Array.from(map.values());
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const exists = list.some((entry) => entry.id === item.id);
  return exists ? list.map((entry) => (entry.id === item.id ? item : entry)) : [item, ...list];
}

function upsertMember<T extends { studentId: string }>(list: T[], item: T): T[] {
  const exists = list.some((entry) => entry.studentId === item.studentId);
  return exists
    ? list.map((entry) => (entry.studentId === item.studentId ? item : entry))
    : [...list, item];
}

function addActivity(
  list: ActivityRecord[] | undefined,
  item: ActivityRecord,
): ActivityRecord[] {
  return [item, ...(list ?? [])].slice(0, 120);
}

function activity(actor: string, action: string, detail: string | undefined, createdAt: string): ActivityRecord {
  return {
    id: makeRecordId("act"),
    actor,
    action,
    detail,
    createdAt,
  };
}

export function normalizeCourse(course: Course): Course {
  const previousStageKey = course.stages?.[course.currentStageIndex]?.key;
  const migratedStageKey = previousStageKey === "group" || previousStageKey === "review"
    ? "proposal"
    : previousStageKey;
  const stages = DEFAULT_STAGES.map((stage) => ({ ...stage }));
  const migratedStageIndex = Math.max(0, stages.findIndex((stage) => stage.key === migratedStageKey));
  const legacyGroups = course.groups ?? [];
  const personalProjects = (course.students ?? []).map((student) => {
    const exactProject = legacyGroups.find((project) => project.id === `grp-${student.id}`)
      ?? legacyGroups.find((project) => project.members.length === 1 && project.members[0]?.studentId === student.id);
    const inheritedProject = exactProject
      ?? legacyGroups.find((project) => project.members.some((member) => member.studentId === student.id));
    const now = course.updatedAt || new Date().toISOString();
    return {
      ...(inheritedProject ?? {
        id: `grp-${student.id}`,
        topic: "待确定选题方向",
        goal: "",
        keywords: [],
        selectedForms: [],
        createdAt: now,
        updatedAt: now,
      }),
      id: exactProject?.id ?? `grp-${student.id}`,
      name: `${student.name}的个人项目`,
      members: [{ studentId: student.id, name: student.name, role: "项目负责人" }],
    };
  });
  const migrateStageKey = (stageKey: string) => stageKey === "group" || stageKey === "review"
    ? "proposal"
    : stageKey === "workspace"
      ? "make"
      : stageKey;
  return {
    ...course,
    pblConfig: normalizePblCourseConfig(course.pblConfig),
    stages,
    currentStageIndex: migratedStageIndex,
    classConfig: course.classConfig
      ? { ...course.classConfig, groupMode: "solo", perGroup: 1, crossClass: false }
      : course.classConfig,
    students: course.students ?? [],
    submissions: course.submissions ?? [],
    feedback: (course.feedback ?? []).map((item) => ({
      sourceRole: "teacher" as const,
      evidence: [],
      status: "open" as const,
      ...item,
    })),
    rubricScores: course.rubricScores ?? [],
    reflections: course.reflections ?? [],
    activityLog: course.activityLog ?? [],
    announcements: course.announcements ?? [],
    todos: course.todos ?? [],
    resources: course.resources ?? [],
    groups: personalProjects,
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
    uiState: {
      ...(course.uiState ?? {}),
      teacherResourceProjection: course.uiState?.teacherResourceProjection ?? null,
      aiChatStagesEnabled: course.uiState?.aiChatStagesEnabled?.length
        ? [...new Set(course.uiState.aiChatStagesEnabled.map(migrateStageKey))]
        : course.uiState?.aiChatStagesEnabled,
    },
    content: {
      ...course.content,
      lessonOutline: (course.content.lessonOutline ?? []).map((section) => ({ ...section, stageKey: migrateStageKey(section.stageKey) })),
      teachingOutline: course.content.teachingOutline?.map((section) => ({
        ...section,
        stageKey: migrateStageKey(section.stageKey),
        // Collapse the removed legacy tag into ordinary classroom activity.
        openMaicUse: section.openMaicUse === "student-ai-learning"
          ? "student-ai-learning"
          : "none",
      })),
      evaluationPlan: {
        ...course.content.evaluationPlan,
        flows: DEFAULT_EVALUATION_FLOWS.map((flow) => ({
          ...flow,
          evidenceRequirements: [...flow.evidenceRequirements],
        })),
      },
    },
  };
}

/** Heartbeat timeout in ms. Students whose lastSeenAt is older than this are
 * considered offline. The frontend sends a heartbeat every 10s, so 30s gives
 * a comfortable margin for occasional network latency without false negatives. */
export const HEARTBEAT_TIMEOUT_MS = 30_000;

/** Returns true if the student is currently considered online (last heartbeat
 * within HEARTBEAT_TIMEOUT_MS). A student with no lastSeenAt is offline. */
export function isStudentOnline(student: { lastSeenAt?: string }, now: number = Date.now()): boolean {
  if (!student.lastSeenAt) return false;
  const ts = new Date(student.lastSeenAt).getTime();
  if (Number.isNaN(ts)) return false;
  return now - ts < HEARTBEAT_TIMEOUT_MS;
}

/** Returns the list of student IDs in a course whose heartbeats have expired
 * and should be marked offline by a MARK_STUDENTS_OFFLINE action. */
export function getStaleStudentIds(course: Course, now: number = Date.now()): string[] {
  return course.students
    .filter((s) => s.lastSeenAt && !isStudentOnline(s, now))
    .map((s) => s.id);
}
