import { describe, expect, it } from 'vitest';
import { formatCourseVisualStyle, resolveCourseVisualStyle } from './course-visual-style';

describe('course visual style', () => {
  it('is stable for every page generated from the same course request', () => {
    expect(resolveCourseVisualStyle('高中物理：动量守恒'))
      .toEqual(resolveCourseVisualStyle('高中物理：动量守恒'));
  });

  it('selects subject-aware palettes while preserving accessible visual roles', () => {
    const style = resolveCourseVisualStyle('初中生物生态系统课程');
    expect(style.id).toBe('forest-coral');
    expect(style.theme.themeColors).toContain(style.primary);
    expect(formatCourseVisualStyle(style)).toContain('one clear visual focal point');
  });
});
