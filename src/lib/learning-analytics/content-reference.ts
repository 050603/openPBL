import type { LearningContentReference } from "@/lib/session/types";

export function formatLearningContentReference(
  content?: LearningContentReference,
  fallback?: string,
): string {
  if (!content) return fallback ?? "未定位到具体内容";
  const sceneKind = content.sceneType === "slide" ? "PPT" : content.sceneType === "quiz" ? "测验" : "页面";
  const scene = content.sceneTitle
    ? `${content.sceneIndex ? `第 ${content.sceneIndex} 页${sceneKind} · ` : ""}${content.sceneTitle}`
    : content.sceneIndex
      ? `第 ${content.sceneIndex} 页${sceneKind}`
      : undefined;
  return [
    content.stageLabel,
    scene,
    content.activityTitle ? `活动：${content.activityTitle}` : undefined,
    content.knowledgePointLabels?.length
      ? `知识点：${content.knowledgePointLabels.join("、")}`
      : undefined,
  ].filter(Boolean).join(" · ") || fallback || "未定位到具体内容";
}
