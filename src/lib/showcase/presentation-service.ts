import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthClaims } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { lockCourseMutation } from "@/lib/db/course-mutation-lock";
import { publishCourseEvent } from "@/lib/realtime/event-bus";
import type {
  FinalArtifactKind,
  FinalArtifactSummary,
  ProjectDocumentVersion,
  ProjectPdfVersion,
  ShowcaseDisplayMode,
  ShowcasePresentationSnapshot,
  ShowcasePresentationStatus,
  ShowcaseViewState,
} from "@/lib/session/types";
import type {
  ShowcaseAction,
  ShowcaseData,
  ShowcaseEventPayload,
  ShowcaseStudentSummary,
} from "./types";

export class ShowcasePresentationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ShowcasePresentationError";
  }
}

type CourseGate = {
  id: string;
  status: string;
  currentStageIndex: number;
  stages: unknown;
  presentingGroupId: string | null;
  presentingStudentId: string | null;
  uiState: unknown;
};

type StudentRow = { id: string; name: string };
type GroupMemberRow = { groupId: string; studentId: string; studentName: string; joinedAt: Date };

function parseStages(value: unknown): Array<{ key?: string; view?: string }> {
  return Array.isArray(value)
    ? value.filter((stage): stage is { key?: unknown; view?: unknown } => Boolean(stage && typeof stage === "object"))
      .map((stage) => ({
        key: typeof stage.key === "string" ? stage.key : undefined,
        view: typeof stage.view === "string" ? stage.view : undefined,
      }))
    : [];
}

function currentStageKey(course: CourseGate): string {
  return parseStages(course.stages)[course.currentStageIndex]?.key ?? "";
}

function assertCourseExists(course: CourseGate | null): asserts course is CourseGate {
  if (!course) throw new ShowcasePresentationError("COURSE_NOT_FOUND", "课程不存在。", 404);
}

function assertStudentCourse(claims: AuthClaims, courseId: string): asserts claims is Extract<AuthClaims, { role: "student" }> {
  if (claims.role !== "student" || claims.courseId !== courseId) {
    throw new ShowcasePresentationError("FORBIDDEN", "学生身份与课程不匹配。", 403);
  }
}

function assertShowcaseStage(course: CourseGate): void {
  const stages = parseStages(course.stages);
  const isNewFiveStageCourse = stages.length === 5
    && ["launch", "ai-learning", "make", "showcase", "reflection"].every((key, index) => stages[index]?.key === key);
  if (course.status !== "teaching" || currentStageKey(course) !== "showcase" || !isNewFiveStageCourse) {
    throw new ShowcasePresentationError("SHOWCASE_INACTIVE", "只有授课中的第四阶段可以进行成果汇报。", 409);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asShowcaseStatus(value: string): ShowcasePresentationStatus {
  return ["pending", "active", "rejected", "ended", "cancelled"].includes(value)
    ? value as ShowcasePresentationStatus
    : "ended";
}

function asDisplayMode(value: string): ShowcaseDisplayMode {
  return value === "slides" ? "slides" : "continuous";
}

function rowToSnapshot(
  row: {
    id: string;
    courseId: string;
    groupId: string;
    studentId: string;
    artifactKind: string;
    artifactVersionId: string;
    artifactTitle: string;
    displayMode: string;
    status: string;
    viewState: Prisma.JsonValue | null;
    revision: number;
    rejectionReason: string | null;
    requestedAt: Date;
    reviewedAt: Date | null;
    reviewedBy: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    updatedAt: Date;
  },
  studentName?: string,
): ShowcasePresentationSnapshot {
  const rawViewState = asRecord(row.viewState);
  const viewState: ShowcaseViewState | undefined = row.viewState
    ? {
        page: typeof rawViewState.page === "number" ? rawViewState.page : undefined,
        scrollRatio: typeof rawViewState.scrollRatio === "number" ? rawViewState.scrollRatio : undefined,
        updatedAt: typeof rawViewState.updatedAt === "string" ? rawViewState.updatedAt : row.updatedAt.toISOString(),
        revision: row.revision,
      }
    : undefined;
  return {
    id: row.id,
    courseId: row.courseId,
    groupId: row.groupId,
    studentId: row.studentId,
    studentName,
    artifactKind: row.artifactKind === "pdf" ? "pdf" : "document",
    artifactVersionId: row.artifactVersionId,
    artifactTitle: row.artifactTitle,
    displayMode: asDisplayMode(row.displayMode),
    status: asShowcaseStatus(row.status),
    revision: row.revision,
    viewState,
    rejectionReason: row.rejectionReason ?? undefined,
    requestedAt: row.requestedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString(),
    reviewedBy: row.reviewedBy ?? undefined,
    startedAt: row.startedAt?.toISOString(),
    endedAt: row.endedAt?.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function documentSummary(version: ProjectDocumentVersion): FinalArtifactSummary {
  return {
    kind: "document",
    versionId: version.id,
    title: version.title,
    sequence: version.sequence,
    submittedAt: version.submittedAt ?? version.createdAt,
    displayModes: ["continuous"],
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: version.docxSize,
    downloadUrl: version.docxUploadId ? `/api/uploads/${version.docxUploadId}?download=1` : undefined,
  };
}

function pdfSummary(version: ProjectPdfVersion): FinalArtifactSummary {
  const kind = version.kind === "file" ? "file" : "pdf";
  return {
    kind,
    versionId: version.id,
    title: version.title,
    sequence: version.sequence,
    submittedAt: version.submittedAt,
    displayModes: kind === "pdf" ? ["continuous", "slides"] : [],
    mimeType: version.mimeType,
    size: version.size,
    downloadUrl: `/api/courses/${encodeURIComponent(version.courseId)}/showcase/artifacts/${encodeURIComponent(version.id)}?download=1`,
  };
}

function latestByStudent(
  documents: ProjectDocumentVersion[],
  pdfs: ProjectPdfVersion[],
): Map<string, FinalArtifactSummary[]> {
  const byStudent = new Map<string, FinalArtifactSummary[]>();
  const latestDocument = new Map<string, ProjectDocumentVersion>();
  for (const version of documents) {
    if (version.status !== "submitted") continue;
    const previous = latestDocument.get(version.studentId);
    if (!previous || isNewerVersion(version.submittedAt ?? version.createdAt, previous.submittedAt ?? previous.createdAt, version.sequence, previous.sequence)) latestDocument.set(version.studentId, version);
  }
  for (const [studentId, version] of latestDocument) byStudent.set(studentId, [documentSummary(version)]);
  for (const version of pdfs) {
    if (version.status !== "submitted") continue;
    byStudent.set(version.studentId, [...(byStudent.get(version.studentId) ?? []), pdfSummary(version)]);
  }
  for (const artifacts of byStudent.values()) artifacts.sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  return byStudent;
}

function isNewerVersion(leftDate: string, rightDate: string, leftSequence: number, rightSequence: number): boolean {
  const left = Date.parse(leftDate);
  const right = Date.parse(rightDate);
  return left > right || (left === right && leftSequence > rightSequence);
}

async function loadCourseGate(courseId: string): Promise<CourseGate | null> {
  return prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      status: true,
      currentStageIndex: true,
      stages: true,
      presentingGroupId: true,
      presentingStudentId: true,
      uiState: true,
    },
  });
}

async function loadStudentAndGroupRows(courseId: string) {
  const [students, members] = await Promise.all([
    prisma.student.findMany({ where: { courseId }, select: { id: true, name: true } }),
    prisma.groupMember.findMany({ where: { courseId }, orderBy: { joinedAt: "asc" }, select: { groupId: true, studentId: true, studentName: true, joinedAt: true } }),
  ]);
  return { students: students as StudentRow[], members: members as GroupMemberRow[] };
}

async function loadFinalVersions(courseId: string, studentId?: string) {
  const where = studentId ? { courseId, studentId } : { courseId };
  const [documents, pdfs] = await Promise.all([
    prisma.projectDocumentVersion.findMany({ where: { ...where, stageKey: "make" }, orderBy: { sequence: "desc" } }),
    prisma.projectPdfVersion.findMany({ where: { ...where, stageKey: "make" }, orderBy: { sequence: "desc" } }),
  ]);
  return {
    documents: documents.map((version) => ({
      id: version.id,
      courseId: version.courseId,
      submissionId: version.submissionId,
      studentId: version.studentId,
      stageKey: version.stageKey,
      sequence: version.sequence,
      sourceVersion: version.sourceVersion,
      title: version.title,
      sourceHtml: version.sourceHtml,
      docxUploadId: version.docxUploadId ?? undefined,
      docxSha256: version.docxSha256 ?? undefined,
      docxSize: version.docxSize ?? undefined,
      status: version.status as ProjectDocumentVersion["status"],
      error: version.error ?? undefined,
      requestId: version.requestId ?? undefined,
      submittedAt: version.submittedAt?.toISOString(),
      createdAt: version.createdAt.toISOString(),
    } satisfies ProjectDocumentVersion)),
    pdfs: pdfs.map((version) => ({
      id: version.id,
      courseId: version.courseId,
      studentId: version.studentId,
      groupId: version.groupId ?? undefined,
      stageKey: version.stageKey,
      sequence: version.sequence,
      title: version.title,
      uploadId: version.uploadId,
      kind: version.kind === "file" ? "file" : "pdf",
      mimeType: version.mimeType,
      sha256: version.sha256 ?? undefined,
      size: version.size ?? undefined,
      status: version.status as ProjectPdfVersion["status"],
      requestId: version.requestId ?? undefined,
      submittedAt: version.submittedAt.toISOString(),
      createdAt: version.createdAt.toISOString(),
    } satisfies ProjectPdfVersion)),
  };
}

async function publishShowcaseEvent(
  courseId: string,
  payload: ShowcaseEventPayload,
): Promise<void> {
  try {
    await publishCourseEvent(courseId, {
      type: "showcase-presentation",
      courseId,
      at: new Date().toISOString(),
      payload: payload as Record<string, unknown>,
    });
  } catch (error) {
    console.error("[showcase] realtime publish failed; clients will poll", error);
  }
}

async function latestSnapshot(courseId: string, id: string) {
  return prisma.showcasePresentation.findFirst({ where: { courseId, id } });
}

async function assertAssignedStudent(
  course: CourseGate,
  courseId: string,
  studentId: string,
): Promise<{ groupId: string; studentName: string }> {
  if (!course.presentingGroupId) {
    throw new ShowcasePresentationError("PRESENTER_NOT_ASSIGNED", "教师尚未设置汇报学生。", 409);
  }
  const effectivePresentingStudentId = course.presentingStudentId
    ?? (await prisma.groupMember.findFirst({
      where: { courseId, groupId: course.presentingGroupId },
      orderBy: { joinedAt: "asc" },
      select: { studentId: true },
    }))?.studentId;
  if (effectivePresentingStudentId && effectivePresentingStudentId !== studentId) {
    throw new ShowcasePresentationError("PRESENTER_NOT_ASSIGNED", "当前学生不是教师指定的汇报学生。", 403);
  }
  const member = await prisma.groupMember.findFirst({
    where: { courseId, groupId: course.presentingGroupId, studentId },
    select: { groupId: true, studentName: true },
  });
  if (!member) {
    throw new ShowcasePresentationError("PRESENTER_NOT_ASSIGNED", "当前学生不是教师指定的汇报学生。", 403);
  }
  return { groupId: member.groupId, studentName: member.studentName };
}

async function findLatestArtifact(
  courseId: string,
  studentId: string,
  artifactKind: FinalArtifactKind,
  artifactVersionId: string,
) {
  if (artifactKind === "file") return null;
  if (artifactKind === "document") {
    const version = await prisma.projectDocumentVersion.findFirst({
      where: { id: artifactVersionId, courseId, studentId, stageKey: "make", status: "submitted" },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }, { sequence: "desc" }],
    });
    if (!version) return null;
    const latest = await prisma.projectDocumentVersion.findFirst({
      where: { courseId, studentId, stageKey: "make", status: "submitted" },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }, { sequence: "desc" }],
      select: { id: true },
    });
    return latest?.id === version.id ? { kind: "document" as const, version, title: version.title } : null;
  }
  const version = await prisma.projectPdfVersion.findFirst({
    where: { id: artifactVersionId, courseId, studentId, stageKey: "make", status: "submitted", kind: "pdf" },
  });
  return version ? { kind: "pdf" as const, version, title: version.title } : null;
}

export async function getShowcaseData(
  courseId: string,
  claims: AuthClaims,
): Promise<ShowcaseData> {
  const course = await loadCourseGate(courseId);
  assertCourseExists(course);
  if (claims.role === "student") assertStudentCourse(claims, courseId);
  assertShowcaseStage(course);

  const { students, members } = await loadStudentAndGroupRows(courseId);
  if (claims.role === "student" && !students.some((student) => student.id === claims.studentId)) {
    throw new ShowcasePresentationError("FORBIDDEN", "学生尚未加入该课程。", 403);
  }
  const memberByStudent = new Map<string, GroupMemberRow>();
  for (const member of members) memberByStudent.set(member.studentId, member);
  const effectivePresentingStudentId = course.presentingStudentId
    ?? members.find((member) => member.groupId === course.presentingGroupId)?.studentId;
  const finalVersions = await loadFinalVersions(courseId, claims.role === "student" ? claims.studentId : undefined);
  const artifactsByStudent = latestByStudent(finalVersions.documents, finalVersions.pdfs);

  const studentSummaries: ShowcaseStudentSummary[] = students.map((student) => {
    const member = memberByStudent.get(student.id);
    return {
      studentId: student.id,
      name: student.name,
      groupId: member?.groupId,
      isAssigned: Boolean(effectivePresentingStudentId
        && student.id === effectivePresentingStudentId
        && member?.groupId === course.presentingGroupId),
      artifacts: artifactsByStudent.get(student.id) ?? [],
    };
  });
  const presentingStudent = studentSummaries.find((student) => student.isAssigned);
  const presentationRows = await prisma.showcasePresentation.findMany({
    where: {
      courseId,
      ...(claims.role === "student"
        ? { OR: [{ studentId: claims.studentId }, { status: "active" }] }
        : {}),
      status: { in: claims.role === "teacher" ? ["pending", "active", "rejected"] : ["pending", "active", "rejected"] },
    },
    orderBy: { updatedAt: "desc" },
  });
  const names = new Map(students.map((student) => [student.id, student.name]));
  const presentations = presentationRows.map((row) => rowToSnapshot(row, names.get(row.studentId)));
  const activePresentation = presentations.find((presentation) => presentation.status === "active");
  const ownArtifacts = claims.role === "student"
    ? artifactsByStudent.get(claims.studentId) ?? []
    : [];

  return {
    courseId,
    stageKey: currentStageKey(course),
    presentingGroupId: course.presentingGroupId ?? undefined,
    presentingStudentId: effectivePresentingStudentId,
    presentingStudentName: presentingStudent?.name,
    students: claims.role === "teacher" ? studentSummaries : [],
    ownArtifacts,
    activePresentation: activePresentation ?? null,
    presentations,
  };
}

async function assignPresenter(courseId: string, groupId: string | null, requestedStudentId: string | null | undefined, claims: AuthClaims) {
  if (claims.role !== "teacher") throw new ShowcasePresentationError("FORBIDDEN", "只有教师可以设置汇报学生。", 403);
  if (!groupId && requestedStudentId) {
    throw new ShowcasePresentationError("INVALID_ASSIGNMENT", "取消汇报学生设置时不能同时指定学生。", 400);
  }
  let payload: ShowcaseEventPayload;
  let cancelledSnapshots: ShowcasePresentationSnapshot[] = [];
  let cancelledActiveIds = new Set<string>();
  await prisma.$transaction(async (tx) => {
    await lockCourseMutation(tx, courseId);
    const course = await tx.course.findUnique({
      where: { id: courseId },
      select: { status: true, currentStageIndex: true, stages: true },
    });
    if (!course) throw new ShowcasePresentationError("COURSE_NOT_FOUND", "课程不存在。", 404);
    assertShowcaseStage({ ...course, id: courseId, presentingGroupId: null, presentingStudentId: null, uiState: null });
    let presentingStudent: { studentId: string; studentName: string } | null = null;
    if (groupId) {
      const group = await tx.projectGroup.findFirst({ where: { courseId, id: groupId }, select: { id: true } });
      if (!group) throw new ShowcasePresentationError("GROUP_NOT_FOUND", "汇报组不存在。", 404);
      presentingStudent = await tx.groupMember.findFirst({
        where: { courseId, groupId, ...(requestedStudentId ? { studentId: requestedStudentId } : {}) },
        select: { studentId: true, studentName: true },
        orderBy: { joinedAt: "asc" },
      });
      if (requestedStudentId && !presentingStudent) {
        throw new ShowcasePresentationError("STUDENT_NOT_IN_GROUP", "指定学生不属于该项目组。", 409);
      }
      if (!presentingStudent) {
        throw new ShowcasePresentationError("GROUP_EMPTY", "汇报组中没有可汇报的学生。", 409);
      }
    }
    const interrupted = await tx.showcasePresentation.findMany({
      where: { courseId, status: { in: ["pending", "active"] } },
    });
    cancelledActiveIds = new Set(interrupted.filter((row) => row.status === "active").map((row) => row.id));
    const endedAt = new Date();
    cancelledSnapshots = interrupted.map((row) => rowToSnapshot({
      ...row,
      // A queued request is cancelled; an already approved session has
      // reached its normal terminal state even when a new presenter replaces
      // it.
      status: row.status === "active" ? "ended" : "cancelled",
      revision: row.revision + 1,
      endedAt,
      updatedAt: endedAt,
    }));
    await tx.showcasePresentation.updateMany({
      where: { courseId, status: "pending" },
      data: { status: "cancelled", endedAt, revision: { increment: 1 } },
    });
    await tx.showcasePresentation.updateMany({
      where: { courseId, status: "active" },
      data: { status: "ended", endedAt, revision: { increment: 1 } },
    });
    await tx.course.update({ where: { id: courseId }, data: { presentingGroupId: groupId, presentingStudentId: presentingStudent?.studentId ?? null, version: { increment: 1 } } });
    payload = {
      scope: "course",
      presentingGroupId: groupId,
      presentingStudentId: presentingStudent?.studentId ?? null,
      presentingStudentName: presentingStudent?.studentName,
    };
  });
  await publishShowcaseEvent(courseId, payload!);
  // Keep the shared Course snapshot (used by the surrounding classroom
  // chrome) aligned with the dedicated showcase state after an assignment.
  await publishCourseEvent(courseId, {
    type: "course-updated",
    courseId,
    at: new Date().toISOString(),
    payload: { actionType: "SET_PRESENTING_GROUP" },
  }).catch(() => undefined);
  for (const snapshot of cancelledSnapshots) {
    await publishShowcaseEvent(courseId, cancelledActiveIds.has(snapshot.id)
      ? { scope: "course", snapshot }
      : { scope: "student", studentId: snapshot.studentId, snapshot });
  }
  return getShowcaseData(courseId, claims);
}

async function requestPresentation(courseId: string, action: Extract<ShowcaseAction, { action: "request" }>, claims: AuthClaims) {
  assertStudentCourse(claims, courseId);
  const course = await loadCourseGate(courseId);
  assertCourseExists(course);
  assertShowcaseStage(course);
  const { groupId, studentName } = await assertAssignedStudent(course, courseId, claims.studentId);
  if (action.artifactKind === "document" && action.displayMode !== "continuous") {
    throw new ShowcasePresentationError("INVALID_DISPLAY_MODE", "富文档只支持连续阅读。", 400);
  }
  const artifact = await findLatestArtifact(courseId, claims.studentId, action.artifactKind, action.artifactVersionId);
  if (!artifact) throw new ShowcasePresentationError("ARTIFACT_NOT_LATEST", "只能展示最新的已提交成果。", 409);
  const requestId = action.requestId ?? randomUUID();
  let snapshot: ShowcasePresentationSnapshot | undefined;
  await prisma.$transaction(async (tx) => {
    await lockCourseMutation(tx, courseId);
    const duplicate = await tx.showcasePresentation.findFirst({ where: { courseId, requestId } });
    if (duplicate) {
      if (duplicate.studentId !== claims.studentId) throw new ShowcasePresentationError("REQUEST_ID_CONFLICT", "请求编号已被其他学生使用。", 409);
      snapshot = rowToSnapshot(duplicate, studentName);
      return;
    }
    const lockedCourse = await tx.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true, currentStageIndex: true, stages: true, presentingGroupId: true, presentingStudentId: true, uiState: true },
    });
    if (!lockedCourse) throw new ShowcasePresentationError("COURSE_NOT_FOUND", "课程不存在。", 404);
    assertShowcaseStage(lockedCourse);
    const lockedAssignedStudentId = lockedCourse.presentingStudentId
      ?? (lockedCourse.presentingGroupId
        ? (await tx.groupMember.findFirst({
            where: { courseId, groupId: lockedCourse.presentingGroupId },
            orderBy: { joinedAt: "asc" },
            select: { studentId: true },
          }))?.studentId
        : undefined);
    if (lockedCourse.presentingGroupId !== groupId || lockedAssignedStudentId !== claims.studentId) {
      throw new ShowcasePresentationError("PRESENTER_NOT_ASSIGNED", "当前学生不是教师指定的汇报学生。", 403);
    }
    const lockedMember = await tx.groupMember.findFirst({
      where: { courseId, groupId, studentId: claims.studentId },
      select: { id: true },
    });
    if (!lockedMember) throw new ShowcasePresentationError("PRESENTER_NOT_ASSIGNED", "当前学生不是教师指定的汇报学生。", 403);
    const latestLocked = action.artifactKind === "pdf"
      ? await tx.projectPdfVersion.findFirst({ where: { id: action.artifactVersionId, courseId, studentId: claims.studentId, stageKey: "make", status: "submitted", kind: "pdf" }, select: { id: true } })
      : await tx.projectDocumentVersion.findFirst({ where: { id: action.artifactVersionId, courseId, studentId: claims.studentId, stageKey: "make", status: "submitted" }, select: { id: true } });
    if (!latestLocked) throw new ShowcasePresentationError("ARTIFACT_NOT_LATEST", "只能展示最新的已提交成果。", 409);
    const latestForStudent = action.artifactKind === "pdf"
      ? latestLocked
      : await tx.projectDocumentVersion.findFirst({ where: { courseId, studentId: claims.studentId, stageKey: "make", status: "submitted" }, orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }, { sequence: "desc" }], select: { id: true } });
    if (latestForStudent?.id !== action.artifactVersionId) throw new ShowcasePresentationError("ARTIFACT_NOT_LATEST", "只能展示最新的已提交成果。", 409);
    const active = await tx.showcasePresentation.findFirst({ where: { courseId, status: "active" }, select: { id: true } });
    if (active) throw new ShowcasePresentationError("PRESENTATION_ACTIVE", "当前已有学生在汇报，请等待教师结束后再申请。", 409);
    const pending = await tx.showcasePresentation.findFirst({ where: { courseId, status: "pending" }, select: { id: true } });
    if (pending) throw new ShowcasePresentationError("PRESENTATION_PENDING", "已有一个汇报申请等待教师处理。", 409);
    const row = await tx.showcasePresentation.create({
      data: {
        id: randomUUID(),
        courseId,
        groupId,
        studentId: claims.studentId,
        artifactKind: artifact.kind,
        artifactVersionId: action.artifactVersionId,
        artifactTitle: artifact.title,
        displayMode: action.displayMode,
        requestId,
        status: "pending",
        viewState: { scrollRatio: 0, page: 1, updatedAt: new Date().toISOString() },
      },
    });
    snapshot = rowToSnapshot(row, studentName);
  });
  await publishShowcaseEvent(courseId, {
    scope: "student",
    studentId: claims.studentId,
    snapshot,
  });
  if (!snapshot) throw new ShowcasePresentationError("PRESENTATION_FAILED", "汇报申请未能创建。", 500);
  return snapshot;
}

async function reviewPresentation(courseId: string, action: Extract<ShowcaseAction, { action: "review" }>, claims: AuthClaims) {
  if (claims.role !== "teacher") throw new ShowcasePresentationError("FORBIDDEN", "只有教师可以审批汇报申请。", 403);
  const course = await loadCourseGate(courseId);
  assertCourseExists(course);
  assertShowcaseStage(course);
  let snapshot: ShowcasePresentationSnapshot | undefined;
  await prisma.$transaction(async (tx) => {
    await lockCourseMutation(tx, courseId);
    const currentCourse = await tx.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true, currentStageIndex: true, stages: true, presentingGroupId: true, presentingStudentId: true, uiState: true },
    });
    if (!currentCourse) throw new ShowcasePresentationError("COURSE_NOT_FOUND", "课程不存在。", 404);
    assertShowcaseStage(currentCourse);
    const row = await tx.showcasePresentation.findFirst({ where: { courseId, id: action.presentationId } });
    if (!row) throw new ShowcasePresentationError("PRESENTATION_NOT_FOUND", "汇报申请不存在。", 404);
    if (row.status !== "pending") throw new ShowcasePresentationError("PRESENTATION_NOT_PENDING", "该申请已经处理过。", 409);
    const currentAssignedStudentId = currentCourse.presentingStudentId
      ?? (currentCourse.presentingGroupId
        ? (await tx.groupMember.findFirst({
            where: { courseId, groupId: currentCourse.presentingGroupId },
            orderBy: { joinedAt: "asc" },
            select: { studentId: true },
          }))?.studentId
        : undefined);
    if (row.groupId !== currentCourse.presentingGroupId || row.studentId !== currentAssignedStudentId) {
      throw new ShowcasePresentationError("PRESENTER_CHANGED", "汇报学生已被教师更换。", 409);
    }
    const student = await tx.student.findFirst({ where: { courseId, id: row.studentId }, select: { name: true } });
    if (!student) throw new ShowcasePresentationError("STUDENT_NOT_FOUND", "汇报学生不存在。", 404);
    if (action.decision === "approve") {
      const latest = row.artifactKind === "pdf"
        ? await tx.projectPdfVersion.findFirst({ where: { id: row.artifactVersionId, courseId, studentId: row.studentId, stageKey: "make", status: "submitted", kind: "pdf" }, select: { id: true } })
        : await tx.projectDocumentVersion.findFirst({ where: { courseId, studentId: row.studentId, stageKey: "make", status: "submitted" }, orderBy: { sequence: "desc" }, select: { id: true } });
      if (!latest || latest.id !== row.artifactVersionId) throw new ShowcasePresentationError("ARTIFACT_NOT_LATEST", "该成果已不是学生最新的提交版本，请让学生重新申请。", 409);
      const active = await tx.showcasePresentation.findFirst({ where: { courseId, status: "active" }, select: { id: true } });
      if (active) throw new ShowcasePresentationError("PRESENTATION_ACTIVE", "当前已有活动投屏。", 409);
      const courseRow = await tx.course.findUnique({ where: { id: courseId }, select: { uiState: true } });
      const uiState = asRecord(courseRow?.uiState);
      await tx.course.update({
        where: { id: courseId },
        data: {
          uiState: {
            ...uiState,
            resourceProjection: null,
            teacherResourceProjection: null,
          } as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
    }
    const updated = await tx.showcasePresentation.update({
      where: { id: row.id },
      data: action.decision === "approve"
        ? { status: "active", reviewedAt: new Date(), reviewedBy: claims.sub, startedAt: new Date(), revision: { increment: 1 } }
        : { status: "rejected", reviewedAt: new Date(), reviewedBy: claims.sub, rejectionReason: action.reason?.trim() || null, revision: { increment: 1 } },
    });
    snapshot = rowToSnapshot(updated, student.name);
  });
  await publishShowcaseEvent(courseId, {
    scope: action.decision === "approve" ? "course" : "student",
    ...(action.decision === "reject" ? { studentId: snapshot!.studentId } : {}),
    snapshot,
  });
  if (action.decision === "approve") {
    // Approval also clears the legacy teacher-resource projection. Trigger a
    // normal course refresh so an already-open resource overlay disappears on
    // every client, while the showcase event carries the presentation snapshot.
    await publishCourseEvent(courseId, {
      type: "course-updated",
      courseId,
      at: new Date().toISOString(),
      payload: { actionType: "SET_UI_STATE" },
    }).catch(() => undefined);
  }
  if (!snapshot) throw new ShowcasePresentationError("PRESENTATION_FAILED", "汇报申请未能处理。", 500);
  return snapshot;
}

async function updateViewState(courseId: string, action: Extract<ShowcaseAction, { action: "update" }>, claims: AuthClaims) {
  assertStudentCourse(claims, courseId);
  let snapshot: ShowcasePresentationSnapshot | undefined;
  await prisma.$transaction(async (tx) => {
    await lockCourseMutation(tx, courseId);
    const row = await tx.showcasePresentation.findFirst({ where: { courseId, id: action.presentationId, status: "active" } });
    if (!row) throw new ShowcasePresentationError("PRESENTATION_NOT_ACTIVE", "汇报投屏已结束。", 409);
    if (row.studentId !== claims.studentId) throw new ShowcasePresentationError("FORBIDDEN", "只有汇报学生可以同步展示位置。", 403);
    const previous = asRecord(row.viewState);
    const next: Record<string, unknown> = {
      ...previous,
      updatedAt: new Date().toISOString(),
    };
    if (row.displayMode === "slides") {
      const page = action.viewState.page;
      if (!Number.isInteger(page) || page! < 1) throw new ShowcasePresentationError("INVALID_VIEW_STATE", "页码无效。", 400);
      next.page = page;
    } else {
      const ratio = action.viewState.scrollRatio;
      if (typeof ratio !== "number" || !Number.isFinite(ratio)) throw new ShowcasePresentationError("INVALID_VIEW_STATE", "滚动位置无效。", 400);
      next.scrollRatio = Math.min(1, Math.max(0, ratio));
    }
    const updated = await tx.showcasePresentation.update({
      where: { id: row.id },
      data: { viewState: next as Prisma.InputJsonValue, revision: { increment: 1 } },
    });
    snapshot = rowToSnapshot(updated, undefined);
  });
  await publishShowcaseEvent(courseId, { scope: "course", snapshot });
  if (!snapshot) throw new ShowcasePresentationError("PRESENTATION_FAILED", "汇报位置未能更新。", 500);
  return snapshot;
}

async function endPresentation(courseId: string, action: Extract<ShowcaseAction, { action: "end" }>, claims: AuthClaims) {
  const row = await latestSnapshot(courseId, action.presentationId);
  if (!row) throw new ShowcasePresentationError("PRESENTATION_NOT_FOUND", "汇报投屏不存在。", 404);
  if (claims.role === "student") {
    assertStudentCourse(claims, courseId);
    if (row.studentId !== claims.studentId) throw new ShowcasePresentationError("FORBIDDEN", "不能结束其他学生的投屏。", 403);
  }
  let snapshot: ShowcasePresentationSnapshot | undefined;
  await prisma.$transaction(async (tx) => {
    await lockCourseMutation(tx, courseId);
    const current = await tx.showcasePresentation.findFirst({ where: { courseId, id: action.presentationId } });
    if (!current) throw new ShowcasePresentationError("PRESENTATION_NOT_FOUND", "汇报投屏不存在。", 404);
    if (!["pending", "active"].includes(current.status)) {
      snapshot = rowToSnapshot(current);
      return;
    }
    const updated = await tx.showcasePresentation.update({
      where: { id: current.id },
      data: { status: current.status === "pending" ? "cancelled" : "ended", endedAt: new Date(), revision: { increment: 1 } },
    });
    snapshot = rowToSnapshot(updated);
  });
  if (!snapshot) throw new ShowcasePresentationError("PRESENTATION_FAILED", "汇报状态未能更新。", 500);
  const visibility = snapshot.status === "active"
    ? { scope: "course" as const }
    : { scope: "student" as const, studentId: snapshot.studentId };
  await publishShowcaseEvent(courseId, { ...visibility, snapshot });
  return snapshot;
}

export async function executeShowcaseAction(
  courseId: string,
  action: ShowcaseAction,
  claims: AuthClaims,
): Promise<ShowcaseData | ShowcasePresentationSnapshot> {
  switch (action.action) {
    case "assign":
      return assignPresenter(courseId, action.groupId, action.studentId, claims);
    case "request":
      return requestPresentation(courseId, action, claims);
    case "review":
      return reviewPresentation(courseId, action, claims);
    case "update":
      return updateViewState(courseId, action, claims);
    case "end":
      return endPresentation(courseId, action, claims);
    default:
      throw new ShowcasePresentationError("INVALID_ACTION", "汇报操作无效。", 400);
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
