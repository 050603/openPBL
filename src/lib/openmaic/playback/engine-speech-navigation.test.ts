import { describe, expect, it, vi } from 'vitest';
import { PlaybackEngine } from './engine';
import type { Scene } from '@openmaic/lib/types/stage';
import type { Action } from '@openmaic/lib/types/action';
import type { ActionEngine } from '@openmaic/lib/action/engine';
import type { AudioPlayer } from '@openmaic/lib/utils/audio-player';

describe('PlaybackEngine speech navigation', () => {
  it('restarts audio and subtitles from the selected speech action', () => {
    const onSpeechStart = vi.fn();
    const onSpeechProgress = vi.fn();
    const actionEngine = {
      clearEffects: vi.fn(),
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as ActionEngine;
    const audioPlayer = {
      play: vi.fn().mockResolvedValue(true),
      onEnded: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
      isPlaying: vi.fn().mockReturnValue(false),
      hasActiveAudio: vi.fn().mockReturnValue(false),
    } as unknown as AudioPlayer;
    const scene = {
      id: 'lesson',
      stageId: 'stage',
      order: 0,
      title: 'Lesson',
      type: 'slide',
      content: { type: 'slide', elements: [] },
      actions: [
        { id: 'speech-1', type: 'speech', text: '第一句', audioUrl: '/first.mp3' },
        { id: 'focus', type: 'spotlight', elementId: 'title' },
        { id: 'speech-2', type: 'speech', text: '第二句', audioUrl: '/second.mp3' },
      ] as Action[],
    } as unknown as Scene;
    const engine = new PlaybackEngine([scene], actionEngine, audioPlayer, {
      onSpeechStart,
      onSpeechProgress,
    });

    expect(engine.playSpeechAt(2)).toBe(true);
    expect(audioPlayer.stop).toHaveBeenCalledTimes(1);
    expect(onSpeechStart).toHaveBeenCalledWith('第二句', {
      sceneId: 'lesson',
      actionIndex: 2,
    });
    expect(onSpeechProgress).toHaveBeenCalledWith(0);
    expect(audioPlayer.play).toHaveBeenCalledWith('', '/second.mp3');
  });

  it('rejects a non-speech action', () => {
    const scene = {
      id: 'lesson',
      stageId: 'stage',
      order: 0,
      title: 'Lesson',
      type: 'slide',
      content: { type: 'slide', elements: [] },
      actions: [{ id: 'focus', type: 'spotlight', elementId: 'title' }] as Action[],
    } as unknown as Scene;
    const engine = new PlaybackEngine(
      [scene],
      { clearEffects: vi.fn() } as unknown as ActionEngine,
      {} as AudioPlayer,
    );

    expect(engine.playSpeechAt(0)).toBe(false);
  });
});
