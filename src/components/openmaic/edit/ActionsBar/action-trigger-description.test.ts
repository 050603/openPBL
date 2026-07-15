import { describe, expect, it } from 'vitest';
import type { Action } from '@openmaic/lib/types/action';
import { getActionTriggerDiagnostic, isActivityPauseAction } from './action-trigger-description';

function action(value: Record<string, unknown>): Action {
  return value as unknown as Action;
}

describe('getActionTriggerDiagnostic', () => {
  it('marks the first action as scene-triggered and later actions as sequential', () => {
    expect(getActionTriggerDiagnostic(action({ id: 'a', type: 'speech', text: 'Hello' }), 0)).toMatchObject({
      trigger: 'sceneStart',
      completion: 'speechEnded',
    });
    expect(getActionTriggerDiagnostic(action({ id: 'b', type: 'speech', text: 'Next' }), 1)).toMatchObject({
      trigger: 'previousCompleted',
      completion: 'speechEnded',
    });
  });

  it('describes an activity gate as event-driven with an explicit safety timeout', () => {
    const gate = action({
      id: 'gate',
      type: 'speech',
      text: '',
      activityPauseSec: 90,
      activityPausePurpose: 'interaction',
    });

    expect(isActivityPauseAction(gate)).toBe(true);
    expect(getActionTriggerDiagnostic(gate, 1)).toEqual({
      trigger: 'previousCompleted',
      completion: 'activityCompleted',
      fallbackSec: 90,
      purpose: 'interaction',
    });
  });

  it.each([
    ['spotlight', 'immediate'],
    ['laser', 'immediate'],
    ['widget_highlight', 'widgetSettled'],
    ['widget_setState', 'widgetSettled'],
    ['widget_annotation', 'widgetSettled'],
    ['widget_reveal', 'widgetSettled'],
    ['discussion', 'discussionConfirmed'],
    ['play_video', 'videoEnded'],
    ['wb_draw_text', 'whiteboardFinished'],
  ] as const)('describes %s completion as %s', (type, completion) => {
    expect(getActionTriggerDiagnostic(action({ id: type, type }), 1).completion).toBe(completion);
  });
});
