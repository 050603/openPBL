# AI Learning Interactions and Seamless Insertions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI-teaching interactions feel like exploration and operation instead of repeated testing, while adaptive resources interrupt and resume the main lesson automatically without losing the original next scene.

**Architecture:** Keep quizzes as the only graded assessment surface. Tighten the outline, action, and widget-generation contracts so interactive scenes use manipulation, observation, construction, comparison, and explanatory feedback without correctness gates or scores. Extend the mounted student player with an explicit adaptive autoplay request so inserted scenes and their saved return scene start automatically in the same queue.

**Tech Stack:** Next.js App Router, React client components, Zustand stage store, OpenMAIC playback engine, Vitest, Testing Library.

---

### Task 1: Lock the non-assessment interaction contract

**Files:**
- Modify: `src/lib/openmaic/prompts/interactive-outline-cadence.test.ts`
- Modify: `src/lib/openmaic/prompts/interactive-actions-agency.test.ts`
- Modify: `src/lib/openmaic/prompts/pbl-course.test.ts`
- Create: `src/lib/openmaic/prompts/interactive-learning-contract.test.ts`

**Steps:**
1. Add assertions that interactive pages are explicitly ungraded, avoid answer-like matching/sorting/drag classification, and use quizzes for correctness judgments.
2. Run the focused prompt tests and confirm the new assertions fail.
3. Update the outline, PBL-course, action, simulation, diagram, code, game, and 3D widget prompt contracts.
4. Run the focused prompt tests and confirm they pass.

### Task 2: Preserve the adaptive insertion return point

**Files:**
- Modify: `src/components/openmaic-bridge/student-stage-host.test.tsx`
- Modify: `src/components/openmaic-bridge/student-stage-host.tsx`

**Steps:**
1. Add a test proving an adaptive segment is inserted after its anchor, activates its first scene, and records the original successor as the return scene.
2. Add adaptive scene metadata for the return scene and make the insertion resolver stable for late arrivals.
3. Run the host test and confirm queue order and return metadata.

### Task 3: Autoplay the inserted segment and resumed main lesson

**Files:**
- Modify: `src/components/openmaic-bridge/student-stage-host.test.tsx`
- Modify: `src/components/openmaic-bridge/student-stage-host.tsx`
- Modify: `src/components/openmaic/stage.tsx`
- Modify: `src/components/openmaic/edit/PlaybackChromeRoot.tsx`

**Steps:**
1. Add tests that the host requests autoplay for the inserted first scene and again for the saved return scene.
2. Pass an `autoplaySceneId` through `StudentStageHost` and `Stage` to the playback chrome.
3. In the playback chrome, consume each autoplay request once after the matching scene engine is ready, start its lecture session, and start playback.
4. Guard delayed normal auto-advance so a timer created by the prior main scene cannot skip a newly inserted adaptive scene.
5. Run the focused host and playback tests.

### Task 4: Verify the integrated change

**Files:**
- Verify only; do not alter unrelated dirty files.

**Steps:**
1. Run all focused prompt, adaptive runtime, host, and playback tests.
2. Run TypeScript checking and lint only the changed implementation/test files where supported.
3. Review `git diff` to confirm existing user changes remain intact and report any pre-existing failures separately.
