import { create } from 'zustand';
import type {
  CheckUnderstandingAction,
  EvidenceBoardItem,
  EvidenceBoardUpdateAction,
} from '@openmaic/lib/types/action';

export interface UnderstandingCheckResponse {
  actionId: string;
  question: string;
  answer: string | string[];
  submittedAt: number;
}

interface EvidenceBoardState {
  title: string;
  items: EvidenceBoardItem[];
}

interface TeachingToolsState {
  activeCheck: CheckUnderstandingAction | null;
  activeCheckMode: 'live' | 'playback' | null;
  lastCheckResponse: UnderstandingCheckResponse | null;
  evidenceBoard: EvidenceBoardState | null;
  evidenceBoardOpen: boolean;
  openCheck: (action: CheckUnderstandingAction) => void;
  presentCheck: (action: CheckUnderstandingAction) => Promise<void>;
  submitCheck: (answer: string | string[]) => void;
  dismissCheck: () => void;
  updateEvidenceBoard: (action: EvidenceBoardUpdateAction) => void;
  closeEvidenceBoard: () => void;
  reset: () => void;
}

const pendingCheckResolutions = new Map<string, () => void>();

function resolvePendingCheck(actionId: string): void {
  pendingCheckResolutions.get(actionId)?.();
  pendingCheckResolutions.delete(actionId);
}

export const useTeachingToolsStore = create<TeachingToolsState>((set, get) => ({
  activeCheck: null,
  activeCheckMode: null,
  lastCheckResponse: null,
  evidenceBoard: null,
  evidenceBoardOpen: false,

  openCheck: (action) => set({ activeCheck: action, activeCheckMode: 'live' }),

  presentCheck: (action) => {
    set({ activeCheck: action, activeCheckMode: 'playback' });
    return new Promise<void>((resolve) => {
      pendingCheckResolutions.set(action.id, resolve);
    });
  },

  submitCheck: (answer) => {
    const activeCheck = get().activeCheck;
    if (!activeCheck) return;
    resolvePendingCheck(activeCheck.id);
    set({
      activeCheck: null,
      activeCheckMode: null,
      lastCheckResponse: {
        actionId: activeCheck.id,
        question: activeCheck.question,
        answer,
        submittedAt: Date.now(),
      },
    });
  },

  dismissCheck: () => {
    const activeCheck = get().activeCheck;
    if (activeCheck) resolvePendingCheck(activeCheck.id);
    set({ activeCheck: null, activeCheckMode: null });
  },

  updateEvidenceBoard: (action) => {
    if (action.operation === 'clear') {
      set({ evidenceBoard: null, evidenceBoardOpen: false });
      return;
    }

    const previous = get().evidenceBoard;
    if (action.operation === 'replace' || !previous) {
      set({
        evidenceBoard: {
          title: action.title?.trim() || previous?.title || 'Evidence board',
          items: action.items,
        },
        evidenceBoardOpen: true,
      });
      return;
    }

    const merged = new Map(previous.items.map((item) => [item.id, item]));
    for (const item of action.items) merged.set(item.id, item);
    set({
      evidenceBoard: {
        title: action.title?.trim() || previous.title,
        items: Array.from(merged.values()),
      },
      evidenceBoardOpen: true,
    });
  },

  closeEvidenceBoard: () => set({ evidenceBoardOpen: false }),

  reset: () => {
    for (const resolve of pendingCheckResolutions.values()) resolve();
    pendingCheckResolutions.clear();
    set({
      activeCheck: null,
      activeCheckMode: null,
      lastCheckResponse: null,
      evidenceBoard: null,
      evidenceBoardOpen: false,
    });
  },
}));
