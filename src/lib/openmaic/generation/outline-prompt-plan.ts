import { PROMPT_IDS } from '@openmaic/lib/prompts';
import type { PromptId } from '@openmaic/lib/prompts/types';
import type { UserRequirements } from '@openmaic/lib/types/generation';

export type OutlinePromptPlan = {
  promptId: PromptId;
  interactiveMode: boolean;
};

/** Keep prompt selection and conditional mode variables identical in streaming and batch generation. */
export function resolveOutlinePromptPlan(
  requirements: Pick<UserRequirements, 'interactiveMode' | 'pblProfile'>,
  taskEngineMode = false,
): OutlinePromptPlan {
  const interactiveMode = requirements.interactiveMode === true;
  const promptId = requirements.pblProfile?.generationTemplate === 'pbl-six-stage'
    ? PROMPT_IDS.PBL_COURSE
    : taskEngineMode
      ? PROMPT_IDS.TASK_ENGINE_OUTLINES
      : interactiveMode
        ? PROMPT_IDS.INTERACTIVE_OUTLINES
        : PROMPT_IDS.REQUIREMENTS_TO_OUTLINES;

  return { promptId, interactiveMode };
}
