import { describe, expect, it } from 'vitest';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import {
  buildMediaRepairOutlines,
  collectRequestedClassroomMedia,
  reconcileMediaFailures,
} from './classroom-asset-generation';

const outlines: SceneOutline[] = [
  {
    id: 'intro',
    type: 'slide',
    title: '自然语言处理导入',
    description: '课程引入',
    keyPoints: [],
    order: 0,
    mediaGenerations: [
      { type: 'image', elementId: 'image-intro', prompt: '原始引入图', aspectRatio: '16:9' },
      { type: 'image', elementId: 'image-intro', prompt: '重复请求不应再次生成', aspectRatio: '16:9' },
    ],
  },
  {
    id: 'detail',
    type: 'slide',
    title: '分词与词性标注',
    description: '核心知识讲解',
    keyPoints: [],
    order: 1,
    mediaGenerations: [
      { type: 'image', elementId: 'image-detail', prompt: '可能触发审核的原始提示词' },
      { type: 'video', elementId: 'video-detail', prompt: '课堂演示视频' },
    ],
  },
];

describe('classroom asset repair planning', () => {
  it('deduplicates media requests and respects enabled capabilities', () => {
    const requests = collectRequestedClassroomMedia(outlines, { image: true, video: false });

    expect(requests.map((request) => request.elementId)).toEqual(['image-intro', 'image-detail']);
    expect(requests[0]?.prompt).toBe('重复请求不应再次生成');
  });

  it('retries only failed media and replaces rejected image prompts with a safe educational prompt', () => {
    const repair = buildMediaRepairOutlines(outlines, [{
      elementId: 'image-detail',
      type: 'image',
      error: 'Qwen Image failed: DataInspectionFailed inappropriate content',
    }]);

    expect(repair).toHaveLength(1);
    expect(repair[0]?.id).toBe('detail');
    expect(repair[0]?.mediaGenerations).toHaveLength(1);
    expect(repair[0]?.mediaGenerations?.[0]?.prompt).toContain('安全、中性教育课件插图');
    expect(repair[0]?.mediaGenerations?.[0]?.prompt).toContain('分词与词性标注');
  });

  it('does not report completion while any requested file is still missing', () => {
    const requests = collectRequestedClassroomMedia(outlines, { image: true, video: false });
    const failures = reconcileMediaFailures(requests, { 'image-detail': '/media/detail.png' }, []);

    expect(failures).toEqual([{
      elementId: 'image-intro',
      type: 'image',
      error: '素材生成未返回可用文件',
    }]);
  });
});
