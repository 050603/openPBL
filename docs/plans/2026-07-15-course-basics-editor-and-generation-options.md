# Course Basics Editor And Generation Options Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the migrated course basics step explicitly saved, provide field-specific AI candidates with strong PBL driving questions, and expose sensible generation defaults in a polished UI.

**Architecture:** Keep teacher input in a local course-basics draft and build one course patch only when the teacher presses Save. Extend the existing project-skeleton AI contract with typed candidate groups, render each group beside its matching field, and keep generation settings in the existing generate page while changing defaults and presentation. Treat the PBL evidence configuration as a list of selected requirements so optional evidence is absent by default.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Vitest, Tailwind CSS, Lucide icons.

---

### Task 1: Explicit-save course basics draft

**Files:**
- Create: `src/lib/teacher/course-basics-draft.ts`
- Test: `src/lib/teacher/course-basics-draft.test.ts`
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`

1. Write tests proving draft edits do not mutate the course and that saving builds one normalized patch.
2. Run the focused test and confirm it fails before implementation.
3. Implement draft creation, objective parsing, validation, and patch construction.
4. Bind text inputs to the local draft and add a single explicit Save action.
5. Run the focused test and type-check the changed page.

### Task 2: Compact title and cover layout

**Files:**
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`

1. Put the course-name editor and cover preview in a balanced two-column header.
2. Remove the duplicate full-width title row and preserve a stacked mobile layout.
3. Verify the page at desktop and narrow widths.

### Task 3: Field-specific AI candidates and PBL question quality

**Files:**
- Modify: `src/lib/teaching-ai/client-api.ts`
- Modify: `src/lib/teaching-ai/support-engine.ts`
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`
- Test: `src/lib/teaching-ai/support-engine.test.ts`

1. Add typed candidate groups for objectives, description, learner profile, and driving questions.
2. Strengthen the generation prompt and normalization rules for authentic, open, feasible PBL driving questions.
3. Render each candidate panel beside only its corresponding field; adopting a candidate updates the local draft but does not save it.
4. Remove scenario and artifact suggestions from the driving-question panel.
5. Run focused AI contract tests and type-check.

### Task 4: Correct evidence defaults

**Files:**
- Modify: `src/lib/pbl-course-config.ts`
- Test: `src/lib/pbl-course-config.test.ts`

1. Add a regression test proving AI decision logs and artifact versions are not selected when config is absent.
2. Normalize evidence requirements as selected entries and retain explicit teacher selections.
3. Run the focused tests.

### Task 5: Exposed generation options with correct defaults

**Files:**
- Modify: `src/app/teacher/prepare/[id]/generate/page.tsx`
- Test: `src/app/teacher/prepare/[id]/generate/page.test.tsx`

1. Add a regression test for image and TTS enabled by default, with web and video disabled.
2. Open the settings disclosure by default.
3. Present four clear option cards with status, icon, and concise impact text.
4. Run the focused test and type-check.

### Task 6: Final verification

**Files:**
- Modify only if verification exposes an in-scope defect.

1. Run all focused tests for draft, PBL config, AI support, and generation settings.
2. Run TypeScript and lint checks scoped as narrowly as the repository permits.
3. Review the diff to ensure unrelated dirty-worktree changes were preserved.
