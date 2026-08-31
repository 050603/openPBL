import { describe, expect, it } from 'vitest';
import type { PPTElement } from '@openmaic/dsl';
import { auditGeneratedSlide } from './slide-quality';

describe('generated slide quality gate', () => {
  it('rejects blank and decoration-only PPT pages', () => {
    expect(auditGeneratedSlide([]).passed).toBe(false);
    expect(auditGeneratedSlide([{
      id: 'shape', type: 'shape', left: 50, top: 50, width: 200, height: 100, rotate: 0,
      path: 'M0 0 L1 0 L1 1 Z', viewBox: [1, 1], fill: '#fff', fixedRatio: false,
    }]).reasons).toContain('slide contains only decorative shapes or lines');
  });

  it('accepts a renderable page with visible instructional content', () => {
    const element = {
      id: 'text', type: 'text', left: 60, top: 60, width: 500, height: 80,
      content: '<p>核心结论与证据</p>', defaultFontName: 'Microsoft YaHei', defaultColor: '#172033',
    } as PPTElement;
    expect(auditGeneratedSlide([element])).toEqual({ passed: true, reasons: [] });
  });
});
