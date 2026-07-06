"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type { ReactNode } from "react";
import {
  applySessionAction,
  initialSessionState,
  makeRecordId,
} from "./actions";
import type { SessionAction, SessionState } from "./actions";
import type {
  ActivityRecord,
  AiSupportRecord,
  AnnouncementReply,
  ClassConfig,
  ClassroomSubmission,
  Course,
  CourseAnnouncement,
  CourseContent,
  CourseTodo,
  CourseUiState,
  CourseUpload,
  GroupAnnouncement,
  GroupBoard,
  GroupBoardMode,
  ProjectGroup,
  ReflectionRecord,
  RubricScore,
  Stage,
  Student,
  TeacherFeedback,
  TeamContribution,
  WhiteboardNode,
  WorkPlanItem,
} from "./types";
import { DEFAULT_STAGES } from "./types";
import { loadJSON, saveJSON } from "./storage";
import { generateInviteCode, normalizeInviteCode } from "./invite-code";
import { makeSeedCourses } from "./seed";

const IDENTITY_KEY = "openpbl.identity.v1";
// Separate identity keys per role to prevent teacher/student identity cross-contamination
// when both are open in the same browser.
const TEACHER_IDENTITY_KEY = "openpbl.identity.teacher.v1";
const STUDENT_IDENTITY_KEY = "openpbl.identity.student.v1";
const LEFT_CLASS_HISTORY_KEY = "openpbl.left-class-history.v1";

type LeftClassRecord = {
  courseId: string;
  courseName: string;
  studentId: string;
  studentName: string;
  leftAt: string;
};

type IdentityState = Pick<
  SessionState,
  "user" | "joinedCourseId" | "studentId" | "studentName"
> & {
  // Cached join timestamp so we can fully reconstruct the Student record
  // when the polling refresh races ahead of the server's JOIN_CLASS ack.
  joinedAt?: string;
  // Cached group membership so applyIdentity can restore the student's
  // group slot when polling returns server state that hasn't yet processed
  // the JOIN_GROUP action.
  joinedGroupId?: string;
  joinedGroupRole?: string;
};

type SessionApi = SessionState & {
  setUser: (u: SessionState["user"]) => void;
  createCourse: (input: Partial<Course>) => Course;
  updateCourse: (id: string, patch: Partial<Course>) => void;
  deleteCourse: (id: string) => void;
  setCourseContent: (id: string, content: CourseContent) => void;
  setCourseStages: (id: string, stages: Stage[]) => void;
  publishCourse: (id: string) => void;
  startTeaching: (id: string, classConfig: ClassConfig) => string;
  endTeaching: (id: string) => void;
  advanceStage: (id: string, direction: 1 | -1) => void;
  setStage: (id: string, index: number) => void;
  joinClass: (code: string, name: string) => { ok: true; course: Course } | { ok: false; reason: string };
  rejoinClass: (record: LeftClassRecord) => { ok: true; course: Course } | { ok: false; reason: string };
  leaveClass: () => void;
  getLeftClassHistory: () => LeftClassRecord[];
  updateStudentProgress: (stageKey: string, value: number) => void;
  upsertSubmission: (submission: Omit<ClassroomSubmission, "id" | "courseId" | "createdAt" | "updatedAt"> & { id?: string; courseId?: string }) => ClassroomSubmission | undefined;
  addFeedback: (feedback: Omit<TeacherFeedback, "id" | "courseId" | "createdAt"> & { id?: string; courseId?: string }) => TeacherFeedback | undefined;
  upsertRubricScore: (score: Omit<RubricScore, "id" | "courseId" | "createdAt" | "updatedAt"> & { id?: string; courseId?: string }) => RubricScore | undefined;
  upsertReflection: (reflection: Omit<ReflectionRecord, "id" | "courseId" | "studentId" | "studentName" | "createdAt" | "updatedAt"> & { id?: string; courseId?: string; studentId?: string; studentName?: string }) => ReflectionRecord | undefined;
  upsertAnnouncement: (courseId: string, input: Omit<CourseAnnouncement, "id" | "createdAt" | "updatedAt" | "replies"> & { id?: string; replies?: AnnouncementReply[] }) => CourseAnnouncement;
  deleteAnnouncement: (courseId: string, announcementId: string) => void;
  replyAnnouncement: (courseId: string, announcementId: string, content: string) => AnnouncementReply | undefined;
  upsertTodo: (courseId: string, todo: CourseTodo) => void;
  completeTodo: (courseId: string, todoId: string, completed: boolean) => void;
  markResourceDownloaded: (courseId: string, resourceId: string) => void;
  upsertGroup: (courseId: string, group: ProjectGroup) => void;
  createGroup: (courseId: string, name?: string) => ProjectGroup;
  joinGroup: (courseId: string, groupId: string, role?: string) => void;
  leaveGroup: (courseId: string, groupId: string) => void;
  setGroupTopic: (courseId: string, groupId: string, patch: Partial<ProjectGroup>) => void;
  upsertGroupAnnouncement: (courseId: string, input: Omit<GroupAnnouncement, "id" | "actor" | "createdAt"> & { id?: string; actor?: string }) => GroupAnnouncement;
  upsertWorkPlanItem: (courseId: string, item: Omit<WorkPlanItem, "id"> & { id?: string }) => WorkPlanItem;
  deleteWorkPlanItem: (courseId: string, itemId: string) => void;
  upsertWhiteboardNode: (courseId: string, node: Omit<WhiteboardNode, "id"> & { id?: string }) => WhiteboardNode;
  deleteWhiteboardNode: (courseId: string, nodeId: string) => void;
  upsertGroupBoard: (courseId: string, board: { groupId: string; snapshot: unknown; mode?: GroupBoardMode; updatedAt?: string }) => void;
  upsertUpload: (upload: Omit<CourseUpload, "createdAt">) => CourseUpload;
  deleteUpload: (courseId: string, uploadId: string) => void;
  setPreviewUpload: (courseId: string, uploadId?: string) => void;
  upsertTeamContribution: (contribution: Omit<TeamContribution, "id" | "courseId" | "updatedAt"> & { id?: string; courseId?: string }) => TeamContribution | undefined;
  upsertAiSupport: (support: Omit<AiSupportRecord, "id" | "courseId" | "createdAt" | "updatedAt"> & { id?: string; courseId?: string }) => AiSupportRecord | undefined;
  setUiState: (courseId: string, patch: Partial<CourseUiState>) => void;
  addActivity: (courseId: string, action: string, detail?: string, actor?: string) => void;
  setPresentingGroup: (courseId: string, groupId: string) => void;
  getCourse: (id: string) => Course | undefined;
  findCourseByCode: (code: string) => Course | undefined;
  generateNewInviteCode: (id: string) => string;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionApi | null>(null);

function reducer(state: SessionState, action: SessionAction): SessionState {
  return applySessionAction(state, action);
}

function makeCourseId(): string {
  return "course-" + Math.random().toString(36).slice(2, 10);
}

function makeStudentId(): string {
  return "s-" + Math.random().toString(36).slice(2, 8);
}

function makeLocalFallback(): SessionState {
  return {
    ...initialSessionState(),
    courses: makeSeedCourses(),
    hydrated: true,
    updatedAt: new Date().toISOString(),
  };
}

async function fetchSession(): Promise<SessionState> {
  const res = await fetch("/api/session", { cache: "no-store" });
  if (!res.ok) throw new Error("SESSION_FETCH_FAILED");
  const state = (await res.json()) as SessionState;
  return { ...state, hydrated: true };
}

async function postSessionAction(action: SessionAction): Promise<SessionState> {
  const res = await fetch("/api/session/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  if (!res.ok) throw new Error("SESSION_ACTION_FAILED");
  const state = (await res.json()) as SessionState;
  return { ...state, hydrated: true };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialSessionState);
  const stateRef = useRef(state);
  const pollingRef = useRef(true);
  // Tracks the number of in-flight commit POSTs. Only the LAST response
  // (when pending drops to 0) triggers a HYDRATE; intermediate responses
  // are ignored so they can't overwrite newer local optimistic state.
  const pendingCommitsRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  function applyIdentity(next: SessionState): SessionState {
    // Try role-specific identity keys first, then fall back to the legacy
    // shared key. This prevents cross-contamination when teacher and student
    // tabs are open in the same browser.
    const identity =
      loadJSON<IdentityState | null>(STUDENT_IDENTITY_KEY, null) ??
      loadJSON<IdentityState | null>(IDENTITY_KEY, null);
    if (!identity) return next;
    let result: SessionState = {
      ...next,
      user: identity.user ?? next.user,
      joinedCourseId: identity.joinedCourseId,
      studentId: identity.studentId,
      studentName: identity.studentName,
    };
    // Ensure the local student is registered in the joined course's student list.
    // Polling refresh may HYDRATE with server state that hasn't yet processed
    // our JOIN_CLASS action, causing the student to transiently disappear from
    // course.students. We restore them here so teacher & peer views always show
    // the joined student (and online counts stay accurate).
    if (identity.joinedCourseId && identity.studentId && identity.studentName) {
      const restoredStudent: Student = {
        id: identity.studentId,
        name: identity.studentName,
        joinedAt: identity.joinedAt ?? new Date().toISOString(),
        stageProgress: {},
      };
      result = {
        ...result,
        courses: result.courses.map((c) => {
          if (c.id !== identity.joinedCourseId) return c;
          let course = c;
          // Restore student in students list if missing
          if (!course.students.some((s) => s.id === restoredStudent.id)) {
            course = { ...course, students: [...course.students, restoredStudent] };
          }
          // Restore student in group members if missing (same race condition
          // as above: JOIN_GROUP may not have been processed by the server yet).
          if (identity.joinedGroupId && course.groups) {
            const group = course.groups.find((g) => g.id === identity.joinedGroupId);
            if (group && !group.members.some((m) => m.studentId === identity.studentId)) {
              course = {
                ...course,
                groups: course.groups.map((g) =>
                  g.id === identity.joinedGroupId
                    ? {
                        ...g,
                        members: [
                          ...g.members,
                          {
                            studentId: identity.studentId!,
                            name: identity.studentName!,
                            role: identity.joinedGroupRole ?? "成员",
                          },
                        ],
                      }
                    : g,
                ),
              };
            }
          }
          return course;
        }),
      };
    }
    return result;
  }

  async function refresh() {
    // Skip polling refresh while commits are in-flight — the server file
    // may not yet reflect those actions (they're queued), and HYDRATEing
    // would overwrite local optimistic state, causing the same
    // "course disappears" symptom as the commit race condition.
    if (pendingCommitsRef.current > 0) return;
    try {
      const next = applyIdentity(await fetchSession());
      dispatch({ type: "HYDRATE", payload: next });
    } catch {
      if (!stateRef.current.hydrated) {
        dispatch({ type: "HYDRATE", payload: makeLocalFallback() });
      }
    }
  }

  function commit(action: SessionAction, options?: { localOnly?: boolean }) {
    dispatch(action);
    if (options?.localOnly) return;
    pendingCommitsRef.current++;
    void postSessionAction(action)
      .then((next) => {
        pendingCommitsRef.current--;
        // Only HYDRATE from the last pending commit's response.
        // Intermediate responses (e.g. from the 1st of 3 rapid commits)
        // lack the later actions' changes and would overwrite local
        // optimistic state, causing courses to "disappear" or status to
        // revert. The server-side serialization queue ensures this last
        // response contains ALL accumulated changes.
        if (pendingCommitsRef.current === 0) {
          dispatch({ type: "HYDRATE", payload: applyIdentity(next) });
        }
      })
      .catch(() => {
        pendingCommitsRef.current--;
        // Optimistic state keeps the classroom demo usable while the dev server restarts.
      });
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      if (pollingRef.current) void refresh();
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    // Persist identity per-browser so refreshes keep the joined student context.
    // We also cache joinedAt (looked up from the joined course's students list)
    // and group membership so applyIdentity can fully reconstruct the Student
    // record when polling refresh races ahead of the server's action processing.
    let joinedAt: string | undefined;
    let joinedGroupId: string | undefined;
    let joinedGroupRole: string | undefined;
    if (state.joinedCourseId && state.studentId) {
      const joinedCourse = state.courses.find((c) => c.id === state.joinedCourseId);
      joinedAt = joinedCourse?.students.find((s) => s.id === state.studentId)?.joinedAt;
      // Find which group the student belongs to
      const studentGroup = joinedCourse?.groups?.find((g) =>
        g.members.some((m) => m.studentId === state.studentId),
      );
      if (studentGroup) {
        joinedGroupId = studentGroup.id;
        joinedGroupRole = studentGroup.members.find((m) => m.studentId === state.studentId)?.role;
      }
    }
    const identity: IdentityState = {
      user: state.user,
      joinedCourseId: state.joinedCourseId,
      studentId: state.studentId,
      studentName: state.studentName,
      joinedAt,
      joinedGroupId,
      joinedGroupRole,
    };
    // Save to role-specific key to prevent teacher/student cross-contamination
    const identityKey = state.user.role === "teacher" ? TEACHER_IDENTITY_KEY : STUDENT_IDENTITY_KEY;
    saveJSON(identityKey, identity);
    // Also save to legacy key for backwards compat
    saveJSON(IDENTITY_KEY, identity);
  }, [state.user, state.joinedCourseId, state.studentId, state.studentName, state.courses]);

  const api: SessionApi = useMemo(() => {
    return {
      ...state,
      setUser(u) {
        commit({ type: "SET_USER", payload: u }, { localOnly: true });
      },
      createCourse(input) {
        const id = makeCourseId();
        const now = new Date().toISOString();
        const course: Course = {
          ...input,
          id,
          name: input.name ?? "未命名课程",
          subject: input.subject ?? "",
          grade: input.grade ?? "",
          hours: input.hours ?? 8,
          summary: input.summary ?? "",
          drivingQuestion: input.drivingQuestion ?? "",
          status: "draft",
          stages: input.stages ?? DEFAULT_STAGES,
          currentStageIndex: 0,
          content: input.content ?? {
            pblOutline: "",
            knowledgePoints: [],
            lessonOutline: [],
            evaluationPlan: { dimensions: [], overallRubric: "" },
          },
          classConfig: undefined,
          inviteCode: undefined,
          students: [],
          submissions: [],
          feedback: [],
          rubricScores: [],
          reflections: [],
          activityLog: [],
          announcements: [],
          todos: defaultTodos(),
          resources: defaultResources(),
          groups: [],
          groupAnnouncements: [],
          workPlan: [],
          whiteboard: [],
          boards: [],
          uploads: [],
          teamContributions: [],
          aiSupports: [],
          uiState: {},
          createdAt: now,
          updatedAt: now,
        };
        commit({ type: "CREATE_COURSE", payload: course });
        return course;
      },
      updateCourse(id, patch) {
        commit({ type: "UPDATE_COURSE", payload: { id, patch } });
      },
      deleteCourse(id) {
        commit({ type: "DELETE_COURSE", payload: { id } });
      },
      setCourseContent(id, content) {
        commit({ type: "SET_COURSE_CONTENT", payload: { id, content } });
      },
      setCourseStages(id, stages) {
        commit({ type: "SET_COURSE_STAGES", payload: { id, stages } });
      },
      publishCourse(id) {
        commit({ type: "PUBLISH_COURSE", payload: { id } });
      },
      startTeaching(id, classConfig) {
        const code = generateInviteCode(6);
        commit({
          type: "START_TEACHING",
          payload: { id, classConfig, inviteCode: code },
        });
        return code;
      },
      endTeaching(id) {
        commit({ type: "END_TEACHING", payload: { id } });
      },
      advanceStage(id, direction) {
        commit({ type: "ADVANCE_STAGE", payload: { id, direction } });
      },
      setStage(id, index) {
        commit({ type: "SET_STAGE", payload: { id, index } });
      },
      joinClass(code, name) {
        const target = state.courses.find(
          (c) =>
            c.inviteCode &&
            c.inviteCode.toUpperCase() === normalizeInviteCode(code) &&
            c.status === "teaching",
        );
        if (!target) {
          return { ok: false, reason: "邀请码无效，或教师尚未开始授课" };
        }
        const trimmedName = name?.trim() || "学生";

        // ===== Same-name account merge =====
        // If a student with the same name already exists in this course,
        // reuse the existing account instead of creating a new one. This
        // ensures each student name appears only once in the teacher's
        // roster, and preserves all of the student's prior learning data
        // (stageProgress, submissions, group membership, etc.).
        const existing = target.students.find(
          (s) => s.name.toLowerCase() === trimmedName.toLowerCase(),
        );
        const student: Student = existing
          ? { ...existing, name: trimmedName, lastSeenAt: new Date().toISOString() }
          : {
              id: makeStudentId(),
              name: trimmedName,
              joinedAt: new Date().toISOString(),
              stageProgress: {},
              lastSeenAt: new Date().toISOString(),
            };

        // Update the user object so the top-right avatar shows the student's
        // name and role, not the default "张老师".
        const studentUser = { role: "student" as const, name: student.name };
        // Pre-seed the identity cache so the next polling refresh cannot
        // drop the just-joined student from course.students before the
        // server's JOIN_CLASS ack lands.
        const identity: IdentityState = {
          user: studentUser,
          joinedCourseId: target.id,
          studentId: student.id,
          studentName: student.name,
          joinedAt: student.joinedAt,
        };
        saveJSON(STUDENT_IDENTITY_KEY, identity);
        saveJSON(IDENTITY_KEY, identity);
        commit({ type: "SET_USER", payload: studentUser });
        commit({ type: "JOIN_CLASS", payload: { courseId: target.id, student } });
        if (existing) {
          console.log(
            `[session] merged same-name student "${trimmedName}" into existing account ${existing.id}`,
          );
        }
        return { ok: true, course: target };
      },
      leaveClass() {
        if (state.joinedCourseId && state.studentId) {
          // Save left-class history so the student can rejoin by name later.
          const leftCourse = state.courses.find((c) => c.id === state.joinedCourseId);
          if (leftCourse) {
            const history = loadJSON<LeftClassRecord[]>(LEFT_CLASS_HISTORY_KEY, []);
            const record: LeftClassRecord = {
              courseId: leftCourse.id,
              courseName: leftCourse.name,
              studentId: state.studentId!,
              studentName: state.studentName ?? state.user.name,
              leftAt: new Date().toISOString(),
            };
            // Keep only the latest record per course
            const filtered = history.filter((r) => r.courseId !== record.courseId);
            filtered.push(record);
            saveJSON(LEFT_CLASS_HISTORY_KEY, filtered);
          }
          commit({
            type: "LEAVE_CLASS",
            payload: {
              courseId: state.joinedCourseId,
              studentId: state.studentId,
            },
          });
          // Reset user to a generic student so the avatar no longer shows
          // the previous student name after leaving.
          commit({ type: "SET_USER", payload: { role: "student", name: "" } });
        }
      },
      rejoinClass(record: LeftClassRecord) {
        const target = state.courses.find((c) => c.id === record.courseId);
        if (!target || target.status !== "teaching") {
          // Remove stale history entry
          const history = loadJSON<LeftClassRecord[]>(LEFT_CLASS_HISTORY_KEY, []);
          saveJSON(LEFT_CLASS_HISTORY_KEY, history.filter((r) => r.courseId !== record.courseId));
          return { ok: false as const, reason: "课堂已结束或不存在，无法重新加入" };
        }
        // Check if student is still in the course's student list
        const existingStudent = target.students.find((s) => s.id === record.studentId);
        if (existingStudent) {
          // Student record still exists (teacher may not have removed them) — just restore identity
          const studentUser = { role: "student" as const, name: record.studentName };
          const identity: IdentityState = {
            user: studentUser,
            joinedCourseId: target.id,
            studentId: record.studentId,
            studentName: record.studentName,
            joinedAt: existingStudent.joinedAt,
          };
          saveJSON(STUDENT_IDENTITY_KEY, identity);
          saveJSON(IDENTITY_KEY, identity);
          commit({ type: "SET_USER", payload: studentUser });
          commit({ type: "JOIN_CLASS", payload: { courseId: target.id, student: existingStudent } });
        } else {
          // Student was removed from the course — re-add them
          const student: Student = {
            id: record.studentId,
            name: record.studentName,
            joinedAt: new Date().toISOString(),
            stageProgress: {},
          };
          const studentUser = { role: "student" as const, name: record.studentName };
          const identity: IdentityState = {
            user: studentUser,
            joinedCourseId: target.id,
            studentId: student.id,
            studentName: student.name,
            joinedAt: student.joinedAt,
          };
          saveJSON(STUDENT_IDENTITY_KEY, identity);
          saveJSON(IDENTITY_KEY, identity);
          commit({ type: "SET_USER", payload: studentUser });
          commit({ type: "JOIN_CLASS", payload: { courseId: target.id, student } });
        }
        // Remove the history entry after successful rejoin
        const history = loadJSON<LeftClassRecord[]>(LEFT_CLASS_HISTORY_KEY, []);
        saveJSON(LEFT_CLASS_HISTORY_KEY, history.filter((r) => r.courseId !== record.courseId));
        return { ok: true as const, course: target };
      },
      getLeftClassHistory() {
        const history = loadJSON<LeftClassRecord[]>(LEFT_CLASS_HISTORY_KEY, []);
        // Filter out entries for courses that are no longer teaching
        return history.filter((r) => {
          const course = state.courses.find((c) => c.id === r.courseId);
          return course?.status === "teaching";
        });
      },
      updateStudentProgress(stageKey, value) {
        if (!state.joinedCourseId || !state.studentId) return;
        commit({
          type: "UPDATE_STUDENT_PROGRESS",
          payload: {
            courseId: state.joinedCourseId,
            studentId: state.studentId,
            stageKey,
            value,
          },
        });
      },
      upsertSubmission(input) {
        const courseId = input.courseId ?? state.joinedCourseId;
        if (!courseId) return undefined;
        const now = new Date().toISOString();
        const submission: ClassroomSubmission = {
          id: input.id ?? makeRecordId("sub"),
          courseId,
          studentId: input.studentId ?? state.studentId,
          studentName: input.studentName ?? state.studentName ?? state.user.name,
          groupId: input.groupId,
          stageKey: input.stageKey,
          type: input.type,
          title: input.title,
          content: input.content,
          files: input.files,
          createdAt: now,
          updatedAt: now,
        };
        commit({ type: "UPSERT_SUBMISSION", payload: { courseId, submission } });
        return submission;
      },
      addFeedback(input) {
        const courseId = input.courseId;
        if (!courseId) return undefined;
        const feedback: TeacherFeedback = {
          id: input.id ?? makeRecordId("fb"),
          courseId,
          targetType: input.targetType,
          targetId: input.targetId,
          stageKey: input.stageKey,
          kind: input.kind,
          content: input.content,
          createdAt: new Date().toISOString(),
        };
        commit({ type: "ADD_FEEDBACK", payload: { courseId, feedback } });
        return feedback;
      },
      upsertRubricScore(input) {
        const courseId = input.courseId;
        if (!courseId) return undefined;
        const now = new Date().toISOString();
        const score: RubricScore = {
          id: input.id ?? makeRecordId("score"),
          courseId,
          groupId: input.groupId,
          stageKey: input.stageKey,
          dimensionScores: input.dimensionScores,
          comment: input.comment,
          total: input.total,
          status: input.status,
          createdAt: now,
          updatedAt: now,
        };
        commit({ type: "UPSERT_RUBRIC_SCORE", payload: { courseId, score } });
        return score;
      },
      upsertReflection(input) {
        const courseId = input.courseId ?? state.joinedCourseId;
        const studentId = input.studentId ?? state.studentId;
        if (!courseId || !studentId) return undefined;
        const now = new Date().toISOString();
        const reflection: ReflectionRecord = {
          id: input.id ?? makeRecordId("ref"),
          courseId,
          studentId,
          studentName: input.studentName ?? state.studentName ?? state.user.name,
          content: input.content,
          improvementPlan: input.improvementPlan,
          createdAt: now,
          updatedAt: now,
        };
        commit({ type: "UPSERT_REFLECTION", payload: { courseId, reflection } });
        return reflection;
      },
      upsertAnnouncement(courseId, input) {
        const now = new Date().toISOString();
        const announcement: CourseAnnouncement = {
          id: input.id ?? makeRecordId("ann"),
          title: input.title,
          content: input.content,
          pinned: input.pinned,
          replies: input.replies ?? [],
          createdAt: now,
          updatedAt: now,
        };
        commit({ type: "UPSERT_ANNOUNCEMENT", payload: { courseId, announcement } });
        return announcement;
      },
      deleteAnnouncement(courseId, announcementId) {
        commit({ type: "DELETE_ANNOUNCEMENT", payload: { courseId, announcementId } });
      },
      replyAnnouncement(courseId, announcementId, content) {
        if (!content.trim()) return undefined;
        const reply: AnnouncementReply = {
          id: makeRecordId("reply"),
          studentId: state.studentId,
          studentName: state.studentName ?? state.user.name,
          content: content.trim(),
          createdAt: new Date().toISOString(),
        };
        commit({ type: "ADD_ANNOUNCEMENT_REPLY", payload: { courseId, announcementId, reply } });
        return reply;
      },
      upsertTodo(courseId, todo) {
        commit({ type: "UPSERT_TODO", payload: { courseId, todo } });
      },
      completeTodo(courseId, todoId, completed) {
        const course = state.courses.find((c) => c.id === courseId);
        const todo = course?.todos?.find((item) => item.id === todoId);
        if (!todo || !state.studentId) return;
        const completedBy = completed
          ? Array.from(new Set([...todo.completedBy, state.studentId]))
          : todo.completedBy.filter((id) => id !== state.studentId);
        commit({ type: "UPSERT_TODO", payload: { courseId, todo: { ...todo, completedBy } } });
      },
      markResourceDownloaded(courseId, resourceId) {
        if (!state.studentId) return;
        commit({
          type: "MARK_RESOURCE_DOWNLOADED",
          payload: {
            courseId,
            resourceId,
            studentId: state.studentId,
            studentName: state.studentName ?? state.user.name,
          },
        });
      },
      upsertGroup(courseId, group) {
        commit({ type: "UPSERT_GROUP", payload: { courseId, group } });
      },
      createGroup(courseId, name) {
        const now = new Date().toISOString();
        const course = state.courses.find((c) => c.id === courseId);
        const group: ProjectGroup = {
          id: makeRecordId("group"),
          name: name || `第 ${(course?.groups?.length ?? 0) + 1} 组`,
          topic: course?.drivingQuestion || "待确定选题方向",
          goal: "明确问题、形成可落地方案，并准备阶段性汇报。",
          keywords: ["低碳生活", "校园场景", "数据驱动"],
          selectedForms: ["方案报告"],
          members: [],
          createdAt: now,
          updatedAt: now,
        };
        commit({ type: "UPSERT_GROUP", payload: { courseId, group } });
        return group;
      },
      joinGroup(courseId, groupId, role) {
        if (!state.studentId) return;
        commit({
          type: "JOIN_GROUP",
          payload: {
            courseId,
            groupId,
            studentId: state.studentId,
            studentName: state.studentName ?? state.user.name,
            role,
          },
        });
      },
      leaveGroup(courseId, groupId) {
        if (!state.studentId) return;
        commit({ type: "LEAVE_GROUP", payload: { courseId, groupId, studentId: state.studentId } });
      },
      setGroupTopic(courseId, groupId, patch) {
        commit({ type: "SET_GROUP_TOPIC", payload: { courseId, groupId, patch } });
      },
      upsertGroupAnnouncement(courseId, input) {
        const announcement: GroupAnnouncement = {
          id: input.id ?? makeRecordId("gann"),
          groupId: input.groupId,
          title: input.title,
          content: input.content,
          actor: input.actor ?? state.studentName ?? state.user.name,
          createdAt: new Date().toISOString(),
        };
        commit({ type: "UPSERT_GROUP_ANNOUNCEMENT", payload: { courseId, announcement } });
        return announcement;
      },
      upsertWorkPlanItem(courseId, input) {
        const item: WorkPlanItem = {
          id: input.id ?? makeRecordId("task"),
          groupId: input.groupId,
          role: input.role,
          memberName: input.memberName,
          task: input.task,
          progress: input.progress,
        };
        commit({ type: "UPSERT_WORK_PLAN_ITEM", payload: { courseId, item } });
        return item;
      },
      deleteWorkPlanItem(courseId, itemId) {
        commit({ type: "DELETE_WORK_PLAN_ITEM", payload: { courseId, itemId } });
      },
      upsertWhiteboardNode(courseId, input) {
        const node: WhiteboardNode = {
          id: input.id ?? makeRecordId("node"),
          groupId: input.groupId,
          label: input.label,
          note: input.note,
          x: input.x,
          y: input.y,
          color: input.color,
          parentId: input.parentId,
        };
        commit({ type: "UPSERT_WHITEBOARD_NODE", payload: { courseId, node } });
        return node;
      },
      deleteWhiteboardNode(courseId, nodeId) {
        commit({ type: "DELETE_WHITEBOARD_NODE", payload: { courseId, nodeId } });
      },
      upsertGroupBoard(courseId, input) {
        const existing = state.courses.find((c) => c.id === courseId)?.boards?.find((b) => b.groupId === input.groupId);
        const board: GroupBoard = {
          groupId: input.groupId,
          snapshot: input.snapshot,
          mode: input.mode ?? existing?.mode ?? "mindmap",
          updatedAt: input.updatedAt ?? new Date().toISOString(),
        };
        commit({ type: "UPSERT_GROUP_BOARD", payload: { courseId, board } });
      },
      upsertUpload(input) {
        const upload: CourseUpload = {
          ...input,
          createdAt: new Date().toISOString(),
        };
        commit({ type: "UPSERT_UPLOAD", payload: { courseId: upload.courseId, upload } });
        return upload;
      },
      deleteUpload(courseId, uploadId) {
        commit({ type: "DELETE_UPLOAD", payload: { courseId, uploadId } });
      },
      setPreviewUpload(courseId, uploadId) {
        commit({ type: "SET_PREVIEW_UPLOAD", payload: { courseId, uploadId } });
      },
      upsertTeamContribution(input) {
        const courseId = input.courseId ?? state.joinedCourseId;
        if (!courseId) return undefined;
        const contribution: TeamContribution = {
          id: input.id ?? makeRecordId("contrib"),
          courseId,
          groupId: input.groupId,
          studentId: input.studentId ?? state.studentId,
          studentName: input.studentName,
          percent: input.percent,
          note: input.note,
          updatedAt: new Date().toISOString(),
        };
        commit({ type: "UPSERT_TEAM_CONTRIBUTION", payload: { courseId, contribution } });
        return contribution;
      },
      upsertAiSupport(input) {
        const courseId = input.courseId ?? state.joinedCourseId;
        if (!courseId) return undefined;
        const existing = state.courses.find((c) => c.id === courseId)?.aiSupports?.find((item) => item.id === input.id);
        const now = new Date().toISOString();
        const support: AiSupportRecord = {
          id: input.id ?? makeRecordId("ais"),
          courseId,
          stageKey: input.stageKey,
          targetType: input.targetType,
          targetId: input.targetId,
          groupId: input.groupId,
          studentId: input.studentId ?? state.studentId,
          studentName: input.studentName ?? state.studentName ?? state.user.name,
          kind: input.kind,
          trigger: input.trigger,
          inputSummary: input.inputSummary,
          diagnosis: input.diagnosis,
          suggestions: input.suggestions,
          evidence: input.evidence,
          status: input.status,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        commit({ type: "UPSERT_AI_SUPPORT", payload: { courseId, support } });
        return support;
      },
      setUiState(courseId, patch) {
        commit({ type: "SET_UI_STATE", payload: { courseId, patch } });
      },
      addActivity(courseId, action, detail, actor = state.user.name) {
        const activity: ActivityRecord = {
          id: makeRecordId("act"),
          actor,
          action,
          detail,
          createdAt: new Date().toISOString(),
        };
        commit({ type: "ADD_ACTIVITY", payload: { courseId, activity } });
      },
      setPresentingGroup(courseId, groupId) {
        commit({ type: "SET_PRESENTING_GROUP", payload: { courseId, groupId } });
      },
      getCourse(id) {
        return state.courses.find((c) => c.id === id);
      },
      findCourseByCode(code) {
        return state.courses.find(
          (c) => c.inviteCode && c.inviteCode.toUpperCase() === normalizeInviteCode(code),
        );
      },
      generateNewInviteCode(id) {
        const code = generateInviteCode(6);
        commit({
          type: "UPDATE_COURSE",
          payload: { id, patch: { inviteCode: code } },
        });
        return code;
      },
      refresh,
    };
  }, [state]);

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}

export function useCourse(id: string | undefined): Course | undefined {
  const { courses } = useSession();
  if (!id) return undefined;
  return courses.find((c) => c.id === id);
}

export function useSessionSnapshot() {
  const { courses, user, hydrated, joinedCourseId, studentName } = useSession();
  return { courses, user, hydrated, joinedCourseId, studentName };
}

export function useHydrated(): boolean {
  return useSession().hydrated;
}

function defaultTodos(): CourseTodo[] {
  return [
    {
      id: "todo-read-brief",
      title: "阅读项目说明",
      description: "了解项目背景、目标与成果要求。",
      stageKey: "launch",
      completedBy: [],
    },
    {
      id: "todo-join-group",
      title: "加入小组",
      description: "选择或创建小组，开启协作。",
      stageKey: "launch",
      completedBy: [],
    },
    {
      id: "todo-pick-direction",
      title: "选择兴趣方向",
      description: "确定你希望研究的校园问题切入点。",
      stageKey: "group",
      completedBy: [],
    },
  ];
}

function defaultResources() {
  return [
    {
      id: "res-brief",
      title: "项目说明书_校园低碳生活解决方案.pdf",
      type: "PDF",
      size: "1.2 MB",
      description: "项目背景、任务说明与成果要求",
      url: "/api/uploads?file=demo-project-brief.txt",
      downloadedBy: [],
    },
    {
      id: "res-data",
      title: "校园低碳生活现状调研数据.xlsx",
      type: "XLSX",
      size: "58 KB",
      description: "示例调研数据与统计模板",
      url: "/api/uploads?file=demo-campus-data.txt",
      downloadedBy: [],
    },
    {
      id: "res-rubric",
      title: "评价量规与汇报标准.pdf",
      type: "PDF",
      size: "890 KB",
      description: "评分维度、权重与汇报建议",
      url: "/api/uploads?file=demo-rubric.txt",
      downloadedBy: [],
    },
  ];
}
