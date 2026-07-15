import { describe, expect, it } from 'vitest';
import type { Action } from '@openmaic/lib/types/action';
import { normalizeWhiteboardActionLifecycle } from './whiteboard-action-lifecycle';

const speech = (id: string, text: string): Action => ({ id, type: 'speech', text });

describe('normalizeWhiteboardActionLifecycle', () => {
  it('opens before an implicit drawing sequence and closes after its explanation', () => {
    const actions: Action[] = [
      {
        id: 'draw_1',
        type: 'wb_draw_text',
        content: 'Step 1',
        x: 60,
        y: 60,
      },
      speech('speech_1', 'Explain the visible first step.'),
    ];

    expect(normalizeWhiteboardActionLifecycle(actions).map((action) => action.type)).toEqual([
      'wb_open',
      'wb_draw_text',
      'speech',
      'wb_close',
    ]);
  });

  it('returns to the PPT before spotlighting a slide element', () => {
    const actions: Action[] = [
      { id: 'open', type: 'wb_open' },
      {
        id: 'formula',
        type: 'wb_draw_latex',
        latex: 'a+b=c',
        x: 80,
        y: 80,
      },
      speech('speech_1', 'Explain the derivation.'),
      { id: 'focus', type: 'spotlight', elementId: 'conclusion' },
      speech('speech_2', 'Return to the durable conclusion.'),
    ];

    expect(normalizeWhiteboardActionLifecycle(actions).map((action) => action.type)).toEqual([
      'wb_open',
      'wb_draw_latex',
      'speech',
      'wb_close',
      'spotlight',
      'speech',
    ]);
  });

  it('removes duplicate lifecycle actions without moving narration', () => {
    const actions: Action[] = [
      { id: 'open_1', type: 'wb_open' },
      { id: 'open_2', type: 'wb_open' },
      speech('speech_1', 'Set up the process.'),
      { id: 'close_1', type: 'wb_close' },
      { id: 'close_2', type: 'wb_close' },
    ];

    expect(normalizeWhiteboardActionLifecycle(actions)).toEqual([
      actions[0],
      actions[2],
      actions[3],
    ]);
  });
});
