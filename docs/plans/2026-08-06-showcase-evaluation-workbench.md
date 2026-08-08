# Showcase Evaluation Workbench Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove internal English identifiers from AI evaluation content and turn the fifth-stage teacher evaluation page into a dense, low-scroll desktop workbench for classes of roughly 30 students.

**Architecture:** Translate stage keys, evidence kinds, and evidence statuses before they enter the AI prompt so generated prose receives only teacher-facing Chinese terminology. Recompose the showcase view as a viewport-height grid with an independently scrolling student rail and three compact work columns for materials, AI evaluation, and teacher scoring/feedback; retain a stacked responsive fallback below desktop width.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Vitest.

---

### Task 1: Localize AI evaluation context

**Files:**
- Modify: `src/lib/evaluation/process-assessment.ts`
- Modify: `src/lib/evaluation/process-assessment.test.ts`
- Modify: `src/lib/teaching-ai/support-engine.ts`
- Modify: `src/lib/teaching-ai/support-engine.test.ts`

1. Add failing tests for Chinese stage, evidence-kind, and evidence-status labels.
2. Add a prompt assertion that internal `阶段=make` is absent.
3. Implement centralized label helpers and use them when building process-evaluation evidence context.
4. Run focused tests.

### Task 2: Build the compact student rail

**Files:**
- Modify: `src/components/views/teacher/showcase.tsx`

1. Add student search state and filtering.
2. Replace wide project cards with compact one-row student buttons showing name, score state, and short topic.
3. Give the list an independent desktop scrollbar and preserve page position during student switching.
4. Add accessible focus and selected states.

### Task 3: Build the evaluation workbench

**Files:**
- Modify: `src/components/views/teacher/showcase.tsx`

1. Replace the vertical detail stack with three desktop work columns.
2. Make materials compact and open-on-demand.
3. Compress AI dimensions into one-row score summaries with expandable evidence details.
4. Convert teacher dimensions from large cards to compact slider rows.
5. Place score totals, comments, questions, revision, and submission controls in the teacher column.
6. Keep empty, loading, error, confirmed, and unconfirmed states visible without page-level scrolling.

### Task 4: Verify desktop density and behavior

**Files:**
- Test: `src/lib/evaluation/process-assessment.test.ts`
- Test: `src/lib/teaching-ai/support-engine.test.ts`

1. Run focused tests, TypeScript checking, and ESLint.
2. Load the local classroom and inspect the fifth-stage workbench at a desktop viewport without changing classroom data.
3. Check that student, material, and AI overflow is contained within their panels.
4. Inspect the final diff and preserve unrelated working-tree changes.
