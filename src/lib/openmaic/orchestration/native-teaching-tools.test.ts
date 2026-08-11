import { describe, expect, it } from 'vitest';
import { createNativeTeachingTools, getNativeTeachingToolNames } from './native-teaching-tools';

describe('native classroom teaching tools', () => {
  it('exposes only supported and role-allowed actions', () => {
    expect(
      getNativeTeachingToolNames([
        'wb_draw_line',
        'check_understanding',
        'evidence_board_update',
        'not_a_tool',
      ]),
    ).toEqual(['wb_draw_line', 'check_understanding', 'evidence_board_update']);
  });

  it('builds AI SDK tools for whiteboard, formative check, evidence, and simulation actions', () => {
    const tools = createNativeTeachingTools([
      'wb_draw_text',
      'check_understanding',
      'evidence_board_update',
      'widget_setState',
    ]);

    expect(Object.keys(tools)).toEqual([
      'wb_draw_text',
      'check_understanding',
      'evidence_board_update',
      'widget_setState',
    ]);
  });
});
