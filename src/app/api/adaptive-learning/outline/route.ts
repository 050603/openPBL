import { callLLM, parseLLMJson } from "@/lib/llm/client";
import {
  ADAPTIVE_LEARNING_GENERATION_POLICY,
  buildAdaptiveLearningGenerationContext,
  createDefaultAdaptiveLearningPlan,
  ensureAdaptiveResourceCoverage,
  evaluateAdaptiveLearningPlanQuality,
  improveAdaptiveLearningPlanQuality,
  normalizeAdaptiveLearningPlan,
} from "@/lib/adaptive-learning";
import { getCourse } from "@/lib/session/server-store";
import { isAuthConfigured, readAuthFromRequest } from "@/lib/auth/session";
import type { KnowledgePoint, OpenMaicSceneOutlineSnapshot } from "@/lib/session/types";
import { JSON_TEACHER_PROMPT_CONTRACT } from "@/lib/prompt-quality/policy";

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
    knowledgeGraph: course.content.knowledgeGraph,
    mainScenes: sourceMainScenes,
  });
  const adaptiveContext = buildAdaptiveLearningGenerationContext({
    knowledgePoints,
    knowledgeGraph: course.content.knowledgeGraph,
    mainScenes: sourceMainScenes,
  });

  try {
    const messages = [
      {
        role: "system",
        content: `${ADAPTIVE_LEARNING_GENERATION_POLICY}
补充约束：
1. 前测只检验会直接影响本节新知识理解的前序知识，优先生成 2-4 道、最多 5 道，合计不超过 5 分钟。只允许单选、判断、匹配，不允许简答；单选每题 4 个选项，正确项不要总在同一位置。
2. 每份资源先生成可由教师修改的大纲与 generationGuidance，不在此接口生成具体 PPT。
3. 资源类型可为 prerequisite（开课前必要回顾）、worked-example（新例题）、application（新应用）或 extension（迁移/边界/开放思考），每份 90-240 秒。
4. anchorKnowledgePointIds 必须来自本课 knowledgeCatalog；前测与 prerequisiteKnowledgePointIds 必须来自本次输出的 prerequisiteKnowledgePoints。
5. 每个被前测题关联的独立先决知识点都必须至少被一份 prerequisite 资源覆盖；一份资源可以覆盖多个紧密相关的先决知识点。prerequisite 使用 placement=before-main-course、evidenceRule=pretest-gap，并列出 prerequisiteKnowledgePointIds；只有前测对应知识答错才插入。
6. worked-example、application、extension 都是可选拓展，不要求覆盖每个模块。只有能明确写出主课未覆盖的新价值时才生成，并通过 assessmentSceneIds 放到学生已掌握其全部依赖知识后的测验之后；相同主题不得重复生成。学生答错只看题目解析，不再次讲授相同内容，只有达到掌握阈值且时间充足才插入。
7. 必须逐页审查 mainScenes。noveltyStatement 要明确说明相对主课新增了什么；mainCourseOverlapSceneIds 列出主题可能重叠、生成时必须避开的主课页。若主课已回顾某个先决知识，prerequisite 应针对前测暴露的具体误解设计诊断案例和新课连接，不得重复主课的完整讲解。
8. generationGuidance 必须明确新案例类型、难度、讲解顺序、互动方式，以及不得复述的主课内容。
9. 每个主课模块测验建议约 3 题；这里只绑定测验，不生成题目。
10. title、introduction、prompt、rationale、objective、keyPoints、noveltyStatement 和 generationGuidance 等自然语言字段必须使用准确的简体中文；枚举代码和内部 ID 只能出现在 schema 指定字段中，不得混入这些自然语言字段。
11. 仅返回 JSON，不要 Markdown。

${JSON_TEACHER_PROMPT_CONTRACT}`,
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
          ...adaptiveContext,
          mainScenes,
          output: {
            timeBudgetMin: 8,
            prerequisiteKnowledgePoints: [{
              id: "prereq-data",
              name: "学生上课前应已掌握的具体知识",
              description: "该知识的课前掌握边界，不得复述本课新授内容",
              keyInfo: "用于生成正确答案和针对性补缺的准确表述",
              relatedIds: ["会因该先决知识缺失而听不懂的本课知识点 id"],
            }],
            pretest: {
              title: "string",
              introduction: "string",
              estimatedMinutes: 3,
              questions: [{
                id: "string",
                type: "single-choice|true-false|matching",
                prompt: "string",
                options: ["string", "string", "string", "string"],
                correctOptionIndex: 0,
                matchingPairs: [{ left: "待匹配项", right: "正确对应项" }],
                rationale: "string",
                knowledgePointIds: ["prerequisite-kp-id"],
              }],
            },
            enrichmentStrategy: {
              recommendedMin: fallback.enrichmentStrategy?.recommendedMin,
              recommendedMax: fallback.enrichmentStrategy?.recommendedMax,
              runtimeMaxPerStudent: fallback.enrichmentStrategy?.runtimeMaxPerStudent,
              summary: "对整门课拓展机会的总体判断",
              decisions: [{
                id: "opportunity-id",
                decision: "selected|rejected",
                title: "具体且唯一的拓展主题",
                valueType: "task-transfer|concept-depth|classic-extension",
                rationale: "相对主课新增什么、为什么值得或不值得占用时间",
                anchorKnowledgePointIds: ["kp-id"],
                afterAssessmentSceneId: "quiz-outline-id",
                branchId: "selected 时对应的 branch id",
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
    ] as const;
    let response = await callLLM([...messages], {
      jsonMode: true,
      abortSignal: request.signal,
      requestClass: "long-generation",
      maxTransientRetries: 1,
    });
    let plan = ensureAdaptiveResourceCoverage(
      improveAdaptiveLearningPlanQuality(
        normalizeAdaptiveLearningPlan(parseLLMJson<unknown>(response), fallback),
        fallback,
        {
          knowledgePoints,
          knowledgeGraph: course.content.knowledgeGraph,
          mainScenes: sourceMainScenes,
        },
      ),
      {
        knowledgePoints,
        knowledgeGraph: course.content.knowledgeGraph,
        mainScenes: sourceMainScenes,
      },
    );
    let quality = evaluateAdaptiveLearningPlanQuality(plan, { knowledgePoints, mainScenes: sourceMainScenes });
    if (!quality.passed) {
      response = await callLLM([
        ...messages,
        {
          role: "assistant",
          content: response,
        },
        {
          role: "user",
          content: `上一次结果未通过完整质量门：${quality.issues.join("；")}。请重新完成两项工作：一是从 mainScenes 逆向分析 1-4 个真正的课外前序知识并形成前测与补缺闭环；二是先对整门课做拓展机会评估，再按建议数量 ${quality.recommendedMin}-${quality.recommendedMax} 选择最有价值且互不重复的综合迁移、概念深化或经典拓展，放在全部依赖知识学完后的最佳测验之后。不得每章凑一个，也不得让内容丰富的课程无理由为零。只返回完整 JSON。`,
        },
      ], {
        jsonMode: true,
        abortSignal: request.signal,
        requestClass: "long-generation",
        maxTransientRetries: 1,
      });
      plan = ensureAdaptiveResourceCoverage(
        improveAdaptiveLearningPlanQuality(
          normalizeAdaptiveLearningPlan(parseLLMJson<unknown>(response), fallback),
          fallback,
          { knowledgePoints, knowledgeGraph: course.content.knowledgeGraph, mainScenes: sourceMainScenes },
        ),
        { knowledgePoints, knowledgeGraph: course.content.knowledgeGraph, mainScenes: sourceMainScenes },
      );
      quality = evaluateAdaptiveLearningPlanQuality(plan, { knowledgePoints, mainScenes: sourceMainScenes });
    }
    if (!quality.passed) {
      return Response.json({
        plan,
        warning: `个性化路径尚未通过质量门：${quality.issues.join("；")}。请重新生成或由教师补充。`,
      });
    }
    return Response.json({
      plan,
      warning: quality.warnings.length
        ? `方案已通过课程级质量底线，另有 ${quality.warnings.length} 项非阻断优化建议：${quality.warnings.join("；")}`
        : undefined,
    });
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return new Response(null, { status: 499 });
    }
    console.error("[adaptive-learning] outline generation failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "unknown failure",
    });
    return Response.json({
      error: "个性化学习路径生成失败，原方案已保留，请稍后重试。",
    }, { status: 503 });
  }
}
