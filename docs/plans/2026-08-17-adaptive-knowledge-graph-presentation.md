# Adaptive Knowledge Graph Presentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the rigid semantic-tier knowledge graph with a stable, collision-free learning-path visualization shared by teacher and student experiences.

**Architecture:** Keep `KnowledgeGraphFlow` as the shared React Flow renderer, but move positioning into a pure deterministic layout module. Derive columns from actual directed relationships, reduce crossings with barycentric ordering, and use semantic levels only for visual meaning. The renderer progressively reveals relationship labels when a node or path is focused.

**Tech Stack:** Next.js App Router, React 19, TypeScript, `@xyflow/react`, Tailwind CSS, Vitest.

---

### Task 1: Adaptive graph layout

**Files:**
- Create: `src/lib/knowledge-graph-layout.ts`
- Create: `src/lib/knowledge-graph-layout.test.ts`

**Steps:**
1. Add failing tests for deterministic placement, forward edge progression, disconnected branches, and collision-free coordinates.
2. Run the focused test and confirm the missing layout implementation fails.
3. Implement topology-derived ranks, cycle-safe fallback, barycentric ordering, and component-aware spacing.
4. Run the focused test and confirm it passes.

### Task 2: Shared renderer redesign

**Files:**
- Modify: `src/components/knowledge-graph-flow.tsx`

**Steps:**
1. Replace semantic tier positioning with the adaptive layout result.
2. Switch to horizontal learning-path handles and low-interference curved edges.
3. Redesign nodes, active-path emphasis, relation-label disclosure, minimap/control placement, legend, and empty state.
4. Preserve teacher drag interaction without allowing stored legacy positions to control automatic layout.

### Task 3: Teacher and student integration polish

**Files:**
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`
- Modify: `src/components/openmaic/roundtable/lecture-subtitle-dock.tsx`

**Steps:**
1. Update teacher guidance and graph shell for the adaptive map.
2. Tune student rail preview and expanded classroom graph for readable focus behavior.

### Task 4: Verification

**Steps:**
1. Run layout/component tests.
2. Run TypeScript validation and lint on touched files.
3. Render the teacher and student graph states, inspect screenshots, and fix visual collisions or contrast issues.

