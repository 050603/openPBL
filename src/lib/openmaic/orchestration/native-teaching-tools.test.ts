import { describe, expect, it } from 'vitest';
import { createNativeTeachingTools, getNativeTeachingToolNames } from './native-teaching-tools';

describe('native classroom teaching tools', () => {
  it('exposes only supported and role-allowed actions', () => {
    expect(
      getNativeTeachingToolNames([
        'wb_draw_line',
        'not_a_tool',
      ]),
    ).toEqual(['wb_draw_line']);
  });

  it('builds AI SDK tools for whiteboard and simulation actions', () => {
    const tools = createNativeTeachingTools([
      'wb_draw_text',
      'widget_setState',
    ]);

    expect(Object.keys(tools)).toEqual([
      'wb_draw_text',
      'widget_setState',
    ]);
  });
});
