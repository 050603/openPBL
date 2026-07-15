import { describe, expect, it } from 'vitest';
import {
  buildPblTimingInputFromScene,
  estimatePblActivityTime,
} from './pbl-time-estimation';

describe('PBL activity time estimation', () => {
  it('estimates theory narration from static TTS parameters and includes transition time', () => {
    const estimate = estimatePblActivityTime({
      id: 'theory-1',
      stageKey: 'ai-learning',
      activityKind: 'knowledge',
      contentType: 'theory',
      speechText: 'Understand the relationship between variables, functions, and input/output. '.repeat(8),
      targetDurationSec: 300,
      tts: { providerId: 'qwen-tts', modelId: 'qwen3-tts-flash', speed: 1, language: 'zh-CN' },
    });

    expect(estimate.ttsSec).toBeGreaterThan(10);
    expect(estimate.transitionSec).toBeGreaterThan(0);
    expect(estimate.totalSec).toBeGreaterThan(estimate.ttsSec);
  });

  it('models case analysis interaction separately from spoken explanation', () => {
    const estimate = estimatePblActivityTime({
      id: 'case-1',
      stageKey: 'proposal',
      activityKind: 'proposal',
      contentType: 'case-analysis',
      speechText: 'Read the case, compare evidence, and make a judgment. '.repeat(5),
      interaction: { type: 'case-analysis', stepCount: 3, difficulty: 'advanced' },
    });

    expect(estimate.interactionSec).toBeGreaterThan(estimate.ttsSec);
    expect(estimate.recommendations.length).toBeGreaterThan(0);
  });

  it('covers technical explanations with a slower static model', () => {
    const estimate = estimatePblActivityTime({
      id: 'technical-1',
      stageKey: 'make',
      activityKind: 'practice',
      contentType: 'technical-explanation',
      speechText: 'First configure the environment, then run tests, and finally verify the fix. '.repeat(10),
      tts: { providerId: 'voxcpm-tts', modelId: 'voxcpm2', speed: 1, language: 'zh-CN' },
    });
    expect(estimate.ttsSec).toBeGreaterThan(10);
    expect(estimate.recommendations.length).toBeGreaterThan(0);
  });

  it('estimates quiz time from question count, type, and difficulty', () => {
    const estimate = estimatePblActivityTime({
      id: 'quiz-1',
      stageKey: 'ai-learning',
      activityKind: 'knowledge',
      contentType: 'quiz',
      quiz: {
        questionCount: 4,
        questionTypes: ['single', 'multiple', 'short_answer'],
        difficulty: 'advanced',
      },
    });

    expect(estimate.quizSec).toBeGreaterThan(240);
    expect(estimate.totalSec).toBe(estimate.quizSec + estimate.teacherSec + estimate.transitionSec);
  });

  it('keeps teacher resources in the total without treating them as TTS', () => {
    const input = buildPblTimingInputFromScene({
      id: 'teacher-launch',
      title: 'Project launch',
      stageKey: 'launch',
      audience: 'teacher',
      type: 'slide',
      targetDurationSec: 600,
    });

    const estimate = estimatePblActivityTime(input);
    expect(estimate.ttsSec).toBe(0);
    expect(estimate.teacherSec).toBe(600);
    expect(estimate.totalSec).toBe(600);
  });

  it('maps scene interactions to the same static model used by classroom generation', () => {
    const input = buildPblTimingInputFromScene({
      id: 'student-practice',
      title: 'Interactive practice',
      stageKey: 'ai-learning',
      audience: 'student',
      type: 'interactive',
      widgetType: 'simulation',
      widgetOutline: { steps: ['observe', 'compare', 'explain'] },
      targetDurationSec: 600,
      ttsPolicy: 'target-duration',
    }, 'Observe and explain the simulation result.');

    const estimate = estimatePblActivityTime(input);
    expect(input.interaction?.stepCount).toBe(3);
    expect(estimate.interactionSec).toBeGreaterThan(0);
    expect(estimate.ttsSec).toBeGreaterThan(0);
  });
});
