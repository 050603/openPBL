import { nanoid } from 'nanoid';
import type { Action } from '@openmaic/lib/types/action';
import type {
  SceneOutline,
  TeachingToolKind,
  TeachingToolPlanItem,
} from '@openmaic/lib/types/generation';

const WHITEBOARD_DRAW_TYPES = new Set<Action['type']>([
  'wb_draw_text',
  'wb_draw_shape',
  'wb_draw_chart',
  'wb_draw_latex',
  'wb_draw_table',
  'wb_draw_line',
  'wb_draw_code',
  'wb_edit_code',
]);

const TOOL_KINDS = new Set<TeachingToolKind>([
  'whiteboard',
  'spotlight',
  'laser-pointer',
  'interactive-widget',
]);

const VISUAL_REASONING_PATTERN =
  /步骤|过程|流程|机制|因果|关系|结构|比较|对比|变化|推导|公式|计算|算法|代码|网络|模型|特征|分类|例子|示例|反例|证据|链路|映射|transform|process|flow|mechanism|compare|formula|algorithm|model|feature/i;

function cleanText(value: unknown, maxLength = 240): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function normalizeTeachingToolPlan(
  value: unknown,
): TeachingToolPlanItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const raw = candidate as Record<string, unknown>;
    if (typeof raw.tool !== 'string' || !TOOL_KINDS.has(raw.tool as TeachingToolKind)) {
      return [];
    }
    const trigger = cleanText(raw.trigger);
    const purpose = cleanText(raw.purpose);
    const content = Array.isArray(raw.content)
      ? raw.content.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 6)
      : [];
    if (!trigger || !purpose || content.length === 0) return [];
    return [{
      id: cleanText(raw.id, 80) || `tool-plan-${index + 1}`,
      tool: raw.tool as TeachingToolKind,
      trigger,
      purpose,
      content,
      required: raw.required !== false,
    }];
  });
}

function autoWhiteboardPlan(outline: SceneOutline): TeachingToolPlanItem[] {
  const content = (outline.keyPoints ?? [])
    .map((item) => cleanText(item, 150))
    .filter(Boolean)
    .slice(0, 4);
  if (content.length < 2) return [];
  return [{
    id: `whiteboard-${outline.id}`,
    tool: 'whiteboard',
    trigger: `讲到“${outline.title}”中需要逐步看清的关系时`,
    purpose: '把口头推理转成可停留、可指认的视觉结构，降低抽象理解负担。',
    content,
    required: true,
  }];
}

/**
 * Preserve model-authored plans and add a conservative fallback only for
 * student explanation pages whose content clearly calls for visible reasoning.
 * Consecutive pages are throttled so the whiteboard remains purposeful.
 */
export function ensureTeachingToolPlans(
  outlines: ReadonlyArray<SceneOutline>,
): SceneOutline[] {
  let lastAutomaticWhiteboardIndex = -3;
  return outlines.map((outline, index) => {
    const normalized = normalizeTeachingToolPlan(outline.teachingToolPlan);
    if (normalized.length > 0) return { ...outline, teachingToolPlan: normalized };

    if (outline.type === 'interactive' && outline.audience === 'student') {
      return {
        ...outline,
        teachingToolPlan: [{
          id: `interactive-${outline.id}`,
          tool: 'interactive-widget',
          trigger: `完成“${outline.title}”的必要讲解后`,
          purpose: '让学生通过操作、观察和比较形成可验证的理解。',
          content: [outline.description, ...(outline.keyPoints ?? [])]
            .map((item) => cleanText(item, 150))
            .filter(Boolean)
            .slice(0, 4),
          required: true,
        }],
      };
    }

    const searchable = [outline.title, outline.description, ...(outline.keyPoints ?? [])].join(' ');
    const eligible = outline.type === 'slide'
      && outline.audience === 'student'
      && outline.generationPurpose === 'knowledge-teaching'
      && VISUAL_REASONING_PATTERN.test(searchable)
      && index - lastAutomaticWhiteboardIndex >= 2;
    if (!eligible) return { ...outline, teachingToolPlan: undefined };

    const teachingToolPlan = autoWhiteboardPlan(outline);
    if (teachingToolPlan.length === 0) return { ...outline, teachingToolPlan: undefined };
    lastAutomaticWhiteboardIndex = index;
    return { ...outline, teachingToolPlan };
  });
}

export function formatTeachingToolPlanForPrompt(outline: SceneOutline): string {
  const plan = normalizeTeachingToolPlan(outline.teachingToolPlan);
  if (plan.length === 0) {
    return [
      '## Page teaching-tool plan',
      '- No tool is contractually planned for this page. You may still use spotlight or laser sparingly when it materially improves attention.',
      '- Do not open the whiteboard merely to copy slide text.',
    ].join('\n');
  }
  return [
    '## Page teaching-tool plan (must follow)',
    '- Execute every item marked required. Synchronize it with the nearby narration instead of announcing the tool itself.',
    '- Whiteboard content below is a semantic specification: make every listed item visible, legible, and spatially organized; do not merely repeat the slide title.',
    ...plan.map((item, index) => [
      `${index + 1}. ${item.tool}${item.required === false ? ' (optional)' : ' (required)'}`,
      `   Trigger: ${item.trigger}`,
      `   Purpose: ${item.purpose}`,
      `   Visible content: ${item.content.join(' | ')}`,
    ].join('\n')),
  ].join('\n');
}

function plannedWhiteboardDrawings(plan: TeachingToolPlanItem): Action[] {
  const content = plan.content.slice(0, 5);
  return [
    { id: `action_${nanoid(8)}`, type: 'wb_open' as const },
    ...content.map((item, index): Action => ({
      id: `action_${nanoid(8)}`,
      type: 'wb_draw_text',
      elementId: `planned-note-${index + 1}`,
      content: index === 0 ? `<strong>${item}</strong>` : `${index + 1}. ${item}`,
      x: index === 0 ? 70 : 90,
      y: index === 0 ? 48 : 112 + (index - 1) * 86,
      width: index === 0 ? 840 : 800,
      height: index === 0 ? 54 : 64,
      fontSize: index === 0 ? 28 : 22,
      color: index === 0 ? '#0f766e' : '#1c1917',
    })),
  ];
}

/**
 * Last-resort execution guard: an approved whiteboard plan is part of the
 * lesson contract. If the model forgets all drawing actions, inject a readable
 * semantic board before the main explanation rather than silently dropping it.
 */
export function applyPlannedTeachingToolActions(
  outline: Pick<SceneOutline, 'teachingToolPlan'>,
  actions: ReadonlyArray<Action>,
): Action[] {
  const plans = normalizeTeachingToolPlan(outline.teachingToolPlan)
    .filter((item) => item.required !== false);
  const whiteboardPlan = plans.find((item) => item.tool === 'whiteboard');
  const widgetPlan = plans.find((item) => item.tool === 'interactive-widget');
  const missingWhiteboard = Boolean(
    whiteboardPlan && !actions.some((action) => WHITEBOARD_DRAW_TYPES.has(action.type)),
  );
  const missingWidget = Boolean(
    widgetPlan && !actions.some((action) => action.type.startsWith('widget_')),
  );
  if (!missingWhiteboard && !missingWidget) return actions.map((action) => ({ ...action }));

  const plannedActions: Action[] = [
    ...(missingWhiteboard && whiteboardPlan ? plannedWhiteboardDrawings(whiteboardPlan) : []),
    ...(missingWidget && widgetPlan ? [{
      id: `action_${nanoid(8)}`,
      type: 'widget_highlight' as const,
      target: 'body',
      content: widgetPlan.content[0] || widgetPlan.purpose,
    }] : []),
  ];
  const speechIndexes = actions.flatMap((action, index) => action.type === 'speech' ? [index] : []);
  const insertAt = speechIndexes.length > 1 ? speechIndexes[0] + 1 : Math.max(0, speechIndexes[0] ?? 0);
  return [
    ...actions.slice(0, insertAt).map((action) => ({ ...action })),
    ...plannedActions,
    ...actions.slice(insertAt).map((action) => ({ ...action })),
  ];
}

function actualContent(action: Action): string[] {
  switch (action.type) {
    case 'wb_draw_text':
      return [action.content.replace(/<[^>]+>/g, '')];
    case 'wb_draw_latex':
      return [action.latex];
    case 'wb_draw_code':
      return [`${action.fileName || action.language}：${action.code}`];
    case 'wb_draw_table':
      return action.data.slice(0, 3).map((row) => row.join('｜'));
    case 'wb_draw_chart':
      return [`${action.chartType}：${action.data.labels.join('、')}`];
    case 'wb_draw_shape':
      return [`${action.shape} 图形`];
    case 'wb_draw_line':
      return ['关系连线 / 箭头'];
    case 'widget_highlight':
    case 'widget_annotation':
    case 'widget_reveal':
      return [action.content || action.target];
    case 'widget_setState':
      return [JSON.stringify(action.state)];
    default:
      return [];
  }
}

export type ActualTeachingToolSummary = {
  tool: TeachingToolKind;
  actionCount: number;
  trigger: string;
  content: string[];
};

export function summarizeActualTeachingTools(
  actions: ReadonlyArray<Action> = [],
): ActualTeachingToolSummary[] {
  const firstToolIndex = actions.findIndex((action) =>
    action.type.startsWith('wb_')
    || action.type.startsWith('widget_')
    || action.type === 'spotlight'
    || action.type === 'laser',
  );
  const priorSpeech = firstToolIndex > 0
    ? [...actions.slice(0, firstToolIndex)].reverse().find((action) => action.type === 'speech')
    : undefined;
  const trigger = priorSpeech?.type === 'speech'
    ? priorSpeech.text.slice(0, 90)
    : '进入本页相关讲解时';
  const groups: Array<{ tool: TeachingToolKind; actions: Action[] }> = [
    { tool: 'whiteboard', actions: actions.filter((action) => action.type.startsWith('wb_')) },
    { tool: 'interactive-widget', actions: actions.filter((action) => action.type.startsWith('widget_')) },
    { tool: 'spotlight', actions: actions.filter((action) => action.type === 'spotlight') },
    { tool: 'laser-pointer', actions: actions.filter((action) => action.type === 'laser') },
  ];
  return groups.flatMap((group) => group.actions.length > 0 ? [{
    tool: group.tool,
    actionCount: group.actions.length,
    trigger,
    content: Array.from(new Set(group.actions.flatMap(actualContent).filter(Boolean))).slice(0, 6),
  }] : []);
}
