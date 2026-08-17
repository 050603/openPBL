import { getCourse } from "@/lib/session/server-store";
import { readClassroom } from "@/lib/openmaic/server/classroom-storage";
import {
  findMissingTeachingToolResources,
  findMissingTtsResources,
} from "@/lib/course-generation/resource-readiness";

export type CourseResourceIssue = {
  id: string;
  type: "adaptive-resource" | "teaching-tool" | "tts" | "media";
  title: string;
  detail: string;
};

export async function auditCourseGeneratedResources(courseId: string): Promise<{
  classroomId?: string;
  issues: CourseResourceIssue[];
}> {
  const course = await getCourse(courseId);
  if (!course) return { issues: [] };
  const classroomId = course.aiLearningClassroomId || course.content._openmaicClassroomId;
  const classroom = classroomId ? await readClassroom(classroomId) : null;
  const outlines = course.content._openmaicSceneOutlines ?? [];
  const toolIssues = classroom
    ? findMissingTeachingToolResources(outlines, classroom.scenes).map((issue) => ({
        id: `tool:${issue.outlineId}:${issue.tool}`,
        type: "teaching-tool" as const,
        title: issue.title,
        detail: `${issue.tool === "whiteboard" ? "白板" : "教学工具"}计划动作未生成`,
      }))
    : [];
  const ttsIssues = classroom
    ? findMissingTtsResources(classroom.scenes).map((issue) => ({
        id: `tts:${issue.sceneId}:${issue.actionId}`,
        type: "tts" as const,
        title: issue.title,
        detail: "配置语音未生成",
      }))
    : [];
  const adaptiveIssues = course.content.adaptiveLearningPlan?.enabled
    ? course.content.adaptiveLearningPlan.branches.flatMap((branch) =>
        branch.enabled !== false
        && branch.status === "teacher-confirmed"
        && (branch.preparedResource?.status !== "ready" || !branch.preparedResource.classroomId)
          ? [{
              id: `adaptive:${branch.id}`,
              type: "adaptive-resource" as const,
              title: branch.title,
              detail: branch.preparedResource?.error || "个性化学习资源未生成",
            }]
          : [],
      )
    : [];
  const mediaIssues = classroom?.assetGeneration?.failures.flatMap((failure) =>
    failure.type === "image" || failure.type === "video"
      ? [{
          id: `media:${failure.type}:${failure.elementId}`,
          type: "media" as const,
          title: failure.elementId,
          detail: `${failure.type === "image" ? "图片" : "视频"}未生成：${failure.error}`,
        }]
      : [],
  ) ?? [];
  return { classroomId, issues: [...adaptiveIssues, ...toolIssues, ...ttsIssues, ...mediaIssues] };
}
