import { describe, expect, it } from 'vitest';
import { normalizePblTeachingOutline } from './pbl-outline-normalization';

describe('PBL teaching outline normalization', () => {
  it('does not manufacture canonical modules for an empty draft', () => {
    expect(normalizePblTeachingOutline([], { totalMinutes: 60 })).toEqual([]);
  });

  it('fills missing canonical modules and puts all confirmed knowledge IDs in AI learning', () => {
    const result = normalizePblTeachingOutline(
      [
        {
          id: 'to-knowledge',
          stageKey: 'ai-learning',
          title: '知识讲解',
          durationMin: 120,
          teachingGoal: '理解基础概念',
          teacherRole: '点拨',
          platformRole: '展示',
          aiRole: '讲解',
          studentActivity: '学习',
          openMaicUse: 'student-ai-learning',
        },
      ],
      {
        totalMinutes: 120,
        topic: '校园节能项目',
        grade: '六年级',
        difficulty: 'standard',
        knowledgePoints: [
          { id: 'kp-1', name: '数据', description: '' },
          { id: 'kp-2', name: '证据', description: '' },
        ],
      },
    );

    expect(result.map((activity) => activity.stageKey).slice(0, 6)).toEqual([
      'launch',
      'ai-learning',
      'proposal',
      'make',
      'showcase',
      'reflection',
    ]);
    expect(result.find((activity) => activity.stageKey === 'ai-learning')?.knowledgePointIds).toEqual([
      'kp-1',
      'kp-2',
    ]);
    expect(result.reduce((sum, activity) => sum + activity.durationMin, 0)).toBe(120);
    expect(result.find((activity) => activity.stageKey === 'make')?.durationMin).toBeGreaterThan(
      result.find((activity) => activity.stageKey === 'ai-learning')?.durationMin ?? 0,
    );
  });
});
