'use client';

import * as React from 'react';

export type OpenPblEditorAiContext = {
  courseId: string;
  studentId: string;
  stageKey: string;
  projectGoal?: string;
  currentTask?: string;
};

type OpenPblEditorContextValue = {
  ai?: OpenPblEditorAiContext;
  appliedAiEdit?: {
    title: string;
    onUndo: () => void;
  };
  openAiMember?: () => void;
  uploadImage?: (file: File) => Promise<string>;
};

const OpenPblEditorContext = React.createContext<OpenPblEditorContextValue>({});

export function OpenPblEditorProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: OpenPblEditorContextValue;
}) {
  return <OpenPblEditorContext.Provider value={value}>{children}</OpenPblEditorContext.Provider>;
}

export function useOpenPblEditorContext() {
  return React.useContext(OpenPblEditorContext);
}
