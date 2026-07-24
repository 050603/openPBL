import type { Course, CourseTodo, ProjectGroup } from "@/lib/session/types";

export type LaunchTodoKind = "resources" | "personal-space" | "topic" | "other";

export function getLaunchTodoKind(todo: CourseTodo): LaunchTodoKind {
  const text = `${todo.id} ${todo.title}`.toLowerCase();
  if (text.includes("read-brief") || text.includes("阅读项目说明")) return "resources";
  if (text.includes("join-group") || text.includes("个人项目空间")) return "personal-space";
  if (
    text.includes("pick-direction") ||
    text.includes("兴趣方向") ||
    text.includes("研究方向") ||
    text.includes("研究主题")
  ) {
    return "topic";
  }
  return "other";
}

export function hasSelectedProjectTopic(
  project?: ProjectGroup,
  inquiryQuestions?: string[],
): boolean {
  const topic = project?.topic.trim();
  if (!topic || topic === "待确定选题方向" || topic === "待确定研究主题") return false;
  return inquiryQuestions ? inquiryQuestions.includes(topic) : true;
}

export function buildCourseTopicOptions(course: Course): Array<{
  value: string;
  description?: string;
}> {
  const configured = course.pblConfig?.inquiryQuestions ?? [];
  const questions = configured.length > 0 ? configured : [course.drivingQuestion];
  return Array.from(
    new Set(questions.map((question) => question.trim()).filter(Boolean)),
  ).map((value) => ({
    value,
    description: "教师设置的项目启发问题",
  }));
}

export function haveAllResourcesBeenViewed(course: Course, studentId?: string): boolean {
  const resources = course.resources ?? [];
  if (resources.length === 0) return true;
  if (!studentId) return false;
  return resources.every((resource) => resource.downloadedBy.includes(studentId));
}
