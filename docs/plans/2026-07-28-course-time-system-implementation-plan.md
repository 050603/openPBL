# Course Time System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an evidence-based, model-assisted and runtime-enforced course timing loop from preparation through AI content generation, live teaching, and adaptive insertion.

**Architecture:** Add a model-assisted recommendation action whose output is normalized by the existing deterministic six-stage model. Add a pure classroom timing state machine backed by absolute timestamps and persist it only on lifecycle events. Feed its real remaining time into adaptive decisions while retaining current TTS planning and post-generation correction.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Vitest, existing OpenAI-compatible LLM client and session store.

---

### Task 1: Add auditable model-assisted timing recommendations

**Files:**
- Modify: `src/lib/pbl-time-model.ts`
- Modify: `src/lib/llm/types.ts`
- Modify: `src/lib/llm/prompts.ts`
- Modify: `src/lib/llm/client.ts`
- Modify: `src/app/api/llm/route.ts`
- Test: `src/lib/pbl-time-model.test.ts`
- Test: `src/lib/llm/client.test.ts`

**Steps:**
1. Add failing tests for model recommendation normalization, aliases, fixed-total allocation, metadata, and invalid-output fallback.
2. Add optional recommendation audit metadata to `PblModuleTimingPlan`.
3. Add the `moduleTimingPlan` LLM action, a compact prompt containing authoritative course facts and knowledge structure, and a strict response parser.
4. Normalize model minutes into the deterministic six-stage skeleton and return a suggested plan.
5. Run the two focused test files and verify all new cases pass.

### Task 2: Wire the teacher preparation action to the model

**Files:**
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`
- Modify: `src/components/teacher/pbl-module-timing-panel.tsx`
- Test: `src/components/teacher/pbl-module-timing-panel.test.tsx`

**Steps:**
1. Add a failing component test for source, confidence, reasons and fallback disclosure.
2. Change “生成时间安排” to call `/api/llm` with `moduleTimingPlan`.
3. Persist the returned skeleton/plan; on an unavailable or invalid model, generate the deterministic fallback and mark it explicitly.
4. Render recommendation source, confidence, evidence, assumptions and per-stage rationale.
5. Run the focused component test.

### Task 3: Add a persistent classroom timing state machine

**Files:**
- Create: `src/lib/classroom/timing.ts`
- Create: `src/lib/classroom/timing.test.ts`
- Modify: `src/lib/session/types.ts`
- Modify: `src/lib/session/actions.ts`

**Steps:**
1. Write failing tests for start, live derivation, pause/resume, reload derivation, stage transition, adjustment/rebalancing and completion.
2. Implement pure state transitions using injected ISO timestamps.
3. Add `classroomTiming` to `CourseUiState`.
4. Initialize/reset it in start/restart actions and settle it on end.
5. Run timing and session action tests.

### Task 4: Replace the disconnected classroom stopwatch

**Files:**
- Modify: `src/app/teacher/teach/[id]/classroom/page.tsx`
- Test: `src/app/teacher/teach/[id]/classroom/page.test.tsx`

**Steps:**
1. Add a failing UI test for planned/elapsed/remaining values and stage transition persistence.
2. Derive the display clock from `course.uiState.classroomTiming` and a local display tick.
3. Persist pause, resume, stage adjustment and transition events through `updateCourse`.
4. Replace reset/+2 behavior with current-stage reset, ±2 minute adjustment, schedule variance and a six-stage timeline.
5. Run the page test.

### Task 5: Clamp adaptive insertion to real classroom time

**Files:**
- Modify: `src/lib/adaptive-learning.ts`
- Modify: `src/components/views/student/adaptive-ai-learning-runtime.tsx`
- Modify: `src/components/views/teacher/ai-learning.tsx`
- Test: `src/lib/adaptive-learning.test.ts`
- Test: `src/components/views/student/adaptive-ai-learning-runtime.test.tsx`

**Steps:**
1. Add failing tests for runtime-budget clipping and zero remaining stage time.
2. Add a helper returning the smaller of adaptive-plan and runtime-stage budgets.
3. Use the classroom timing snapshot for pre-course and after-module decisions.
4. Show the effective remaining budget in the teacher AI-learning view.
5. Run focused adaptive tests.

### Task 6: Tighten generated page timing verification

**Files:**
- Modify: `src/lib/openmaic/server/classroom-generation.ts`
- Modify: `src/lib/openmaic/audio/tts-timing.ts`
- Test: `src/lib/openmaic/server/classroom-media-generation-tts.test.ts`
- Test: `src/lib/openmaic/audio/tts-timing.test.ts`

**Steps:**
1. Add failing tests that assess total activity time as narration plus reserved student/transition time.
2. Compare both first and corrected generations against the same total target.
3. Keep the better correction and retain natural speech speed.
4. Run focused OpenMAIC timing tests.

### Task 7: Verify the full change

**Files:**
- Review all files above and `git diff --check`.

**Steps:**
1. Run targeted Vitest suites.
2. Run `pnpm typecheck`.
3. Run targeted ESLint on changed source files.
4. Run `pnpm build`.
5. Inspect the final diff and confirm unrelated dirty-worktree files were not modified.
