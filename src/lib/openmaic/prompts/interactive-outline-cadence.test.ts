import { describe, expect, it } from 'vitest';
import { buildPrompt, PROMPT_IDS } from './index';

describe('generic interactive outline cadence', () => {
  it('requires explanation-practice alternation without arbitrary widget quotas', () => {
    const prompt = buildPrompt(PROMPT_IDS.INTERACTIVE_OUTLINES, {
      requirement: 'Teach a short concept course',
      userProfile: '',
      pdfContent: 'None',
      availableImages: 'None',
      researchContext: 'None',
      teacherContext: '',
    });
    const combined = `${prompt?.system ?? ''}\n${prompt?.user ?? ''}`;

    expect(combined).toContain('mandatory explanation-practice cadence');
    expect(combined).toContain('one or at most two closely related');
    expect(combined).toContain('quiz does not count as the required interaction');
    expect(combined).toContain('not a fixed widget percentage');
    expect(combined).not.toContain('Minimum 2 scenes');
    expect(combined).not.toContain('70% interactive scenes');
  });
});
