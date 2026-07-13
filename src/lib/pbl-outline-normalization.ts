import type {
  KnowledgeGraph,
  KnowledgePoint,
  TeachingOutlineSection,
} from '@/lib/session/types';
import {
  classifyPblActivityKind,
  PBL_MODULE_DEFINITIONS,
  normalizePblStageKey,
  suggestPblTimeAllocation,
  type PblTimeModelContext,
} from '@/lib/pbl-time-model';

type NormalizePblTeachingOutlineOptions = Omit<PblTimeModelContext, 'knowledgePoints' | 'knowledgeGraph'> & {
  totalMinutes: number;
  applyTimeModel?: boolean;
  knowledgePoints?: ReadonlyArray<KnowledgePoint>;
  knowledgeGraph?: KnowledgeGraph;
};

const KIND_TO_DEFINITION = new Map(
  PBL_MODULE_DEFINITIONS.map((definition) => [definition.kind, definition]),
);

function defaultTeachingActivity(
  definition: (typeof PBL_MODULE_DEFINITIONS)[number],
  index: number,
  knowledgePointIds: string[],
): TeachingOutlineSection {
  const isKnowledge = definition.stageKey === 'ai-learning';
  return {
    id: `pbl-module-${definition.stageKey}`,
    stageKey: definition.stageKey,
    title: definition.defaultTitle,
    durationMin: 1,
    teachingGoal:
      isKnowledge
        ? '按知识图谱的先修关系建构核心知识，并通过短练习检查理解。'
        : `完成${definition.label}的关键课堂任务，并为下一模块留下可追溯证据。`,
    teacherRole:
      isKnowledge
        ? '根据学生理解情况进行点拨和必要的全班讲解。'
        : `主持${definition.label}，明确过程要求并根据真实证据追问。`,
    platformRole: isKnowledge
      ? '展示知识图谱、分发学习内容并记录学习结果。'
      : '展示教师支架、收集学生提交物并沉淀过程证据。',
    aiRole: isKnowledge
      ? '生成知识讲解、测验或互动练习，并根据作答提供解释。'
      : '提供伴学提示、记录证据和提出澄清问题，不替学生完成项目。',
    studentActivity: isKnowledge
      ? '学习核心知识，完成互动或测验，并把知识连接到驱动问题。'
      : `围绕${definition.label}完成个人项目任务，保存相应过程证据。`,
    activityKind: definition.kind,
    knowledgePointIds,
    openMaicUse: isKnowledge ? 'student-ai-learning' : 'none',
    resourceTypes: isKnowledge ? ['ppt'] : ['ppt', 'script'],
    notes: `课程模块 ${index + 1}：${definition.resourcePlan}`,
  };
}

function knowledgeContext(
  options: NormalizePblTeachingOutlineOptions,
): PblTimeModelContext {
  return {
    topic: options.topic,
    subject: options.subject,
    summary: options.summary,
    grade: options.grade,
    difficulty: options.difficulty,
    knowledgePoints: options.knowledgePoints,
    knowledgeGraph: options.knowledgeGraph,
  };
}

/**
 * Normalize a generated first-level outline into a six-module timeline.
 * Additional activities are retained (for example three separate knowledge
 * explanations), while the six canonical modules are always present first.
 */
export function normalizePblTeachingOutline(
  activities: ReadonlyArray<TeachingOutlineSection>,
  options: NormalizePblTeachingOutlineOptions,
): TeachingOutlineSection[] {
  if (activities.length === 0) return [];

  const knownIds = new Set(
    (options.knowledgePoints ?? []).map((point) => point.id).filter(Boolean),
  );
  const source = activities.map((activity, index) => {
    const kind = classifyPblActivityKind(activity);
    const definition = kind === 'other' ? undefined : KIND_TO_DEFINITION.get(kind);
    const stageKey = definition?.stageKey ?? normalizePblStageKey(activity.stageKey) ?? 'make';
    const validKnowledgePointIds = (activity.knowledgePointIds ?? []).filter((id) =>
      knownIds.size === 0 ? Boolean(id) : knownIds.has(id),
    );
    return {
      ...activity,
      id: activity.id || `to-${index + 1}`,
      stageKey,
      activityKind: definition?.kind ?? 'practice',
      durationMin: Number.isFinite(Number(activity.durationMin))
        ? Math.max(1, Math.round(Number(activity.durationMin)))
        : 1,
      knowledgePointIds: validKnowledgePointIds,
      openMaicUse: stageKey === 'ai-learning' ? 'student-ai-learning' : 'none',
      resourceTypes:
        stageKey === 'ai-learning'
          ? activity.resourceTypes?.length
            ? activity.resourceTypes
            : ['ppt']
          : ['ppt', 'script'],
    } satisfies TeachingOutlineSection;
  });

  const byKind = new Map<string, TeachingOutlineSection[]>();
  for (const activity of source) {
    const kind = classifyPblActivityKind(activity);
    const group = byKind.get(kind) ?? [];
    group.push(activity);
    byKind.set(kind, group);
  }

  const canonical: TeachingOutlineSection[] = [];
  const primaryIds = new Set<string>();
  PBL_MODULE_DEFINITIONS.forEach((definition, index) => {
    const existing = byKind.get(definition.kind)?.[0];
    const next = existing
      ? existing
      : defaultTeachingActivity(
          definition,
          index,
          definition.kind === 'knowledge' ? Array.from(knownIds) : [],
        );
    canonical.push({
      ...next,
      stageKey: definition.stageKey,
      activityKind: definition.kind,
      knowledgePointIds:
        definition.kind === 'knowledge' && knownIds.size > 0
          ? Array.from(new Set([...(next.knowledgePointIds ?? []), ...knownIds]))
          : next.knowledgePointIds ?? [],
      openMaicUse: definition.kind === 'knowledge' ? 'student-ai-learning' : 'none',
      resourceTypes: definition.kind === 'knowledge' ? next.resourceTypes ?? ['ppt'] : ['ppt', 'script'],
    });
    primaryIds.add(next.id);
  });

  const extras = source.filter((activity) => !primaryIds.has(activity.id));
  const normalized = [...canonical, ...extras];
  const suggestions = options.applyTimeModel === false
    ? {}
    : suggestPblTimeAllocation(
        options.totalMinutes,
        normalized,
        knowledgeContext(options),
      );

  return normalized.map((activity) => ({
    ...activity,
    durationMin: suggestions[activity.id] ?? activity.durationMin,
  }));
}
