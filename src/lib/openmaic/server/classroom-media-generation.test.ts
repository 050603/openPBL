import { describe, expect, it } from 'vitest';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import type { Scene } from '@openmaic/lib/types/stage';
import {
  findUnresolvedClassroomMedia,
  mediaServingUrl,
  replaceMediaPlaceholders,
} from './classroom-media-generation';

describe('classroom media URL and placeholder backfill', () => {
  it('always builds migration-safe same-origin URLs', () => {
    expect(mediaServingUrl('', 'classroom-1', 'media/image.png')).toBe(
      '/api/openmaic/classroom-media/classroom-1/media/image.png',
    );
    expect(mediaServingUrl('https://school.example/', 'classroom-1', 'media/image.png')).toBe(
      '/api/openmaic/classroom-media/classroom-1/media/image.png',
    );
  });

  it('matches a normalized placeholder to the sole planned image for its outline', () => {
    const outlines: SceneOutline[] = [{
      id: 'outline-1',
      type: 'slide',
      title: '页面',
      description: '说明',
      keyPoints: [],
      order: 0,
      mediaGenerations: [{
        type: 'image',
        elementId: 'gen_img_randomized',
        prompt: '课堂插图',
      }],
    }];
    const scenes = [{
      id: 'scene-1',
      outlineId: 'outline-1',
      type: 'slide',
      content: {
        canvas: {
          elements: [{ id: 'image-1', type: 'image', src: 'gen_img_1' }],
        },
      },
    }] as unknown as Scene[];

    replaceMediaPlaceholders(
      scenes,
      { gen_img_randomized: '/api/openmaic/classroom-media/c1/media/generated.png' },
      outlines,
    );

    const element = (scenes[0]!.content as { canvas: { elements: Array<{ src: string }> } })
      .canvas.elements[0];
    expect(element?.src).toBe('/api/openmaic/classroom-media/c1/media/generated.png');
  });

  it('discovers unresolved placeholders even when no asset failure was recorded', () => {
    const outlines = [{
      id: 'outline-1',
      type: 'slide',
      title: '页面',
      description: '说明',
      keyPoints: [],
      order: 0,
      mediaGenerations: [{ type: 'image', elementId: 'gen_img_expected', prompt: '课堂插图' }],
    }] as SceneOutline[];
    const scenes = [{
      id: 'scene-1',
      outlineId: 'outline-1',
      type: 'slide',
      content: { canvas: { elements: [{ type: 'image', src: 'gen_img_1' }] } },
    }] as unknown as Scene[];

    expect(findUnresolvedClassroomMedia(outlines, scenes)).toEqual([{
      elementId: 'gen_img_expected',
      type: 'image',
      error: '页面仍包含未解析的媒体占位符',
    }]);
  });

  it('reports a raw placeholder when its durable media plan is missing', () => {
    const scenes = [{
      id: 'scene-1',
      outlineId: 'outline-1',
      type: 'slide',
      content: { canvas: { elements: [{ type: 'image', src: 'gen_img_lost' }] } },
    }] as unknown as Scene[];

    expect(findUnresolvedClassroomMedia([], scenes)).toEqual([{
      elementId: 'gen_img_lost',
      type: 'image',
      error: '媒体生成计划缺失，无法生成真实资源',
    }]);
  });
});
