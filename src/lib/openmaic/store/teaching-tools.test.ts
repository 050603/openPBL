import { afterEach, describe, expect, it } from 'vitest';
import { useTeachingToolsStore } from './teaching-tools';

afterEach(() => useTeachingToolsStore.getState().reset());

describe('teaching tools store', () => {
  it('pauses a formative check until the learner responds and records the response', async () => {
    const completed = useTeachingToolsStore.getState().presentCheck({
      id: 'check-1',
      type: 'check_understanding',
      question: 'What changes first?',
      responseType: 'prediction',
    });

    expect(useTeachingToolsStore.getState().activeCheck?.id).toBe('check-1');
    useTeachingToolsStore.getState().submitCheck('The pressure increases.');
    await completed;

    expect(useTeachingToolsStore.getState().activeCheck).toBeNull();
    expect(useTeachingToolsStore.getState().lastCheckResponse).toMatchObject({
      actionId: 'check-1',
      answer: 'The pressure increases.',
    });
  });

  it('merges evidence items by stable id and preserves source status', () => {
    const store = useTeachingToolsStore.getState();
    store.updateEvidenceBoard({
      id: 'evidence-1',
      type: 'evidence_board_update',
      operation: 'replace',
      title: 'Design decision',
      items: [
        {
          id: 'claim-1',
          claim: 'Choose material A',
          evidence: 'Initial observation',
          sourceStatus: 'needs_verification',
        },
      ],
    });
    useTeachingToolsStore.getState().updateEvidenceBoard({
      id: 'evidence-2',
      type: 'evidence_board_update',
      operation: 'append',
      items: [
        {
          id: 'claim-1',
          claim: 'Choose material A',
          evidence: 'Verified measurement',
          sourceStatus: 'verified',
        },
        {
          id: 'claim-2',
          claim: 'Material B is cheaper',
          evidence: 'Student-provided quote',
          sourceStatus: 'student_provided',
        },
      ],
    });

    expect(useTeachingToolsStore.getState().evidenceBoard).toEqual({
      title: 'Design decision',
      items: [
        expect.objectContaining({ id: 'claim-1', sourceStatus: 'verified' }),
        expect.objectContaining({ id: 'claim-2', sourceStatus: 'student_provided' }),
      ],
    });
  });
});
