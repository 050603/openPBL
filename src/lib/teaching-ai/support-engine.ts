import type {
  ActivityRecord,
  AiSupportRecord,
  Course,
  CourseUpload,
  ProjectGroup,
  WorkPlanItem,
} from "@/lib/session/types";
import { callLLM, isLlmReady, parseLLMJson } from "@/lib/llm/client";

export type AiSupportDraft = Omit<
  AiSupportRecord,
  "id" | "courseId" | "createdAt" | "updatedAt" | "studentId" | "studentName"
> & {
  studentId?: string;
  studentName?: string;
};

export type TeacherInterventionSignal = {
  groupId: string;
  groupName: string;
  riskLevel: "high" | "medium" | "low";
  reasons: string[];
  evidence: string[];
  supportCard: string;
};

export type ArtifactFocus = "steps" | "evidence" | "risk" | "overall";

const PLACEHOLDER_TOPICS = new Set(["待确定选题方向", "待确定", ""]);

// ============================================================
// 第一部分：LLM 调用辅助函数
// ============================================================

/**
 * 调用 LLM 生成结构化 JSON 结果。
 * - LLM 不可用或调用失败时返回 null（由调用方走本地兜底）
 * - 统一使用系统 LLM 配置（ai-settings.json / server-providers.yml / env）
 */
async function callLLMForJson<T = unknown>(
  systemPrompt: string,
  userPrompt: string,
  opts: { abortSignal?: AbortSignal } = {},
): Promise<T | null> {
  if (!(await isLlmReady())) return null;
  try {
    const text = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { jsonMode: true, abortSignal: opts.abortSignal },
    );
    return parseLLMJson<T>(text);
  } catch (err) {
    console.warn("[support-engine] LLM 调用失败，回退到本地规则：", err);
    return null;
  }
}

const SYSTEM_PREAMBLE = `你是一名资深的 PBL（项目式学习）教学支架专家，擅长基于学生当前的项目进度给出具体、可执行、可验证的改进建议。
请始终以严格 JSON 形式返回结果，不要包含任何额外说明文字。
所有建议必须基于学生实际填写的内容，避免空话套话，每条建议应能被学生立即执行并验证。`;

// ============================================================
// 第二部分：小组构思诊断（阶段三）
// ============================================================

/**
 * 诊断小组构思方案（异步版，LLM 优先 + 本地兜底）。
 * 用于阶段三"小组构思"和阶段四"方案汇报与纠偏"。
 */
export async function diagnoseGroupIdea(input: {
  course: Course;
  group: ProjectGroup;
  tasks: WorkPlanItem[];
}): Promise<AiSupportDraft> {
  const { course, group, tasks } = input;
  const localDraft = diagnoseGroupIdeaLocal(input);

  const llmResult = await callLLMForJson<{
    diagnosis: string;
    suggestions: string[];
    evidence: string[];
  }>(
    SYSTEM_PREAMBLE,
    `请诊断以下小组的项目构思方案，给出诊断结论、3-5 条具体建议和依据。

课程名称：${course.name}
驱动问题：${course.drivingQuestion || "（无）"}
小组名称：${group.name}
选题：${group.topic || "未填写"}
项目目标：${group.goal || "未填写"}
成果形式：${group.selectedForms.join("、") || "未选择"}
小组成员：${group.members.map((m) => `${m.name}（${m.role ?? "成员"}）`).join("、")}
任务分工：
${tasks.map((t) => `- ${t.memberName ?? "未指派"}（${t.role ?? "成员"}）：${t.task}，进度 ${t.progress}%`).join("\n") || "（暂无任务）"}

要求：
1. diagnosis：1-2 句话判断方案成熟度（高/中/低），指出最关键的卡点
2. suggestions：3-5 条可立即执行的建议，每条聚焦一个改进点（选题/目标/成果/分工/证据/AI使用计划）
3. evidence：列出诊断依据，引用学生实际填写的内容

仅返回 JSON：{ "diagnosis": "string", "suggestions": ["string"], "evidence": ["string"] }`,
  );

  if (llmResult && llmResult.diagnosis) {
    return {
      ...localDraft,
      diagnosis: llmResult.diagnosis,
      suggestions: llmResult.suggestions?.slice(0, 5) ?? localDraft.suggestions,
      evidence: llmResult.evidence?.slice(0, 5) ?? localDraft.evidence,
      source: "llm",
    };
  }
  return { ...localDraft, source: "local" };
}

// ============================================================
// 第三部分：项目作品诊断（阶段五）
// ============================================================

/**
 * 诊断项目作品（异步版，LLM 优先 + 本地兜底）。
 * 用于阶段五"项目制作与 AI 实时支架"。
 */
export async function diagnoseProjectArtifact(input: {
  course: Course;
  group: ProjectGroup;
  stageKey: string;
  documentHtml: string;
  uploads: CourseUpload[];
  tasks: WorkPlanItem[];
  focus?: ArtifactFocus;
}): Promise<AiSupportDraft> {
  const { course, group, stageKey, documentHtml, uploads, tasks, focus = "overall" } = input;
  const localDraft = diagnoseProjectArtifactLocal(input);

  const focusText = focusLabel(focus);
  const documentText = plainText(documentHtml).slice(0, 4000); // 截断避免超长

  const llmResult = await callLLMForJson<{
    diagnosis: string;
    suggestions: string[];
    evidence: string[];
  }>(
    SYSTEM_PREAMBLE,
    `请诊断以下小组的项目作品文档，聚焦"${focusText}"维度，给出诊断结论、3-5 条具体建议和依据。

课程名称：${course.name}
驱动问题：${course.drivingQuestion || "（无）"}
小组名称：${group.name}
选题：${group.topic || "未填写"}
当前聚焦：${focusText}
文档字数：约 ${plainText(documentHtml).length} 字
已上传材料：${uploads.map((u) => `${u.title}（${u.fileType}）`).join("、") || "无"}
任务进度：
${tasks.map((t) => `- ${t.memberName ?? "未指派"}：${t.task}（${t.progress}%）`).join("\n") || "（暂无任务）"}

文档内容（截断到 4000 字）：
${documentText}

要求：
1. diagnosis：1-2 句话判断作品当前可推进度，指出最关键的缺口
2. suggestions：3-5 条可立即执行的建议，聚焦"${focusText}"维度
3. evidence：列出诊断依据，引用文档实际内容

仅返回 JSON：{ "diagnosis": "string", "suggestions": ["string"], "evidence": ["string"] }`,
  );

  if (llmResult && llmResult.diagnosis) {
    return {
      ...localDraft,
      diagnosis: llmResult.diagnosis,
      suggestions: llmResult.suggestions?.slice(0, 5) ?? localDraft.suggestions,
      evidence: llmResult.evidence?.slice(0, 5) ?? localDraft.evidence,
      source: "llm",
    };
  }
  return { ...localDraft, source: "local" };
}

// ============================================================
// 第四部分：汇报教练（阶段六）
// ============================================================

/**
 * 构建汇报教练建议（异步版，LLM 优先 + 本地兜底）。
 * 用于阶段六"最终汇报展示"。
 */
export async function buildShowcaseCoach(input: {
  course: Course;
  group: ProjectGroup;
  uploads: CourseUpload[];
  activities: ActivityRecord[];
  aiSupports: AiSupportRecord[];
}): Promise<AiSupportDraft> {
  const { course, group, uploads, activities, aiSupports } = input;
  const localDraft = buildShowcaseCoachLocal(input);

  const llmResult = await callLLMForJson<{
    diagnosis: string;
    suggestions: string[];
    evidence: string[];
  }>(
    SYSTEM_PREAMBLE,
    `请为以下小组的最终汇报给出教练建议，覆盖作品质量、过程证据、AI 使用边界和小组贡献。

课程名称：${course.name}
小组名称：${group.name}
选题：${group.topic || "未填写"}
项目目标：${group.goal || "未填写"}
已上传材料：${uploads.map((u) => `${u.title}（${u.fileType}）`).join("、") || "无"}
过程活动记录：${activities.length} 条
AI 支架记录：${aiSupports.length} 条（已采纳 ${aiSupports.filter((s) => s.status === "student-applied").length} 条）

要求：
1. diagnosis：1-2 句话判断汇报准备度，指出最需要补强的环节
2. suggestions：3-5 条汇报准备建议，每条可立即执行（如"准备 6-8 页汇报稿，按问题证据→方案设计→验证过程→反思改进组织"）
3. evidence：列出建议依据，引用小组已有材料

仅返回 JSON：{ "diagnosis": "string", "suggestions": ["string"], "evidence": ["string"] }`,
  );

  if (llmResult && llmResult.diagnosis) {
    return {
      ...localDraft,
      diagnosis: llmResult.diagnosis,
      suggestions: llmResult.suggestions?.slice(0, 5) ?? localDraft.suggestions,
      evidence: llmResult.evidence?.slice(0, 5) ?? localDraft.evidence,
      source: "llm",
    };
  }
  return { ...localDraft, source: "local" };
}

// ============================================================
// 第五部分：反思证据提示（阶段七）
// ============================================================

/**
 * 构建反思证据提示（异步版，LLM 优先 + 本地兜底）。
 * 用于阶段七"综合评价与反思"。
 */
export async function buildReflectionEvidencePrompts(input: {
  course: Course;
  group?: ProjectGroup;
  studentId: string;
}): Promise<AiSupportDraft> {
  const { course, group, studentId } = input;
  const localDraft = buildReflectionEvidencePromptsLocal(input);

  const student = course.students.find((item) => item.id === studentId);
  const supports = (course.aiSupports ?? []).filter(
    (item) => item.studentId === studentId || (group && item.groupId === group.id),
  );
  const uploads = (course.uploads ?? []).filter(
    (item) => item.studentId === studentId || (group && item.groupId === group.id),
  );

  const llmResult = await callLLMForJson<{
    diagnosis: string;
    suggestions: string[];
    evidence: string[];
  }>(
    SYSTEM_PREAMBLE,
    `请为以下学生生成反思证据提示，引导学生基于过程证据进行反思，而不是泛泛描述感受。

课程名称：${course.name}
学生姓名：${student?.name ?? studentId}
所属小组：${group?.name ?? "（未分组）"}
选题：${group?.topic ?? "（无）"}
AI 支架记录：${supports.length} 条
  - 已采纳：${supports.filter((s) => s.status === "student-applied").length} 条
  - 未采纳：${supports.filter((s) => s.status !== "student-applied" && s.status !== "dismissed").length} 条
已上传材料：${uploads.length} 个
  - 证据类：${uploads.filter((u) => u.category === "evidence").length} 个

最近的 AI 支架记录：
${supports.slice(-3).map((s) => `- [${s.kind}] ${s.trigger}：${s.diagnosis}`).join("\n") || "（无）"}

要求：
1. diagnosis：1-2 句话指出该学生反思应聚焦的证据类型
2. suggestions：3-5 条反思提示，每条引导学生引用具体的过程证据（如"选择一条你们采纳过的 AI 建议，写清它解决了什么问题以及你们如何验证它"）
3. evidence：列出可引用的过程证据

仅返回 JSON：{ "diagnosis": "string", "suggestions": ["string"], "evidence": ["string"] }`,
  );

  if (llmResult && llmResult.diagnosis) {
    return {
      ...localDraft,
      diagnosis: llmResult.diagnosis,
      suggestions: llmResult.suggestions?.slice(0, 5) ?? localDraft.suggestions,
      evidence: llmResult.evidence?.slice(0, 5) ?? localDraft.evidence,
      source: "llm",
    };
  }
  return { ...localDraft, source: "local" };
}

// ============================================================
// 第六部分：教师干预信号（全阶段，教师监控面板）
// ============================================================

/**
 * 构建教师干预信号（异步版，LLM 优先 + 本地兜底）。
 * 用于教师监控面板"AI 构思质量雷达"和"AI 实时干预建议"。
 *
 * 注意：本函数对每个小组分别调用 LLM 可能成本过高，
 * 这里采用批量方式：让 LLM 一次分析所有小组。
 */
export async function buildTeacherInterventionSignals(
  course: Course,
  stageKey: string,
): Promise<TeacherInterventionSignal[]> {
  const localSignals = buildTeacherInterventionSignalsLocal(course, stageKey);

  // 如果没有小组，直接返回空数组
  if (!course.groups?.length) return [];

  const llmResult = await callLLMForJson<{
    groups: Array<{
      groupId: string;
      riskLevel: "high" | "medium" | "low";
      reasons: string[];
      evidence: string[];
      supportCard: string;
    }>;
  }>(
    SYSTEM_PREAMBLE,
    `请分析以下课程所有小组的当前状态，识别需要教师干预的小组，并给出干预建议。

课程名称：${course.name}
驱动问题：${course.drivingQuestion || "（无）"}
当前阶段：${stageKey}

小组列表：
${course.groups.map((g) => {
  const groupTasks = (course.workPlan ?? []).filter((task) => task.groupId === g.id);
  const groupUploads = (course.uploads ?? []).filter((upload) => upload.groupId === g.id);
  const groupSupports = (course.aiSupports ?? []).filter((support) => support.groupId === g.id);
  const progress = averageGroupProgress(course, g, stageKey);
  return `小组 ${g.id} - ${g.name}：
  - 选题：${g.topic || "未填写"}
  - 目标：${g.goal || "未填写"}
  - 成果形式：${g.selectedForms.join("、") || "未选择"}
  - 成员：${g.members.map((m) => m.name).join("、")}
  - 任务数：${groupTasks.length}（覆盖 ${new Set(groupTasks.map((t) => t.memberName).filter(Boolean)).size} 人）
  - 上传材料：${groupUploads.length} 个
  - AI 支架记录：${groupSupports.length} 条（已采纳 ${groupSupports.filter((s) => s.status === "student-applied").length}）
  - 阶段进度：${progress}%`;
}).join("\n\n")}

要求：
1. 仅返回 riskLevel 为 high 或 medium 的小组（low 的小组不需要教师干预）
2. reasons：1-3 条干预理由（如"选题偏离驱动问题""进度偏低""AI 建议多次未采纳"）
3. evidence：引用小组实际数据作为依据
4. supportCard：1-2 句具体的教师干预建议（如"建议教师先确认卡点：选题偏离；再要求小组在 10 分钟内提交一个可检查的小产出"）

仅返回 JSON：{ "groups": [{ "groupId": "string", "riskLevel": "high"|"medium"|"low", "reasons": ["string"], "evidence": ["string"], "supportCard": "string" }] }`,
  );

  if (llmResult?.groups?.length) {
    // 将 LLM 结果与本地小组信息合并（保留 groupId 和 groupName 的对应关系）
    const groupMap = new Map(course.groups.map((g) => [g.id, g]));
    return llmResult.groups
      .filter((item) => item.riskLevel !== "low" && groupMap.has(item.groupId))
      .map((item) => {
        const group = groupMap.get(item.groupId)!;
        return {
          groupId: item.groupId,
          groupName: group.name,
          riskLevel: item.riskLevel,
          reasons: item.reasons?.slice(0, 3) ?? [],
          evidence: item.evidence?.slice(0, 3) ?? [],
          supportCard: item.supportCard ?? "",
        };
      })
      .sort((a, b) => riskWeight(b.riskLevel) - riskWeight(a.riskLevel));
  }
  return localSignals;
}

// ============================================================
// 第七部分：新增场景 - 阶段一项目骨架生成
// ============================================================

/**
 * AI 生成项目骨架（阶段一：项目启动）。
 * 教师在 prepare/new 页面点击"AI 生成项目骨架"按钮时调用。
 *
 * 输出：3-5 个驱动问题候选、情境故事、成果形式建议、评价量规草案
 */
export async function generateProjectSkeleton(input: {
  courseName: string;
  subject: string;
  grade: string;
  hours: number;
  summary?: string;
  initialDrivingQuestion?: string;
}): Promise<{
  drivingQuestions: string[];
  scenario: string;
  suggestedForms: string[];
  evaluationDimensions: Array<{ name: string; weight: number; description: string }>;
  source: "llm" | "local";
}> {
  const localSkeleton = generateProjectSkeletonLocal(input);

  const llmResult = await callLLMForJson<{
    drivingQuestions: string[];
    scenario: string;
    suggestedForms: string[];
    evaluationDimensions: Array<{ name: string; weight: number; description: string }>;
  }>(
    SYSTEM_PREAMBLE,
    `请基于以下课程信息，生成项目骨架，帮助教师快速启动 PBL 项目。

课程名称：${input.courseName}
学科：${input.subject}
年级：${input.grade}
课时：${input.hours} 课时
课程简介：${input.summary || "（无）"}
教师初步想法：${input.initialDrivingQuestion || "（无，请基于课程名称与简介推断）"}

要求：
1. drivingQuestions：3-5 个候选驱动问题，每个问题应能激发学生探究，与学科和年级匹配
2. scenario：1 段 100-200 字的情境故事，将驱动问题嵌入真实校园场景
3. suggestedForms：3-5 个建议的成果形式（如"调研报告""科普海报""微视频""校园应用方案"）
4. evaluationDimensions：4-6 个评价维度，权重合计 100%，每个维度附简短描述

仅返回 JSON：{ "drivingQuestions": ["string"], "scenario": "string", "suggestedForms": ["string"], "evaluationDimensions": [{ "name": "string", "weight": 20, "description": "string" }] }`,
  );

  if (llmResult?.drivingQuestions?.length) {
    return {
      drivingQuestions: llmResult.drivingQuestions.slice(0, 5),
      scenario: llmResult.scenario ?? localSkeleton.scenario,
      suggestedForms: llmResult.suggestedForms?.slice(0, 5) ?? localSkeleton.suggestedForms,
      evaluationDimensions:
        llmResult.evaluationDimensions?.slice(0, 6) ?? localSkeleton.evaluationDimensions,
      source: "llm",
    };
  }
  return { ...localSkeleton, source: "local" };
}

// ============================================================
// 第八部分：新增场景 - 阶段四方案诊断摘要（教师端）
// ============================================================

/**
 * 教师端方案诊断摘要（阶段四：方案汇报与纠偏）。
 * 教师点击"AI 方案诊断"按钮时调用，批量分析所有小组的方案。
 */
export async function diagnoseAllProposals(input: {
  course: Course;
}): Promise<Array<{
  groupId: string;
  groupName: string;
  topic: string;
  diagnosis: string;
  risks: string[];
  suggestedQuestions: string[];
  source: "llm" | "local";
}>> {
  const { course } = input;
  const groups = course.groups ?? [];

  if (!groups.length) return [];

  const llmResult = await callLLMForJson<{
    groups: Array<{
      groupId: string;
      diagnosis: string;
      risks: string[];
      suggestedQuestions: string[];
    }>;
  }>(
    SYSTEM_PREAMBLE,
    `请批量分析以下课程所有小组的项目方案，为每组生成诊断摘要、风险点和建议追问问题。

课程名称：${course.name}
驱动问题：${course.drivingQuestion || "（无）"}

小组方案：
${groups.map((g) => {
  const submission = (course.submissions ?? []).find(
    (s) => s.groupId === g.id && s.type === "document",
  );
  const documentText = submission?.content
    ? plainText(submission.content).slice(0, 800)
    : "（未提交方案文档）";
  return `小组 ${g.id} - ${g.name}：
  选题：${g.topic || "未填写"}
  目标：${g.goal || "未填写"}
  成果形式：${g.selectedForms.join("、") || "未选择"}
  方案文档（截断到 800 字）：${documentText}`;
}).join("\n\n")}

要求：
1. 为每个小组生成 diagnosis（1-2 句话诊断方案完整性）
2. risks：1-3 个风险点（如"证据来源不明确""AI 使用边界不清""分工不均衡"）
3. suggestedQuestions：2-3 个教师可在汇报时追问的问题

仅返回 JSON：{ "groups": [{ "groupId": "string", "diagnosis": "string", "risks": ["string"], "suggestedQuestions": ["string"] }] }`,
  );

  if (llmResult?.groups?.length) {
    const groupMap = new Map(groups.map((g) => [g.id, g]));
    return llmResult.groups
      .filter((item) => groupMap.has(item.groupId))
      .map((item) => {
        const group = groupMap.get(item.groupId)!;
        return {
          groupId: item.groupId,
          groupName: group.name,
          topic: group.topic,
          diagnosis: item.diagnosis ?? "方案诊断暂无",
          risks: item.risks?.slice(0, 3) ?? [],
          suggestedQuestions: item.suggestedQuestions?.slice(0, 3) ?? [],
          source: "llm" as const,
        };
      });
  }

  // 本地兜底：基于规则快速生成
  return groups.map((group) => {
    const submission = (course.submissions ?? []).find(
      (s) => s.groupId === group.id && s.type === "document",
    );
    const text = submission?.content ? plainText(submission.content) : "";
    const risks: string[] = [];
    if (!isMeaningful(group.topic)) risks.push("选题未明确");
    if (text.length < 120) risks.push("方案文档内容过少");
    if (!mentionsAny(text, ["数据", "调研", "证据", "样本"])) risks.push("缺少证据来源");
    if (!mentionsAny(text, ["AI", "人工智能", "模型"])) risks.push("未说明 AI 使用计划");
    return {
      groupId: group.id,
      groupName: group.name,
      topic: group.topic,
      diagnosis:
        risks.length === 0
          ? "方案已具备基本结构，可在汇报中聚焦证据质量。"
          : `方案存在 ${risks.length} 个待补强环节。`,
      risks: risks.slice(0, 3),
      suggestedQuestions: [
        "你们要解决的核心问题是什么？",
        "证据从哪里来？样本有多少？",
        "AI 在项目中帮了什么忙？你们修改了 AI 的哪些建议？",
      ],
      source: "local" as const,
    };
  });
}

// ============================================================
// 第九部分：新增场景 - 阶段七过程性评价报告（教师端）
// ============================================================

/**
 * 教师端 AI 过程性评价报告（阶段七：综合评价与反思）。
 * 教师点击"AI 生成过程评价"按钮时调用。
 */
export async function generateProcessEvaluation(input: {
  course: Course;
  groupId?: string;
}): Promise<{
  summary: string;
  dimensions: Array<{ name: string; score: number; evidence: string[] }>;
  highlights: string[];
  improvements: string[];
  source: "llm" | "local";
}> {
  const { course, groupId } = input;
  const targetGroups = groupId
    ? (course.groups ?? []).filter((g) => g.id === groupId)
    : (course.groups ?? []);

  const targetStudents = targetGroups.flatMap((g) => g.members);
  const studentIds = new Set(targetStudents.map((m) => m.studentId));

  const supports = (course.aiSupports ?? []).filter(
    (s) => !groupId || s.groupId === groupId,
  );
  const activities = (course.activityLog ?? []).filter(
    (a) => !groupId || true, // 活动日志不按小组过滤（活动可能不含 groupId）
  );
  const uploads = (course.uploads ?? []).filter(
    (u) => !groupId || u.groupId === groupId,
  );
  const submissions = (course.submissions ?? []).filter(
    (s) => !groupId || s.groupId === groupId,
  );

  const llmResult = await callLLMForJson<{
    summary: string;
    dimensions: Array<{ name: string; score: number; evidence: string[] }>;
    highlights: string[];
    improvements: string[];
  }>(
    SYSTEM_PREAMBLE,
    `请基于以下过程数据，生成过程性评价报告。

课程名称：${course.name}
评价范围：${groupId ? `单个小组（${targetGroups[0]?.name ?? ""}）` : `全班（${targetGroups.length} 个小组）`}
学生数：${studentIds.size}

过程数据：
- AI 支架记录：${supports.length} 条
  - 已采纳：${supports.filter((s) => s.status === "student-applied").length} 条
  - 未采纳：${supports.filter((s) => s.status !== "student-applied" && s.status !== "dismissed").length} 条
- 活动记录：${activities.length} 条
- 上传材料：${uploads.length} 个（证据类 ${uploads.filter((u) => u.category === "evidence").length}）
- 提交记录：${submissions.length} 条

各小组进度：
${targetGroups.map((g) => {
  const progress = averageGroupProgress(course, g, "reflection");
  const groupSupports = supports.filter((s) => s.groupId === g.id);
  return `- ${g.name}：阶段进度 ${progress}%，AI 支架 ${groupSupports.length} 条`;
}).join("\n")}

最近的 AI 支架记录（用于评估学生 AI 使用判断力）：
${supports.slice(-5).map((s) => `- [${s.kind}] ${s.trigger}：${s.diagnosis}（${s.status}）`).join("\n") || "（无）"}

要求：
1. summary：1 段 100-200 字的过程性评价总结
2. dimensions：4 个评价维度（学习轨迹/任务完成/修改次数/AI 使用判断/过程参与度中选 4 个），每维度给 0-100 分和证据
3. highlights：2-3 条过程亮点
4. improvements：2-3 条改进建议

仅返回 JSON：{ "summary": "string", "dimensions": [{ "name": "string", "score": 80, "evidence": ["string"] }], "highlights": ["string"], "improvements": ["string"] }`,
  );

  if (llmResult?.summary) {
    return {
      summary: llmResult.summary,
      dimensions: llmResult.dimensions?.slice(0, 5) ?? [],
      highlights: llmResult.highlights?.slice(0, 3) ?? [],
      improvements: llmResult.improvements?.slice(0, 3) ?? [],
      source: "llm",
    };
  }

  // 本地兜底
  const adoptionRate = supports.length > 0
    ? Math.round((supports.filter((s) => s.status === "student-applied").length / supports.length) * 100)
    : 0;
  return {
    summary: `本${groupId ? "组" : "班"}共产生 ${supports.length} 条 AI 支架记录，采纳率 ${adoptionRate}%；上传材料 ${uploads.length} 个，提交记录 ${submissions.length} 条。`,
    dimensions: [
      {
        name: "学习轨迹",
        score: Math.min(100, activities.length * 5),
        evidence: [`${activities.length} 条活动记录`],
      },
      {
        name: "任务完成",
        score: Math.min(100, submissions.length * 15),
        evidence: [`${submissions.length} 条提交记录`],
      },
      {
        name: "AI 使用判断",
        score: adoptionRate,
        evidence: [`采纳率 ${adoptionRate}%`, `${supports.length} 条 AI 支架记录`],
      },
      {
        name: "过程参与",
        score: Math.min(100, uploads.length * 10),
        evidence: [`${uploads.length} 个上传材料`],
      },
    ],
    highlights: [`累计 ${activities.length} 条活动记录`, `上传 ${uploads.length} 个材料`],
    improvements: [
      adoptionRate < 50 ? "AI 建议采纳率偏低，建议引导学生选择性采纳" : "AI 使用判断良好",
      "建议在汇报中展示完整的过程证据链",
    ],
    source: "local",
  };
}

// ============================================================
// 第十部分：新增场景 - 阶段六实时汇报评价（教师端）
// ============================================================

/**
 * 教师端 AI 实时汇报评价（阶段六：最终汇报展示）。
 * 教师点击"AI 实时评价"按钮时调用，基于学生汇报材料生成 4 维度评分建议。
 */
export async function generateLiveEvaluation(input: {
  course: Course;
  group: ProjectGroup;
  teacherNotes?: string;
}): Promise<{
  dimensions: Array<{ name: string; suggestedScore: number; rationale: string }>;
  overallComment: string;
  source: "llm" | "local";
}> {
  const { course, group, teacherNotes } = input;
  const uploads = (course.uploads ?? []).filter((u) => u.groupId === group.id);
  const submission = (course.submissions ?? []).find(
    (s) => s.groupId === group.id && s.type === "document",
  );
  const documentText = submission?.content ? plainText(submission.content).slice(0, 2000) : "";

  const llmResult = await callLLMForJson<{
    dimensions: Array<{ name: string; suggestedScore: number; rationale: string }>;
    overallComment: string;
  }>(
    SYSTEM_PREAMBLE,
    `请为以下小组的最终汇报生成实时评价建议，覆盖 4 个维度。

课程名称：${course.name}
小组名称：${group.name}
选题：${group.topic || "未填写"}
项目目标：${group.goal || "未填写"}

小组材料：
- 上传文件：${uploads.map((u) => `${u.title}（${u.fileType}）`).join("、") || "无"}
- 方案文档（截断到 2000 字）：${documentText || "无"}

教师现场速记：${teacherNotes || "（无）"}

要求：
1. dimensions：4 个维度评分建议（0-100 分）
   - 知识准确性：AI 知识运用是否准确
   - 项目完整性：方案是否完整、有证据链
   - 表达展示：汇报结构、清晰度
   - 价值反思：对 AI 使用的反思和判断
2. rationale：每维度 1 句话评分理由
3. overallComment：1 段 50-100 字总体评价

仅返回 JSON：{ "dimensions": [{ "name": "string", "suggestedScore": 80, "rationale": "string" }], "overallComment": "string" }`,
  );

  if (llmResult?.dimensions?.length) {
    return {
      dimensions: llmResult.dimensions.slice(0, 4),
      overallComment: llmResult.overallComment ?? "",
      source: "llm",
    };
  }

  // 本地兜底
  const hasReport = uploads.some((u) => u.title.includes("报告") || u.fileType === "PDF");
  const hasPresentation = uploads.some((u) => u.fileType === "PPTX" || u.title.includes("PPT"));
  const evidenceCount = uploads.filter((u) => u.category === "evidence").length;
  return {
    dimensions: [
      {
        name: "知识准确性",
        suggestedScore: documentText.includes("AI") ? 75 : 60,
        rationale: documentText.includes("AI") ? "方案中涉及 AI 知识运用" : "方案中 AI 知识体现不足",
      },
      {
        name: "项目完整性",
        suggestedScore: hasReport ? 75 : 55,
        rationale: hasReport ? "已提交研究报告" : "缺少研究报告",
      },
      {
        name: "表达展示",
        suggestedScore: hasPresentation ? 75 : 55,
        rationale: hasPresentation ? "已准备 PPT" : "未准备 PPT",
      },
      {
        name: "价值反思",
        suggestedScore: evidenceCount > 0 ? 70 : 55,
        rationale: evidenceCount > 0 ? "有过程证据" : "过程证据不足",
      },
    ],
    overallComment: "建议教师结合现场汇报情况调整评分。",
    source: "local",
  };
}

// ============================================================
// 第十一部分：新增场景 - 阶段三项目方向建议（学生端）
// ============================================================

/**
 * 学生端 AI 项目方向建议（阶段三：小组构思）。
 * 学生点击"AI 建议项目方向"按钮时调用。
 */
export async function suggestProjectDirections(input: {
  course: Course;
  group: ProjectGroup;
}): Promise<{
  directions: Array<{
    title: string;
    description: string;
    suggestedForm: string;
    keyQuestions: string[];
  }>;
  source: "llm" | "local";
}> {
  const { course, group } = input;

  const llmResult = await callLLMForJson<{
    directions: Array<{
      title: string;
      description: string;
      suggestedForm: string;
      keyQuestions: string[];
    }>;
  }>(
    SYSTEM_PREAMBLE,
    `请基于以下课程信息，为小组生成 3-5 个可调查的项目方向建议。

课程名称：${course.name}
学科：${course.subject}
年级：${course.grade}
驱动问题：${course.drivingQuestion || "（无）"}
小组当前选题：${group.topic || "未填写"}
小组成员：${group.members.map((m) => m.name).join("、")}

要求：
1. directions：3-5 个项目方向，每个方向应可调查、可验证、与驱动问题相关
2. 每个方向包含：title（方向名称）、description（50-100 字描述）、suggestedForm（建议成果形式）、keyQuestions（2-3 个引导问题）

仅返回 JSON：{ "directions": [{ "title": "string", "description": "string", "suggestedForm": "string", "keyQuestions": ["string"] }] }`,
  );

  if (llmResult?.directions?.length) {
    return {
      directions: llmResult.directions.slice(0, 5),
      source: "llm",
    };
  }

  // 本地兜底
  return {
    directions: [
      {
        title: "校园 AI 使用现状调研",
        description: "调查同学使用 AI 工具的现状、频率、场景和遇到的问题，形成调研报告。",
        suggestedForm: "调研报告",
        keyQuestions: ["同学最常使用哪些 AI 工具？", "使用中遇到什么问题？", "如何合理使用 AI？"],
      },
      {
        title: "AI 误判案例分析",
        description: "收集 AI 在图像识别、文本生成等场景的误判案例，分析原因并提出规避建议。",
        suggestedForm: "案例分析报告",
        keyQuestions: ["AI 在哪些场景容易误判？", "误判的原因是什么？", "如何识别和规避？"],
      },
      {
        title: "校园 AI 应用方案设计",
        description: "针对校园中的真实问题（如作业辅导、图书馆推荐），设计一个 AI 应用方案并分析风险。",
        suggestedForm: "应用方案设计",
        keyQuestions: ["解决什么问题？", "AI 能帮什么忙？", "有哪些风险？"],
      },
    ],
    source: "local",
  };
}

// ============================================================
// 第十二部分：本地规则函数（兜底实现，保留原逻辑）
// ============================================================

function diagnoseGroupIdeaLocal(input: {
  course: Course;
  group: ProjectGroup;
  tasks: WorkPlanItem[];
}): AiSupportDraft {
  const { course, group, tasks } = input;
  const suggestions: string[] = [];
  const evidence: string[] = [];
  let score = 100;

  if (!isMeaningful(group.topic) || PLACEHOLDER_TOPICS.has(group.topic.trim())) {
    score -= 25;
    suggestions.push("先把选题改写成一个可调查、可验证的问题句，说明对象、场景和痛点。");
    evidence.push("选题仍是占位内容或过于笼统。");
  } else {
    evidence.push(`已填写选题：${group.topic}`);
  }

  if (!isMeaningful(group.goal) || plainText(group.goal ?? "").length < 20) {
    score -= 18;
    suggestions.push("补充项目目标，至少说明要解决什么问题、服务谁、最终产出什么变化。");
    evidence.push("项目目标较短，缺少可检查的成果描述。");
  }

  if (group.selectedForms.length === 0) {
    score -= 15;
    suggestions.push("选择至少一种成果形式，并说明它为什么适合呈现你们的研究结论。");
    evidence.push("尚未选择成果形式。");
  } else {
    evidence.push(`成果形式：${group.selectedForms.join("、")}`);
  }

  if (tasks.length === 0) {
    score -= 18;
    suggestions.push("给每位成员分配可交付任务，例如调研样本、数据整理、方案草图、汇报脚本。");
    evidence.push("尚未建立分工计划。");
  } else {
    const membersWithTasks = new Set(tasks.map((task) => task.memberName).filter(Boolean));
    if (membersWithTasks.size < Math.max(1, group.members.length)) {
      score -= 10;
      suggestions.push("检查是否每位成员都有明确任务，避免只有角色名称、没有交付物。");
      evidence.push(`已有 ${tasks.length} 项任务，覆盖 ${membersWithTasks.size}/${group.members.length} 名成员。`);
    } else {
      evidence.push(`分工覆盖 ${membersWithTasks.size} 名成员。`);
    }
  }

  if (!mentionsAny(`${group.topic} ${group.goal ?? ""}`, ["数据", "调研", "观察", "访谈", "证据", "样本"])) {
    score -= 12;
    suggestions.push("加入证据计划：准备用哪些数据、观察或访谈证明问题真实存在。");
    evidence.push("选题和目标中还没有看到明确证据来源。");
  }

  if (!mentionsAny(`${group.topic} ${group.goal ?? ""}`, ["AI", "人工智能", "生成式", "模型"])) {
    suggestions.push("写清楚 AI 使用计划：哪些环节可以辅助，哪些最终判断必须由小组完成。");
  }

  const boundedScore = Math.max(20, Math.min(100, score));
  const diagnosis =
    boundedScore >= 80
      ? "方案构思已具备推进基础，下一步应聚焦证据质量和任务落地。"
      : boundedScore >= 55
        ? "方案构思有基本方向，但目标、分工或证据链仍需补齐后再进入制作。"
        : "方案构思成熟度偏低，建议先完成问题定义、成果形式和分工计划。";

  return {
    stageKey: "group",
    targetType: "group",
    targetId: group.id,
    groupId: group.id,
    kind: "idea-check",
    trigger: "检查我的方案",
    inputSummary: `课程：${course.name}；小组：${group.name}；选题：${group.topic || "未填写"}；任务数：${tasks.length}`,
    diagnosis,
    suggestions: unique(suggestions).slice(0, 5),
    evidence: unique(evidence).slice(0, 5),
    status: "draft",
  };
}

function diagnoseProjectArtifactLocal(input: {
  course: Course;
  group: ProjectGroup;
  stageKey: string;
  documentHtml: string;
  uploads: CourseUpload[];
  tasks: WorkPlanItem[];
  focus?: ArtifactFocus;
}): AiSupportDraft {
  const { course, group, stageKey, documentHtml, uploads, tasks, focus = "overall" } = input;
  const text = plainText(documentHtml);
  const suggestions: string[] = [];
  const evidence: string[] = [];

  if (text.length < 120) {
    suggestions.push("先补齐方案骨架：问题背景、证据来源、实施步骤、预期成果、风险应对。");
    evidence.push(`当前文档约 ${text.length} 字，内容证据不足。`);
  } else {
    evidence.push(`当前文档约 ${text.length} 字。`);
  }

  if (focus === "steps" || focus === "overall") {
    if (!mentionsAny(text, ["第一", "第二", "步骤", "阶段", "计划", "时间", "分工", "任务"])) {
      suggestions.push("把实施过程拆成 3-5 个步骤，并为每一步写清负责人、产出物和完成标准。");
      evidence.push("文档中缺少清晰的实施步骤或时间安排。");
    }
    if (tasks.some((task) => task.progress < 30)) {
      suggestions.push("优先处理低进度任务，把卡点写成具体请求，便于教师或同伴介入。");
      evidence.push("存在进度低于 30% 的任务。");
    }
  }

  if (focus === "evidence" || focus === "overall") {
    if (!mentionsAny(text, ["数据", "调研", "访谈", "问卷", "观察", "样本", "引用", "来源"])) {
      suggestions.push("补充证据链：说明数据从哪里来、样本多少、如何支持你们的判断。");
      evidence.push("文档中缺少数据来源或调研说明。");
    }
    if (!uploads.some((upload) => upload.category === "evidence" || upload.fileType === "XLSX")) {
      suggestions.push("上传至少一份过程证据，例如访谈记录、观察照片、数据表或测试反馈。");
      evidence.push("当前小组尚未上传证据类材料或数据表。");
    }
  }

  if (focus === "risk" || focus === "overall") {
    if (!mentionsAny(text, ["风险", "伦理", "隐私", "安全", "偏差", "局限", "备选"])) {
      suggestions.push("增加风险与伦理段落，说明隐私保护、AI 使用边界和失败时的备选方案。");
      evidence.push("文档中尚未看到风险、伦理或备选方案。");
    }
  }

  if (!mentionsAny(text, ["AI", "人工智能", "模型", "生成式"])) {
    suggestions.push("补充 AI 使用说明：AI 提供了哪些帮助，小组成员如何验证和修改建议。");
  }

  const diagnosis =
    suggestions.length <= 2
      ? "当前作品已有可推进基础，建议围绕证据质量和表达结构做精修。"
      : "当前作品需要补强关键支撑，尤其是实施路径、证据链或风险说明。";

  return {
    stageKey,
    targetType: "group",
    targetId: group.id,
    groupId: group.id,
    kind: stageKey === "review" ? "proposal-diagnosis" : "artifact-diagnosis",
    trigger: focusLabel(focus),
    inputSummary: `课程：${course.name}；小组：${group.name}；文档字数：${text.length}；上传材料：${uploads.length} 个`,
    diagnosis,
    suggestions: unique(suggestions).slice(0, 5),
    evidence: unique(evidence).slice(0, 5),
    status: "draft",
  };
}

function buildShowcaseCoachLocal(input: {
  course: Course;
  group: ProjectGroup;
  uploads: CourseUpload[];
  activities: ActivityRecord[];
  aiSupports: AiSupportRecord[];
}): AiSupportDraft {
  const { course, group, uploads, activities, aiSupports } = input;
  const hasReport = uploads.some((upload) => upload.title.includes("报告") || upload.fileType === "PDF");
  const hasPresentation = uploads.some((upload) => upload.fileType === "PPTX" || upload.title.includes("PPT"));
  const evidenceCount = uploads.filter((upload) => upload.category === "evidence" || upload.fileType === "XLSX").length;
  const suggestions = [
    hasReport ? "用 30 秒说明报告中的核心发现，不要逐页念材料。" : "先补交研究报告或等价成果，汇报需要可被追问的主材料。",
    hasPresentation ? "把 PPT 组织成：问题证据、方案设计、验证过程、反思改进四段。" : "准备 6-8 页汇报稿，避免只有口头介绍没有结构。",
    evidenceCount > 0 ? "在汇报中明确指出最关键的一份过程证据如何支持结论。" : "补充至少一份过程证据，否则同伴很难判断方案可信度。",
    "预设教师追问：为什么选择这个问题？数据是否可靠？AI 建议中哪些被你们修改过？",
    "每位成员至少准备一句自己的贡献说明，和一条后续改进计划。",
  ];
  const evidence = [
    `已上传 ${uploads.length} 个材料，其中证据类 ${evidenceCount} 个。`,
    `过程记录 ${activities.length} 条，AI 支架记录 ${aiSupports.length} 条。`,
  ];

  return {
    stageKey: "showcase",
    targetType: "group",
    targetId: group.id,
    groupId: group.id,
    kind: "showcase-coach",
    trigger: "准备汇报追问",
    inputSummary: `课程：${course.name}；小组：${group.name}；汇报材料：${uploads.map((u) => u.title).join("、") || "未上传"}`,
    diagnosis: "汇报准备应同时覆盖作品质量、过程证据、AI 使用边界和小组贡献。",
    suggestions,
    evidence,
    status: "draft",
  };
}

function buildReflectionEvidencePromptsLocal(input: {
  course: Course;
  group?: ProjectGroup;
  studentId: string;
}): AiSupportDraft {
  const { course, group, studentId } = input;
  const student = course.students.find((item) => item.id === studentId);
  const supports = (course.aiSupports ?? []).filter(
    (item) => item.studentId === studentId || (group && item.groupId === group.id),
  );
  const uploads = (course.uploads ?? []).filter((item) => item.studentId === studentId || (group && item.groupId === group.id));
  const reflections = [
    "选择一条你们采纳过的 AI 建议，写清它解决了什么问题，以及你们如何验证它。",
    "回顾一个没有采纳的 AI 建议，说明为什么不适合你们的真实任务。",
    "用一份上传材料或修改记录证明你在项目中完成了具体贡献。",
    "写下一条下一轮可执行改进，不要只写“继续努力”。",
  ];

  return {
    stageKey: "reflection",
    targetType: group ? "group" : "student",
    targetId: group?.id ?? studentId,
    groupId: group?.id,
    studentId,
    studentName: student?.name,
    kind: "reflection-evidence",
    trigger: "辅助反思 AI 使用",
    inputSummary: `学生：${student?.name ?? studentId}；AI支架记录：${supports.length}；上传材料：${uploads.length}`,
    diagnosis: "反思应基于过程证据，而不是泛泛描述项目感受。",
    suggestions: reflections,
    evidence: [
      `可引用 AI 支架记录 ${supports.length} 条。`,
      `可引用上传材料 ${uploads.length} 个。`,
      `当前阶段进度：${student?.stageProgress?.reflection ?? 0}%`,
    ],
    status: "draft",
  };
}

function buildTeacherInterventionSignalsLocal(course: Course, stageKey: string): TeacherInterventionSignal[] {
  return (course.groups ?? [])
    .map((group) => {
      const groupTasks = (course.workPlan ?? []).filter((task) => task.groupId === group.id);
      const groupUploads = (course.uploads ?? []).filter((upload) => upload.groupId === group.id);
      const groupSupports = (course.aiSupports ?? []).filter((support) => support.groupId === group.id);
      const progress = averageGroupProgress(course, group, stageKey);
      const reasons: string[] = [];
      const evidence: string[] = [];

      if (!isMeaningful(group.topic) || PLACEHOLDER_TOPICS.has(group.topic.trim())) {
        reasons.push("选题尚未成形");
        evidence.push("小组题目仍为占位内容。");
      }
      if (groupTasks.length === 0) {
        reasons.push("缺少分工计划");
        evidence.push("未建立任何任务卡。");
      }
      if (stageKey !== "group" && groupUploads.length === 0) {
        reasons.push("缺少过程材料");
        evidence.push("尚未上传作品或证据。");
      }
      if (progress < 35) {
        reasons.push("阶段进度偏低");
        evidence.push(`当前阶段平均进度 ${progress}%。`);
      }
      if (groupSupports.filter((support) => support.status !== "student-applied").length >= 3) {
        reasons.push("AI建议多次出现但未采纳");
        evidence.push("存在多条未采纳的 AI 支架记录。");
      }

      const riskLevel: TeacherInterventionSignal["riskLevel"] =
        reasons.length >= 3 || progress < 25 ? "high" : reasons.length >= 1 ? "medium" : "low";
      const supportCard =
        reasons.length === 0
          ? "可鼓励小组把已有证据转化为汇报中的追问准备。"
          : `建议教师先确认卡点：${reasons.slice(0, 2).join("、")}；再要求小组在 10 分钟内提交一个可检查的小产出。`;

      return {
        groupId: group.id,
        groupName: group.name,
        riskLevel,
        reasons,
        evidence,
        supportCard,
      };
    })
    .filter((signal) => signal.riskLevel !== "low")
    .sort((a, b) => riskWeight(b.riskLevel) - riskWeight(a.riskLevel));
}

function generateProjectSkeletonLocal(input: {
  courseName: string;
  subject: string;
  grade: string;
  hours: number;
  summary?: string;
  initialDrivingQuestion?: string;
}): {
  drivingQuestions: string[];
  scenario: string;
  suggestedForms: string[];
  evaluationDimensions: Array<{ name: string; weight: number; description: string }>;
} {
  const subject = input.subject || "人工智能通识";
  const grade = input.grade || "中学";
  return {
    drivingQuestions: [
      `${grade}学生应该如何正确、负责地使用 AI？`,
      `AI 在${subject}中能解决什么真实问题？有哪些局限？`,
      `我们能否设计一个面向同学的 AI 使用指南？`,
    ],
    scenario: `在校园里，越来越多同学开始使用 AI 工具辅助学习、查阅资料、生成内容。但有人过度依赖 AI，有人盲目相信 AI 输出，也有人不清楚 AI 的边界与风险。本课程将引导同学围绕"${input.courseName}"展开真实调查与方案设计，理解 AI 的能力与局限，并产出可分享的成果。`,
    suggestedForms: ["调研报告", "科普海报", "微视频", "校园应用方案", "AI 使用指南"],
    evaluationDimensions: [
      { name: "知识准确性", weight: 25, description: "AI 知识运用是否准确、概念是否清晰" },
      { name: "项目完整性", weight: 25, description: "方案是否完整、证据链是否充分" },
      { name: "表达展示", weight: 20, description: "汇报结构、清晰度、吸引力" },
      { name: "价值反思", weight: 20, description: "对 AI 使用的反思、伦理判断" },
      { name: "协作贡献", weight: 10, description: "小组分工、个人贡献" },
    ],
  };
}

// ============================================================
// 第十三部分：辅助函数
// ============================================================

function averageGroupProgress(course: Course, group: ProjectGroup, stageKey: string): number {
  if (!group.members.length) return 0;
  const sum = group.members.reduce((total, member) => {
    return total + (course.students.find((student) => student.id === member.studentId)?.stageProgress?.[stageKey] ?? 0);
  }, 0);
  return Math.round(sum / group.members.length);
}

function focusLabel(focus: ArtifactFocus): string {
  if (focus === "steps") return "检查实施步骤";
  if (focus === "evidence") return "查找证据缺口";
  if (focus === "risk") return "扫描风险与伦理";
  return "诊断当前作品";
}

function isMeaningful(value: string | undefined): boolean {
  return Boolean(value && plainText(value).length >= 4);
}

function mentionsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function unique(list: string[]): string[] {
  return Array.from(new Set(list.filter(Boolean)));
}

function riskWeight(value: TeacherInterventionSignal["riskLevel"]): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}
