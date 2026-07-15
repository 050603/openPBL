import { describe, expect, it } from 'vitest';
import { buildPrompt, PROMPT_IDS } from './index';

const widgetPromptIds = [
  PROMPT_IDS.CODE_CONTENT,
  PROMPT_IDS.DIAGRAM_CONTENT,
  PROMPT_IDS.GAME_CONTENT,
  PROMPT_IDS.SIMULATION_CONTENT,
  PROMPT_IDS.VISUALIZATION3D_CONTENT,
] as const;

describe('widget knowledge-teaching contract', () => {
  it.each(widgetPromptIds)('%s requires a complete, non-decorative teaching loop', (promptId) => {
    const prompt = buildPrompt(promptId, {
      title: '测试主题',
      description: '测试描述',
      keyPoints: '1. 知识点 A\n2. 知识点 B',
    });
    const user = prompt?.user ?? '';

    expect(user).toContain('Objective Alignment');
    expect(user).toContain('No Decorative Interaction');
    expect(user).toContain('Explanatory Feedback');
    expect(user).toContain('Mastery Evidence');
    expect(user).toContain('predict');
    expect(user).toContain('transfer');
  });
});
