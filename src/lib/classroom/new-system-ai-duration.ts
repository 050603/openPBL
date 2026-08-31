import { callLLM, parseLLMJson } from "@/lib/llm/client";
import { DURABLE_GENERATION_TRANSIENT_RETRIES } from "@/lib/llm/request-policy";
import type { Course, KnowledgeGraph, KnowledgePoint } from "@/lib/session/types";
import type { CourseGenerationMode } from "@/lib/openmaic/types/generation";
import type { GenerationReferenceMaterial } from "@/lib/course-design/generation-references";
import type { NewSystemAiDurationRecommendation } from "@/lib/classroom/new-system-course";

type ModelCall = typeof callLLM;

export type NewSystemAiDurationInput = {
  course: Pick<
    Course,
    | "name"
    | "subject"
    | "grade"
    | "hours"
    | "summary"
    | "learningObjectives"
    | "learnerProfile"
    | "pblConfig"
  >;
  knowledgePoints: readonly KnowledgePoint[];
  knowledgeGraph?: KnowledgeGraph;
  generationMode: CourseGenerationMode;
  teacherBrief: string;
  referenceMaterials?: readonly GenerationReferenceMaterial[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(text).filter(Boolean)
    : [];
}

function finitePositive(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function knowledgePointWeight(
  point: KnowledgePoint,
  graph: KnowledgeGraph | undefined,
): number {
  const levelWeight: Record<NonNullable<KnowledgePoint["level"]>, number> = {
    foundation: 3,
    core: 5,
    application: 6,
    extension: 7,
  };
  const graphNodeIds = new Set([
    point.id,
    ...(graph?.nodes.filter((node) => node.label === point.name).map((node) => node.id) ?? []),
  ]);
  const incidentEdges = graph?.edges.filter(
    (edge) => graphNodeIds.has(edge.source) || graphNodeIds.has(edge.target),
  ).length ?? 0;
  return (point.level ? levelWeight[point.level] : 4) + Math.min(3, incidentEdges * 0.4);
}

export function buildNewSystemAiDurationMessages(input: NewSystemAiDurationInput) {
  const availableMinutes = Math.max(1, Math.round(input.course.hours * 60));
  return [
    {
      role: "system" as const,
      content: `你是 PBL 课程第二阶段“AI 授知”的教学时长规划专家。你只判断：为了让当前学段学生真正理解已确认知识图谱，并完成必要练习与一次达标检测，AI 授知课堂本身需要多少分钟。

关键规则：
1. 教师填写的 ${availableMinutes} 分钟是整节 PBL 课程可用容量的硬上限和排课背景，不是 AI 授知必须用满的目标，也不得套用 35% 或任何固定比例。
2. 根据本课知识点数量、层级、概念抽象度、图谱依赖深度、学生已有基础、例证需求、练习与检测负荷动态判断。不要根据页数反推时间。
3. 每个知识点预算应覆盖必要的讲解、例证、思考或练习；共享讲解只计一次，避免重复和注水。
4. 普通模式只安排教学必要的互动；深度交互模式需给真实操作、观察反馈与修正留出时间，但不得用“点击下一步/查看详情”一类伪互动凑时长。
5. durationMin 必须为整数，至少能够覆盖所有本课知识点，且不得超过 ${availableMinutes}。若内容在上限内无法讲清，应返回上限并在 scopeWarning 说明需要缩减哪些范围，不得擅自增加总时长。
6. knowledgePointId 必须逐项使用输入中已有的精确 ID；每个本课知识点恰好出现一次；各项 durationMin 之和必须等于总 durationMin。

只返回 JSON：{
  "durationMin": 42,
  "rationale": "为什么该时长足以讲清且没有注水",
  "confidence": "low|medium|high",
  "knowledgePointBudgets": [
    { "knowledgePointId": "精确ID", "durationMin": 8, "rationale": "本知识点为何需要这些时间" }
  ],
  "evidence": ["影响时长的可观察依据"],
  "assumptions": ["无法从输入确认但规划时采用的假设"],
  "scopeWarning": "可选；只有容量不足时填写"
}。`,
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        course: {
          name: input.course.name,
          subject: input.course.subject,
          grade: input.course.grade,
          teacherRequestedCourseHours: input.course.hours,
          availableMinutes,
          summary: input.course.summary,
          learningObjectives: input.course.learningObjectives ?? [],
          learnerProfile: input.course.learnerProfile,
          difficultyLevel: input.course.pblConfig?.difficultyLevel,
        },
        teacherBrief: input.teacherBrief,
        generationMode: input.generationMode,
        knowledgePoints: input.knowledgePoints,
        knowledgeGraph: input.knowledgeGraph
          ? { nodes: input.knowledgeGraph.nodes, edges: input.knowledgeGraph.edges }
          : undefined,
        teacherReferenceFiles: input.referenceMaterials?.map((material) => material.fileName) ?? [],
      }),
    },
  ];
}

export function normalizeNewSystemAiDurationRecommendation(
  value: unknown,
  input: NewSystemAiDurationInput,
): NewSystemAiDurationRecommendation {
  const raw = asRecord(value);
  const requestedDuration = finitePositive(raw.durationMin);
  if (!requestedDuration) {
    throw new Error("AI 授知时长判断失败：模型未返回有效的 durationMin。");
  }
  const rationale = text(raw.rationale);
  if (!rationale) {
    throw new Error("AI 授知时长判断失败：模型未说明判断依据。");
  }

  const availableMinutes = Math.max(1, Math.round(input.course.hours * 60));
  const safetyFloor = Math.min(
    availableMinutes,
    Math.max(8, input.knowledgePoints.length * 2),
  );
  const durationMin = Math.min(
    availableMinutes,
    Math.max(safetyFloor, Math.round(requestedDuration)),
  );
  const rawBudgets = Array.isArray(raw.knowledgePointBudgets)
    ? raw.knowledgePointBudgets.map(asRecord)
    : [];
  const budgetById = new Map<string, Record<string, unknown>>();
  rawBudgets.forEach((budget) => {
    const id = text(budget.knowledgePointId);
    if (id && !budgetById.has(id)) budgetById.set(id, budget);
  });
  const knowledgePointBudgets = input.knowledgePoints.map((point) => {
    const budget = budgetById.get(point.id);
    return {
      knowledgePointId: point.id,
      durationMin: finitePositive(budget?.durationMin)
        ?? knowledgePointWeight(point, input.knowledgeGraph),
      rationale: text(budget?.rationale)
        || `${point.level ?? "core"} 层级，并结合其在知识图谱中的依赖关系分配。`,
    };
  });
  const confidenceValue = text(raw.confidence);
  const confidence = confidenceValue === "low" || confidenceValue === "high"
    ? confidenceValue
    : "medium";
  const modelScopeWarning = text(raw.scopeWarning);
  const scopeWarning = requestedDuration > availableMinutes
    ? modelScopeWarning || `模型判断需要约 ${Math.round(requestedDuration)} 分钟，已按教师课程容量压缩至 ${availableMinutes} 分钟，应缩减非核心拓展内容。`
    : modelScopeWarning || undefined;
  const assumptions = textArray(raw.assumptions);
  if (requestedDuration < safetyFloor) {
    assumptions.push(`原始建议低于结构安全下限，已调整为 ${durationMin} 分钟以覆盖全部知识点。`);
  }

  return {
    durationMin,
    rationale,
    confidence,
    knowledgePointBudgets,
    evidence: textArray(raw.evidence).length > 0
      ? textArray(raw.evidence)
      : [
          `${input.knowledgePoints.length} 个本课知识点`,
          `${input.knowledgeGraph?.edges.length ?? 0} 条知识关系`,
          `教师提供的课程容量为 ${availableMinutes} 分钟`,
        ],
    assumptions,
    scopeWarning,
  };
}

export async function generateNewSystemAiDurationRecommendation(
  input: NewSystemAiDurationInput,
  options: { abortSignal?: AbortSignal; modelCall?: ModelCall } = {},
): Promise<NewSystemAiDurationRecommendation> {
  const raw = await (options.modelCall ?? callLLM)(buildNewSystemAiDurationMessages(input), {
    jsonMode: true,
    abortSignal: options.abortSignal,
    requestClass: "long-generation",
    maxTransientRetries: DURABLE_GENERATION_TRANSIENT_RETRIES,
  });
  return normalizeNewSystemAiDurationRecommendation(parseLLMJson<unknown>(raw), input);
}
