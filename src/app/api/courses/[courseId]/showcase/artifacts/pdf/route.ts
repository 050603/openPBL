import { createHash, randomUUID } from "node:crypto";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { authenticateRequest, requireSameOrigin } from "@/lib/auth/request-guards";
import { checkDistributedRateLimit } from "@/lib/auth/distributed-rate-limit";
import { rateLimitedResponse } from "@/lib/auth/rate-limit";
import { isDatabaseConfigured, prisma } from "@/lib/db/client";
import { lockCourseMutation } from "@/lib/db/course-mutation-lock";
import { publishCourseEvent } from "@/lib/realtime/event-bus";
import { ShowcasePresentationError } from "@/lib/showcase/presentation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const dataDir = process.env.UPLOAD_DIR?.trim() || path.resolve(".openpbl-data", "uploads");
const MetadataSchema = z.object({
  title: z.string().trim().max(200).optional(),
  requestId: z.string().uuid().optional(),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const auth = await authenticateRequest(request, "student");
  if ("response" in auth) return auth.response;
  if (auth.claims.role !== "student") return errorResponse("FORBIDDEN", "只有学生可以提交最终 PDF。", 403);
  const studentId = auth.claims.studentId;
  if (!isDatabaseConfigured()) return errorResponse("DATABASE_REQUIRED", "PDF 最终提交需要连接数据库。", 503);
  const { courseId } = await context.params;
  if (auth.claims.courseId !== courseId) return errorResponse("FORBIDDEN", "学生身份与课程不匹配。", 403);
  const limit = await checkDistributedRateLimit({
    namespace: "showcase-pdf-submit",
    key: `${auth.claims.sub}:${courseId}`,
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterMs);

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true, currentStageIndex: true, stages: true },
  });
  if (!course) return errorResponse("COURSE_NOT_FOUND", "课程不存在。", 404);
  const stages = Array.isArray(course.stages) ? course.stages : [];
  const stage = stages[course.currentStageIndex];
  const newFiveStageCourse = stages.length === 5
    && ["launch", "ai-learning", "make", "showcase", "reflection"].every((key, index) => {
      const candidate = stages[index];
      return Boolean(candidate && typeof candidate === "object" && (candidate as { key?: unknown }).key === key);
    });
  if (course.status !== "teaching" || !newFiveStageCourse || !stage || typeof stage !== "object" || (stage as { key?: unknown }).key !== "make") {
    return errorResponse("MAKE_INACTIVE", "只能在第三阶段项目实践中提交最终 PDF。", 409);
  }
  const member = await prisma.groupMember.findFirst({
    where: { courseId, studentId },
    select: { groupId: true },
  });
  if (!member) return errorResponse("STUDENT_NOT_FOUND", "学生尚未加入项目空间。", 404);

  let targetPath: string | undefined;
  try {
    const form = await request.formData();
    const files = form.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File)) return errorResponse("FILE_REQUIRED", "请选择一个 PDF 文件。", 400);
    const file = files[0];
    const originalName = path.basename(file.name).normalize("NFC");
    if (path.extname(originalName).toLowerCase() !== ".pdf") return errorResponse("PDF_REQUIRED", "最终成果仅支持 PDF 文件。", 415);
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return errorResponse("FILE_TOO_LARGE", "PDF 不能超过 50 MiB。", 413);
    const metadata = MetadataSchema.safeParse({
      title: form.get("title") ?? undefined,
      requestId: form.get("requestId") ?? undefined,
    });
    if (!metadata.success) return errorResponse("INVALID_METADATA", "PDF 提交信息无效。", 400);
    const title = metadata.data.title || originalName;
    if (title.length > 200) return errorResponse("INVALID_METADATA", "PDF 标题不能超过 200 个字符。", 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(bytes).catch(() => null);
    if (!detected || detected.ext !== "pdf") return errorResponse("FILE_SIGNATURE_MISMATCH", "文件内容不是有效 PDF。", 415);

    const headerRequestId = request.headers.get("x-request-id");
    const requestId = metadata.data.requestId
      ?? (headerRequestId && headerRequestId.length <= 160 ? headerRequestId : undefined)
      ?? randomUUID();
    const existing = await prisma.projectPdfVersion.findFirst({ where: { courseId, requestId } });
    if (existing) {
      if (existing.studentId !== studentId) return errorResponse("REQUEST_ID_CONFLICT", "请求编号已被其他学生使用。", 409);
      return Response.json({
        ok: true,
        versionId: existing.id,
        sequence: existing.sequence,
        submittedAt: existing.submittedAt.toISOString(),
        uploadId: existing.uploadId,
        requestId,
      });
    }

    const uploadId = randomUUID();
    const versionId = randomUUID();
    const storedName = `${uploadId}.pdf`;
    targetPath = path.join(dataDir, storedName);
    await mkdir(dataDir, { recursive: true });
    await writeFile(targetPath, bytes, { flag: "wx", mode: 0o600 });
    const info = await stat(targetPath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const durable = await prisma.$transaction(async (tx) => {
      await lockCourseMutation(tx, courseId);
      const duplicate = await tx.projectPdfVersion.findFirst({ where: { courseId, requestId } });
      if (duplicate) {
        if (duplicate.studentId !== studentId) {
          throw new ShowcasePresentationError("REQUEST_ID_CONFLICT", "请求编号已被其他学生使用。", 409);
        }
        return { duplicate };
      }
      const lockedCourse = await tx.course.findUnique({
        where: { id: courseId },
        select: { status: true, currentStageIndex: true, stages: true },
      });
      const lockedStages = Array.isArray(lockedCourse?.stages) ? lockedCourse.stages : [];
      const lockedStage = lockedStages[lockedCourse?.currentStageIndex ?? -1];
      const lockedNewFiveStageCourse = lockedStages.length === 5
        && ["launch", "ai-learning", "make", "showcase", "reflection"].every((key, index) => {
          const candidate = lockedStages[index];
          return Boolean(candidate && typeof candidate === "object" && (candidate as { key?: unknown }).key === key);
        });
      if (lockedCourse?.status !== "teaching"
        || !lockedNewFiveStageCourse
        || !lockedStage
        || typeof lockedStage !== "object"
        || (lockedStage as { key?: unknown }).key !== "make") {
        throw new ShowcasePresentationError("MAKE_INACTIVE", "只能在第三阶段项目实践中提交最终 PDF。", 409);
      }
      const lockedMember = await tx.groupMember.findFirst({
        where: { courseId, studentId },
        select: { groupId: true },
      });
      if (!lockedMember) throw new ShowcasePresentationError("STUDENT_NOT_FOUND", "学生尚未加入项目空间。", 404);
      const latest = await tx.projectPdfVersion.findFirst({
        where: { courseId, studentId, stageKey: "make" },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      await tx.uploadFile.create({
        data: {
          id: uploadId,
          fileName: originalName,
          storedName,
          courseId,
          uploadedById: studentId,
          uploadedByRole: "student",
          size: info.size,
          mimeType: "application/pdf",
          referencedBy: [`project-pdf-version:${versionId}`],
          refCount: 1,
        },
      });
      const version = await tx.projectPdfVersion.create({
        data: {
          id: versionId,
          courseId,
          studentId,
          groupId: lockedMember.groupId,
          stageKey: "make",
          sequence: (latest?.sequence ?? 0) + 1,
          title,
          uploadId,
          sha256,
          size: info.size,
          requestId,
        },
      });
      const updatedCourse = await tx.course.update({
        where: { id: courseId },
        data: { version: { increment: 1 } },
        select: { version: true },
      });
      const event = await tx.courseEvent.create({
        data: {
          courseId,
          requestId: randomUUID(),
          type: "UPDATE_COURSE",
          actorId: studentId,
          actorRole: "student",
          courseVersion: updatedCourse.version,
          payload: { source: "showcase-pdf-submission", scope: "student", studentId },
        },
        select: { cursor: true },
      });
      return { version, courseVersion: updatedCourse.version, eventCursor: event.cursor.toString() };
    });
    if ("duplicate" in durable && durable.duplicate) {
      await unlink(targetPath).catch(() => undefined);
      return Response.json({ ok: true, versionId: durable.duplicate.id, sequence: durable.duplicate.sequence, submittedAt: durable.duplicate.submittedAt.toISOString(), uploadId: durable.duplicate.uploadId, requestId });
    }
    await publishCourseEvent(courseId, {
      type: "course-updated",
      courseId,
      at: new Date().toISOString(),
      payload: {
        actionType: "UPDATE_COURSE",
        courseVersion: durable.courseVersion,
        eventCursor: durable.eventCursor,
        scope: "student",
        studentId,
      },
    }).catch(() => undefined);
    return Response.json({
      ok: true,
      versionId: durable.version.id,
      sequence: durable.version.sequence,
      submittedAt: durable.version.submittedAt.toISOString(),
      uploadId,
      requestId,
    }, { status: 201 });
  } catch (error) {
    if (targetPath) await unlink(targetPath).catch(() => undefined);
    if (error instanceof ShowcasePresentationError) return errorResponse(error.code, error.message, error.status);
    console.error("[showcase/pdf] upload failed", error);
    return errorResponse("PDF_SUBMIT_FAILED", "PDF 最终提交失败，请稍后重试。", 500);
  }
}

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ code, message }, { status });
}
