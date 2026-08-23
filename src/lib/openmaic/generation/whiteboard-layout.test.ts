import { describe, expect, it } from 'vitest';
import type { Action } from '@openmaic/lib/types/action';
import { normalizeWhiteboardActionLayout } from './whiteboard-layout';

describe('normalizeWhiteboardActionLayout', () => {
  it('moves later content below an existing note instead of covering it', () => {
    const actions: Action[] = [
      { id: 'a', type: 'wb_draw_text', elementId: 'a', content: '前文', x: 40, y: 40, width: 400, height: 100 },
      { id: 'b', type: 'wb_draw_text', elementId: 'b', content: '后文', x: 60, y: 70, width: 400, height: 100 },
    ];
    const result = normalizeWhiteboardActionLayout(actions);
    expect(result[0]).toMatchObject({ y: 40 });
    expect(result[1]).toMatchObject({ y: 164 });
  });

  it('starts a fresh layout page after a board clear', () => {
    const result = normalizeWhiteboardActionLayout([
      { id: 'a', type: 'wb_draw_text', content: '旧内容', x: 40, y: 40 },
      { id: 'clear', type: 'wb_clear' },
      { id: 'b', type: 'wb_draw_text', content: '新内容', x: 40, y: 40 },
    ]);
    expect(result[2]).toMatchObject({ y: 40 });
  });
});
