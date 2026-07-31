# AI Learning Per-Page Time Budget Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every AI-learning page execute the teacher-confirmed time budget using natural-speed, model-and-voice-specific TTS content sizing plus task-aware student activity and transition time.

**Architecture:** Add one deterministic per-page planner that decomposes a confirmed page target into narration, reading/thinking, operation, feedback, and transition budgets. Feed that result into the existing TTS content-budget model, generation prompt, correction pass, and playback engine.

**Tech Stack:** TypeScript, Next.js 16, React, Vitest, OpenMAIC playback engine.

---

### Task 1: Per-page activity budget

**Files:**
- Modify: `src/lib/pbl-time-estimation.ts`
- Test: `src/lib/pbl-time-estimation.test.ts`

**Steps:**

1. Write failing tests proving that slides reserve only a few transition seconds, interactions use widget type/steps/difficulty, and quizzes use question type/count/difficulty.
2. Run `pnpm vitest run src/lib/pbl-time-estimation.test.ts` and verify failure.
3. Add `planPblPageTiming` and a structured page-breakdown type.
4. Enforce `narration + student activity + transition = activity target`.
5. Re-run the test and verify success.

### Task 2: Auditable natural-speed TTS plan

**Files:**
- Modify: `src/lib/openmaic/audio/tts-timing.ts`
- Test: `src/lib/openmaic/audio/tts-timing.test.ts`

**Steps:**

1. Write failing tests showing two calibrated voices produce different target character counts for the same narration duration.
2. Extend `TtsTimingPlan` with page breakdown, calibration source, effective unit rate, and a natural-speed lock.
3. Keep speed fixed at `1.0` in the AI-learning page plan.
4. Re-run the TTS tests.

### Task 3: Connect the planner to classroom generation

**Files:**
- Modify: `src/lib/openmaic/server/classroom-generation.ts`
- Modify: `src/lib/openmaic/generation/scene-generator.ts`
- Test: `src/lib/openmaic/server/classroom-generation-timing.test.ts`

**Steps:**

1. Write failing tests for slide, interaction, quiz, and calibrated-voice plans.
2. Replace percentage-based allocation in `attachTtsTimingPlans` with `planPblPageTiming`.
3. Add the full breakdown and effective natural speech rate to the generation prompt.
4. Keep correction comparisons on the full page activity target.
5. Re-run the generation timing tests.

### Task 4: Execute student and transition time

**Files:**
- Modify: `src/lib/openmaic/generation/activity-gate.ts`
- Modify: `src/lib/openmaic/generation/scene-generator.ts`
- Modify: `src/lib/openmaic/playback/engine.ts`
- Test: `src/lib/openmaic/generation/activity-gate.test.ts`
- Test: `src/lib/openmaic/playback/engine-activity.test.ts`

**Steps:**

1. Write failing tests proving student activity budgets above 180 seconds are preserved and each page receives its configured transition pause.
2. Add a fixed page-transition timing action separate from the learner-completable activity gate.
3. Teach the playback engine to execute, pause, and resume the fixed transition timer.
4. Re-run the activity-gate and playback-engine tests.

### Task 5: Verification

**Files:**
- Verify all files above.

**Steps:**

1. Run all per-page timing tests.
2. Run `pnpm typecheck`.
3. Run targeted ESLint for modified files.
4. Run `pnpm build`.
5. Run `git diff --check`.
6. Do not commit without explicit user authorization.

