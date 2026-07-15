import { describe, expect, it } from 'vitest';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import { applyInteractiveModePolicy, suggestTeachingWidget } from './interactive-mode-policy';

function outline(overrides: Partial<SceneOutline> = {}): SceneOutline {
  return {
    id: 'scene-1',
    type: 'slide',
    title: '变量如何影响函数图像',
    description: '学生调节变量，观察函数图像变化并解释原因。',
    keyPoints: ['自变量', '因变量', '图像变化规律'],
    order: 1,
    stageKey: 'ai-learning',
    audience: 'student',
    generationPurpose: 'knowledge-teaching',
    resourceTypes: ['ppt'],
    ...overrides,
  };
}

describe('interactive mode outline policy', () => {
  it('is a strict opt-in and leaves default-mode outlines unchanged', () => {
    const outlines = [outline()];

    expect(applyInteractiveModePolicy(outlines, false)).toEqual(outlines);
  });

  it('converts even a single suitable AI-learning slide into a teaching widget', () => {
    const [result] = applyInteractiveModePolicy([outline()], true);

    expect(result).toMatchObject({
      type: 'interactive',
      widgetType: 'simulation',
      resourceTypes: ['interactive-demo'],
    });
    expect(result.widgetOutline).toBeTruthy();
  });

  it('never converts launch or later teacher resources', () => {
    const launch = outline({
      id: 'launch',
      stageKey: 'launch',
      audience: 'teacher',
      generationPurpose: 'teacher-resource',
    });
    const make = outline({
      id: 'make',
      stageKey: 'make',
      audience: 'teacher',
      generationPurpose: 'facilitation-scaffold',
    });

    expect(applyInteractiveModePolicy([launch, make], true)).toEqual([launch, make]);
  });

  it('keeps a slide when dense static reference is the clearest teaching form', () => {
    const reference = outline({
      title: '术语定义与安全规范对照表',
      description: '完整列出正式定义、单位、符号和不可省略的安全规范，供后续活动持续查阅。',
      keyPoints: ['术语表', '符号对照', '安全清单'],
    });

    expect(applyInteractiveModePolicy([reference], true)[0]?.type).toBe('slide');
  });

  it('uses Chinese teaching-affordance signals without relying on ASCII word boundaries', () => {
    const forTitle = (title: string) => outline({ title, description: title, keyPoints: [title] });

    expect(suggestTeachingWidget(forTitle('Python 循环调试练习')).widgetType).toBe('code');
    expect(suggestTeachingWidget(forTitle('太阳系行星空间结构')).widgetType).toBe('visualization3d');
    expect(suggestTeachingWidget(forTitle('力与加速度变量实验')).widgetType).toBe('simulation');
    expect(suggestTeachingWidget(forTitle('分类规则闯关挑战')).widgetType).toBe('game');
    expect(suggestTeachingWidget(forTitle('概念之间的因果关系')).widgetType).toBe('diagram');
  });
});
