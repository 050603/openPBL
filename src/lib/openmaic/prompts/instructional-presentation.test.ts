import { describe, expect, it } from 'vitest';
import { buildPrompt, loadSnippet, PROMPT_IDS } from './index';

describe('instructional presentation prompt contract', () => {
  it('requires substantive PPT evidence instead of directory-style labels', () => {
    const prompt = buildPrompt(PROMPT_IDS.SLIDE_CONTENT, {
      canvas_width: 1000,
      canvas_height: 562.5,
      title: 'A lesson page',
      description: 'Explain a concept with evidence.',
      keyPoints: '1. Concept\n2. Evidence',
      teacherContext: '',
      pblContext: '',
      timingBudget: 'Target: 120 seconds',
      assignedImages: 'No images',
      languageDirective: 'Use English',
    });

    expect(prompt?.system).toContain('does **not** mean title-only, keyword-only, or directory-style');
    expect(prompt?.system).toContain('exact evidence');
    expect(prompt?.system).toContain('durable summary');
    expect(prompt?.system).toContain('hard to understand by listening alone');
  });

  it('gives slide action generation a cross-discipline whiteboard decision and tools', () => {
    const prompt = buildPrompt(PROMPT_IDS.SLIDE_ACTIONS, {
      title: 'A lesson page',
      keyPoints: '1. Analyze the relationship',
      description: 'Students need to see the reasoning unfold.',
      elements: '- id: "summary", type: "text", Content summary: "Conclusion"',
      courseContext: '',
      agents: '',
      userProfile: '',
      pblContext: '',
      timingBudget: 'Target: 180 seconds',
      languageDirective: 'Use English',
    });

    expect(prompt?.system).toContain('instructional intent and the learner\'s need to see');
    expect(prompt?.system).toContain('wb_open');
    expect(prompt?.system).toContain('wb_draw_text');
    expect(prompt?.system).toContain('wb_draw_latex');
    expect(prompt?.system).toContain('Close and return to PPT');
    expect(prompt?.system).toContain('Do not use the whiteboard merely to copy the slide');
  });

  it('keeps the shared decision policy semantic instead of hard-coding the motivating example', () => {
    const policy = loadSnippet('instructional-presentation-policy');

    expect(policy).toContain('sequence, transformation, difference, annotation');
    expect(policy).toContain('not from subject-specific trigger words');
    expect(policy).not.toMatch(/\bNLP\b|punctuation|question mark|exclamation mark/i);
  });
});
