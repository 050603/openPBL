import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackEngine } from './engine';
import type { Scene } from '@openmaic/lib/types/stage';
import type { Action } from '@openmaic/lib/types/action';
import type { ActionEngine } from '@openmaic/lib/action/engine';
import type { AudioPlayer } from '@openmaic/lib/utils/audio-player';

function activityScene(durationSec = 1): Scene {
  return {
    id: 'quiz-scene',
    stageId: 'stage-1',
    order: 0,
    title: 'Quiz',
    type: 'quiz',
    content: { type: 'quiz', questions: [] },
    actions: [
      {
        id: 'activity-gate',
        type: 'speech',
        text: '',
        activityPauseSec: durationSec,
        activityPausePurpose: 'quiz',
      },
      { id: 'after-gate', type: 'laser', elementId: 'answer' },
    ] as Action[],
  } as Scene;
}

function createEngine(callbacks: ConstructorParameters<typeof PlaybackEngine>[3] = {}) {
  const actionEngine = {
    clearEffects: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined),
  } as unknown as ActionEngine;
  const audioPlayer = {
    play: vi.fn().mockResolvedValue(false),
    onEnded: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    isPlaying: vi.fn().mockReturnValue(false),
    hasActiveAudio: vi.fn().mockReturnValue(false),
  } as unknown as AudioPlayer;
  const engine = new PlaybackEngine([activityScene()], actionEngine, audioPlayer, callbacks);
  return { engine, actionEngine };
}

describe('PlaybackEngine activity gates', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('continues after the activity timer expires', async () => {
    const onActivityComplete = vi.fn();
    const { engine, actionEngine } = createEngine({ onActivityComplete });

    engine.start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(onActivityComplete).toHaveBeenCalledWith(
      expect.objectContaining({ sceneId: 'quiz-scene', purpose: 'quiz' }),
      'timeout',
    );
    expect(actionEngine.execute).toHaveBeenCalledTimes(1);
  });

  it('continues once when the student completes early', async () => {
    const { engine, actionEngine } = createEngine();
    engine.start();

    expect(engine.completeActivity('quiz-scene', 'quiz')).toBe(true);
    expect(engine.completeActivity('quiz-scene', 'quiz')).toBe(false);
    await vi.runAllTimersAsync();

    expect(actionEngine.execute).toHaveBeenCalledTimes(1);
  });

  it('preserves the remaining activity time across pause and resume', async () => {
    const { engine, actionEngine } = createEngine();
    engine.start();
    await vi.advanceTimersByTimeAsync(400);
    engine.pause();
    await vi.advanceTimersByTimeAsync(1000);
    expect(actionEngine.execute).not.toHaveBeenCalled();

    engine.resume();
    await vi.advanceTimersByTimeAsync(599);
    expect(actionEngine.execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(actionEngine.execute).toHaveBeenCalledTimes(1);
  });

  it('records completion while paused and continues only after resume', async () => {
    const { engine, actionEngine } = createEngine();
    engine.start();
    engine.pause();

    expect(engine.completeActivity('quiz-scene', 'quiz')).toBe(true);
    await vi.runAllTimersAsync();
    expect(actionEngine.execute).not.toHaveBeenCalled();

    engine.resume();
    await vi.runAllTimersAsync();
    expect(actionEngine.execute).toHaveBeenCalledTimes(1);
  });
});
