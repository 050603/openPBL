import type { Course, CourseContent } from "@/lib/session/types";
import type {
  PblActivityCatalogEntry,
  PblTeachingActivityRequirement,
  SceneOutline,
  SceneResourceType,
} from "@openmaic/lib/types/generation";
import { normalizePblCourseConfig } from "@/lib/pbl-course-config";
import {
  assessPblTimeAllocation,
  buildPblProjectMainline,
} from "@/lib/pbl-time-model";

export function buildTeacherActivityRequirements(
  content?: Partial<CourseContent>,
): PblTeachingActivityRequirement[] {
  return (content?.teachingOutline ?? [])
    .filter((activity) => activity.stageKey !== "ai-learning")
    .map((activity) => ({
      activityId: activity.id,
      stageKey: activity.stageKey,
      title: activity.title,
      durationMin: activity.durationMin,
      teachingGoal: activity.teachingGoal,
      teacherRole: activity.teacherRole,
      platformRole: activity.platformRole,
      aiRole: activity.aiRole,
      studentActivity: activity.studentActivity,
      // Teacher support is part of the ordinary classroom activity route.
      // Its generated deliverables are intentionally limited to a PPT plus
      // script; interactive scenes belong only to student AI learning.
      openMaicUse: "none",
      resourceTypes: ["ppt", "script"] as SceneResourceType[],
      requirement:
        "必须单独生成普通课堂活动所需的教师 PPT 与讲稿，并在教师课堂资源中解析；不得进入学生 AI 授知播放界面。",
    }));
}

export function buildPblActivityCatalog(
  content?: Partial<CourseContent>,
): PblActivityCatalogEntry[] {
  return (content?.teachingOutline ?? []).map((activity) => ({
    activityId: activity.id,
    stageKey: activity.stageKey,
    title: activity.title,
    durationMin: activity.durationMin,
    knowledgePointIds: [...(activity.knowledgePointIds ?? [])],
  }));
}

/**
 * Serialize course facts only. Routing, phase ownership, and output rules live
 * in the pbl-course prompt template rather than in this request text.
 */
export function buildPblCourseRequirement(
  course: Pick<Course, "name" | "subject" | "grade" | "hours" | "summary" | "drivingQuestion" | "learningObjectives" | "pblConfig">,
  content?: Partial<CourseContent>,
  outlines?: SceneOutline[],
): string {
  const totalMinutes = Math.max(0, Math.round(course.hours * 60));
  const timeContext = {
    topic: course.name,
    subject: course.subject,
    summary: course.summary,
    grade: course.grade,
    difficulty: normalizePblCourseConfig(course.pblConfig).difficultyLevel,
    knowledgePoints: content?.knowledgePoints,
    knowledgeGraph: content?.knowledgeGraph,
  };
  const timeAssessment = assessPblTimeAllocation(
    totalMinutes,
    content?.teachingOutline ?? [],
    timeContext,
  );
  const projectMainline = content?.projectMainline ?? buildPblProjectMainline(
    totalMinutes,
    content?.teachingOutline ?? [],
  );
  return [
    "课程事实：",
    JSON.stringify(
      {
        name: course.name,
        subject: course.subject,
        grade: course.grade,
        hours: course.hours,
        summary: course.summary,
        drivingQuestion: course.drivingQuestion,
        learningObjectives: course.learningObjectives ?? [],
        pblConfig: normalizePblCourseConfig(course.pblConfig),
      },
      null,
      2,
    ),
    content?.knowledgePoints || content?.knowledgeGraph
      ? `已确认知识结构：\n${JSON.stringify({ knowledgePoints: content.knowledgePoints ?? [], knowledgeGraph: content.knowledgeGraph ?? null }, null, 2)}`
      : "",
    content?.teachingOutline
      ? `已确认课程模块（每个模块可独立展开多个课程大纲资源）：\n${JSON.stringify(content.teachingOutline, null, 2)}\n课程总时长：${totalMinutes} 分钟；当前模块合计：${timeAssessment.allocatedMinutes} 分钟；六模块建议：${JSON.stringify(timeAssessment.recommendedStageTotals)}\n项目主线：${JSON.stringify(projectMainline, null, 2)}`
      : "",
    content?.teachingOutline?.length
      ? `课程模块目录（用于校验课程大纲 parentActivityId）：\n${JSON.stringify(buildPblActivityCatalog(content), null, 2)}`
      : "",
    content?.knowledgePoints?.length
      ? `课程大纲只能引用以下已确认知识点 ID，请保持 knowledgePointIds 与备课目标一致，并优先覆盖 foundation/core 后再安排 application/extension：\n${JSON.stringify(content.knowledgePoints.map((point) => ({ id: point.id, name: point.name, level: point.level })), null, 2)}`
      : "",
    content?.teachingOutline?.length
      ? `普通课堂活动的教师资源清单（每条都要单独生成和解析，AI 授知阶段除外）：\n${JSON.stringify(buildTeacherActivityRequirements(content), null, 2)}`
      : "",
    outlines?.length
      ? `已确认场景大纲：\n${JSON.stringify(outlines, null, 2)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
