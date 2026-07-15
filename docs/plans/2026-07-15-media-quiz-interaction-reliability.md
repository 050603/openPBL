# Media, Quiz, and Interaction Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make classroom image backfill survive provider throttling, restore short-answer grading, and ensure interactive demonstrations run before the learner activity wait.

**Architecture:** Preserve the existing post-response asset pipeline, App Router API layout, and sequential playback engine. Strengthen boundary contracts: upstream image errors carry retry metadata, quiz clients call the namespaced route, and activity gates are inserted after demonstration actions but before final feedback.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, DashScope Qwen Image.

---

### Task 1: Provider-aware image throttling

**Files:**
- Modify: `src/lib/openmaic/media/adapters/qwen-image-adapter.ts`
- Modify: `src/lib/openmaic/generation/generation-retry.ts`
- Modify: `src/lib/openmaic/server/classroom-media-generation.ts`
- Test: `src/lib/openmaic/generation/generation-retry.test.ts`

**Steps:** Add failing tests for explicit retry delays; attach status and retry metadata to Qwen errors; honor provider delay hints; use a conservative Qwen retry/spacing policy; run focused tests.

### Task 2: Short-answer grading route contract

**Files:**
- Modify: `src/components/openmaic/scene-renderers/quiz-view.tsx`
- Test: `src/components/openmaic/scene-renderers/quiz-view.test.tsx`

**Steps:** Assert the namespaced API URL; change the client request; verify direct success payload parsing and graceful fallback.

### Task 3: Interactive demonstration ordering and diagnostics

**Files:**
- Modify: `src/lib/openmaic/generation/scene-generator.ts`
- Test: `src/lib/openmaic/generation/scene-generator.test.ts`
- Verify: `src/components/openmaic/edit/ActionsBar/ActionsBar.tsx`
- Verify: `src/lib/openmaic/playback/engine-activity.test.ts`

**Steps:** Test that widget demonstration actions precede the activity gate and feedback follows it; implement deterministic insertion before final feedback; verify hover/focus/click diagnostics and pause/resume activity behavior.

### Task 4: Regression verification

Run focused Vitest files, targeted ESLint, TypeScript checking, and review the final diff without overwriting unrelated worktree changes.
