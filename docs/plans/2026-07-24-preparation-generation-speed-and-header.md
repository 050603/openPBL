# Preparation Generation Speed And Header Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce course-resource generation time without changing models, prompts, output specifications, validation, or classroom-control contracts, and make the preparation journey the first visible page element.

**Architecture:** Preserve the bounded scene-generation pipeline and all quality repair gates. Run independent media and speech backfills concurrently with a final merged persistence pass, and reuse already-ready adaptive branch classrooms unless editing has invalidated them. Move the existing back navigation into the presentation-only journey component.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Vitest, Tailwind CSS 4.

---

### Task 1: Reuse valid adaptive resources

**Files:**
- Create: `src/lib/teacher/adaptive-resource-generation.ts`
- Create: `src/lib/teacher/adaptive-resource-generation.test.ts`
- Modify: `src/app/teacher/prepare/[id]/generate/page.tsx`

1. Test that confirmed branches with a ready classroom are reused.
2. Test that missing, failed, or invalidated resources remain generation candidates.
3. Generate only candidate branches and preserve ready resources in the final plan.

### Task 2: Parallel independent asset backfills

**Files:**
- Create: `src/lib/openmaic/server/classroom-asset-tasks.ts`
- Create: `src/lib/openmaic/server/classroom-asset-tasks.test.ts`
- Modify: `src/lib/openmaic/server/classroom-asset-generation.ts`

1. Test that media and TTS tasks both start before either task completes.
2. Keep existing provider concurrency, retry, timing, and failure behavior unchanged.
3. Run media/video backfill and speech backfill concurrently.
4. Persist the merged in-memory scene state once both tasks settle successfully.

### Task 3: Compact preparation header

**Files:**
- Modify: `src/components/teacher/preparation-journey.tsx`
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`

1. Add an accessible back button inside the journey card.
2. Remove the separate preparation title, course name, subject, grade, and hours header.
3. Keep the journey card as the first preparation-page content and retain responsive horizontal flow navigation.

### Task 4: Verification

1. Run focused adaptive-resource and asset-task tests.
2. Run the existing course-generation, quality, PBL outline, and stage-gate tests.
3. Run TypeScript, scoped ESLint, and the production build.
4. Visually verify desktop and narrow preparation layouts.

