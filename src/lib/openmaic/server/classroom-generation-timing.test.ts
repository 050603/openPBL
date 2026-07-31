import { describe, expect, it } from 'vitest';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import {
  createTtsVoiceTimingCalibration,
  registerTtsVoiceTimingCalibration,
} from '@openmaic/lib/audio/tts-timing';
import { attachTtsTimingPlans } from './classroom-generation';

const selection = {
  providerId: 'qwen-tts',
  modelId: 'qwen3-tts-flash',
  voiceId: 'Serena',
  speed: 1.8,
  language: 'zh-CN',
};

function outline(overrides: Partial<SceneOutline>): SceneOutline {
  return {
    id: 'page-1',
    type: 'slide',
    title: 'Concept',
    description: 'Explain the concept with one example.',
    keyPoints: ['definition', 'example'],
    estimatedDuration: 180,
    targetDurationSec: 180,
    order: 0,
    audience: 'student',
    ttsPolicy: 'target-duration',
    ...overrides,
  };
}

describe('attachTtsTimingPlans', () => {
  it('turns almost the whole slide budget into natural-speed script content', () => {
    const [planned] = attachTtsTimingPlans([outline({})], selection);
    const plan = planned.timingPlan!;

    expect(plan.pageKind).toBe('slide');
    expect(plan.speed).toBe(1);
    expect(plan.naturalSpeedLocked).toBe(true);
    expect(plan.studentActivitySec).toBe(0);
    expect(plan.transitionSec).toBeGreaterThanOrEqual(3);
    expect(plan.transitionSec).toBeLessThanOrEqual(6);
    expect(
      plan.targetDurationSec + (plan.studentActivitySec ?? 0) + (plan.transitionSec ?? 0),
    ).toBe(180);
  });

  it('uses widget steps and type for an interactive page breakdown', () => {
    const [planned] = attachTtsTimingPlans([
      outline({
        id: 'code-page',
        type: 'interactive',
        widgetType: 'code',
        widgetOutline: {
          steps: ['read starter code', 'implement', 'run tests'],
        },
        targetDurationSec: 600,
      }),
    ], selection);
    const plan = planned.timingPlan!;

    expect(plan.pageKind).toBe('interactive');
    expect(plan.readingThinkingSec).toBeGreaterThan(0);
    expect(plan.operationSec).toBeGreaterThan(0);
    expect(plan.studentActivitySec).toBe(
      (plan.readingThinkingSec ?? 0) + (plan.operationSec ?? 0),
    );
    expect(plan.taskComplexity).toBe('high');
    expect(
      plan.targetDurationSec + (plan.studentActivitySec ?? 0) + (plan.transitionSec ?? 0),
    ).toBe(600);
  });

  it('uses quiz configuration and keeps feedback inside narration', () => {
    const [planned] = attachTtsTimingPlans([
      outline({
        id: 'quiz-page',
        type: 'quiz',
        quizConfig: {
          questionCount: 3,
          questionTypes: ['single', 'short_answer', 'scenario_task'],
          difficulty: 'hard',
        },
        targetDurationSec: 480,
      }),
    ], selection);
    const plan = planned.timingPlan!;

    expect(plan.pageKind).toBe('quiz');
    expect(plan.readingThinkingSec).toBeGreaterThan(0);
    expect(plan.operationSec).toBeGreaterThan(0);
    expect(plan.feedbackSec).toBeGreaterThan(0);
    expect(plan.feedbackSec).toBeLessThanOrEqual(plan.targetDurationSec);
    expect(
      plan.targetDurationSec + (plan.studentActivitySec ?? 0) + (plan.transitionSec ?? 0),
    ).toBe(480);
  });

  it('uses the exact selected voice calibration in the generated page plan', () => {
    const text = '这是用于课堂逐页讲稿预算的音色校准样本。'.repeat(12);
    registerTtsVoiceTimingCalibration(createTtsVoiceTimingCalibration({
      providerId: 'generation-voice-test',
      modelId: 'natural-model',
      voiceId: 'teacher-voice',
      text,
      measuredDurationSec: 30,
    }));

    const [planned] = attachTtsTimingPlans([outline({ targetDurationSec: 120 })], {
      providerId: 'generation-voice-test',
      modelId: 'natural-model',
      voiceId: 'teacher-voice',
      speed: 2,
      language: 'zh-CN',
    });

    expect(planned.timingPlan).toMatchObject({
      providerId: 'generation-voice-test',
      modelId: 'natural-model',
      voiceId: 'teacher-voice',
      calibrationSource: 'configured',
      naturalSpeedLocked: true,
      speed: 1,
    });
    expect(planned.timingPlan?.targetUnits).toBeGreaterThan(0);
  });

  it('does not add student TTS timing to teacher-only resources', () => {
    const [planned] = attachTtsTimingPlans([
      outline({ audience: 'teacher', ttsPolicy: 'none' }),
    ], selection);

    expect(planned.timingPlan).toBeUndefined();
  });
});
