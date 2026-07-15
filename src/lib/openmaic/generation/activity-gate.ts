import type { Action } from '@openmaic/lib/types/action';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import { nanoid } from 'nanoid';

type ActivityPauseSpeechAction = Extract<Action, { type: 'speech' }> & {
  activityPauseSec: number;
  activityPausePurpose: 'interaction' | 'quiz';
};

function isActivityPause(action: Action): action is ActivityPauseSpeechAction {
  return action.type === 'speech' && Number.isFinite(
    Number((action as Action & { activityPauseSec?: number }).activityPauseSec),
  ) && Number((action as Action & { activityPauseSec?: number }).activityPauseSec) > 0;
}

/** Normalize older generated classrooms whose wait gate was placed after the intro. */
export function normalizeStudentActivityPause(actions: Action[]): Action[];
export function normalizeStudentActivityPause(actions: undefined): undefined;
export function normalizeStudentActivityPause(actions: Action[] | undefined): Action[] | undefined;
export function normalizeStudentActivityPause(actions: Action[] | undefined): Action[] | undefined {
  if (!actions) return actions;
  const gateIndex = actions.findIndex(isActivityPause);
  const finalSpeechIndex = actions.findLastIndex(
    (action, index) => action.type === 'speech' && index !== gateIndex,
  );
  if (gateIndex < 0 || finalSpeechIndex < 0) return actions;

  const insertionIndex = gateIndex < finalSpeechIndex ? finalSpeechIndex - 1 : finalSpeechIndex;
  if (gateIndex === insertionIndex) return actions;
  const gate = actions[gateIndex];
  const withoutGate = actions.filter((_, index) => index !== gateIndex);
  return [
    ...withoutGate.slice(0, insertionIndex),
    gate,
    ...withoutGate.slice(insertionIndex),
  ];
}

/**
 * Put the learner-controlled wait after all automatic demonstrations and
 * immediately before the closing feedback narration.
 */
export function addStudentActivityPause(outline: SceneOutline, actions: Action[]): Action[] {
  const activityPauseSec = Math.round(outline.timingPlan?.studentActivitySec ?? 0);
  if (activityPauseSec <= 0) return actions;

  const normalizedActions = actions.filter((action) => action.type === 'speech').length >= 2
    ? actions
    : [
        ...actions,
        {
          id: `activity_feedback_${nanoid(8)}`,
          type: 'speech' as const,
          title: outline.type === 'quiz' ? '测验反馈与过渡' : '活动反馈与过渡',
          text: outline.type === 'quiz'
            ? '提交后，请对照页面解析检查自己的推理依据，确认需要巩固的步骤，再继续后面的学习。'
            : '完成阅读或操作后，把观察到的信息和当前知识点联系起来，再带着这个证据进入下一部分。',
        },
      ];

  const pauseAction: ActivityPauseSpeechAction = {
    id: `activity_pause_${nanoid(8)}`,
    type: 'speech',
    title: outline.type === 'quiz' ? '学生读题、思考与作答' : '学生阅读、操作与观察',
    text: '',
    activityPauseSec,
    activityPausePurpose: outline.type === 'quiz' ? 'quiz' : 'interaction',
  };

  const finalFeedbackIndex = normalizedActions.findLastIndex((action) => action.type === 'speech');
  const insertionIndex = finalFeedbackIndex >= 0 ? finalFeedbackIndex : normalizedActions.length;
  return normalizeStudentActivityPause([
    ...normalizedActions.slice(0, insertionIndex),
    pauseAction,
    ...normalizedActions.slice(insertionIndex),
  ]);
}
