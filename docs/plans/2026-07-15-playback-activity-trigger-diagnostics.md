# Playback Activity Trigger Diagnostics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make interactive activity gates complete at the intended pedagogical moment and expose every timeline action's trigger/wait semantics for debugging.

**Architecture:** Keep the existing sequential playback engine and its `activity-complete` event contract. Strengthen the iframe bridge and five widget-generation prompts so generated resources emit that contract on meaningful completion, then make the timeline derive human-readable trigger diagnostics from the same runtime semantics. Preserve custom activity-gate metadata through JSON/export by continuing to spread action fields.

**Tech Stack:** Next.js 16 client components, React 19, TypeScript, Vitest, sandboxed iframe `postMessage`, JSON i18n.

---

### Task 1: Lock down the activity-completion contract

**Files:**
- Modify: `src/lib/openmaic/prompts/widget-knowledge-teaching.test.ts`
- Create: `src/lib/openmaic/utils/iframe.test.ts`

**Step 1: Write failing prompt tests**

Assert that all five interactive widget prompts require a semantically correct completion marker/API and a reset marker/API rather than treating any decorative click as completion.

**Step 2: Write failing iframe bridge tests**

Assert that patched HTML exposes an explicit `window.__maicActivity.complete/reset` API and still supports declarative `data-activity-complete` and `data-activity-reset` controls.

**Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/openmaic/prompts/widget-knowledge-teaching.test.ts src/lib/openmaic/utils/iframe.test.ts`

Expected: failures for the missing prompt contract and explicit bridge API.

### Task 2: Implement reliable generated-page completion signaling

**Files:**
- Modify: `src/lib/openmaic/utils/iframe.ts`
- Modify: `src/lib/openmaic/prompts/templates/code-content/user.md`
- Modify: `src/lib/openmaic/prompts/templates/diagram-content/user.md`
- Modify: `src/lib/openmaic/prompts/templates/game-content/user.md`
- Modify: `src/lib/openmaic/prompts/templates/simulation-content/user.md`
- Modify: `src/lib/openmaic/prompts/templates/visualization3d-content/user.md`

**Step 1: Add a stable iframe API**

Expose `window.__maicActivity.complete()` and `.reset()` before generated page scripts run. Keep postMessage payloads compatible with `InteractiveIframeHost`.

**Step 2: Preserve declarative compatibility**

Route existing submit/reset/data-attribute detection through the same API and avoid interpreting ordinary interaction as task completion.

**Step 3: Teach every widget generator the protocol**

Require generated HTML to call completion only after the learner produces mastery evidence, and reset when a new attempt starts. Require declarative attributes as a no-script-compatible fallback where appropriate.

**Step 4: Run contract tests**

Run the tests from Task 1 and expect all to pass.

### Task 3: Expose action trigger and wait diagnostics

**Files:**
- Create: `src/components/openmaic/edit/ActionsBar/action-trigger-description.ts`
- Create: `src/components/openmaic/edit/ActionsBar/action-trigger-description.test.ts`
- Modify: `src/components/openmaic/edit/ActionsBar/ActionsBar.tsx`
- Modify: `src/lib/openmaic/i18n/locales/zh-CN.json`
- Modify: `src/lib/openmaic/i18n/locales/en-US.json`

**Step 1: Write failing pure-function tests**

Cover scene-start actions, normal speech completion, activity-gate event/timeout semantics, fire-and-forget cues, widget message delay, discussions, video, and whiteboard actions.

**Step 2: Implement the trigger description helper**

Return structured rows for trigger, wait condition, fallback timeout, target, and content using i18n keys.

**Step 3: Connect diagnostics to every symbol**

Show the existing portal tooltip for speech and activity-gate symbols as well as other cues. Support mouse hover, keyboard focus, and click-to-pin without changing element-picking behavior.

**Step 4: Make hidden activity gates visually identifiable**

Label empty speech actions carrying `activityPauseSec` as an activity wait rather than an empty narration line, including the maximum wait duration.

**Step 5: Run helper and UI-adjacent tests**

Run: `pnpm vitest run src/components/openmaic/edit/ActionsBar/action-trigger-description.test.ts`

Expected: all trigger semantics pass.

### Task 4: Verify end-to-end compatibility

**Files:**
- Verify: `src/lib/openmaic/playback/engine-activity.test.ts`
- Verify: `src/lib/openmaic/export/classroom-zip-utils.ts`
- Verify: `src/components/openmaic/scene-renderers/InteractiveIframeHost.tsx`

**Step 1: Run activity-engine regression tests**

Run: `pnpm vitest run src/lib/openmaic/playback/engine-activity.test.ts`

Expected: early completion resumes once; timeout remains a safety fallback.

**Step 2: Verify serialization**

Confirm action spread serialization retains `activityPauseSec` and `activityPausePurpose` in saved/exported manifests.

**Step 3: Run lint/type checks on changed files**

Run targeted ESLint, then `pnpm tsc --noEmit` if the repository baseline permits.

**Step 4: Review the final diff**

Confirm no default PPT behavior, outline selection logic, or non-AI-teaching stage behavior changed.
