import { isRetryableGenerationError } from "@openmaic/lib/generation/generation-retry";

export const MAX_MANAGED_COURSE_GENERATION_RECOVERIES = 2;

export type ManagedCourseGenerationRequest = {
  managedRecoveryCount?: number;
};

export function createManagedCourseGenerationRecoveryRequest<T extends object>(
  request: T & ManagedCourseGenerationRequest,
  error: unknown,
  completedPageCount: number,
): (T & ManagedCourseGenerationRequest) | null {
  if (completedPageCount <= 0 || !isRetryableGenerationError(error)) return null;
  const recoveryCount = request.managedRecoveryCount ?? 0;
  if (recoveryCount >= MAX_MANAGED_COURSE_GENERATION_RECOVERIES) return null;
  return { ...request, managedRecoveryCount: recoveryCount + 1 };
}

export function formatCourseGenerationErrorForTeacher(error: unknown): string {
  if (isRetryableGenerationError(error)) {
    return "AI 页面生成服务连续多次未能完成最后的课堂页面；已经生成的页面均已保留，请稍后继续。";
  }
  return "课程生成遇到无法继续的系统错误；已经生成的页面均已保留，请稍后继续。";
}
