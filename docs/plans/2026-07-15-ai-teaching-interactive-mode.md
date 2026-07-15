# AI Teaching Interactive Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make interactive mode produce a clearly different, pedagogically stronger AI-learning experience while leaving default generation and every teacher-facing phase unchanged.

**Architecture:** Add a pure, tested outline policy between PBL outline normalization and scene generation. The policy is opt-in, only transforms student `ai-learning` knowledge-teaching slides, preserves slides whose primary job is dense static reference, and selects a widget from the teaching affordance of the content. Reinforce the five widget prompts with a shared teaching-loop contract and add an interactive-only directive to the PBL outline prompt.

**Tech Stack:** TypeScript, Next.js 16 App Router, Vitest, Markdown prompt templates.

---

### Task 1: Lock the outline routing contract with tests

**Files:**
- Create: `src/lib/openmaic/generation/interactive-mode-policy.test.ts`
- Create: `src/lib/openmaic/generation/interactive-mode-policy.ts`

**Steps:**
1. Add failing tests for opt-in behavior, AI-learning-only scope, single-page conversion, PPT-essential preservation, widget selection, and resource metadata.
2. Run `pnpm vitest run src/lib/openmaic/generation/interactive-mode-policy.test.ts` and confirm failure before implementation.
3. Implement the smallest pure policy that satisfies those tests.
4. Re-run the test and confirm it passes.

### Task 2: Integrate the deterministic policy

**Files:**
- Modify: `src/lib/openmaic/server/classroom-generation.ts`

**Steps:**
1. Replace the local broad conversion helper with the tested policy import.
2. Pass the mode flag explicitly so false preserves the existing outline array.
3. Keep conversion after `enforcePblOutlineContract` so audience and phase metadata are authoritative.

### Task 3: Make PBL outline planning mode-aware

**Files:**
- Modify: `src/lib/openmaic/generation/outline-generator.ts`
- Modify: `src/lib/openmaic/prompts/templates/pbl-course/user.md`
- Modify: `src/lib/openmaic/prompts/pbl-course.test.ts`

**Steps:**
1. Inject a conditional interactive-mode planning block only when the flag is true.
2. Require interactive-first resources only in `ai-learning`; keep launch and later teacher resources PPT/script-only.
3. Test both enabled and disabled prompt rendering.

### Task 4: Upgrade the five widget teaching contracts

**Files:**
- Modify: `src/lib/openmaic/prompts/templates/code-content/user.md`
- Modify: `src/lib/openmaic/prompts/templates/diagram-content/user.md`
- Modify: `src/lib/openmaic/prompts/templates/game-content/user.md`
- Modify: `src/lib/openmaic/prompts/templates/simulation-content/user.md`
- Modify: `src/lib/openmaic/prompts/templates/visualization3d-content/user.md`
- Create: `src/lib/openmaic/prompts/widget-knowledge-teaching.test.ts`

**Steps:**
1. Test for objective/key-point alignment, non-decorative interaction, explanatory feedback, and mastery evidence in every widget prompt.
2. Replace passive “knowledge panel” requirements with a complete predict-act-observe-explain-check teaching loop adapted to each widget.
3. Preserve each template's existing output and technical constraints.

### Task 5: Verify the complete change

**Files:** No additional production files.

**Steps:**
1. Run the new focused tests and existing PBL outline tests.
2. Run TypeScript checking and ESLint on modified TypeScript files.
3. Review `git diff --check` and the final scoped diff for accidental edits.
