# Course Preparation Journey Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the long, tab-like preparation page with a process-led course design journey while preserving every existing generation input, classroom control, validation gate, and publish requirement.

**Architecture:** Keep the existing preparation route and stateful page for the first migration so unsaved drafts, streaming outline generation, and classroom-generation contracts remain unchanged. Extract only the journey model and journey presentation, then separate existing UI blocks into focused steps without rewriting their business logic. The final generation and preview routes remain authoritative gates.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Tailwind CSS 4, Vitest, Lucide icons.

---

### Task 1: Preparation journey model

**Files:**
- Create: `src/lib/teacher/preparation-flow.ts`
- Create: `src/lib/teacher/preparation-flow.test.ts`

1. Write tests for the ordered preparation steps, phase labels, and step presentation states.
2. Run `pnpm test -- src/lib/teacher/preparation-flow.test.ts` and confirm the test fails.
3. Implement the typed journey model and state resolver.
4. Run the focused test and confirm it passes.

### Task 2: Process-led journey component

**Files:**
- Create: `src/components/teacher/preparation-journey.tsx`

1. Build a horizontal course-design path rather than a persistent side navigation.
2. Show the current step, completed steps, accessible future steps, and the relationship between adjacent steps.
3. Add responsive horizontal scrolling, keyboard focus states, and reduced-motion-safe transitions.
4. Keep the component presentation-only so it cannot mutate course data or bypass quality gates.

### Task 3: Split the existing preparation work into focused steps

**Files:**
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`

1. Replace the tab strip with `PreparationJourney`.
2. Separate course positioning and PBL project outcomes into distinct steps while reusing the current inputs and update handlers.
3. Move evaluation before course architecture to support backward design without changing its persistence contract.
4. Move `AdaptiveLearningPlanEditor` out of the main-course step into its own step.
5. Preserve `persistAndNext`, knowledge alignment, parent-module validation, adaptive trigger validation, generation payload construction, and all existing save behavior.
6. When a final validation fails, navigate the teacher to the exact affected journey step.

### Task 4: Add contextual stage framing

**Files:**
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`

1. Add a compact current-stage introduction showing upstream basis, expected output, and readiness.
2. Keep AI generation buttons local to the content they affect.
3. Retain the persistent save/continue bar, but label the next destination explicitly.

### Task 5: Regression and visual verification

**Files:**
- Modify only if verification exposes a scoped defect.

1. Run `pnpm test -- src/lib/teacher/preparation-flow.test.ts src/lib/teacher/course-basics-draft.test.ts src/lib/pbl-course-config.test.ts src/lib/pbl-outline-validation.test.ts`.
2. Run `pnpm exec tsc --noEmit`.
3. Run scoped ESLint for the new component, helper, and preparation page.
4. Open a real teacher course and visually verify desktop and narrow widths.
5. Verify that saving, outline generation, adaptive confirmation, entering generation, and publishing still use the existing gates.

