import { describe, expect, it } from 'vitest';
import type { Action } from '@openmaic/lib/types/action';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import { addStudentActivityPause, normalizeStudentActivityPause } from './activity-gate';

describe('addStudentActivityPause', () => {
  it('allows automatic widget demonstrations before waiting for the learner', () => {
    const outline = {
      type: 'interactive',
      timingPlan: { studentActivitySec: 90 },
    } as SceneOutline;
    const actions = [
      { id: 'intro', type: 'speech', text: '先观察演示' },
      { id: 'demo', type: 'widget_setState', state: { speed: 2 } },
      { id: 'feedback', type: 'speech', text: '总结你的发现' },
    ] as Action[];

    const result = addStudentActivityPause(outline, actions);

    expect(result.map((action) => action.id)).toEqual([
      'intro',
      'demo',
      expect.stringMatching(/^activity_pause_/),
      'feedback',
    ]);
  });

  it('adds a closing feedback line when the generated script only has an introduction', () => {
    const outline = {
      type: 'quiz',
      timingPlan: { studentActivitySec: 60 },
    } as SceneOutline;
    const result = addStudentActivityPause(outline, [
      { id: 'intro', type: 'speech', text: '请完成测验' },
    ] as Action[]);

    expect(result).toHaveLength(3);
    expect(result[1]).toMatchObject({ type: 'speech', activityPausePurpose: 'quiz' });
    expect(result[2]).toMatchObject({ type: 'speech', title: '测验反馈与过渡' });
  });

  it('migrates an existing early gate behind its widget demonstration', () => {
    const legacyActions = [
      { id: 'intro', type: 'speech', text: '先观察' },
      { id: 'gate', type: 'speech', text: '', activityPauseSec: 90, activityPausePurpose: 'interaction' },
      { id: 'demo', type: 'widget_setState', state: { speed: 2 } },
      { id: 'feedback', type: 'speech', text: '现在请你操作' },
    ] as Action[];

    expect(normalizeStudentActivityPause(legacyActions).map((action) => action.id)).toEqual([
      'intro', 'demo', 'gate', 'feedback',
    ]);
  });
});
