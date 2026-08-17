import { describe, expect, it } from 'vitest';
import type { Action } from '../types/action';
import type { SceneOutline } from '../types/generation';
import {
  buildNarrationContext,
  enforceNarrationContinuity,
  stripRepeatedNarrationOpening,
  stripFormalNarrationFarewell,
} from './narration-continuity';

const outlines: SceneOutline[] = [
  { id: 'a', type: 'slide', title: '认识变量', description: '理解变量表示会变化的量', keyPoints: ['变量含义'], estimatedDuration: 60, order: 0, stageKey: 'ai-learning' },
  { id: 'b', type: 'slide', title: '变量关系', description: '用关系式连接两个变量', keyPoints: ['对应关系'], estimatedDuration: 60, order: 1, stageKey: 'ai-learning' },
  { id: 'c', type: 'interactive', title: '动手验证', description: '操作滑块观察变量变化', keyPoints: ['观察证据'], estimatedDuration: 60, order: 2, stageKey: 'project-practice' },
];

describe('narration continuity', () => {
  it('builds previous-page context before concurrent generation', () => {
    const context = buildNarrationContext(outlines, 1);
    expect(context.pageIndex).toBe(2);
    expect(context.sectionPosition).toBe('continuation');
    expect(context.previousPageTitle).toBe('认识变量');
    expect(context.previousPageSummary).toContain('变量含义');
    expect(context.currentTeachingObjective).toContain('对应关系');
  });

  it('marks the first page of a new section without treating it as a new class', () => {
    const context = buildNarrationContext(outlines, 2);
    expect(context.sectionPosition).toBe('section-first');
    expect(context.pageIndex).toBe(3);
  });

  it('removes repeated greetings and course restarts after page one', () => {
    expect(stripRepeatedNarrationOpening('大家好，欢迎来到今天的课堂。下面看变量关系。')).toBe('下面看变量关系。');
    expect(stripRepeatedNarrationOpening('同学们，今天我们来学习变量关系。先看这个式子。')).toBe('先看这个式子。');
    const actions: Action[] = [{ id: 's1', type: 'speech', text: '欢迎同学们来到变量课堂。现在观察关系式。' }];
    const result = enforceNarrationContinuity(actions, buildNarrationContext(outlines, 1));
    expect(result[0]).toMatchObject({ type: 'speech', text: '现在观察关系式。' });
  });

  it('keeps the course-first greeting intact', () => {
    const actions: Action[] = [{ id: 's1', type: 'speech', text: '大家好，欢迎来到今天的课堂。' }];
    expect(enforceNarrationContinuity(actions, buildNarrationContext(outlines, 0))).toEqual(actions);
  });

  it('makes the main course opening independent from prerequisite pages', () => {
    const actions: Action[] = [{
      id: 's1',
      type: 'speech',
      text: '上一页我们看到了计算机视觉在生活中的应用，现在认识图像分类。',
    }];
    const result = enforceNarrationContinuity(actions, buildNarrationContext(outlines, 0));

    expect(result[0]).toMatchObject({
      type: 'speech',
      text: '同学们好，欢迎来到今天的课堂。这节课我们先来了解计算机视觉在生活中的应用，现在认识图像分类。',
    });
  });

  it('adds a greeting when a generated main course starts without one', () => {
    const actions: Action[] = [{ id: 's1', type: 'speech', text: '今天我们来认识变量。' }];
    expect(enforceNarrationContinuity(actions, buildNarrationContext(outlines, 0))[0]).toMatchObject({
      type: 'speech',
      text: '同学们好，欢迎来到今天的课堂。今天我们来认识变量。',
    });
  });

  it('keeps a section-first opening intact', () => {
    const actions: Action[] = [{ id: 's1', type: 'speech', text: '下面进入项目实践这一章，先把刚才的变量关系用于操作。' }];
    expect(enforceNarrationContinuity(actions, buildNarrationContext(outlines, 2))).toEqual(actions);
  });

  it('treats an independently generated resource as an embedded lesson segment', () => {
    const embedded: SceneOutline[] = [{
      ...outlines[0],
      id: 'review',
      narrationMode: 'embedded-segment',
    }];
    const actions: Action[] = [
      { id: 's1', type: 'speech', text: '同学们好，欢迎来到今天的课程。先回顾训练集的作用。' },
      { id: 's2', type: 'speech', text: '这能帮助我们进入后面的学习。谢谢大家，下节课再见！' },
    ];
    expect(enforceNarrationContinuity(actions, buildNarrationContext(embedded, 0))).toEqual([
      { id: 's1', type: 'speech', text: '先回顾训练集的作用。' },
      { id: 's2', type: 'speech', text: '这能帮助我们进入后面的学习。 接下来，让我们继续后面的学习。' },
    ]);
  });

  it('rewrites false previous-session references on adjacent pages', () => {
    const actions: Action[] = [{ id: 's1', type: 'speech', text: '上一节课我们认识了变量，现在继续看关系。' }];
    expect(enforceNarrationContinuity(actions, buildNarrationContext(outlines, 1))[0]).toMatchObject({
      type: 'speech',
      text: '刚才我们认识了变量，现在继续看关系。',
    });
  });

  it('recognizes formal farewells without removing the learning takeaway', () => {
    expect(stripFormalNarrationFarewell('记住这个判断依据。感谢同学们的聆听！')).toBe('记住这个判断依据。');
  });
});
