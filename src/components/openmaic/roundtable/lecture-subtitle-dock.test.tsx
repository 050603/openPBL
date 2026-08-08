import { describe, expect, it } from 'vitest';
import {
  buildSubtitleLines,
  resolveActiveCueIndex,
  resolveActiveSubtitleLineIndex,
  splitSubtitleText,
} from './lecture-subtitle-dock';

const cues = [
  { actionIndex: 0, text: '第一句' },
  { actionIndex: 2, text: '第二句' },
  { actionIndex: 4, text: '第三句' },
];

describe('resolveActiveCueIndex', () => {
  it('uses the playback action index as the authoritative TTS cue', () => {
    expect(resolveActiveCueIndex(cues, 2, '第一句')).toBe(1);
  });

  it('falls back to exact text for an older playback callback', () => {
    expect(resolveActiveCueIndex(cues, -1, '第三句')).toBe(2);
  });

  it('starts at the first cue before playback begins', () => {
    expect(resolveActiveCueIndex(cues, -1, '')).toBe(0);
  });
});

describe('long subtitle paging', () => {
  it('preserves complete sentences instead of dividing them by character count', () => {
    const text = '这是一个较长的讲解段落，需要跟随语音自动翻阅，并让正在朗读的内容始终清楚可见。';
    const lines = splitSubtitleText(text);

    expect(lines).toEqual([text]);
    expect(lines.join('')).toBe(text);
  });

  it('starts a new display unit only after sentence-ending punctuation', () => {
    expect(splitSubtitleText('第一句很长，逗号不会拆分；分号会拆分。第二句呢？最后一句！')).toEqual([
      '第一句很长，逗号不会拆分；',
      '分号会拆分。',
      '第二句呢？',
      '最后一句！',
    ]);
    expect(splitSubtitleText('Version 1.0 remains together. Next sentence.')).toEqual([
      'Version 1.0 remains together.',
      'Next sentence.',
    ]);
  });

  it('maps speech progress to the matching line including the final line', () => {
    const lines = buildSubtitleLines([{ actionIndex: 3, text: '第一部分内容，第二部分内容，最后一句。' }]);

    expect(resolveActiveSubtitleLineIndex(lines, 0, 0)).toBe(0);
    expect(resolveActiveSubtitleLineIndex(lines, 0, 1)).toBe(lines.length - 1);
  });

  it('keeps progress scoped to the active speech cue', () => {
    const lines = buildSubtitleLines([
      { actionIndex: 0, text: '前一段。' },
      { actionIndex: 2, text: '当前段第一句，当前段第二句。' },
    ]);
    const activeIndex = resolveActiveSubtitleLineIndex(lines, 1, 0);

    expect(lines[activeIndex]?.actionIndex).toBe(2);
  });
});
