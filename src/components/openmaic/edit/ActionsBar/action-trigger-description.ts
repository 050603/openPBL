import type { Action } from '@openmaic/lib/types/action';

export type ActionTrigger = 'sceneStart' | 'previousCompleted';
export type ActionCompletion =
  | 'speechEnded'
  | 'activityCompleted'
  | 'immediate'
  | 'widgetSettled'
  | 'discussionConfirmed'
  | 'videoEnded'
  | 'whiteboardFinished';

export type ActivityPauseAction = Action & {
  activityPauseSec: number;
  activityPausePurpose?: 'interaction' | 'quiz' | string;
};

export interface ActionTriggerDiagnostic {
  trigger: ActionTrigger;
  completion: ActionCompletion;
  fallbackSec?: number;
  purpose?: string;
}

export function isActivityPauseAction(action: Action): action is ActivityPauseAction {
  const pauseSec = (action as unknown as { activityPauseSec?: unknown }).activityPauseSec;
  return (
    action.type === 'speech' &&
    typeof pauseSec === 'number' &&
    pauseSec > 0
  );
}

export function getActionTriggerDiagnostic(
  action: Action,
  actionIndex: number,
): ActionTriggerDiagnostic {
  const trigger: ActionTrigger = actionIndex === 0 ? 'sceneStart' : 'previousCompleted';

  if (isActivityPauseAction(action)) {
    return {
      trigger,
      completion: 'activityCompleted',
      fallbackSec: Math.round(action.activityPauseSec),
      purpose: action.activityPausePurpose ?? 'interaction',
    };
  }

  if (action.type === 'speech') return { trigger, completion: 'speechEnded' };
  if (action.type === 'spotlight' || action.type === 'laser') {
    return { trigger, completion: 'immediate' };
  }
  if (action.type.startsWith('widget_')) return { trigger, completion: 'widgetSettled' };
  if (action.type === 'discussion') return { trigger, completion: 'discussionConfirmed' };
  if (action.type === 'play_video') return { trigger, completion: 'videoEnded' };
  return { trigger, completion: 'whiteboardFinished' };
}
