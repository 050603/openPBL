'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { KnowledgeGraph, KnowledgePoint } from '@/lib/session/types';

type TeachingKnowledgeGraph = {
  graph?: KnowledgeGraph;
  points: KnowledgePoint[];
};

const KnowledgeGraphContext = createContext<TeachingKnowledgeGraph>({ points: [] });

export function TeachingKnowledgeGraphProvider({
  children,
  graph,
  points,
}: TeachingKnowledgeGraph & { children: ReactNode }) {
  return (
    <KnowledgeGraphContext.Provider value={{ graph, points }}>
      {children}
    </KnowledgeGraphContext.Provider>
  );
}

export function useTeachingKnowledgeGraph(): TeachingKnowledgeGraph {
  return useContext(KnowledgeGraphContext);
}
