import { describe, expect, it } from 'vitest';
import { applyMediaPlanToOutlines } from './media-planner';
import type { SceneOutline } from '../types/generation';

const outlines: SceneOutline[] = Array.from({ length: 6 }, (_, index) => ({
  id: `scene-${index + 1}`,
  type: 'slide',
  title: `页面 ${index + 1}`,
  description: '讲清楚一个课程知识点',
  keyPoints: ['知识点'],
  estimatedDuration: 60,
  order: index,
}));

describe('confirmed-outline media planner', () => {
  it('uses only enabled media and preserves the confirmed outline structure', () => {
    const result = applyMediaPlanToOutlines(outlines, { media: [
      { outlineId: 'scene-1', type: 'image', prompt: '用于解释知识关系的清晰中文结构图' },
      { outlineId: 'scene-2', type: 'video', prompt: '展示物体运动变化过程的短动画' },
      { outlineId: 'missing', type: 'image', prompt: '不应使用的无效页面图片说明' },
    ] }, { imageEnabled: true, videoEnabled: false });

    expect(result.map(({ id, title, order }) => ({ id, title, order }))).toEqual(
      outlines.map(({ id, title, order }) => ({ id, title, order })),
    );
    expect(result[0]?.mediaGenerations).toHaveLength(1);
    expect(result[1]?.mediaGenerations).toBeUndefined();
  });

  it('limits generated images and videos instead of adding media to every page', () => {
    const plan = { media: [
      { outlineId: 'scene-1', type: 'video', prompt: '展示物体随时间连续运动变化的演示视频' },
      ...outlines.slice(1).map((outline) => ({
        outlineId: outline.id,
        type: 'image' as const,
        prompt: `页面 ${outline.id} 的概念关系示意插图`,
      })),
    ] };
    const result = applyMediaPlanToOutlines(outlines, plan, { imageEnabled: true, videoEnabled: true });
    const requests = result.flatMap((outline) => outline.mediaGenerations ?? []);
    expect(requests.filter((item) => item.type === 'image')).toHaveLength(2);
    expect(requests.filter((item) => item.type === 'video')).toHaveLength(1);
    expect(result.every((outline) => (outline.mediaGenerations?.length ?? 0) <= 1)).toBe(true);
  });
});
