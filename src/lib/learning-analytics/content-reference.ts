import type { LearningContentReference } from "@/lib/session/types";

export function formatLearningContentReference(
  content?: LearningContentReference,
  fallback?: string,
): string {
  if (!content) return fallback ?? "未定位到具体内容";
  const scenePrefix = content.sceneIndex ? `第 ${content.sceneIndex} 页` : undefined;
  const scene = content.sceneTitle
    ? [scenePrefix, `《${content.sceneTitle}》`].filter(Boolean).join(" ")
    : scenePrefix
      ?? (content.sceneType === "quiz" ? "当前测验" : undefined);
  const primaryLocation = scene ?? content.activityTitle ?? content.stageLabel;
  const knowledgePoints = content.knowledgePointLabels ?? [];
  const knowledge = knowledgePoints.length
    ? `${knowledgePoints[0]}${knowledgePoints.length > 1 ? `等 ${knowledgePoints.length} 个知识点` : ""}`
    : undefined;
  return [primaryLocation, knowledge].filter(Boolean).join(" · ") || fallback || "当前学习内容";
}
