import { describe, expect, it } from 'vitest';
import { normalizeQuizQuestions, selectQuizFormats } from './quality';

describe('quiz quality normalization', () => {
  it('normalizes a true-false alias into a renderable single choice', () => {
    const result = normalizeQuizQuestions([{ type: 'judgment', question: '文本分类只能处理英文。', answer: false, analysis: '文本分类可以处理多种语言，关键在于数据和处理方法。' }]);
    expect(result.questions[0]).toMatchObject({ type: 'single', format: 'true_false', answer: ['false'] });
    expect(result.questions[0]?.options).toHaveLength(2);
  });

  it('downgrades unsupported matching data into a gradable scenario task', () => {
    const result = normalizeQuizQuestions([{ type: 'matching', question: '关联概念与例子', pairs: [{ left: '分类', right: '垃圾邮件识别' }] }]);
    expect(result.questions[0]).toMatchObject({ type: 'short_answer', format: 'scenario_task', hasAnswer: false });
    expect(result.questions[0]?.commentPrompt).toContain('60%');
    expect(result.issues[0]).toContain('downgraded');
  });

  it('repairs malformed choice questions instead of storing an ungradable choice', () => {
    const result = normalizeQuizQuestions([{ type: 'single', question: '哪个描述正确？', options: ['A', 'B'] }]);
    expect(result.questions[0]?.type).toBe('short_answer');
    expect(result.questions[0]?.commentPrompt).toBeTruthy();
  });

  it('adds analysis and maps label answers to stable option values', () => {
    const result = normalizeQuizQuestions([{ type: 'single', question: '选择生活中的文本分类例子', options: ['垃圾邮件识别', '调节屏幕亮度'], correctAnswer: '垃圾邮件识别' }]);
    expect(result.questions[0]?.answer).toEqual(['A']);
    expect(result.questions[0]?.analysis?.length).toBeGreaterThan(12);
  });

  it('selects assessment forms from the objective rather than randomly', () => {
    expect(selectQuizFormats({
      objectiveText: '比较两种分类结果并应用到校园情境', difficulty: 'medium', questionCount: 3, requested: ['single'],
    })).toEqual(['single', 'multiple', 'scenario_task']);
  });
});
