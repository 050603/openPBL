# Lesson Script UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make preparation stage six visually consistent with the other stages while turning the detailed lesson outline into a clear, polished, and practical editing workspace.

**Architecture:** Keep the existing lesson-script directory and data flow unchanged. Adjust the stage shell in `verify/page.tsx`, then specialize the existing `scriptWorkspace` rendering branch in `outlines-editor.tsx` so the generic OpenMAIC editor remains unaffected elsewhere.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind CSS v4 utilities, Motion, Vitest, Testing Library.

---

### Task 1: Align the stage shell and detailed-outline heading

**Files:**
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`

**Step 1:** Reuse the same `Card`, header padding, typography, border, and radius conventions used by the neighboring preparation stages.

**Step 2:** Replace the gradient vertical-bar heading in the detailed-outline section with a compact editorial heading, useful page/resource counts, and a short editing hint.

**Step 3:** Preserve `LessonScriptDirectory` markup and behavior because the user explicitly approved that area.

### Task 2: Redesign lesson detail rows

**Files:**
- Modify: `src/components/openmaic/generation/outlines-editor.tsx`
- Test: `src/components/openmaic/generation/outlines-editor.test.tsx`

**Step 1:** Add a failing render test for the script-workspace semantics: page number, audience, title/summary region, and a non-transparent configuration panel.

**Step 2:** Replace the script-workspace left accent rail with a bordered, softly tinted two-column editing surface.

**Step 3:** Keep title, description, duration, knowledge points, deletion, drag reorder, and scene-type mutation behavior intact.

**Step 4:** Move type and type-specific controls into a dedicated right-side configuration panel with a solid surface and clear labels.

**Step 5:** Keep the generic editor path visually and behaviorally unchanged.

### Task 3: Verify behavior and visual quality

**Files:**
- Verify: `src/components/openmaic/generation/outlines-editor.test.tsx`
- Verify: `src/app/teacher/prepare/[id]/verify/page.tsx`

**Step 1:** Run the focused Vitest suite for the outline editor.

**Step 2:** Run TypeScript checking and linting for modified files or the nearest available project commands.

**Step 3:** Open a real stage-six course in the local app, inspect desktop and narrower widths, and confirm that no controls overlap, disappear into transparent backgrounds, or regress the approved directory.

**Step 4:** Review the final diff to ensure unrelated dirty-worktree files were not modified.
