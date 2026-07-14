import { describe, expect, it } from 'vitest';
import { deriveTeachingConstraints, formatTeachingConstraintsForPrompt, inferGradeBand } from './teaching-constraints';

describe('teaching constraints', () => {
  it('infers a conservative high-school learner foundation', () => {
    expect(inferGradeBand('高一')).toBe('high-school');
    const result = deriveTeachingConstraints({ grade: '高一', subject: '信息技术', topic: '自然语言处理' });
    expect(result.learnerFoundation).toContain('no university-level specialist knowledge');
    expect(result.terminologyRule).toContain('Define, scaffold, or replace');
  });

  it('uses explicit teacher-provided prior knowledge over inferred defaults', () => {
    const result = deriveTeachingConstraints({
      grade: '高一',
      learnerProfile: { priorKnowledge: '学生已经理解分类和概率的直观含义' },
    });
    expect(result.learnerFoundation).toBe('学生已经理解分类和概率的直观含义');
  });

  it('formats confirmed knowledge points as an authoritative boundary', () => {
    const text = formatTeachingConstraintsForPrompt(deriveTeachingConstraints({
      grade: '八年级',
      knowledgePoints: [{ id: 'kp-1', name: '文本分类', level: 'core' }],
    }));
    expect(text).toContain('kp-1: 文本分类 (core)');
    expect(text).toContain('must never become a hidden prerequisite');
  });
});
