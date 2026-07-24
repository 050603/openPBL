import { callLLM, parseLLMJson } from "@/lib/llm/client";
import {
  createDefaultAdaptiveLearningPlan,
  normalizeAdaptiveLearningPlan,
} from "@/lib/adaptive-learning";
import { getCourse } from "@/lib/session/server-store";
import { isAuthConfigured, readAuthFromRequest } from "@/lib/auth/session";
import type { KnowledgePoint, OpenMaicSceneOutlineSnapshot } from "@/lib/session/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    courseId?: string;
    knowledgePoints?: unknown;
    mainScenes?: unknown;
  } | null;
  if (!body?.courseId) {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  if (isAuthConfigured()) {
    const claims = await readAuthFromRequest(request, "teacher");
    if (claims?.role !== "teacher") {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }
  const course = await getCourse(body.courseId);
  if (!course) return Response.json({ error: "COURSE_NOT_FOUND" }, { status: 404 });

  const requestedKnowledgePoints = Array.isArray(body.knowledgePoints)
    ? body.knowledgePoints.filter((point): point is KnowledgePoint =>
        Boolean(
          point
          && typeof point === "object"
          && typeof (point as KnowledgePoint).id === "string"
          && typeof (point as KnowledgePoint).name === "string",
        ),
      )
    : [];
  const knowledgePoints = requestedKnowledgePoints.length
    ? requestedKnowledgePoints
    : course.content.knowledgePoints;
  const requestedMainScenes = Array.isArray(body.mainScenes)
    ? body.mainScenes.filter((scene): scene is OpenMaicSceneOutlineSnapshot =>
        Boolean(
          scene
          && typeof scene === "object"
          && typeof (scene as OpenMaicSceneOutlineSnapshot).id === "string"
          && typeof (scene as OpenMaicSceneOutlineSnapshot).title === "string",
        ),
      )
    : [];
  const sourceMainScenes = requestedMainScenes.length
    ? requestedMainScenes
    : course.content._openmaicSceneOutlines ?? [];
  const knowledgeCatalog = knowledgePoints.map((point) => ({
    id: point.id,
    name: point.name,
    description: point.description,
    keyInfo: point.keyInfo,
    level: point.level,
  }));
  const mainScenes = sourceMainScenes
    .filter((scene) => scene.stageKey === "ai-learning" || scene.audience === "student")
    .map((scene) => ({
      id: scene.id,
      title: scene.title,
      type: scene.type,
      knowledgePointIds: scene.knowledgePointIds ?? [],
      targetDurationSec: scene.targetDurationSec ?? scene.estimatedDuration,
    }));
  const fallback = createDefaultAdaptiveLearningPlan({
    knowledgePoints,
    mainScenes: sourceMainScenes,
  });

  try {
    const response = await callLLM([
      {
        role: "system",
        content: `你是课程自适应路径设计师。请为一节课生成轻量前测和可选分支大纲。
约束：
1. 前测只检验本节课所需的前序知识，3-5 道单选题，每题 4 个选项，正确项不要总在同一位置。
2. 分支先生成可由教师修改的大纲与 generationGuidance，不在此接口生成具体 PPT。每个主要知识锚点最多一个补基础分支和一个拓展分支。
3. 每个分支 90-240 秒；补基础侧重先决概念和具体例子，拓展侧重迁移、边界或开放挑战。
4. 所有 knowledgePointIds 必须来自给定目录。
5. 每个分支必须绑定主课程中的 afterSceneId；beforeSceneId 表示分支结束后回到哪一页。
6. 补基础默认使用 tier-or-low-score，拓展默认使用 tier-and-high-score；阈值与最小剩余时间要明确。
7. generationGuidance 必须给教师一段可编辑的成品生成指导，明确案例类型、难度、讲解顺序、互动方式和应避免的内容。
7. 仅返回 JSON，不要 Markdown。`,
      },
      {
        role: "user",
        content: JSON.stringify({
          course: {
            name: course.name,
            subject: course.subject,
            grade: course.grade,
            summary: course.summary,
            learningObjectives: course.learningObjectives,
            timeBudgetMin: fallback.timeBudgetMin,
          },
          knowledgeCatalog,
          mainScenes,
          output: {
            timeBudgetMin: 8,
            pretest: {
              title: "string",
              introduction: "string",
              estimatedMinutes: 3,
              questions: [{
                id: "string",
                prompt: "string",
                options: ["string", "string", "string", "string"],
                correctOptionIndex: 0,
                rationale: "string",
                knowledgePointIds: ["kp-id"],
              }],
            },
            branches: [{
              id: "string",
              kind: "foundation|extension",
              title: "string",
              objective: "string",
              keyPoints: ["string"],
              anchorKnowledgePointIds: ["kp-id"],
              sceneType: "slide|interactive",
              targetDurationSec: 180,
              generationGuidance: "string",
              trigger: {
                afterSceneId: "main-scene-id",
                beforeSceneId: "next-main-scene-id",
                evidenceRule: "tier|tier-or-low-score|tier-and-high-score",
                scoreThreshold: 70,
                minimumRemainingSec: 180,
              },
            }],
          },
        }),
      },
    ], { jsonMode: true, abortSignal: request.signal });
    const plan = normalizeAdaptiveLearningPlan(
      parseLLMJson<unknown>(response),
      fallback,
    );
    return Response.json({ plan });
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return new Response(null, { status: 499 });
    }
    return Response.json({
      plan: fallback,
      warning: "AI 生成暂不可用，已创建可编辑的基础方案。",
    });
  }
}
