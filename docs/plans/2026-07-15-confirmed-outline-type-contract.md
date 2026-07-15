# Confirmed Outline Type Contract Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure final classroom generation exactly preserves the PPT, quiz, and interactive types shown in the teacher-confirmed course outline.

**Architecture:** Keep interactive mode as an outline-planning preference. Add an explicit outline-source contract to the deterministic fallback so it may help only unconfirmed model-generated outlines and can never rewrite confirmed outline types.

**Tech Stack:** TypeScript, Vitest, Next.js 16 server generation.

---

### Task 1: Reproduce the confirmed-outline regression

**Files:**
- Modify: `src/lib/openmaic/generation/interactive-mode-policy.test.ts`

**Steps:**
1. Add a mixed confirmed outline containing PPT, quiz, and interactive AI-learning pages.
2. Assert that interactive mode preserves every confirmed type and resource marker.
3. Run the focused test and verify it fails against the current post-confirmation conversion.

### Task 2: Make outline provenance explicit

**Files:**
- Modify: `src/lib/openmaic/generation/interactive-mode-policy.ts`
- Modify: `src/lib/openmaic/server/classroom-generation.ts`

**Steps:**
1. Add a `confirmed | generated` source argument to the fallback policy.
2. Return confirmed outlines unchanged, regardless of interactive mode.
3. Pass the actual source from classroom generation.
4. Keep the existing AI-learning-only fallback for unconfirmed generated outlines.

### Task 3: Verify routing and compatibility

**Files:** No additional production files.

**Steps:**
1. Run focused policy and prompt tests.
2. Run the complete test suite and TypeScript checking.
3. Run the production build and `git diff --check`.
