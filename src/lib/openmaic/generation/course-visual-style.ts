import type { SlideTheme } from '@openmaic/dsl';

export interface CourseVisualStyle {
  id: string;
  name: string;
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  mutedText: string;
  theme: SlideTheme;
}

const PALETTES: ReadonlyArray<Omit<CourseVisualStyle, 'theme'>> = [
  {
    id: 'cobalt-teal', name: 'Cobalt & Teal', background: '#F7FAFC', surface: '#FFFFFF',
    primary: '#1D4ED8', secondary: '#0F766E', accent: '#F59E0B', text: '#172033', mutedText: '#526077',
  },
  {
    id: 'indigo-amber', name: 'Indigo & Amber', background: '#F8F7FC', surface: '#FFFFFF',
    primary: '#4F46E5', secondary: '#7C3AED', accent: '#D97706', text: '#1F1B2D', mutedText: '#625B72',
  },
  {
    id: 'forest-coral', name: 'Forest & Coral', background: '#F6FAF7', surface: '#FFFFFF',
    primary: '#166534', secondary: '#0F766E', accent: '#EA580C', text: '#17251D', mutedText: '#53665A',
  },
  {
    id: 'navy-cyan', name: 'Navy & Cyan', background: '#F5F8FC', surface: '#FFFFFF',
    primary: '#123A63', secondary: '#0369A1', accent: '#0891B2', text: '#152536', mutedText: '#53677A',
  },
  {
    id: 'plum-rose', name: 'Plum & Rose', background: '#FCF7FB', surface: '#FFFFFF',
    primary: '#7E22CE', secondary: '#BE185D', accent: '#E11D48', text: '#2C1831', mutedText: '#735D78',
  },
];

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function paletteIndex(seed: string): number {
  const text = seed.toLowerCase();
  if (/小学|儿童|child|playful|活泼|趣味/.test(text)) return 1;
  if (/自然|生态|生物|地理|environment|biology|nature/.test(text)) return 2;
  if (/商业|工程|计算机|信息|business|engineering|computer|technology/.test(text)) return 3;
  if (/艺术|文学|历史|人文|art|literature|history|humanities/.test(text)) return 4;
  return stableHash(text.trim() || 'openpbl-course') % PALETTES.length;
}

export function resolveCourseVisualStyle(seed: string): CourseVisualStyle {
  const palette = PALETTES[paletteIndex(seed)];
  return {
    ...palette,
    theme: {
      backgroundColor: palette.background,
      themeColors: [
        palette.primary,
        palette.secondary,
        palette.accent,
        palette.surface,
        palette.mutedText,
      ],
      fontColor: palette.text,
      fontName: 'Microsoft YaHei',
      outline: { color: palette.primary, width: 2, style: 'solid' },
      shadow: { h: 0, v: 3, blur: 14, color: '#000000' },
    },
  };
}

export function formatCourseVisualStyle(style: CourseVisualStyle): string {
  return [
    `Theme: ${style.name} (${style.id})`,
    `Canvas background: ${style.background}; content surfaces: ${style.surface}`,
    `Primary: ${style.primary}; secondary: ${style.secondary}; accent: ${style.accent}`,
    `Main text: ${style.text}; secondary text: ${style.mutedText}`,
    '- Use this exact family across every PPT page in the course. Do not invent another saturated palette.',
    '- Use primary for titles and structural anchors, secondary for relationships/comparisons, and accent only for the single most important focus or warning.',
    '- Choose the layout from the page meaning: comparison, process, evidence, hierarchy, worked example, or summary. Preserve generous whitespace and one clear visual focal point.',
  ].join('\n');
}
