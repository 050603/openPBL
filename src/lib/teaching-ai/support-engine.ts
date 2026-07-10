import type {
  ActivityRecord,
  AiSupportRecord,
  Course,
  CourseUpload,
  EvaluationDimension,
  ProjectGroup,
  WorkPlanItem,
} from "@/lib/session/types";
import { callLLM, parseLLMJson } from "@/lib/llm/client";

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

const TEACHER_SIGNAL_CACHE_TTL_MS = 120_000;

type TeacherSignalCacheEntry = {
  expiresAt: number;
  promise?: Promise<TeacherInterventionSignal[]>;
  value?: TeacherInterventionSignal[];
};

const teacherSignalCache = new Map<string, TeacherSignalCacheEntry>();

// ============================================================
// 第一部分：LLM 调用辅助函数
// ============================================================

/**
 * 调用 LLM 生成结构化 JSON 结果。
 * - LLM 不可用、限流或返回结构错误时直接抛错，由界面提示用户
 * - 统一使用系统 LLM 配置（ai-settings.json / server-providers.yml / env）
 */
async function callLLMForJson<T = unknown>(
  systemPrompt: string,
  userPrompt: string,
  opts: { abortSignal?: AbortSignal } = {},
): Promise<T> {
  const text = await callLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { jsonMode: true, abortSignal: opts.abortSignal },
  );
  return parseLLMJson<T>(text);
}

function invalidAiResult(scope: string): never {
  throw new Error(`${scope}失败：AI 返回结构不完整，请检查模型输出后重试。`);
}

const SYSTEM_PREAMBLE = `你是一名资深的 PBL（项目式学习）教学支架专家，擅长基于学生当前的项目进度给出具体、可执行、可验证的改进建议。
请始终以严格 JSON 形式返回结果，不要包含任何额外说明文字。
所有建议必须基于学生实际填写的内容，避免空话套话，每条建议应能被学生立即执行并验证。`;

// ============================================================
// 第二部分：小组构思诊断（阶段三）
// ============================================================

/**
 * 诊断小组构思方案（异步版，真实 LLM 生成）。
 * 用于阶段三"小组构思"和阶段四"方案汇报与纠偏"。
 */
export async function diagnoseGroupIdea(input: {
  course: Course;
  group: ProjectGroup;
  tasks: WorkPlanItem[];
}): Promise<AiSupportDraft> {
  const { course, group, tasks } = input;

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
      stageKey: "group",
      targetType: "group",
      targetId: group.id,
      groupId: group.id,
      kind: "idea-check",
      trigger: "检查我的方案",
      inputSummary: `课程：${course.name}；小组：${group.name}；选题：${group.topic || "未填写"}；任务数：${tasks.length}`,
      diagnosis: llmResult.diagnosis,
      suggestions: llmResult.suggestions?.slice(0, 5) ?? invalidAiResult("小组方案诊断"),
      evidence: llmResult.evidence?.slice(0, 5) ?? invalidAiResult("小组方案诊断"),
      status: "draft",
      source: "llm",
    };
  }
  return invalidAiResult("小组方案诊断");
}

// ============================================================
// 第三部分：项目作品诊断（阶段五）
// ============================================================

/**
 * 诊断项目作品（异步版，真实 LLM 生成）。
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
  const { course, group, documentHtml, uploads, tasks, focus = "overall" } = input;

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
      stageKey: input.stageKey,
      targetType: "group",
      targetId: group.id,
      groupId: group.id,
      kind: "artifact-diagnosis",
      trigger: `AI 诊断：${focusText}`,
      inputSummary: `课程：${course.name}；小组：${group.name}；文档字数：${plainText(documentHtml).length}；上传材料：${uploads.length}`,
      diagnosis: llmResult.diagnosis,
      suggestions: llmResult.suggestions?.slice(0, 5) ?? invalidAiResult("作品诊断"),
      evidence: llmResult.evidence?.slice(0, 5) ?? invalidAiResult("作品诊断"),
      status: "draft",
      source: "llm",
    };
  }
  return invalidAiResult("作品诊断");
}

// ============================================================
// 第四部分：汇报教练（阶段六）
// ============================================================

/**
 * 构建汇报教练建议（异步版，真实 LLM 生成）。
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
      stageKey: "showcase",
      targetType: "group",
      targetId: group.id,
      groupId: group.id,
      kind: "showcase-coach",
      trigger: "AI 汇报教练",
      inputSummary: `课程：${course.name}；小组：${group.name}；上传材料：${uploads.length}；过程记录：${activities.length}`,
      diagnosis: llmResult.diagnosis,
      suggestions: llmResult.suggestions?.slice(0, 5) ?? invalidAiResult("汇报教练建议"),
      evidence: llmResult.evidence?.slice(0, 5) ?? invalidAiResult("汇报教练建议"),
      status: "draft",
      source: "llm",
    };
  }
  return invalidAiResult("汇报教练建议");
}

// ============================================================
// 第五部分：反思证据提示（阶段七）
// ============================================================

/**
 * 构建反思证据提示（异步版，真实 LLM 生成）。
 * 用于阶段七"综合评价与反思"。
 */
export async function buildReflectionEvidencePrompts(input: {
  course: Course;
  group?: ProjectGroup;
  studentId: string;
}): Promise<AiSupportDraft> {
  const { course, group, studentId } = input;

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
      stageKey: "reflection",
      targetType: "student",
      targetId: studentId,
      groupId: group?.id,
      studentId,
      studentName: student?.name ?? studentId,
      kind: "reflection-evidence",
      trigger: "AI 反思证据提示",
      inputSummary: `课程：${course.name}；学生：${student?.name ?? studentId}；小组：${group?.name ?? "未分组"}；支架记录：${supports.length}`,
      diagnosis: llmResult.diagnosis,
      suggestions: llmResult.suggestions?.slice(0, 5) ?? invalidAiResult("反思证据提示"),
      evidence: llmResult.evidence?.slice(0, 5) ?? invalidAiResult("反思证据提示"),
      status: "draft",
      source: "llm",
    };
  }
  return invalidAiResult("反思证据提示");
}

// ============================================================
// 第六部分：教师干预信号（全阶段，教师监控面板）
// ============================================================

/**
 * 构建教师干预信号（异步版，真实 LLM 生成）。
 * 用于教师监控面板"AI 构思质量雷达"和"AI 实时干预建议"。
 *
 * 注意：本函数对每个小组分别调用 LLM 可能成本过高，
 * 这里采用批量方式：让 LLM 一次分析所有小组。
 */
export async function buildTeacherInterventionSignals(
  course: Course,
  stageKey: string,
): Promise<TeacherInterventionSignal[]> {
  // 如果没有小组，直接返回空数组
  if (!course.groups?.length) return [];

  const cacheKey = teacherSignalCacheKey(course, stageKey);
  const cached = teacherSignalCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.value) return cached.value;
    if (cached.promise) return cached.promise;
  }

  const promise = callLLMForJson<{
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
  ).then((llmResult) => {
    if (Array.isArray(llmResult?.groups)) {
      // 将 LLM 结果与本地小组信息合并（保留 groupId 和 groupName 的对应关系）
      const groupMap = new Map((course.groups ?? []).map((g) => [g.id, g]));
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
    return invalidAiResult("教师 AI 观察");
  });

  teacherSignalCache.set(cacheKey, { expiresAt: Date.now() + TEACHER_SIGNAL_CACHE_TTL_MS, promise });
  const result = await promise;
  teacherSignalCache.set(cacheKey, { expiresAt: Date.now() + TEACHER_SIGNAL_CACHE_TTL_MS, value: result });
  return result;
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
      scenario: llmResult.scenario ?? invalidAiResult("项目骨架生成"),
      suggestedForms: llmResult.suggestedForms?.slice(0, 5) ?? invalidAiResult("项目骨架生成"),
      evaluationDimensions:
        llmResult.evaluationDimensions?.slice(0, 6) ?? invalidAiResult("项目骨架生成"),
      source: "llm",
    };
  }
  return invalidAiResult("项目骨架生成");
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
    const result = llmResult.groups
      .filter((item) => groupMap.has(item.groupId))
      .map((item) => {
        const group = groupMap.get(item.groupId)!;
        return {
          groupId: item.groupId,
          groupName: group.name,
          topic: group.topic,
          diagnosis: item.diagnosis ?? invalidAiResult("方案批量诊断"),
          risks: item.risks?.slice(0, 3) ?? invalidAiResult("方案批量诊断"),
          suggestedQuestions: item.suggestedQuestions?.slice(0, 3) ?? invalidAiResult("方案批量诊断"),
          source: "llm" as const,
        };
      });
    if (result.length === groups.length) return result;
  }

  return invalidAiResult("方案批量诊断");
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
  const activities = course.activityLog ?? [];
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
      dimensions: llmResult.dimensions?.slice(0, 5) ?? invalidAiResult("过程性评价生成"),
      highlights: llmResult.highlights?.slice(0, 3) ?? invalidAiResult("过程性评价生成"),
      improvements: llmResult.improvements?.slice(0, 3) ?? invalidAiResult("过程性评价生成"),
      source: "llm",
    };
  }

  return invalidAiResult("过程性评价生成");
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
  dimensions: Array<{
    dimensionId: string;
    name: string;
    suggestedScore: number;
    rationale: string;
  }>;
  overallComment: string;
  source: "llm" | "local";
}> {
  const { course, group, teacherNotes } = input;
  const uploads = (course.uploads ?? []).filter((u) => u.groupId === group.id);
  const submission = (course.submissions ?? []).find(
    (s) => s.groupId === group.id && s.type === "document",
  );
  const documentText = submission?.content ? plainText(submission.content).slice(0, 2000) : "";
  const rubricDimensions = getShowcaseRubricDimensions(course);

  const llmResult = await callLLMForJson<{
    dimensions: Array<{
      dimensionId: string;
      name: string;
      suggestedScore: number;
      rationale: string;
    }>;
    overallComment: string;
  }>(
    SYSTEM_PREAMBLE,
    `请为以下小组的最终汇报生成实时评价建议。必须严格按照“课程评分维度”逐项返回，不要新增、合并或改名维度。

课程名称：${course.name}
小组名称：${group.name}
选题：${group.topic || "未填写"}
项目目标：${group.goal || "未填写"}

小组材料：
- 上传文件：${uploads.map((u) => `${u.title}（${u.fileType}）`).join("、") || "无"}
- 方案文档（截断到 2000 字）：${documentText || "无"}

教师现场速记：${teacherNotes || "（无）"}

课程评分维度：
${rubricDimensions
  .map(
    (dimension) =>
      `- dimensionId: ${dimension.id}；name: ${dimension.name}；weight: ${dimension.weight}%；description: ${dimension.description}`,
  )
  .join("\n")}

要求：
1. dimensions：必须与上方课程评分维度数量一致，且每项保留原 dimensionId 和 name。
2. suggestedScore：每维度 0-100 分，必须是整数。
3. rationale：每维度 1 句话评分理由，必须结合学生材料或教师现场速记。
4. overallComment：1 段 50-100 字总体评价。

仅返回 JSON：{ "dimensions": [{ "dimensionId": "string", "name": "string", "suggestedScore": 80, "rationale": "string" }], "overallComment": "string" }`,
  );

  if (llmResult?.dimensions?.length && llmResult.overallComment) {
    const normalizedDimensions = normalizeLiveEvaluationDimensions(
      llmResult.dimensions,
      rubricDimensions,
    );
    return {
      dimensions: normalizedDimensions,
      overallComment: llmResult.overallComment,
      source: "llm",
    };
  }

  return invalidAiResult("实时汇报评价");
}

function getShowcaseRubricDimensions(course: Course): EvaluationDimension[] {
  const dimensions = course.content.evaluationPlan.dimensions ?? [];
  if (!dimensions.length) {
    return invalidAiResult("实时汇报评价");
  }
  return dimensions;
}

function normalizeLiveEvaluationDimensions(
  aiDimensions: Array<{
    dimensionId?: string;
    name?: string;
    suggestedScore?: number;
    rationale?: string;
  }>,
  rubricDimensions: EvaluationDimension[],
) {
  return rubricDimensions.map((rubricDimension) => {
    const aiDimension = aiDimensions.find(
      (item) => item.dimensionId === rubricDimension.id || item.name === rubricDimension.name,
    );
    if (!aiDimension) {
      return invalidAiResult(`实时汇报评价：缺少维度「${rubricDimension.name}」`);
    }
    if (typeof aiDimension.suggestedScore !== "number" || !aiDimension.rationale) {
      return invalidAiResult(`实时汇报评价：维度「${rubricDimension.name}」结构不完整`);
    }
    return {
      dimensionId: rubricDimension.id,
      name: rubricDimension.name,
      suggestedScore: Math.max(0, Math.min(100, Math.round(aiDimension.suggestedScore))),
      rationale: aiDimension.rationale,
    };
  });
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

  return invalidAiResult("项目方向建议");
}

// ============================================================
// 第十二部分：辅助函数
// ============================================================

function averageGroupProgress(course: Course, group: ProjectGroup, stageKey: string): number {
  if (!group.members.length) return 0;
  const sum = group.members.reduce((total, member) => {
    return total + (course.students.find((student) => student.id === member.studentId)?.stageProgress?.[stageKey] ?? 0);
  }, 0);
  return Math.round(sum / group.members.length);
}

function teacherSignalCacheKey(course: Course, stageKey: string): string {
  const groupDigest = (course.groups ?? [])
    .map((group) => {
      const progress = averageGroupProgress(course, group, stageKey);
      const uploads = (course.uploads ?? []).filter((upload) => upload.groupId === group.id).length;
      const supports = (course.aiSupports ?? []).filter((support) => support.groupId === group.id).length;
      return `${group.id}:${group.updatedAt}:${progress}:${uploads}:${supports}`;
    })
    .join("|");
  return `${course.id}:${stageKey}:${course.updatedAt}:${groupDigest}`;
}

function focusLabel(focus: ArtifactFocus): string {
  if (focus === "steps") return "检查实施步骤";
  if (focus === "evidence") return "查找证据缺口";
  if (focus === "risk") return "扫描风险与伦理";
  return "诊断当前作品";
}

function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function riskWeight(value: TeacherInterventionSignal["riskLevel"]): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}
