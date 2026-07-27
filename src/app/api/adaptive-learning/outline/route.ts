import { callLLM, parseLLMJson } from "@/lib/llm/client";
import {
  createDefaultAdaptiveLearningPlan,
  ensureAdaptiveResourceCoverage,
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
      description: scene.description,
      keyPoints: scene.keyPoints ?? [],
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
        content: `你是课程自适应资源编排设计师。主课程必须完整讲清本节课大纲要求，额外资源只能补充先决知识或提供新的案例、应用、迁移与思考，不得替代主课，也不得重复主课已经讲过的定义、回顾、例题或结论。
约束：
1. 前测只检验会直接影响本节新知识理解的前序知识，最多 5 道单选题；必要时把多个相关先决知识融合进一道情境题。每题 4 个选项，正确项不要总在同一位置。
2. 每份资源先生成可由教师修改的大纲与 generationGuidance，不在此接口生成具体 PPT。
3. 资源类型可为 prerequisite（开课前必要回顾）、worked-example（新例题）、application（新应用）或 extension（迁移/边界/开放思考），每份 90-240 秒。
4. 所有 knowledgePointIds 必须来自给定目录。
5. 每个被前测题关联的独立先决知识点都必须至少被一份 prerequisite 资源覆盖；一份资源可以覆盖多个紧密相关的先决知识点。prerequisite 使用 placement=before-main-course、evidenceRule=pretest-gap，并列出 prerequisiteKnowledgePointIds；只有前测对应知识答错才插入。
6. 每一个主课模块测验都必须至少绑定一份 worked-example、application 或 extension 资源。资源使用 placement=after-module、evidenceRule=module-mastery，通过 assessmentSceneIds 关联模块测验；学生答错只看题目解析，不再次讲授相同内容，只有达到掌握阈值且时间充足才插入。
7. 必须逐页审查 mainScenes。noveltyStatement 要明确说明相对主课新增了什么；mainCourseOverlapSceneIds 列出主题可能重叠、生成时必须避开的主课页。若主课已回顾某个先决知识，prerequisite 应针对前测暴露的具体误解设计诊断案例和新课连接，不得重复主课的完整讲解。
8. generationGuidance 必须明确新案例类型、难度、讲解顺序、互动方式，以及不得复述的主课内容。
9. 每个主课模块测验建议约 3 题；这里只绑定测验，不生成题目。
10. 仅返回 JSON，不要 Markdown。`,
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
              kind: "prerequisite|worked-example|application|extension",
              title: "string",
              objective: "string",
              keyPoints: ["string"],
              anchorKnowledgePointIds: ["kp-id"],
              prerequisiteKnowledgePointIds: ["kp-id"],
              noveltyStatement: "string",
              mainCourseOverlapSceneIds: ["main-scene-id"],
              sceneType: "slide|interactive",
              targetDurationSec: 180,
              generationGuidance: "string",
              trigger: {
                placement: "before-main-course|after-module",
                assessmentSceneIds: ["quiz-outline-id"],
                linkedQuestionIds: [],
                answerRule: "score-at-least",
                evidenceRule: "pretest-gap|module-mastery",
                scoreThreshold: 80,
                minimumRemainingSec: 180,
              },
            }],
          },
        }),
      },
    ], { jsonMode: true, abortSignal: request.signal });
    const plan = ensureAdaptiveResourceCoverage(
      normalizeAdaptiveLearningPlan(
        parseLLMJson<unknown>(response),
        fallback,
      ),
      { knowledgePoints, mainScenes: sourceMainScenes },
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
