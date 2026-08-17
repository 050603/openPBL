import { describe, expect, it } from 'vitest';
import { PROMPT_IDS } from '@openmaic/lib/prompts';
import { resolveOutlinePromptPlan } from './outline-prompt-plan';

describe('resolveOutlinePromptPlan', () => {
  it('keeps the interactive flag when structured PBL uses the shared PBL prompt', () => {
    expect(resolveOutlinePromptPlan({
      pblProfile: { generationTemplate: 'pbl-six-stage' } as never,
    })).toEqual({
      promptId: PROMPT_IDS.PBL_COURSE,
    });
  });

  it('uses deep-interaction generation even when a legacy caller sends false', () => {
    expect(resolveOutlinePromptPlan({}).promptId)
      .toBe(PROMPT_IDS.INTERACTIVE_OUTLINES);
    expect(resolveOutlinePromptPlan({}).promptId)
      .toBe(PROMPT_IDS.INTERACTIVE_OUTLINES);
  });

  it('does not let task-engine selection erase the mode variable', () => {
    expect(resolveOutlinePromptPlan({}, true)).toEqual({
      promptId: PROMPT_IDS.TASK_ENGINE_OUTLINES,
    });
  });
});
