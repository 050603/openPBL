import type { SceneOutline, SceneResourceType } from '@openmaic/lib/types/generation';

type TeachingWidgetSuggestion = {
  widgetType: NonNullable<SceneOutline['widgetType']>;
  widgetOutline: NonNullable<SceneOutline['widgetOutline']>;
};

export type OutlineSource = 'confirmed' | 'generated';

const CODE_SIGNALS = [
  '编程', '代码', '算法', '程序', '递归', '排序算法', '数据结构', '循环语句',
  '条件语句', '数组', '字符串', '编译', '调试', '编程语法', '程序接口', '代码框架', '变量赋值',
];
const THREE_D_SIGNALS = [
  '分子', '原子', '太阳系', '行星', '轨道', '细胞', '骨骼', '肌肉', '器官', '立体',
  '晶体', '蛋白质', '地形', '地貌', '建筑', '雕塑', '空间结构', '几何体', '立方体', '球体',
  '圆柱', '圆锥',
];
const SIMULATION_SIGNALS = [
  '力学', '受力', '力与', '作用力', '运动', '速度', '加速度', '电路', '波动', '光学', '电磁', '温度', '压强', '化学反应',
  '生态', '实验', '模拟', '概率', '统计', '分布', '函数图', '坐标', '方程', '微积分', '导数',
  '积分', '随机', '方差', '均值', '回归', '拟合', '模型', '演化', '生长', '繁殖', '代谢',
  '光合', '呼吸', '遗传', '突变', '变量实验', '参数变化',
];
const GAME_SIGNALS = [
  '挑战', '练习', '游戏', '实战', '求解', '测试', '答题', '闯关', '竞赛', '比赛', '拼图',
  '分类规则', '配对', '建造', '决策',
];

function outlineText(outline: SceneOutline): string {
  return `${outline.title} ${outline.description} ${(outline.keyPoints ?? []).join(' ')}`.toLowerCase();
}

function hasAny(text: string, signals: ReadonlyArray<string>): boolean {
  return signals.some((signal) => text.includes(signal));
}

function matchesEnglish(text: string, words: string): boolean {
  return new RegExp(`\\b(?:${words})\\b`, 'i').test(text);
}

function inferCodeLanguage(text: string): NonNullable<SceneOutline['widgetOutline']>['language'] {
  if (matchesEnglish(text, 'javascript|typescript|js|ts')) return text.includes('typescript') ? 'typescript' : 'javascript';
  if (matchesEnglish(text, 'java')) return 'java';
  if (matchesEnglish(text, 'c\\+\\+|cpp')) return 'cpp';
  return 'python';
}

/** Select the interaction whose affordance best expresses the teaching task. */
export function suggestTeachingWidget(outline: SceneOutline): TeachingWidgetSuggestion {
  const text = outlineText(outline);

  if (hasAny(text, CODE_SIGNALS) || matchesEnglish(text, 'code|coding|python|javascript|typescript|java|algorithm|program|debug|api|class|object')) {
    return {
      widgetType: 'code',
      widgetOutline: {
        language: inferCodeLanguage(text),
        challengeType: 'guided-practice',
        concept: outline.title,
      },
    };
  }

  if (hasAny(text, THREE_D_SIGNALS) || matchesEnglish(text, '3d|molecule|atom|solar|planet|orbit|anatomy|organ|crystal|topography|sculpture')) {
    return {
      widgetType: 'visualization3d',
      widgetOutline: {
        visualizationType: 'custom',
        objects: outline.keyPoints.slice(0, 5),
        interactions: ['select', 'inspect', 'guided-tour', 'compare'],
        concept: outline.title,
      },
    };
  }

  if (hasAny(text, GAME_SIGNALS) || matchesEnglish(text, 'challenge|practice|game|apply|quiz|trivia|puzzle|build|decision')) {
    return {
      widgetType: 'game',
      widgetOutline: {
        gameType: 'strategy',
        challenge: outline.description || outline.title,
        playerControls: ['choose', 'manipulate', 'test', 'revise'],
        concept: outline.title,
      },
    };
  }

  if (hasAny(text, SIMULATION_SIGNALS) || matchesEnglish(text, 'force|motion|velocity|circuit|wave|reaction|experiment|simulation|probability|function|model|variable')) {
    return {
      widgetType: 'simulation',
      widgetOutline: {
        concept: outline.title,
        keyVariables: outline.keyPoints.slice(0, 4),
      },
    };
  }

  const diagramType = hasAny(text, ['流程', '步骤', '过程', '阶段'])
    ? 'flowchart'
    : hasAny(text, ['层级', '分类', '组成'])
      ? 'hierarchy'
      : 'system';
  return {
    widgetType: 'diagram',
    widgetOutline: {
      diagramType,
      nodeCount: Math.max(3, Math.min(outline.keyPoints.length * 2, 12)),
      concept: outline.title,
    },
  };
}

/**
 * Apply the opt-in explanation-practice cadence after the PBL routing contract
 * has normalized phase, audience, and purpose metadata.
 */
export function applyInteractiveModePolicy(
  outlines: ReadonlyArray<SceneOutline>,
  enabled: boolean,
  source: OutlineSource = 'generated',
): SceneOutline[] {
  // Once the teacher has confirmed the outline, its resource types are the
  // generation contract. Interactive mode may shape planning, but must never
  // silently turn a confirmed PPT page into a different resource afterwards.
  if (!enabled || source === 'confirmed') return [...outlines];

  const result: SceneOutline[] = [];
  const usedIds = new Set(outlines.map((outline) => outline.id).filter(Boolean));
  let explanationBlock: SceneOutline[] = [];
  let changed = false;

  const isStudentKnowledge = (outline: SceneOutline): boolean => {
    const isStructuredStudentScene = outline.stageKey === 'ai-learning'
      && outline.audience === 'student'
      && outline.generationPurpose === 'knowledge-teaching';
    const isUnstructuredCourseScene = !outline.stageKey && !outline.audience;
    return isStructuredStudentScene || isUnstructuredCourseScene;
  };
  const sameScope = (left: SceneOutline, right: SceneOutline): boolean =>
    (left.parentActivityId ?? left.stageKey ?? 'course')
      === (right.parentActivityId ?? right.stageKey ?? 'course');

  for (let index = 0; index < outlines.length; index += 1) {
    const outline = outlines[index];
    const next = outlines[index + 1];

    if (!isStudentKnowledge(outline)) {
      explanationBlock = [];
      result.push(outline);
      continue;
    }

    if (outline.type === 'interactive') {
      explanationBlock = [];
      result.push(outline);
      continue;
    }

    if (outline.type !== 'slide') {
      explanationBlock = [];
      result.push(outline);
      continue;
    }

    result.push(outline);
    explanationBlock.push(outline);

    const nextIsMatchingInteraction = Boolean(
      next
      && isStudentKnowledge(next)
      && next.type === 'interactive'
      && sameScope(outline, next),
    );
    const blockMustClose = explanationBlock.length >= 2
      || !next
      || !isStudentKnowledge(next)
      || next.type !== 'slide'
      || !sameScope(outline, next);

    if (!nextIsMatchingInteraction && blockMustClose) {
      const lastResultIndex = result.length - 1;
      const { explanation, interaction } = deriveInteractionPractice(
        explanationBlock,
        usedIds,
      );
      result[lastResultIndex] = explanation;
      result.push(interaction);
      explanationBlock = [];
      changed = true;
    }
  }

  return changed
    ? result.map((outline, index) => ({ ...outline, order: index + 1 }))
    : result;
}

function deriveInteractionPractice(
  explanationBlock: ReadonlyArray<SceneOutline>,
  usedIds: Set<string>,
): { explanation: SceneOutline; interaction: SceneOutline } {
  const source = explanationBlock[explanationBlock.length - 1];
  const knowledgePointIds = Array.from(new Set(
    explanationBlock.flatMap((outline) => outline.knowledgePointIds ?? []),
  ));
  const keyPoints = Array.from(new Set(
    explanationBlock.flatMap((outline) => outline.keyPoints ?? []),
  ));
  const usesCjk = /[\u3400-\u9fff]/.test(source.title);
  const practiceLabel = usesCjk ? '互动实践' : 'Interactive practice';
  const description = usesCjk
    ? `通过预测、操作、观察和解释，应用并检验前面讲解的“${source.title}”相关知识；系统提供解释性反馈和迁移检查。`
    : `Apply and check the preceding ${source.title} knowledge through prediction, manipulation, observation, and explanation, with explanatory feedback and a transfer check.`;
  const widgetSeed: SceneOutline = {
    ...source,
    title: source.title,
    description: explanationBlock.map((outline) => outline.description).join(' '),
    keyPoints,
    knowledgePointIds,
  };
  const { widgetType, widgetOutline } = suggestTeachingWidget(widgetSeed);
  const resourceTypes: SceneResourceType[] = [
    widgetType === 'code' ? 'code-interactive' : 'interactive-demo',
  ];
  const id = uniquePracticeId(`${source.id || 'scene'}-interactive-practice`, usedIds);
  const targetSplit = splitDuration(source.targetDurationSec);
  const estimateSplit = splitDuration(source.estimatedDuration);
  const explanation: SceneOutline = {
    ...source,
    ...(targetSplit ? { targetDurationSec: targetSplit.explanation } : {}),
    ...(estimateSplit ? { estimatedDuration: estimateSplit.explanation } : {}),
  };
  const interaction: SceneOutline = {
    ...source,
    id,
    type: 'interactive',
    title: `${source.title} · ${practiceLabel}`,
    description,
    keyPoints,
    knowledgePointIds,
    detailKind: 'interactive-practice',
    resourceTypes,
    widgetType,
    widgetOutline,
    mediaGenerations: undefined,
    suggestedImageIds: undefined,
    ...(targetSplit ? { targetDurationSec: targetSplit.interaction } : {}),
    ...(estimateSplit ? { estimatedDuration: estimateSplit.interaction } : {}),
  };

  return { explanation, interaction };
}

function splitDuration(
  duration: number | undefined,
): { explanation: number; interaction: number } | undefined {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 2) {
    return undefined;
  }
  const interaction = Math.max(1, Math.round(duration * 0.35));
  return {
    explanation: Math.max(1, duration - interaction),
    interaction,
  };
}

function uniquePracticeId(base: string, usedIds: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}
