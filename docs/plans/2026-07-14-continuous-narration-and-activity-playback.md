# Continuous Narration and Activity Playback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make generated teacher narration continuous across pages and make timed reading, interaction, and quiz completion reliably resume subsequent narration or scene playback.

**Architecture:** Build deterministic per-outline continuity context before bounded-concurrent scene generation, inject it into every action prompt, and apply a small post-generation guard against repeated greetings. Replace the implicit empty-speech wait with an explicit activity-gate lifecycle inside `PlaybackEngine`; timer expiry and UI completion events share one idempotent completion method.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zustand, Vitest, browser `CustomEvent`/iframe `postMessage`.

---

### Task 1: Narration continuity contract

**Files:**
- Modify: `src/lib/openmaic/generation/pipeline-types.ts`
- Modify: `src/lib/openmaic/generation/prompt-formatters.ts`
- Modify: `src/lib/openmaic/generation/scene-generator.ts`
- Modify: `src/lib/openmaic/server/classroom-generation.ts`
- Test: `src/lib/openmaic/generation/narration-continuity.test.ts`

**Steps:**
1. Add failing tests proving non-first pages receive the previous title/summary and cannot retain repeated greeting prefixes.
2. Add a pure outline-to-context builder containing course position, section position, previous topic/summary, and current teaching objective.
3. Pass that context into action generation before concurrent workers start; do not depend on a previous worker finishing.
4. Add a deterministic post-generation guard that removes greeting/course-restart prefixes only from pages after page one.
5. Run the focused narration tests and TypeScript.

### Task 2: Quiz and interaction action structure

**Files:**
- Modify: `src/lib/openmaic/prompts/templates/slide-actions/system.md`
- Modify: `src/lib/openmaic/prompts/templates/interactive-actions/system.md`
- Modify: `src/lib/openmaic/prompts/templates/interactive-actions/user.md`
- Modify: `src/lib/openmaic/prompts/templates/quiz-actions/system.md`
- Modify: `src/lib/openmaic/prompts/templates/quiz-actions/user.md`
- Modify: `src/lib/openmaic/generation/scene-generator.ts`

**Steps:**
1. Require one greeting only on course page one and natural continuation elsewhere.
2. Require quiz/interactive actions in the order: concise guidance speech, activity gate, feedback/analysis speech.
3. Update fallbacks so a provider parse failure still leaves a post-activity transition.
4. Verify generated action ordering with focused tests.

### Task 3: Idempotent playback activity gate

**Files:**
- Modify: `src/lib/openmaic/playback/types.ts`
- Modify: `src/lib/openmaic/playback/engine.ts`
- Test: `src/lib/openmaic/playback/engine-activity.test.ts`

**Steps:**
1. Add failing fake-timer tests for timeout continuation, early completion, duplicate completion, pause/resume, and completion while paused.
2. Track the active activity gate explicitly instead of treating it as ordinary narration state.
3. Add `completeActivity(sceneId, purpose)`; cancel the timer and advance at most once.
4. Preserve the gate across pause/resume and clear it on stop/scene replacement.
5. Run focused playback tests.

### Task 4: UI completion event bridge

**Files:**
- Create: `src/lib/openmaic/playback/activity-events.ts`
- Modify: `src/components/openmaic/scene-renderers/quiz-view.tsx`
- Modify: `src/lib/openmaic/utils/iframe.ts`
- Modify: `src/components/openmaic/scene-renderers/InteractiveIframeHost.tsx`
- Modify: `src/components/openmaic/edit/PlaybackChromeRoot.tsx`

**Steps:**
1. Define a typed, scene-scoped activity completion event.
2. Emit quiz completion only after grading reaches reviewing; re-emit restored reviewing state after refresh.
3. Let interactive iframes emit explicit completion and add compatibility detection for form submit/final completion controls.
4. Record completion even if it arrives before playback reaches the activity gate.
5. Permit autoplay from quiz/interactive only after their gate has completed; keep PBL manual gating unchanged.

### Task 5: Verification

**Files:**
- Test all files above.

**Steps:**
1. Run focused generation and playback tests.
2. Run `npx tsc --noEmit` and targeted ESLint.
3. Run the complete Vitest suite.
4. Run `npm run build`.
5. Open a local classroom and verify timed continuation, quiz submission continuation, pause/resume, and no duplicate playback or console errors.

