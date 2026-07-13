import { describe, expect, it } from 'vitest';
import {
  assessPblTimeAllocation,
  buildPblProjectMainline,
  derivePblTimeRatios,
  estimateTtsDurationSec,
  PBL_TIME_RATIOS,
  rescalePblDetailDurations,
  suggestPblTimeAllocation,
} from './pbl-time-model';

describe('PBL time model', () => {
  it('keeps the standard ratios normalized', () => {
    expect(Object.values(PBL_TIME_RATIOS).reduce((sum, value) => sum + value, 0)).toBe(1);
  });

  it('allocates one-to-many knowledge activities and preserves the total', () => {
    const suggestions = suggestPblTimeAllocation(120, [
      { id: 'launch', stageKey: 'launch' },
      { id: 'k1', stageKey: 'ai-learning' },
      { id: 'k2', stageKey: 'ai-learning' },
      { id: 'k3', stageKey: 'ai-learning' },
      { id: 'make', stageKey: 'make' },
      { id: 'showcase', stageKey: 'showcase' },
      { id: 'reflection', stageKey: 'reflection' },
    ]);

    expect(Object.values(suggestions).reduce((sum, value) => sum + value, 0)).toBe(120);
    expect(suggestions.k1).toBe(suggestions.k2);
    expect(suggestions.k2).toBe(suggestions.k3);
    expect(suggestions.make).toBeGreaterThan(suggestions.k1);
  });

  it('warns when knowledge teaching is longer than project practice', () => {
    const assessment = assessPblTimeAllocation(60, [
      { id: 'knowledge', stageKey: 'ai-learning', durationMin: 20 },
      { id: 'practice', stageKey: 'make', durationMin: 10 },
      { id: 'other', stageKey: 'launch', durationMin: 30 },
    ]);

    expect(assessment.warnings.map((warning) => warning.code)).toContain('knowledge-exceeds-practice');
  });

  it('allows a teacher override while reporting total mismatch', () => {
    const assessment = assessPblTimeAllocation(90, [
      { id: 'launch', stageKey: 'launch', durationMin: 10 },
      { id: 'practice', stageKey: 'make', durationMin: 50 },
    ]);

    expect(assessment.allocatedMinutes).toBe(60);
    expect(assessment.warnings.map((warning) => warning.code)).toContain('allocation-total-mismatch');
  });

  it('always recommends all six modules instead of renormalizing to AI learning', () => {
    const assessment = assessPblTimeAllocation(120, [
      { id: 'knowledge', stageKey: 'ai-learning', durationMin: 120 },
    ]);

    expect(assessment.recommendedStageTotals.knowledge).toBe(24);
    expect(assessment.recommendedStageTotals.practice).toBe(48);
    expect(assessment.warnings.map((warning) => warning.code)).toContain('missing-module');
  });

  it('keeps practice as the largest module for advanced projects', () => {
    const ratios = derivePblTimeRatios({
      topic: '跨学科开放性研究项目',
      grade: '高一',
      difficulty: 'advanced',
      knowledgePoints: [
        { id: 'kp-1', level: 'foundation' },
        { id: 'kp-2', level: 'application' },
        { id: 'kp-3', level: 'extension' },
      ],
    });

    expect(ratios.practice).toBeGreaterThan(ratios.knowledge);
    expect(ratios.practice).toBeGreaterThan(ratios.launch);
    expect(Object.values(ratios).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it('builds a strict six-module mainline and rescales child targets', () => {
    const activities = [
      { id: 'launch', stageKey: 'project-launch', durationMin: 10 },
      { id: 'knowledge', stageKey: 'ai-learning', durationMin: 20 },
      { id: 'proposal', stageKey: 'proposal', durationMin: 10 },
      { id: 'practice', stageKey: 'make', durationMin: 50 },
      { id: 'showcase', stageKey: 'showcase', durationMin: 20 },
      { id: 'reflection', stageKey: 'reflection', durationMin: 10 },
    ];
    const mainline = buildPblProjectMainline(120, activities);
    expect(mainline.modules).toHaveLength(6);
    expect(mainline.modules.at(-1)?.endMin).toBe(120);

    const details = rescalePblDetailDurations(
      [
        { id: 'd1', parentActivityId: 'practice', targetDurationSec: 1200 },
        { id: 'd2', parentActivityId: 'practice', targetDurationSec: 1800 },
      ],
      [{ id: 'practice', durationMin: 30 }],
    );
    expect(details.reduce((sum, detail) => sum + (detail.targetDurationSec ?? 0), 0)).toBe(1800);
  });

  it('estimates a positive Chinese TTS duration', () => {
    expect(estimateTtsDurationSec('请先观察数据，再说明你的判断依据。')).toBeGreaterThan(1);
  });
});
