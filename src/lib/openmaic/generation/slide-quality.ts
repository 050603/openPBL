import type { PPTElement } from '@openmaic/dsl';

export interface SlideQualityAudit {
  passed: boolean;
  reasons: string[];
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasRenderableGeometry(element: PPTElement): boolean {
  if (!finite(element.left) || !finite(element.top) || !finite(element.width)) return false;
  if (element.left < 0 || element.top < 0 || element.width <= 0) return false;
  if (element.type === 'line') return true;
  return finite(element.height) && element.height > 0;
}

function visibleText(value: unknown): boolean {
  return typeof value === 'string'
    && value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').trim().length > 0;
}

function carriesInstructionalContent(element: PPTElement): boolean {
  switch (element.type) {
    case 'text':
      return visibleText(element.content);
    case 'shape':
      return visibleText(element.text?.content);
    case 'image':
      return visibleText(element.src);
    case 'latex':
      return visibleText(element.latex) || visibleText(element.html);
    case 'chart':
    case 'table':
    case 'video':
    case 'audio':
    case 'code':
      return true;
    case 'line':
      return false;
  }
}

/** High-confidence persistence gate; aesthetic judgment remains in the prompt. */
export function auditGeneratedSlide(elements: ReadonlyArray<PPTElement>): SlideQualityAudit {
  const reasons: string[] = [];
  if (elements.length === 0) reasons.push('slide contains no elements');

  const invalidGeometryCount = elements.filter((element) => !hasRenderableGeometry(element)).length;
  if (invalidGeometryCount > 0) {
    reasons.push(`${invalidGeometryCount} element(s) have invalid render geometry`);
  }
  if (elements.length > 0 && !elements.some(carriesInstructionalContent)) {
    reasons.push('slide contains only decorative shapes or lines');
  }

  return { passed: reasons.length === 0, reasons };
}
