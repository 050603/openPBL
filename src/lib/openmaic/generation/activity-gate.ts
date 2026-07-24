import type { Action } from '@openmaic/lib/types/action';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import { nanoid } from 'nanoid';

type ActivityPauseSpeechAction = Extract<Action, { type: 'speech' }> & {
  activityPauseSec: number;
  activityPausePurpose: 'interaction' | 'quiz';
};

export const MIN_STUDENT_ACTIVITY_SEC = 30;
export const MAX_STUDENT_ACTIVITY_SEC = 180;

function isActivityPause(action: Action): action is ActivityPauseSpeechAction {
  return action.type === 'speech' && Number.isFinite(
    Number((action as Action & { activityPauseSec?: number }).activityPauseSec),
  ) && Number((action as Action & { activityPauseSec?: number }).activityPauseSec) > 0;
}

function getStudentActivityInsertionIndex(actions: Action[]): number {
  const firstSpeechIndex = actions.findIndex((action) => action.type === 'speech');
  if (firstSpeechIndex < 0) return 0;

  // A highlight may point learners to the control they should use. Every
  // state-changing/revealing action must wait until the learner has acted.
  let insertionIndex = firstSpeechIndex + 1;
  while (actions[insertionIndex]?.type === 'widget_highlight') {
    insertionIndex += 1;
  }
  return insertionIndex;
}

function clampStudentActivitySec(seconds: number): number {
  return Math.min(
    MAX_STUDENT_ACTIVITY_SEC,
    Math.max(MIN_STUDENT_ACTIVITY_SEC, Math.round(seconds)),
  );
}

/**
 * Normalize older generated classrooms whose gate was placed after automatic
 * widget changes. The only platform action allowed before the gate is a
 * highlight that points to the learner-controlled UI.
 */
export function normalizeStudentActivityPause(actions: Action[]): Action[];
export function normalizeStudentActivityPause(actions: undefined): undefined;
export function normalizeStudentActivityPause(actions: Action[] | undefined): Action[] | undefined;
export function normalizeStudentActivityPause(actions: Action[] | undefined): Action[] | undefined {
  if (!actions) return actions;
  const gateIndex = actions.findIndex(isActivityPause);
  if (gateIndex < 0) return actions;

  const originalGate = actions[gateIndex];
  if (!isActivityPause(originalGate)) return actions;
  const gate = {
    ...originalGate,
    activityPauseSec: clampStudentActivitySec(originalGate.activityPauseSec),
  };
  const withoutGate = actions.filter((_, index) => index !== gateIndex);
  const insertionIndex = getStudentActivityInsertionIndex(withoutGate);
  if (
    gateIndex === insertionIndex
    && gate.activityPauseSec === originalGate.activityPauseSec
  ) {
    return actions;
  }
  return [
    ...withoutGate.slice(0, insertionIndex),
    gate,
    ...withoutGate.slice(insertionIndex),
  ];
}

/**
 * Put the learner-controlled wait immediately after the guidance speech and
 * optional control highlight. Automatic widget changes happen only after the
 * learner has completed the page task.
 */
export function addStudentActivityPause(outline: SceneOutline, actions: Action[]): Action[] {
  const configuredActivitySec = Math.round(outline.timingPlan?.studentActivitySec ?? 0);
  if (configuredActivitySec <= 0) return actions;
  const activityPauseSec = clampStudentActivitySec(configuredActivitySec);

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

  const insertionIndex = getStudentActivityInsertionIndex(normalizedActions);
  return normalizeStudentActivityPause([
    ...normalizedActions.slice(0, insertionIndex),
    pauseAction,
    ...normalizedActions.slice(insertionIndex),
  ]);
}
