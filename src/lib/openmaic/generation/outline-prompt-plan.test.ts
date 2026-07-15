import { describe, expect, it } from 'vitest';
import { PROMPT_IDS } from '@openmaic/lib/prompts';
import { resolveOutlinePromptPlan } from './outline-prompt-plan';

describe('resolveOutlinePromptPlan', () => {
  it('keeps the interactive flag when structured PBL uses the shared PBL prompt', () => {
    expect(resolveOutlinePromptPlan({
      interactiveMode: true,
      pblProfile: { generationTemplate: 'pbl-six-stage' } as never,
    })).toEqual({
      promptId: PROMPT_IDS.PBL_COURSE,
      interactiveMode: true,
    });
  });

  it('selects visibly different generic prompt plans for the off and on states', () => {
    expect(resolveOutlinePromptPlan({ interactiveMode: false }).promptId)
      .toBe(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES);
    expect(resolveOutlinePromptPlan({ interactiveMode: true }).promptId)
      .toBe(PROMPT_IDS.INTERACTIVE_OUTLINES);
  });

  it('does not let task-engine selection erase the mode variable', () => {
    expect(resolveOutlinePromptPlan({ interactiveMode: true }, true)).toEqual({
      promptId: PROMPT_IDS.TASK_ENGINE_OUTLINES,
      interactiveMode: true,
    });
  });
});
