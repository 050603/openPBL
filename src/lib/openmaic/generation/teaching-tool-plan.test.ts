import { describe, expect, it } from 'vitest';
import type { Action } from '@openmaic/lib/types/action';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import {
  applyPlannedTeachingToolActions,
  ensureTeachingToolPlans,
  formatTeachingToolPlanForPrompt,
  normalizeTeachingToolPlan,
  summarizeActualTeachingTools,
} from './teaching-tool-plan';

function slide(patch: Partial<SceneOutline> = {}): SceneOutline {
  return {
    id: 'scene-1',
    type: 'slide',
    title: '图像分类流程',
    description: '逐步解释数据、特征与模型之间的关系',
    keyPoints: ['输入标注图像', '提取可区分特征', '模型输出类别'],
    order: 0,
    audience: 'student',
    generationPurpose: 'knowledge-teaching',
    ...patch,
  };
}

describe('teaching tool plan', () => {
  it('adds a conservative whiteboard plan to visible multi-step reasoning', () => {
    const [planned] = ensureTeachingToolPlans([slide()]);
    expect(planned.teachingToolPlan).toMatchObject([{
      tool: 'whiteboard',
      required: true,
      content: ['输入标注图像', '提取可区分特征', '模型输出类别'],
    }]);
  });

  it('preserves and sanitizes a model-authored tool plan', () => {
    const plan = normalizeTeachingToolPlan([{
      tool: 'whiteboard',
      trigger: '讲到卷积核移动时',
      purpose: '保留局部计算过程',
      content: ['输入窗口', '逐元素相乘', '求和得到特征值'],
      required: true,
    }]);
    expect(plan).toHaveLength(1);
    expect(formatTeachingToolPlanForPrompt(slide({ teachingToolPlan: plan }))).toContain('求和得到特征值');
  });

  it('injects executable whiteboard actions when the model omits a required plan', () => {
    const [planned] = ensureTeachingToolPlans([slide()]);
    const actions: Action[] = [{ id: 'speech-1', type: 'speech', text: '我们逐步看这条处理链。' }];
    const result = applyPlannedTeachingToolActions(planned, actions);
    expect(result.map((action) => action.type)).toEqual([
      'wb_open',
      'wb_draw_text',
      'wb_draw_text',
      'wb_draw_text',
      'speech',
    ]);
  });

  it('injects a safe widget action when a required interactive plan is missing', () => {
    const result = applyPlannedTeachingToolActions({
      teachingToolPlan: [{
        id: 'widget-plan',
        tool: 'interactive-widget',
        trigger: '完成讲解后',
        purpose: '引导学生操作',
        content: ['尝试调整参数并观察结果'],
        required: true,
      }],
    }, [{ id: 'speech', type: 'speech', text: '请开始操作。' }]);

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'widget_highlight', target: 'body' }),
    ]));
  });

  it('reports the actual page trigger and visible whiteboard content', () => {
    const actions: Action[] = [
      { id: 'speech-1', type: 'speech', text: '现在把三个步骤画出来。' },
      { id: 'open', type: 'wb_open' },
      { id: 'draw-1', type: 'wb_draw_text', content: '数据 → 特征 → 分类', x: 20, y: 20 },
    ];
    expect(summarizeActualTeachingTools(actions)).toEqual([{
      tool: 'whiteboard',
      actionCount: 2,
      trigger: '现在把三个步骤画出来。',
      content: ['数据 → 特征 → 分类'],
    }]);
  });
});
