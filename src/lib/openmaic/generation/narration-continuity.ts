import type { Action } from '@openmaic/lib/types/action';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import type { SceneGenerationContext } from './pipeline-types';

function sectionIdentity(outline: SceneOutline): string {
  return outline.parentActivityId
    || outline.stageKey
    || outline.segmentGroupId
    || '__course__';
}

function summarizeOutline(outline: SceneOutline | undefined): string | undefined {
  if (!outline) return undefined;
  return [outline.description, ...(outline.keyPoints ?? [])]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join('；')
    .slice(0, 600) || outline.title;
}

/** Build continuity metadata before concurrent scene workers start. */
export function buildNarrationContext(
  outlines: ReadonlyArray<SceneOutline>,
  index: number,
): SceneGenerationContext {
  const safeIndex = Math.max(0, Math.min(index, Math.max(0, outlines.length - 1)));
  const current = outlines[safeIndex];
  const previous = safeIndex > 0 ? outlines[safeIndex - 1] : undefined;
  const sectionPosition = safeIndex === 0
    ? 'course-first'
    : previous && current && sectionIdentity(previous) !== sectionIdentity(current)
      ? 'section-first'
      : 'continuation';

  return {
    pageIndex: safeIndex + 1,
    totalPages: outlines.length,
    allTitles: outlines.map((outline) => outline.title),
    previousSpeeches: [],
    sectionPosition,
    previousPageTitle: previous?.title,
    previousPageSummary: summarizeOutline(previous),
    currentTeachingObjective: summarizeOutline(current),
  };
}

const REPEATED_OPENING_PREFIX = /^(?:(?:大家好|同学们好|各位同学(?:好)?)[，,。.!！、\s]*|同学们[，,]\s*(?:今天|这节课|本节课)[^。！？!?]*[。！？!?\s]*|欢迎(?:大家|各位同学|同学们)?(?:来到|参加|进入)[^。！？!?]*[。！？!?\s]*|(?:hello|hi)\s+(?:everyone|class|students)[,.!\s]*|welcome(?:\s+everyone|\s+class|\s+students)?[^.!?]*[.!?\s]*)+/i;

export function stripRepeatedNarrationOpening(text: string): string {
  return text.replace(REPEATED_OPENING_PREFIX, '').trimStart();
}

/** Deterministic final guard for model outputs that ignore the continuity prompt. */
export function enforceNarrationContinuity(
  actions: ReadonlyArray<Action>,
  context?: SceneGenerationContext,
): Action[] {
  if (!context || context.sectionPosition !== 'continuation') return [...actions];
  let firstSpeechHandled = false;
  return actions.map((action) => {
    if (firstSpeechHandled || action.type !== 'speech') return { ...action };
    firstSpeechHandled = true;
    const cleaned = stripRepeatedNarrationOpening(action.text);
    return {
      ...action,
      text: cleaned || context.currentTeachingObjective || context.allTitles[context.pageIndex - 1] || action.text,
    };
  });
}
