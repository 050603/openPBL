import type { SceneOutline } from "@/lib/openmaic/types/generation";

export type AdaptiveGenerationProgress = {
  progress: number;
  message: string;
};

export async function generateAdaptiveClassroom(input: {
  title: string;
  requirement: string;
  stageKey: "ai-learning" | "proposal" | "make";
  scenes: Array<{
    title: string;
    description: string;
    keyPoints: string[];
    type?: "slide" | "interactive";
    targetDurationSec: number;
    knowledgePointIds?: string[];
  }>;
  signal?: AbortSignal;
  requestRole?: "student" | "teacher";
  onProgress?: (progress: AdaptiveGenerationProgress) => void;
}): Promise<{ classroomId: string; scenesCount: number }> {
  const outlines: SceneOutline[] = input.scenes.map((scene, index) => ({
    id: `adaptive-${Date.now().toString(36)}-${index + 1}`,
    type: scene.type ?? "slide",
    title: scene.title,
    description: scene.description,
    keyPoints: scene.keyPoints,
    teachingObjective: scene.description,
    estimatedDuration: scene.targetDurationSec,
    targetDurationSec: scene.targetDurationSec,
    order: index,
    stageKey: input.stageKey,
    stageLabel: input.stageKey === "ai-learning" ? "AI 授知" : input.stageKey === "proposal" ? "方案构思" : "项目实践",
    audience: "student",
    generationPurpose: "knowledge-teaching",
    detailKind: "knowledge-explanation",
    knowledgePointIds: scene.knowledgePointIds ?? [],
    ttsPolicy: "target-duration",
    resourceTypes: scene.type === "interactive" ? ["interactive-demo"] : ["ppt"],
  }));
  const response = await fetch("/api/openmaic/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OpenPBL-Role": input.requestRole ?? "student",
    },
    body: JSON.stringify({
      requirement: input.requirement,
      courseTitle: input.title,
      sceneOutlines: outlines,
      enableTTS: true,
      interactiveMode: outlines.some((scene) => scene.type === "interactive"),
    }),
    signal: input.signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`微课生成失败（HTTP ${response.status}）`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { classroomId: string; scenesCount: number } | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      const event = JSON.parse(dataLine.slice(6)) as {
        type?: string;
        progress?: number;
        message?: string;
        id?: string;
        scenesCount?: number;
        details?: string;
      };
      if (event.type === "progress") {
        input.onProgress?.({
          progress: event.progress ?? 0,
          message: event.message ?? "正在生成",
        });
      } else if (event.type === "done" && event.id) {
        result = { classroomId: event.id, scenesCount: event.scenesCount ?? outlines.length };
      } else if (event.type === "error") {
        throw new Error(event.details || "微课生成失败");
      }
    }
  }
  if (!result) throw new Error("微课生成未返回课堂资源");
  return result;
}
