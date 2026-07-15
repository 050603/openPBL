import { describe, expect, it } from 'vitest';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import { applyInteractiveModePolicy, suggestTeachingWidget } from './interactive-mode-policy';

function outline(overrides: Partial<SceneOutline> = {}): SceneOutline {
  return {
    id: 'scene-1',
    type: 'slide',
    title: 'How variables affect a model',
    description: 'Explain the relationship before students test it.',
    keyPoints: ['independent variable', 'dependent variable', 'causal pattern'],
    estimatedDuration: 120,
    targetDurationSec: 120,
    order: 1,
    stageKey: 'ai-learning',
    audience: 'student',
    generationPurpose: 'knowledge-teaching',
    parentActivityId: 'ai-module',
    knowledgePointIds: ['kp-1'],
    resourceTypes: ['ppt'],
    ...overrides,
  };
}

describe('interactive mode outline policy', () => {
  it('is a strict opt-in and leaves default-mode outlines unchanged', () => {
    const outlines = [outline()];

    expect(applyInteractiveModePolicy(outlines, false)).toEqual(outlines);
  });

  it('treats teacher-confirmed PPT, quiz, and interactive types as immutable', () => {
    const confirmed = [
      outline({ id: 'confirmed-ppt' }),
      outline({ id: 'confirmed-quiz', type: 'quiz', resourceTypes: [] }),
      outline({
        id: 'confirmed-interactive',
        type: 'interactive',
        widgetType: 'diagram',
        widgetOutline: { diagramType: 'system', concept: 'causal relationship' },
        resourceTypes: ['interactive-demo'],
      }),
    ];

    expect(applyInteractiveModePolicy(confirmed, true, 'confirmed')).toEqual(confirmed);
  });

  it('adds a related interaction after one explanation and before the final quiz', () => {
    const explanation = outline();
    const quiz = outline({ id: 'quiz', type: 'quiz', title: 'Comprehensive check' });

    const result = applyInteractiveModePolicy([explanation, quiz], true);

    expect(result.map((item) => item.type)).toEqual(['slide', 'interactive', 'quiz']);
    expect(result[1]).toMatchObject({
      detailKind: 'interactive-practice',
      parentActivityId: 'ai-module',
      knowledgePointIds: ['kp-1'],
      targetDurationSec: 42,
      estimatedDuration: 42,
    });
    expect(result[0]).toMatchObject({ targetDurationSec: 78, estimatedDuration: 78 });
    expect((result[0].targetDurationSec ?? 0) + (result[1].targetDurationSec ?? 0)).toBe(120);
  });

  it('creates the requested explanation-practice cadence without replacing explanation slides', () => {
    const slides = [
      outline({ id: 's1', title: 'Concept A', knowledgePointIds: ['a'] }),
      outline({ id: 's2', title: 'Concept B', knowledgePointIds: ['b'] }),
      outline({ id: 's3', title: 'Concept C', knowledgePointIds: ['c'] }),
      outline({ id: 's4', title: 'Concept D', knowledgePointIds: ['d'] }),
    ];

    const result = applyInteractiveModePolicy(slides, true);

    expect(result.map((item) => item.type)).toEqual([
      'slide', 'slide', 'interactive', 'slide', 'slide', 'interactive',
    ]);
    expect(result.filter((item) => item.type === 'slide')).toHaveLength(4);
    expect(result[2].knowledgePointIds).toEqual(['a', 'b']);
    expect(result[5].knowledgePointIds).toEqual(['c', 'd']);
  });

  it('uses an existing matching interaction and does not add a duplicate', () => {
    const existing = outline({
      id: 'practice',
      type: 'interactive',
      widgetType: 'simulation',
      widgetOutline: { concept: 'variable model' },
      resourceTypes: ['interactive-demo'],
    });
    const sequence = [outline({ id: 'explain' }), existing];

    expect(applyInteractiveModePolicy(sequence, true)).toHaveLength(2);
    expect(applyInteractiveModePolicy(applyInteractiveModePolicy(sequence, true), true))
      .toEqual(applyInteractiveModePolicy(sequence, true));
  });

  it('never changes teacher resources outside student AI learning', () => {
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

  it('supports generic non-PBL course outlines that have no stage metadata', () => {
    const generic = outline({
      stageKey: undefined,
      audience: undefined,
      generationPurpose: undefined,
      parentActivityId: undefined,
    });

    expect(applyInteractiveModePolicy([generic], true).map((item) => item.type))
      .toEqual(['slide', 'interactive']);
  });

  it('selects widgets from teaching affordance', () => {
    const forTitle = (title: string) => outline({ title, description: title, keyPoints: [title] });

    expect(suggestTeachingWidget(forTitle('Python loop debugging practice')).widgetType).toBe('code');
    expect(suggestTeachingWidget(forTitle('Solar system spatial structure')).widgetType)
      .toBe('visualization3d');
    expect(suggestTeachingWidget(forTitle('Force and acceleration variable experiment')).widgetType)
      .toBe('simulation');
    expect(suggestTeachingWidget(forTitle('Classification rule challenge game')).widgetType)
      .toBe('game');
    expect(suggestTeachingWidget(forTitle('Causal relationships among concepts')).widgetType)
      .toBe('diagram');
  });
});
