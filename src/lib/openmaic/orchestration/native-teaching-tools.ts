import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { ACTION_DESCRIPTIONS } from './tool-schemas';

const empty = z.object({});
const elementId = z.string().min(1);
const coordinates = {
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(562),
};

const TOOL_INPUT_SCHEMAS: Record<string, z.ZodType> = {
  spotlight: z.object({ elementId, dimOpacity: z.number().min(0).max(1).optional() }),
  laser: z.object({ elementId, color: z.string().optional() }),
  play_video: z.object({ elementId }),
  wb_open: empty,
  wb_close: empty,
  wb_clear: empty,
  wb_delete: z.object({ elementId }),
  wb_draw_text: z.object({
    content: z.string().min(1),
    ...coordinates,
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    fontSize: z.number().min(8).max(96).optional(),
    color: z.string().optional(),
    elementId: z.string().optional(),
  }),
  wb_draw_shape: z.object({
    shape: z.enum(['rectangle', 'circle', 'triangle']),
    ...coordinates,
    width: z.number().positive(),
    height: z.number().positive(),
    fillColor: z.string().optional(),
    elementId: z.string().optional(),
  }),
  wb_draw_chart: z.object({
    chartType: z.enum(['bar', 'column', 'line', 'pie', 'ring', 'area', 'radar', 'scatter']),
    ...coordinates,
    width: z.number().positive(),
    height: z.number().positive(),
    data: z.object({
      labels: z.array(z.string()),
      legends: z.array(z.string()),
      series: z.array(z.array(z.number())),
    }),
    themeColors: z.array(z.string()).optional(),
    elementId: z.string().optional(),
  }),
  wb_draw_latex: z.object({
    latex: z.string().min(1),
    ...coordinates,
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    color: z.string().optional(),
    elementId: z.string().optional(),
  }),
  wb_draw_table: z.object({
    ...coordinates,
    width: z.number().positive(),
    height: z.number().positive(),
    data: z.array(z.array(z.string())).min(1),
    outline: z
      .object({ width: z.number().positive(), style: z.string(), color: z.string() })
      .optional(),
    theme: z.object({ color: z.string() }).optional(),
    elementId: z.string().optional(),
  }),
  wb_draw_line: z.object({
    startX: z.number().min(0).max(1000),
    startY: z.number().min(0).max(562),
    endX: z.number().min(0).max(1000),
    endY: z.number().min(0).max(562),
    color: z.string().optional(),
    width: z.number().positive().optional(),
    style: z.enum(['solid', 'dashed']).optional(),
    points: z.tuple([z.enum(['', 'arrow']), z.enum(['', 'arrow'])]).optional(),
    elementId: z.string().optional(),
  }),
  wb_draw_code: z.object({
    language: z.string().min(1),
    code: z.string(),
    ...coordinates,
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    fileName: z.string().optional(),
    elementId: z.string().optional(),
  }),
  wb_edit_code: z.object({
    elementId,
    operation: z.enum(['insert_after', 'insert_before', 'delete_lines', 'replace_lines']),
    lineId: z.string().optional(),
    lineIds: z.array(z.string()).optional(),
    content: z.string().optional(),
  }),
  widget_highlight: z.object({ target: z.string().min(1), content: z.string().optional() }),
  widget_setState: z.object({
    state: z.record(z.string(), z.unknown()),
    content: z.string().optional(),
  }),
  widget_annotation: z.object({ target: z.string().min(1), content: z.string().optional() }),
  widget_reveal: z.object({ target: z.string().min(1), content: z.string().optional() }),
  check_understanding: z.object({
    question: z.string().min(1),
    responseType: z.enum([
      'single_choice',
      'multiple_choice',
      'short_answer',
      'prediction',
    ]),
    options: z
      .array(z.object({ id: z.string().min(1), label: z.string().min(1) }))
      .max(6)
      .optional(),
    hint: z.string().optional(),
    expectedEvidence: z.string().optional(),
  }),
  evidence_board_update: z.object({
    operation: z.enum(['replace', 'append', 'clear']),
    title: z.string().optional(),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          claim: z.string().min(1),
          evidence: z.string().min(1),
          reasoning: z.string().optional(),
          source: z.string().optional(),
          sourceStatus: z.enum(['verified', 'student_provided', 'needs_verification']),
          stance: z.enum(['supports', 'challenges', 'neutral']).optional(),
        }),
      )
      .max(8),
  }),
};

export function getNativeTeachingToolNames(allowedActions: readonly string[]): string[] {
  return allowedActions.filter(
    (action) => Boolean(TOOL_INPUT_SCHEMAS[action] && ACTION_DESCRIPTIONS[action]),
  );
}

/**
 * Build request-scoped AI SDK tools. Tool execution only acknowledges the
 * call; the actual side effect is compiled into an Action SSE event and runs
 * in the shared ActionEngine on the classroom client.
 */
export function createNativeTeachingTools(allowedActions: readonly string[]): ToolSet {
  const tools: ToolSet = {};
  for (const actionName of getNativeTeachingToolNames(allowedActions)) {
    tools[actionName] = tool({
      description: ACTION_DESCRIPTIONS[actionName],
      inputSchema: TOOL_INPUT_SCHEMAS[actionName],
      execute: async () => ({ ok: true, scheduledAction: actionName }),
    });
  }
  return tools;
}
