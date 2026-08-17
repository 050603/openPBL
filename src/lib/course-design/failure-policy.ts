export const MAX_MANAGED_COURSE_DESIGN_RECOVERIES = 2;

type RecoverableRequest = {
  courseId: string;
  teacherBrief: string;
  managedRecoveryCount?: number;
  managedRecoveryFeedback?: string;
  [key: string]: unknown;
};

export type CourseDesignFailureKind = "recoverable-generation" | "terminal-quality" | "fatal-infrastructure";

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = current instanceof Error ? current.cause : undefined;
  }
  return chain;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

const INFRASTRUCTURE_ERROR = /(?:ECONN|ENOTFOUND|ETIMEDOUT|调用超时|fetch failed|network|socket|429|rate.?limit|quota|API.?key|unauthori[sz]ed|forbidden|database|prisma|P20\d\d)/i;
const RECOVERABLE_GENERATION_ERROR = /(?:代理无法生成结构完整的数据|无法通过独立审校|未通过(?:独立)?(?:审校|质量门|校验)|未能补齐必要结构|未返回可保存的数据|Failed to parse scene outlines response|无法解析.*JSON|生成的数据结构不完整)/i;
const EXHAUSTED_LOCAL_REPAIR = /(?:目标与知识结构无法通过独立审校|课程入口学习包无法通过发布校验|编辑 Agent 无法完成审校修订)/i;

export function classifyCourseDesignFailure(error: unknown): CourseDesignFailureKind {
  const chain = errorChain(error);
  if (chain.some((item) => INFRASTRUCTURE_ERROR.test(messageOf(item)))) {
    return "fatal-infrastructure";
  }
  if (chain.some((item) => EXHAUSTED_LOCAL_REPAIR.test(messageOf(item)))) {
    return "terminal-quality";
  }
  if (chain.some((item) => item instanceof SyntaxError)) {
    return "recoverable-generation";
  }
  return chain.some((item) => RECOVERABLE_GENERATION_ERROR.test(messageOf(item)))
    ? "recoverable-generation"
    : "fatal-infrastructure";
}

export function createManagedRecoveryRequest<T extends RecoverableRequest>(
  request: T,
  error: unknown,
): T | null {
  if (classifyCourseDesignFailure(error) !== "recoverable-generation") return null;
  const recoveryCount = request.managedRecoveryCount ?? 0;
  if (recoveryCount >= MAX_MANAGED_COURSE_DESIGN_RECOVERIES) return null;
  return {
    ...request,
    managedRecoveryCount: recoveryCount + 1,
    managedRecoveryFeedback: messageOf(error).slice(0, 2_000),
  };
}

export function formatFatalCourseDesignError(error: unknown): string {
  const messages = errorChain(error).map(messageOf).join(" ");
  if (INFRASTRUCTURE_ERROR.test(messages)) {
    return "网络或 AI 服务暂时不可用，快速生成已安全停止；已完成的课程设计内容仍会保留，请稍后重试。";
  }
  if (EXHAUSTED_LOCAL_REPAIR.test(messages)) {
    return "当前课程阶段经过多轮定向编辑后仍未通过质量检查，生成已停止且不会整项重跑；此前已经完成的内容仍会保留。";
  }
  return "快速生成遇到无法继续的系统错误，已安全停止；已完成的课程设计内容仍会保留，请稍后重试。";
}
