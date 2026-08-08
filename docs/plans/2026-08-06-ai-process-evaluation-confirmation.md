# AI Process Evaluation Confirmation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI process evaluation always produce a clear 0-100 suggestion, allow teacher-guided re-evaluation and manual adjustment, and synchronize the score into the final grade only after teacher confirmation.

**Architecture:** Normalize every returned process dimension to a numeric score, using zero when evidence is insufficient, then calculate the suggestion total across all dimensions. Pass optional teacher guidance through the existing teaching-AI API into the server prompt. Keep the persisted suggestion review states, but derive the score used by the final-grade formula exclusively from confirmed or adjusted suggestions.

**Tech Stack:** Next.js 16 client components, React 19, TypeScript, Tailwind CSS, Vitest.

---

### Task 1: Normalize process evaluation scores

**Files:**
- Modify: `src/lib/teaching-ai/support-engine.ts`
- Modify: `src/lib/teaching-ai/support-engine.test.ts`

1. Add a failing test proving an unscorable dimension is normalized to zero.
2. Run the focused evaluator test and confirm it fails.
3. Normalize missing/unsupported scores to zero and update the AI prompt.
4. Add optional teacher guidance to the process-evaluation input and prompt.
5. Run the focused test and confirm it passes.

### Task 2: Add deterministic presentation helpers

**Files:**
- Create: `src/lib/evaluation/process-assessment.ts`
- Create: `src/lib/evaluation/process-assessment.test.ts`

1. Add tests for total calculation, Chinese status/confidence labels, gap de-duplication, and confirmed-score extraction.
2. Run the tests and confirm they fail before implementation.
3. Implement the minimal pure helpers.
4. Run the focused tests and confirm they pass.

### Task 3: Rebuild the teacher review interaction

**Files:**
- Modify: `src/lib/teaching-ai/client-api.ts`
- Modify: `src/components/views/teacher/showcase.tsx`

1. Pass optional teacher guidance through the client API.
2. Add a teacher-guidance field and a guided re-evaluation action.
3. Present five readable score cards with zero-score evidence warnings and collapsed evidence details.
4. Replace English statuses/confidence with Chinese labels and remove raw IDs from the default view.
5. Preserve manual score adjustment and make the primary action explicitly confirm and synchronize.
6. Ensure only confirmed/adjusted scores enter `computeFinalScore` and persisted rubric scores.

### Task 4: Verify behavior

**Files:**
- Test: `src/lib/evaluation/process-assessment.test.ts`
- Test: `src/lib/teaching-ai/support-engine.test.ts`

1. Run focused Vitest suites.
2. Run TypeScript checking.
3. Run ESLint on changed TypeScript/TSX files.
4. Inspect the final diff to ensure unrelated working-tree changes remain untouched.
