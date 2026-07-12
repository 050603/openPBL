import { describe, expect, it } from 'vitest';
import {
  assessPblTimeAllocation,
  PBL_TIME_RATIOS,
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
});
