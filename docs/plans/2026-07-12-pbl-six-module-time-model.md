# PBL Six-Module Time Model Implementation Plan
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the new PBL course timing flow around six canonical course modules so that recommendations are distributed across the whole project, teacher adjustments regenerate the project mainline and downstream outline timing, all knowledge points remain covered, and resource/TTS generation follows the adjusted model.

**Architecture:** Keep the six-module timing and project-mainline calculations in pure, tested library functions. Normalize generated first-level activities into canonical module slots, retain second-level details as one-to-many children, and let the verification page apply one derived-content recomputation after every timing change. Pass the normalized timing, knowledge graph, and both outline levels into prompts and final classroom generation.

**Tech Stack:** Next.js 16 App Router, React/TypeScript, Vitest, Zod, pnpm.

---

## Root cause to address

The current allocator only assigns ratios to stage categories present in the generated first-level rows. When stage keys are missing or non-canonical (for example `project-launch`) and the only recognized row is `ai-learning`, the allocator normalizes the ratio over that active subset, so all available time is assigned to AI授知. The UI also treats the first-level rows as free-form activities instead of guaranteeing six canonical module slots, so missing modules are not visible or allocated.

## Tasks

1. Extend and test the pure PBL time model.
   - Normalize stage aliases and guarantee six module slots.
   - Add topic/difficulty/grade/knowledge-complexity inputs and constrained adaptive ratios with project practice remaining largest.
   - Build a strict project mainline and rescale second-level target durations after module changes.
   - Add TTS duration estimation helpers and validation warnings for missing/imbalanced modules.

2. Normalize course data and generation contracts.
   - Add structured project-mainline metadata and knowledge difficulty levels.
   - Ensure first-level generation covers every configured knowledge point and uses the knowledge graph/base course facts.
   - Feed the final time model, mainline, and both outline levels into resource and evaluation prompts.

3. Update the teacher flow and naming.
   - Rename the first-level UI to `课程模块` and the second-level UI to `课程大纲`.
   - Apply/recompute module times, project mainline, child detail targets, and coverage state together.
   - Make the final generation consume the recomputed second-level outline.

4. Verify the implementation.
   - Run focused model tests, all tests, TypeScript, production build, targeted lint, and diff checks.

