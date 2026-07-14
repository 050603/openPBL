import { describe, expect, it } from 'vitest';
import {
  assessTtsDurationError,
  buildTtsTimingPlan,
  calculateTtsContentBudget,
  createTtsVoiceTimingCalibration,
  getTtsCalibrationKey,
  mergeTtsVoiceTimingCalibrations,
  estimateSpeechDurationSec,
  getTtsTimingProfile,
  registerTtsVoiceTimingCalibration,
} from './tts-timing';

describe('TTS timing model', () => {
  it('resolves a model-specific static profile', () => {
    const qwen = getTtsTimingProfile('qwen-tts', 'qwen3-tts-flash');
    const azure = getTtsTimingProfile('azure-tts', '');

    expect(qwen.modelId).toBe('qwen3-tts-flash');
    expect(azure.providerId).toBe('azure-tts');
    expect(qwen.id).not.toBe(azure.id);
  });

  it('keeps an unknown provider/model extensible with a safe static profile', () => {
    const profile = getTtsTimingProfile('new-tts-provider', 'new-model-v1');
    expect(profile.providerId).toBe('new-tts-provider');
    expect(profile.modelId).toBe('new-model-v1');
    expect(profile.cjkCharsPerMinute).toBeGreaterThan(0);
    expect(profile.source).toBe('seed');
  });

  it('calculates enough Chinese content for a five-minute narration', () => {
    const profile = getTtsTimingProfile('qwen-tts', 'qwen3-tts-flash');
    const budget = calculateTtsContentBudget(300, {
      profile,
      speed: 1,
      language: 'zh-CN',
      punctuationRatio: 1 / 28,
    });

    expect(budget.unit).toBe('cjk-char');
    expect(budget.targetUnits).toBeGreaterThan(1_000);
    expect(budget.targetUnits).toBeLessThan(1_500);
    expect(budget.minUnits).toBeLessThan(budget.targetUnits);
    expect(budget.maxUnits).toBeGreaterThan(budget.targetUnits);
  });

  it('handles mixed speech with the selected speed', () => {
    const profile = getTtsTimingProfile('azure-tts', '');
    const text = 'This is an API design case. Observe request and response.';
    const normal = estimateSpeechDurationSec(text, { profile, speed: 1 });
    const faster = estimateSpeechDurationSec(text, { profile, speed: 1.5 });

    expect(normal).toBeGreaterThan(faster);
    expect(faster).toBeGreaterThan(1);
  });

  it('reports a concrete adjustment when a one-off estimate is outside ten percent', () => {
    const assessment = assessTtsDurationError({ targetSec: 300, actualSec: 105 });

    expect(assessment.status).toBe('under');
    expect(assessment.errorRatio).toBeCloseTo(-0.65, 2);
    expect(assessment.withinTolerance).toBe(false);
    expect(assessment.suggestions.length).toBeGreaterThan(0);
  });

  it('builds a static plan that can be recalculated for another model', () => {
    const plan = buildTtsTimingPlan({
      targetDurationSec: 300,
      providerId: 'qwen-tts',
      modelId: 'qwen3-tts-flash',
      speed: 1,
      language: 'zh-CN',
      contentType: 'theory',
    });

    expect(plan.targetDurationSec).toBe(300);
    expect(plan.targetUnits).toBeGreaterThan(1_000);
    expect(plan.contentType).toBe('theory');
    expect(plan).not.toHaveProperty('calibration');
    expect(plan).not.toHaveProperty('expectedNaturalDurationSec');
  });

  it('calibrates and resolves an exact provider/model/voice at natural speed', () => {
    const text = '这是用于自然语速建模的一段标准课程讲解文本。';
    const calibration = createTtsVoiceTimingCalibration({
      providerId: 'qwen-tts',
      modelId: 'qwen3-tts-flash',
      voiceId: 'Cherry',
      text,
      measuredDurationSec: 6,
    });
    registerTtsVoiceTimingCalibration(calibration);

    const exact = getTtsTimingProfile('qwen-tts', 'qwen3-tts-flash', 'Cherry');
    const otherVoice = getTtsTimingProfile('qwen-tts', 'qwen3-tts-flash', 'Serena');

    expect(exact.source).toBe('configured');
    expect(exact.voiceId).toBe('Cherry');
    expect(exact.punctuationPauseSec).toBe(0);
    expect(otherVoice.source).toBe('seed');
  });

  it('records narration and silent student activity as separate budgets', () => {
    const plan = buildTtsTimingPlan({
      targetDurationSec: 55,
      activityTargetDurationSec: 180,
      studentActivitySec: 115,
      feedbackSec: 25,
      transitionSec: 10,
      providerId: 'qwen-tts',
      modelId: 'qwen3-tts-flash',
      voiceId: 'Serena',
      contentType: 'quiz',
    });

    expect(plan.speed).toBe(1);
    expect(plan.narrationSec).toBe(55);
    expect(plan.studentActivitySec).toBe(115);
    expect(plan.feedbackSec).toBe(25);
    expect(plan.transitionSec).toBe(10);
  });

  it('binds calibration identity to provider, model, voice, language, and speed', () => {
    const base = createTtsVoiceTimingCalibration({
      providerId: 'qwen-tts',
      modelId: 'qwen3-tts-flash',
      voiceId: 'Cherry',
      language: 'zh-CN',
      speed: 1,
      text: '这是测试文本。',
      measuredDurationSec: 2,
    });
    expect(getTtsCalibrationKey(base)).not.toBe(getTtsCalibrationKey({ ...base, voiceId: 'Serena' }));
    expect(getTtsCalibrationKey(base)).not.toBe(getTtsCalibrationKey({ ...base, language: 'en-US' }));
    expect(getTtsCalibrationKey(base)).not.toBe(getTtsCalibrationKey({ ...base, speed: 1.2 }));
  });

  it('aggregates repeated samples by total units and decoded duration', () => {
    const first = createTtsVoiceTimingCalibration({
      providerId: 'qwen-tts', modelId: 'qwen3-tts-flash', voiceId: 'Cherry',
      text: '这是第一段标准测试文本。', measuredDurationSec: 3,
    });
    const second = createTtsVoiceTimingCalibration({
      providerId: 'qwen-tts', modelId: 'qwen3-tts-flash', voiceId: 'Cherry',
      text: '这是第二段标准测试文本。', measuredDurationSec: 5,
    });
    const aggregate = mergeTtsVoiceTimingCalibrations(first, second);

    expect(aggregate.sampleCount).toBe(2);
    expect(aggregate.totalSampleUnits).toBe(first.sampleUnits + second.sampleUnits);
    expect(aggregate.totalMeasuredDurationSec).toBe(8);
    expect(aggregate.cjkCharsPerMinute).toBeCloseTo(
      ((first.sampleUnits + second.sampleUnits) * 60) / 8,
      1,
    );
  });
});
