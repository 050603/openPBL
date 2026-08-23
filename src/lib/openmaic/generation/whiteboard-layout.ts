import type { Action } from '@openmaic/lib/types/action';

type Box = { id: string; left: number; top: number; width: number; height: number };

function boxFor(action: Action): Box | null {
  const id = 'elementId' in action && action.elementId ? action.elementId : action.id;
  switch (action.type) {
    case 'wb_draw_text':
      return { id, left: action.x, top: action.y, width: action.width ?? 400, height: action.height ?? 100 };
    case 'wb_draw_shape':
    case 'wb_draw_chart':
    case 'wb_draw_table':
      return { id, left: action.x, top: action.y, width: action.width, height: action.height };
    case 'wb_draw_latex':
      return { id, left: action.x, top: action.y, width: action.width ?? 400, height: action.height ?? 80 };
    case 'wb_draw_code':
      return { id, left: action.x, top: action.y, width: action.width ?? 500, height: action.height ?? 300 };
    case 'wb_draw_line': {
      const left = Math.min(action.startX, action.endX);
      const top = Math.min(action.startY, action.endY);
      return {
        id,
        left,
        top,
        width: Math.max(8, Math.abs(action.endX - action.startX)),
        height: Math.max(8, Math.abs(action.endY - action.startY)),
      };
    }
    default:
      return null;
  }
}

function overlaps(left: Box, right: Box, gap = 18): boolean {
  return !(
    left.left + left.width + gap <= right.left
    || right.left + right.width + gap <= left.left
    || left.top + left.height + gap <= right.top
    || right.top + right.height + gap <= left.top
  );
}

function translate(action: Action, deltaY: number): Action {
  if (deltaY <= 0) return { ...action };
  switch (action.type) {
    case 'wb_draw_text':
    case 'wb_draw_shape':
    case 'wb_draw_chart':
    case 'wb_draw_latex':
    case 'wb_draw_table':
    case 'wb_draw_code':
      return { ...action, y: action.y + deltaY };
    case 'wb_draw_line':
      return { ...action, startY: action.startY + deltaY, endY: action.endY + deltaY };
    default:
      return { ...action };
  }
}

/** Keep sequential board additions from covering content already written. */
export function normalizeWhiteboardActionLayout(actions: ReadonlyArray<Action>): Action[] {
  const occupied: Box[] = [];
  return actions.map((source) => {
    if (source.type === 'wb_clear') {
      occupied.length = 0;
      return { ...source };
    }
    if (source.type === 'wb_delete') {
      const index = occupied.findIndex((box) => box.id === source.elementId);
      if (index >= 0) occupied.splice(index, 1);
      return { ...source };
    }

    const initial = boxFor(source);
    if (!initial) return { ...source };
    const existingIndex = occupied.findIndex((box) => box.id === initial.id);
    if (existingIndex >= 0) occupied.splice(existingIndex, 1);

    let candidate = initial;
    let guard = 0;
    while (guard++ < 100) {
      const conflicts = occupied.filter((box) => overlaps(candidate, box));
      if (conflicts.length === 0) break;
      candidate = {
        ...candidate,
        top: Math.max(...conflicts.map((box) => box.top + box.height + 24)),
      };
    }
    occupied.push(candidate);
    return translate(source, candidate.top - initial.top);
  });
}
