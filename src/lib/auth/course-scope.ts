import type { AuthClaims } from "@/lib/auth/session";
import type { Course } from "@/lib/session/types";

export function scopeCourseForClaims(course: Course, claims: AuthClaims): Course {
  if (claims.role === "teacher") return course;
  const studentId = claims.studentId;
  const groupIds = new Set(
    (course.groups ?? [])
      .filter((group) => group.members.some((member) => member.studentId === studentId))
      .map((group) => group.id),
  );
  const inScope = (student: string | undefined, group: string | undefined) =>
    student === studentId || (!!group && groupIds.has(group));

  return {
    ...course,
    students: course.students
      .filter((student) => student.id === studentId)
      .map((student) => ({ ...student })),
    submissions: (course.submissions ?? []).filter((item) =>
      inScope(item.studentId, item.groupId),
    ),
    feedback: (course.feedback ?? []).filter((item) =>
      item.targetType === "course" ||
      item.targetId === studentId ||
      groupIds.has(item.targetId),
    ),
    rubricScores: (course.rubricScores ?? []).filter((item) =>
      item.groupId ? groupIds.has(item.groupId) : false,
    ),
    reflections: (course.reflections ?? []).filter((item) => item.studentId === studentId),
    activityLog: [],
    groupAnnouncements: (course.groupAnnouncements ?? []).filter((item) =>
      groupIds.has(item.groupId),
    ),
    workPlan: (course.workPlan ?? []).filter((item) => groupIds.has(item.groupId)),
    whiteboard: (course.whiteboard ?? []).filter((item) => groupIds.has(item.groupId)),
    boards: (course.boards ?? []).filter((item) => groupIds.has(item.groupId)),
    uploads: (course.uploads ?? []).filter((item) => inScope(item.studentId, item.groupId)),
    teamContributions: (course.teamContributions ?? []).filter((item) =>
      groupIds.has(item.groupId),
    ),
    aiSupports: (course.aiSupports ?? []).filter((item) =>
      inScope(item.studentId, item.groupId),
    ),
    teacherInterventions: (course.teacherInterventions ?? []).filter((item) =>
      item.scope === "course" ||
      item.targetIds.includes(studentId) ||
      item.targetIds.some((id) => groupIds.has(id)),
    ),
    learningEvents: (course.learningEvents ?? []).filter((item) => item.studentId === studentId),
    companionThreads: (course.companionThreads ?? []).filter(
      (item) => item.studentId === studentId,
    ),
    companionTasks: (course.companionTasks ?? []).filter(
      (item) => item.studentId === studentId,
    ),
    companionConfirmations: (course.companionConfirmations ?? []).filter(
      (item) => item.studentId === studentId,
    ),
    companionProcessRecords: (course.companionProcessRecords ?? []).filter(
      (item) => item.studentId === studentId,
    ),
    learningSignals: (course.learningSignals ?? []).filter(
      (item) => item.studentId === studentId,
    ),
    classCommonIssues: [],
    teacherAgentDirectives: (course.teacherAgentDirectives ?? []).filter(
      (item) =>
        item.targetScope === "course" ||
        item.targetStudentIds.includes(studentId),
    ),
    offlineInterventions: [],
    dynamicFacilitationScaffolds: [],
  };
}
