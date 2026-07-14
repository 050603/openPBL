# Confirmed Module Timing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the course-level TTS self-learning timing feedback with a teacher-confirmed six-module timing plan that drives project-mainline and downstream outline generation.

**Architecture:** The course stores one `moduleTimingPlan` containing AI recommendations, the teacher's current allocation, and confirmation state. The recommendation is derived locally from course difficulty, grade, knowledge-point complexity, and total lesson duration. TTS keeps static model profiles and per-scene content budgets for generation, but generated-audio measurements and calibration never enter the course allocation model. The verify page blocks progression until the teacher confirms the fixed-total module allocation; confirmation then creates the deterministic PBL project mainline.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, existing PBL time-model and OpenMAIC generation pipeline.

---

### Task 1: Add the pure module timing plan model

**Files:**
- Modify: `src/lib/pbl-time-model.ts`
- Test: `src/lib/pbl-time-model.test.ts`
- Modify: `src/lib/session/types.ts`

**Steps:**
1. Add a serializable `PblModuleTimingPlan` with total minutes, per-module current/recommended minutes, recommendation metadata, and `status: suggested | confirmed`.
2. Add helpers to build a recommendation from course context, apply a teacher allocation, and verify that the six canonical module minutes equal the fixed course total.
3. Add tests for difficulty/knowledge-driven recommendation, fixed-total allocation, and confirmation validity.
4. Run `pnpm exec vitest run src/lib/pbl-time-model.test.ts`.

### Task 2: Make the verify page use the confirmation workflow

**Files:**
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`
- Modify: `src/components/teacher/pbl-timing-feedback-panel.tsx` or replace with a module-allocation component

**Steps:**
1. Remove detailed TTS activity inputs and the audio-feedback panel from the module section.
2. Render only the AI module allocation recommendation and editable module minutes.
3. Recalculate suggestions when course data or teaching modules change.
4. Add an explicit “confirm timing and generate project mainline” action.
5. Clear confirmation and the mainline whenever module durations are changed after confirmation.
6. Require confirmed timing before entering course-outline generation.

### Task 3: Remove TTS measurement learning from persistence and generation

**Files:**
- Modify: `src/lib/openmaic/audio/tts-timing.ts`
- Modify: `src/lib/openmaic/server/classroom-generation.ts`
- Modify: `src/lib/openmaic/server/classroom-media-generation.ts`
- Modify: `src/app/api/openmaic/generate/route.ts`
- Modify: `src/lib/openmaic-bridge/course-linker.ts`
- Modify: `src/lib/openmaic/types/generation.ts`
- Modify: `src/lib/openmaic/types/stage.ts`

**Steps:**
1. Remove course-level calibration input/output and measurement accumulation.
2. Keep static TTS timing profiles and content budgets used to shape generated narration.
3. Stop writing generated-audio measurements into scenes or course content.
4. Ensure final course timing is exclusively the confirmed module plan.
5. Update tests so no generated-audio measurement can change the module allocation.

### Task 4: Propagate the confirmed plan downstream

**Files:**
- Modify: `src/app/teacher/prepare/[id]/generate/page.tsx`
- Modify: `src/lib/openmaic/pbl/course-request.ts`
- Modify: `src/app/teacher/prepare/[id]/preview/page.tsx`
- Modify: `src/lib/openmaic-bridge/course-linker.ts`

**Steps:**
1. Send only confirmed module durations and the generated project mainline in the course-generation request.
2. Preserve each module duration as the parent budget when splitting second-level course-outline resources.
3. Show the confirmed module plan as a read-only summary on generation and preview pages.
4. Reject or stop generation if the plan is not confirmed or does not equal the course total.

### Task 5: Verify the complete workflow

**Steps:**
1. Run focused PBL timing tests.
2. Run `pnpm test`.
3. Run `pnpm exec tsc --noEmit --pretty false`.
4. Run ESLint on all touched files.
5. Run `pnpm build` and verify the verify, generate, preview, and OpenMAIC generation routes compile.
