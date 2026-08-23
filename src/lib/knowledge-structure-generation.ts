import { callLLM, normalizeKnowledgeGraphOutput, parseLLMJson } from "@/lib/llm/client";
import { buildKnowledgeGraphPrompt } from "@/lib/llm/prompts";
import type { GenerateInput } from "@/lib/llm/types";
import type {
  CourseContent,
  KnowledgeGraph,
  KnowledgeStructureSemanticReview,
} from "@/lib/session/types";
import {
  assessKnowledgeGraphQuality,
  knowledgeStructureSignature,
} from "@/lib/knowledge-graph-quality";
import { deriveCourseEntryPolicy, formatCourseEntryPolicy } from "@/lib/course-entry-policy";
import { DURABLE_GENERATION_TRANSIENT_RETRIES } from "@/lib/llm/request-policy";

type ModelCall = typeof callLLM;

export type KnowledgeStructureGenerationContext = {
  pblOutline?: string;
  teacherRequiredKnowledgePoints?: string[];
};

export type ReviewedKnowledgeStructure = Pick<CourseContent, "knowledgePoints" | "knowledgeGraph"> & {
  revisionCount: number;
};

export function buildKnowledgeStructureAuditMessages(
  input: GenerateInput,
  knowledgePoints: CourseContent["knowledgePoints"],
  knowledgeGraph: KnowledgeGraph,
) {
  const entryPolicy = deriveCourseEntryPolicy({
    hours: input.hours,
    grade: input.grade,
    lessonTargetCount: knowledgePoints.length,
    foundationTargetCount: knowledgePoints.filter((point) => point.level === "foundation").length,
    acceptedPrerequisiteCount: 0,
    courseMode: input.pblConfig?.generationTemplate,
  });
  return [
    {
      role: "system" as const,
      content: `你是课程知识结构流程代理，不参与原图谱生成，也不掌握教师未提供的真实学情。请只依据课程目标、学段、教师输入和当前图谱，检查可以直接观察到的常见明显问题；不要把无法证实的教学取舍或学生实际掌握情况当成阻断错误。
审校规则：
1. 本课目标边界：knowledgePoints 是否准确覆盖课程目标，粒度是否适合学段与课时，masteryBoundary 是否可以观察和评价；是否遗漏关键机制，或混入只需课前回顾的内容。
2. 课程体系先修：本平台主要服务 K12 学生，也覆盖大学学习者；“知识启蒙”不代表课程主题没有知识台阶。先按学段定位，再判断本课目标在完整知识阶梯中的深度，最后反向检查 prerequisite 节点是否有可信的学科依赖、跨学科基础、课程递进或已学基础依据。这里只判断“理应先学”，是否已经掌握由前测判断。年级、learnerProfile 或既往课程信息为空表示未知/未填写，应按 K12 学段待确认审慎分析，不等于无需先修。不得把生活常识、激趣背景、本课新授的简化版本当作先修。
3. 必要性：required-prerequisite + required 必须表示“缺失将直接听不懂或无法完成目标”，仅降低难度或帮助理解只能是 supports + helpful。
4. 递进对应：required-prerequisite 只能从 prerequisite 节点指向 lesson 节点；本课目标之间的支撑、应用、对比或迁移必须使用对应关系类型，方向正确、无伪因果。
5. 对高中自然语言处理，应实质核对人工智能三大基石、机器学习与数据特征—算法选择、训练/验证/测试集、监督学习过程、神经网络结构及应用等前序课程衔接；对计算机视觉若主课直接使用分类器、特征提取、训练或模型评价，也应实质核对人工智能、图像数据与数据集/标注、机器学习、监督学习和数据集划分、特征与算法选择。只接受与当前输入和目标确有必需关系的能力，不得机械凑齐。
6. 入口规模不得使用全局固定数量，必须遵循当前课程动态策略：${formatCourseEntryPolicy(entryPolicy)} 数量不足时沿目标的知识阶梯继续回溯，数量过多时只保留会直接阻断目标的真实先修；不得用常识题、低龄题、术语记忆或本课预习内容凑数。
只返回 JSON：{
  "status": "passed|failed",
  "summary": "string",
  "lessonDecisions": [{ "knowledgePointId": "string", "verdict": "accept|reject", "issues": ["string"] }],
  "prerequisiteDecisions": [{ "nodeId": "string", "verdict": "accept|reject", "issues": ["string"] }],
  "relationshipDecisions": [{ "edgeId": "string", "verdict": "accept|reject", "issues": ["string"] }]
}。任何 reject 或遗漏逐项结论都必须 failed。`,
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        course: {
          name: input.name,
          subject: input.subject,
          grade: input.grade,
          hours: input.hours,
          summary: input.summary,
          learningObjectives: input.learningObjectives ?? [],
          learnerProfile: input.learnerProfile,
        },
        knowledgePoints,
        knowledgeGraph: {
          nodes: knowledgeGraph.nodes,
          edges: knowledgeGraph.edges,
        },
      }),
    },
  ];
}

export function buildKnowledgeStructureRepairMessages(
  input: GenerateInput,
  knowledgePoints: CourseContent["knowledgePoints"],
  knowledgeGraph: KnowledgeGraph,
  review: KnowledgeStructureSemanticReview,
) {
  const entryPolicy = deriveCourseEntryPolicy({
    hours: input.hours,
    grade: input.grade,
    lessonTargetCount: knowledgePoints.length,
    foundationTargetCount: knowledgePoints.filter((point) => point.level === "foundation").length,
    acceptedPrerequisiteCount: 0,
    courseMode: input.pblConfig?.generationTemplate,
  });
  return [
    {
      role: "system" as const,
      content: `你是快速课程设计代理，正在像教师编辑页面一样直接修订当前知识结构。独立审校员已经逐项指出问题；你的任务是修改数据本身，而不是解释、申辩或把问题交给教师。
修订规则：
1. 返回完整的 knowledgePoints 和 knowledgeGraph，不返回补丁或说明文字。
2. 优先保留已通过审校的节点、关系和稳定 ID，只修改 reject 项及其必要的关联项。
3. 若 required-prerequisite 的必要性不足，应按审校意见降级为 supports/helpful；若降级后某先修节点不再具有任何真实的必需先修路径，应删除或用有充分依据的真实先修替换，不能为满足数量机械凑数。
4. 若目标、先修节点或关系被拒绝，应直接增加、删除或重写对应数据，并同步修正相关边。
5. 修订后仍须满足完整性、方向、无环、课程目标覆盖及动态入口策略：${formatCourseEntryPolicy(entryPolicy)}
只返回 JSON：{ "knowledgePoints": [...], "knowledgeGraph": { "nodes": [...], "edges": [...] } }。`,
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        course: {
          name: input.name,
          subject: input.subject,
          grade: input.grade,
          hours: input.hours,
          summary: input.summary,
          learningObjectives: input.learningObjectives ?? [],
          learnerProfile: input.learnerProfile,
        },
        current: { knowledgePoints, knowledgeGraph },
        independentReview: review,
      }),
    },
  ];
}

function parseReview(
  rawValue: string,
  points: CourseContent["knowledgePoints"],
  graph: KnowledgeGraph,
): KnowledgeStructureSemanticReview {
  const raw = parseLLMJson<Record<string, unknown>>(rawValue);
  const lessonDecisions = Array.isArray(raw.lessonDecisions)
    ? raw.lessonDecisions.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const decision = item as Record<string, unknown>;
        if (typeof decision.knowledgePointId !== "string") return [];
        return [{
          knowledgePointId: decision.knowledgePointId,
          verdict: decision.verdict === "accept" ? "accept" as const : "reject" as const,
          issues: Array.isArray(decision.issues)
            ? decision.issues.filter((issue): issue is string => typeof issue === "string" && Boolean(issue.trim()))
            : [],
        }];
      })
    : [];
  const prerequisiteDecisions = Array.isArray(raw.prerequisiteDecisions)
    ? raw.prerequisiteDecisions.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const decision = item as Record<string, unknown>;
        if (typeof decision.nodeId !== "string") return [];
        return [{
          nodeId: decision.nodeId,
          verdict: decision.verdict === "accept" ? "accept" as const : "reject" as const,
          issues: Array.isArray(decision.issues)
            ? decision.issues.filter((issue): issue is string => typeof issue === "string" && Boolean(issue.trim()))
            : [],
        }];
      })
    : [];
  const relationshipDecisions = Array.isArray(raw.relationshipDecisions)
    ? raw.relationshipDecisions.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const decision = item as Record<string, unknown>;
        if (typeof decision.edgeId !== "string") return [];
        return [{
          edgeId: decision.edgeId,
          verdict: decision.verdict === "accept" ? "accept" as const : "reject" as const,
          issues: Array.isArray(decision.issues)
            ? decision.issues.filter((issue): issue is string => typeof issue === "string" && Boolean(issue.trim()))
            : [],
        }];
      })
    : [];
  const prerequisiteIds = graph.nodes
    .filter((node) => node.instructionalRole === "prerequisite")
    .map((node) => node.id);
  const relationshipIds = graph.edges.map((edge) => edge.id);
  const reviewedLessonIds = new Set(lessonDecisions.map((decision) => decision.knowledgePointId));
  const reviewedNodeIds = new Set(prerequisiteDecisions.map((decision) => decision.nodeId));
  const reviewedEdgeIds = new Set(relationshipDecisions.map((decision) => decision.edgeId));
  for (const knowledgePointId of points.map((point) => point.id).filter((id) => !reviewedLessonIds.has(id))) {
    lessonDecisions.push({ knowledgePointId, verdict: "reject", issues: ["审校模型遗漏了该本课目标"] });
  }
  for (const nodeId of prerequisiteIds.filter((id) => !reviewedNodeIds.has(id))) {
    prerequisiteDecisions.push({ nodeId, verdict: "reject", issues: ["审校模型遗漏了该先修节点"] });
  }
  for (const edgeId of relationshipIds.filter((id) => !reviewedEdgeIds.has(id))) {
    relationshipDecisions.push({ edgeId, verdict: "reject", issues: ["审校模型遗漏了该知识关系"] });
  }
  const failed = raw.status !== "passed"
    || lessonDecisions.some((decision) => decision.verdict === "reject")
    || prerequisiteDecisions.some((decision) => decision.verdict === "reject")
    || relationshipDecisions.some((decision) => decision.verdict === "reject");
  return {
    status: failed ? "failed" : "passed",
    summary: typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : failed ? "课程知识结构语义审校未通过" : "课程知识结构语义审校通过",
    sourceSignature: knowledgeStructureSignature(graph, points),
    lessonDecisions,
    prerequisiteDecisions,
    relationshipDecisions,
  };
}

export async function generateReviewedKnowledgeStructure(
  input: GenerateInput,
  context: KnowledgeStructureGenerationContext = {},
  options: { abortSignal?: AbortSignal; modelCall?: ModelCall; maxAttempts?: number } = {},
): Promise<ReviewedKnowledgeStructure> {
  const modelCall = options.modelCall ?? callLLM;
  // Keep semantic corrections inside this stage: one candidate followed by a
  // small number of direct Agent edits. Restarting the durable course job is
  // both slower and less precise than editing the rejected graph in place.
  const maxAttempts = Math.max(1, Math.min(4, options.maxAttempts ?? 4));
  let correction = "";
  let latestIssues: string[] = [];
  let pendingRepair: ReturnType<typeof normalizeKnowledgeGraphOutput> | null = null;
  let pendingRawRepair: Record<string, unknown> | null = null;
  let latestStructurallyValid: ReturnType<typeof normalizeKnowledgeGraphOutput> | null = null;
  const requestRepair = async (
    normalized: ReturnType<typeof normalizeKnowledgeGraphOutput>,
    review: KnowledgeStructureSemanticReview,
  ) => {
    const repairedRaw = await modelCall(
      buildKnowledgeStructureRepairMessages(
        input,
        normalized.knowledgePoints,
        normalized.knowledgeGraph,
        review,
      ),
      {
        jsonMode: true,
        abortSignal: options.abortSignal,
        requestClass: "standard",
        maxTransientRetries: DURABLE_GENERATION_TRANSIENT_RETRIES,
      },
    );
    const repaired = parseLLMJson<Record<string, unknown>>(repairedRaw);
    return normalizeKnowledgeGraphOutput(
      repaired.knowledgePoints,
      repaired.knowledgeGraph,
      context.teacherRequiredKnowledgePoints,
    );
  };
  const requestRawRepair = async (candidate: Record<string, unknown>) => {
    const repairedRaw = await modelCall([
      {
        role: "system",
        content: `你是课程知识结构流程代理。当前生成结果已经存在，但有明显的 JSON 或字段结构错误。请像教师编辑页面一样直接修复当前数据，不要重新设计课程，不要只返回意见。保留可用内容和稳定 ID，只补齐或纠正无法解析、缺失、引用无效或类型错误的字段。只返回包含 knowledgePoints 和 knowledgeGraph 的完整 JSON。`,
      },
      {
        role: "user",
        content: JSON.stringify({
          course: {
            name: input.name,
            subject: input.subject,
            grade: input.grade,
            hours: input.hours,
            learningObjectives: input.learningObjectives ?? [],
          },
          current: candidate,
          issues: latestIssues,
        }),
      },
    ], {
      jsonMode: true,
      abortSignal: options.abortSignal,
      requestClass: "standard",
      maxTransientRetries: DURABLE_GENERATION_TRANSIENT_RETRIES,
    });
    const repaired = parseLLMJson<Record<string, unknown>>(repairedRaw);
    return normalizeKnowledgeGraphOutput(
      repaired.knowledgePoints,
      repaired.knowledgeGraph,
      context.teacherRequiredKnowledgePoints,
    );
  };
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let normalized: ReturnType<typeof normalizeKnowledgeGraphOutput>;
    if (pendingRepair) {
      normalized = pendingRepair;
      pendingRepair = null;
    } else if (pendingRawRepair) {
      const rawCandidate: Record<string, unknown> = pendingRawRepair;
      pendingRawRepair = null;
      try {
        normalized = await requestRawRepair(rawCandidate);
      } catch (error) {
        latestIssues = [
          ...latestIssues,
          error instanceof Error ? error.message : "知识结构编辑 Agent 未返回可解析的完整结构",
        ];
        correction = latestIssues.join("；");
        pendingRawRepair = rawCandidate;
        continue;
      }
    } else {
      const prompt = buildKnowledgeGraphPrompt(input, context);
      const raw = await modelCall([
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: prompt.user,
        },
      ], {
        jsonMode: true,
        abortSignal: options.abortSignal,
        // This produces the complete graph, not merely a verdict. Deep
        // reasoning models need the long structured-generation budget.
        requestClass: "long-generation",
        maxTransientRetries: DURABLE_GENERATION_TRANSIENT_RETRIES,
      });
      const parsed = parseLLMJson<Record<string, unknown>>(raw);
      try {
        normalized = normalizeKnowledgeGraphOutput(
          parsed.knowledgePoints,
          parsed.knowledgeGraph,
          context.teacherRequiredKnowledgePoints,
        );
      } catch (error) {
        latestIssues = [error instanceof Error ? error.message : "知识结构不完整"];
        correction = latestIssues.join("；");
        pendingRawRepair = parsed;
        continue;
      }
    }
    const entryPolicy = deriveCourseEntryPolicy({
      hours: input.hours,
      grade: input.grade,
      lessonTargetCount: normalized.knowledgePoints.length,
      foundationTargetCount: normalized.knowledgePoints.filter((point) => point.level === "foundation").length,
      acceptedPrerequisiteCount: 0,
      courseMode: input.pblConfig?.generationTemplate,
    });
    const structural = assessKnowledgeGraphQuality(
      normalized.knowledgeGraph,
      normalized.knowledgePoints,
      context.teacherRequiredKnowledgePoints,
      {
        objectiveCount: input.learningObjectives?.length ?? 0,
        minimumPrerequisites: entryPolicy.minimumPrerequisites,
        maximumPrerequisites: entryPolicy.maximumPrerequisites,
      },
    );
    if (!structural.ok) {
      latestIssues = structural.issues;
      correction = latestIssues.join("；");
      if (attempt < maxAttempts - 1) {
        const structuralReview: KnowledgeStructureSemanticReview = {
          status: "failed",
          summary: `结构化质量检查发现问题：${correction}`,
          sourceSignature: knowledgeStructureSignature(normalized.knowledgeGraph, normalized.knowledgePoints),
          lessonDecisions: normalized.knowledgePoints.map((point) => ({ knowledgePointId: point.id, verdict: "accept", issues: [] })),
          prerequisiteDecisions: normalized.knowledgeGraph.nodes
            .filter((node) => node.instructionalRole === "prerequisite")
            .map((node) => ({ nodeId: node.id, verdict: "accept", issues: [] })),
          relationshipDecisions: normalized.knowledgeGraph.edges
            .map((edge) => ({ edgeId: edge.id, verdict: "accept", issues: [] })),
        };
        try {
          pendingRepair = await requestRepair(normalized, structuralReview);
        } catch (error) {
          latestIssues = [
            ...latestIssues,
            error instanceof Error ? error.message : "代理修订后的知识结构不完整",
          ];
          correction = latestIssues.join("；");
          // Keep retrying the editor against the same candidate. A failed edit
          // call must not send review feedback back to the original producer.
          pendingRepair = normalized;
        }
      }
      continue;
    }
    latestStructurallyValid = normalized;
    const rawReview = await modelCall(
      buildKnowledgeStructureAuditMessages(input, normalized.knowledgePoints, normalized.knowledgeGraph),
      {
        jsonMode: true,
        abortSignal: options.abortSignal,
        requestClass: "quality-review",
        maxTransientRetries: DURABLE_GENERATION_TRANSIENT_RETRIES,
      },
    );
    const review = parseReview(rawReview, normalized.knowledgePoints, normalized.knowledgeGraph);
    if (review.status === "failed") {
      latestIssues = [
        review.summary,
        ...review.lessonDecisions.flatMap((decision) => decision.issues),
        ...review.prerequisiteDecisions.flatMap((decision) => decision.issues),
        ...review.relationshipDecisions.flatMap((decision) => decision.issues),
      ].filter(Boolean);
      correction = latestIssues.join("；");
      if (attempt < maxAttempts - 1) {
        try {
          pendingRepair = await requestRepair(normalized, review);
        } catch (error) {
          latestIssues = [
            ...latestIssues,
            error instanceof Error ? error.message : "代理修订后的知识结构不完整",
          ];
          correction = latestIssues.join("；");
          pendingRepair = normalized;
        }
      }
      continue;
    }
    normalized.knowledgeGraph.semanticReview = review;
    return { ...normalized, revisionCount: attempt };
  }
  if (latestStructurallyValid) {
    const graph = latestStructurallyValid.knowledgeGraph;
    graph.semanticReview = {
      status: "passed",
      summary: "确定性知识结构检查已通过；Agent 尚有不阻断后续生成的建议。",
      advisoryIssues: latestIssues,
      sourceSignature: knowledgeStructureSignature(graph, latestStructurallyValid.knowledgePoints),
      lessonDecisions: latestStructurallyValid.knowledgePoints.map((point) => ({ knowledgePointId: point.id, verdict: "accept", issues: [] })),
      prerequisiteDecisions: graph.nodes
        .filter((node) => node.instructionalRole === "prerequisite")
        .map((node) => ({ nodeId: node.id, verdict: "accept", issues: [] })),
      relationshipDecisions: graph.edges.map((edge) => ({ edgeId: edge.id, verdict: "accept", issues: [] })),
    };
    return { ...latestStructurallyValid, revisionCount: maxAttempts - 1 };
  }
  throw new Error(`目标与知识结构无法通过独立审校：${latestIssues.join("；") || "模型未返回可采用结构"}`);
}
