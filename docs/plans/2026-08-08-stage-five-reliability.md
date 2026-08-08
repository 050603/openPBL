# Stage Five Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make showcase stage silent from companion activity, synchronize uploaded final materials to the teacher view, authorize presentation switching correctly, and show only meaningful project operations.

**Architecture:** Keep showcase as a task-only stage. Companion speech may use configured server TTS only and becomes silent when server audio is unavailable. Treat course uploads and artifact snapshots as complementary material sources, while keeping evidence-readiness rules unchanged. Record presentation switching within its canonical mutation and derive the student timeline from meaningful process records.

**Tech Stack:** Next.js App Router route handlers, React, TypeScript, Prisma-backed session actions, Vitest.

---

### Task 1: Prevent companion browser speech leakage

**Files:**
- Modify: `src/components/views/student/companion-runtime.tsx`
- Modify: `src/app/student/classroom/[id]/page.tsx`
- Test: `src/components/views/student/companion-roundtable-tts.test.tsx`

1. Add a failing test proving a failed server TTS request never calls `speechSynthesis.speak`.
2. Resolve missing or browser-native companion providers to silent text presentation.
3. Replace server-generation and audio-playback browser fallbacks with silent completion.
4. Cancel any queued browser speech when entering a task-only stage.
5. Run the TTS and stage-policy tests.

### Task 2: Synchronize final showcase materials

**Files:**
- Modify: `src/components/views/student/showcase.tsx`
- Modify: `src/components/views/teacher/showcase.tsx`
- Test: `src/components/views/student/showcase.test.tsx`
- Test: `src/components/views/teacher/showcase.test.tsx`

1. Add tests for building a showcase snapshot from a successful upload and for teacher material selection from raw uploads.
2. Persist an artifact snapshot and a meaningful student process record with the uploaded file.
3. Build a deduplicated teacher material list from showcase uploads plus snapshots.
4. Render and open the real file from the teacher material drawer without weakening evidence-completeness checks.
5. Run student and teacher showcase tests.

### Task 3: Fix presentation action authorization

**Files:**
- Modify: `src/components/views/teacher/showcase.tsx`
- Modify: `src/lib/session/actions.ts`
- Test: `src/lib/session/actions.test.ts`

1. Add a reducer test proving `SET_PRESENTING_GROUP` records its own activity.
2. Move the activity entry into the canonical presentation mutation.
3. Remove the separate unauthorized `ADD_ACTIVITY` request from the teacher button.
4. Run action and permission tests.

### Task 4: Reduce project process noise

**Files:**
- Modify: `src/components/views/student/showcase.tsx`
- Test: `src/components/views/student/showcase.test.tsx`

1. Add a test that excludes generic agent learning-request replies.
2. Keep student work, system milestones, and agent records tied to tasks, evidence, or concrete workspace operations.
3. Show timestamps and cap the display to the most recent important records.
4. Run showcase tests and TypeScript checks.

### Task 5: Verification

1. Run all targeted tests for TTS, stage policy, showcase views, session actions, and permissions.
2. Run `pnpm exec tsc -p tsconfig.check.json --noEmit`.
3. Run `git diff --check` for every touched file.
