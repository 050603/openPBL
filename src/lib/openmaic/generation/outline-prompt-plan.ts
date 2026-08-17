import { PROMPT_IDS } from '@openmaic/lib/prompts';
import type { PromptId } from '@openmaic/lib/prompts/types';
import type { UserRequirements } from '@openmaic/lib/types/generation';

export type OutlinePromptPlan = {
  promptId: PromptId;
};

/** Keep prompt selection and conditional mode variables identical in streaming and batch generation. */
export function resolveOutlinePromptPlan(
  requirements: Pick<UserRequirements, 'pblProfile'>,
  taskEngineMode = false,
): OutlinePromptPlan {
  // Deep interaction is the product's default teaching contract. The legacy
  // flag is still accepted so older persisted requests remain readable, but a
  // caller can no longer downgrade a newly generated lesson to slide-only mode.
  const promptId = requirements.pblProfile?.generationTemplate === 'pbl-six-stage'
    ? PROMPT_IDS.PBL_COURSE
    : taskEngineMode
      ? PROMPT_IDS.TASK_ENGINE_OUTLINES
      : PROMPT_IDS.INTERACTIVE_OUTLINES;

  return { promptId };
}
