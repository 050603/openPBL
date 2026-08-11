# Deep Interactive Teaching Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every newly generated course use a foundation-first deep-interaction flow, one end-of-core mastery assessment, knowledge-point-aware optional enrichment, and reliable visual teaching guidance without adding new classroom tools.

**Architecture:** Keep `interactiveMode` as a backward-compatible persisted field, but force it to `true` at all new-generation boundaries and remove teacher-facing toggles. Replace the block-quiz prompt contract and count-based interaction quality gate with a single terminal mastery assessment plus explanation-depth checks. Extend quiz questions and adaptive evidence with knowledge-point attribution so the existing prepared-resource library can select enrichment after the terminal assessment using mastery and remaining-time constraints.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vercel AI SDK, Vitest, OpenMAIC DSL.

---

### Task 1: Lock the new lesson-outline contract with tests

**Files:**
- Modify: `src/lib/openmaic/prompts/pbl-course.test.ts`
- Modify: `src/lib/course-design/quality-gates.test.ts`
- Modify: `src/lib/openmaic/generation/outline-prompt-plan.test.ts`

**Steps:**
1. Add failing assertions that deep interaction is always selected for new outline generation.
2. Add failing assertions that prompts require one terminal mastery assessment and forbid block-level quiz repetition.
3. Add failing quality-gate cases for multiple quizzes, a quiz before teaching completes, missing slide explanation coverage, and missing meaningful interaction.
4. Run the focused tests and confirm the new assertions fail.

### Task 2: Implement the foundation-first generation policy

**Files:**
- Modify: `src/lib/openmaic/generation/outline-prompt-plan.ts`
- Modify: `src/lib/openmaic/prompts/templates/pbl-course/system.md`
- Modify: `src/lib/openmaic/prompts/templates/pbl-course/user.md`
- Modify: `src/lib/openmaic/prompts/templates/requirements-to-outlines/user.md`
- Modify: `src/lib/openmaic/prompts/templates/interactive-outlines/system.md`
- Modify: `src/lib/course-design/quality-gates.ts`
- Modify: `src/lib/course-design/job-runner.ts`

**Steps:**
1. Make deep interaction the default prompt plan while preserving task-engine routing precedence.
2. Replace per-block quizzes with one terminal `主课达标测` that covers taught knowledge points.
3. Require concept explanation, concrete example or counterexample, visual support, guided ungraded interaction, and feedback before assessment.
4. Replace interaction-ratio pressure with semantic checks for explanation coverage, a meaningful interaction, quiz count, quiz placement, and assessment-time share.
5. Run focused prompt and quality-gate tests.

### Task 3: Remove teacher-facing interaction-mode choices

**Files:**
- Modify: `src/components/teacher/fast-course-generator.tsx`
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`
- Modify: `src/app/teacher/prepare/[id]/generate/page.tsx`
- Modify: `src/app/api/courses/[courseId]/design-generation/route.ts`
- Modify: `src/app/api/courses/[courseId]/generation/route.ts`
- Modify: `src/lib/course-design/job-runner.ts`

**Steps:**
1. Remove both interactive-mode toggles and their local option state.
2. Force `interactiveMode: true` in new design and classroom generation requests.
3. Replace mode labels with a fixed description of the foundation-first teaching flow where useful.
4. Preserve reading old `interactiveMode` data only for compatibility.
5. Run TypeScript and affected component tests.

### Task 4: Add knowledge-point attribution to mastery assessment questions

**Files:**
- Modify: `packages/@openmaic/dsl/src/stage.ts`
- Modify: `src/lib/openmaic/quiz/quality.ts`
- Modify: `src/lib/openmaic/quiz/quality.test.ts`
- Modify: `src/lib/openmaic/prompts/templates/quiz-content/system.md`
- Modify: `src/lib/openmaic/prompts/templates/quiz-content/user.md`
- Modify: `src/lib/openmaic/generation/scene-generator.ts`

**Steps:**
1. Add optional `knowledgePointIds` to the backward-compatible quiz-question contract.
2. Preserve and sanitize attribution during quiz normalization.
3. Supply allowed knowledge-point IDs to quiz generation and require every generated question to reference at least one.
4. Fall back to the scene's knowledge-point IDs for legacy generated questions lacking attribution.
5. Run DSL and quiz-generation tests.

### Task 5: Route enrichment from per-knowledge-point terminal-assessment evidence

**Files:**
- Modify: `src/lib/session/types.ts`
- Modify: `src/components/views/student/adaptive-ai-learning-runtime.tsx`
- Modify: `src/lib/adaptive-learning.ts`
- Modify: `src/lib/adaptive-learning.test.ts`
- Modify: `src/components/views/student/adaptive-ai-learning-runtime.test.tsx`
- Modify: `src/lib/course-design/job-runner.ts`

**Steps:**
1. Add per-knowledge-point score records to adaptive evidence.
2. Aggregate submitted question results by their attributed knowledge points.
3. Mark mastery and weakness per knowledge point instead of applying the total score to every point.
4. Retarget all non-prerequisite prepared resources to the final mastery-assessment scene.
5. Select at most the configured runtime limit using matched mastered points, resource readiness, and remaining-time budget.
6. Do not add another quiz after an inserted enrichment resource.
7. Run adaptive unit and runtime component tests.

### Task 6: Simplify classroom tools and strengthen visual teaching

**Files:**
- Modify: `src/lib/openmaic/orchestration/registry/types.ts`
- Modify: `src/lib/openmaic/orchestration/registry/store.ts`
- Modify: `src/lib/openmaic/orchestration/prompt-builder.ts`
- Modify: `src/lib/openmaic/prompts/templates/agent-system-wb-teacher/system.md`
- Modify: related orchestration tests

**Steps:**
1. Remove `check_understanding` and `evidence_board_update` from default AI-learning agent action sets while keeping playback compatibility for existing courses.
2. Replace the 100-character teacher cap with a complete but paced explanatory-beat target.
3. Require meaningful whiteboard or widget use when a process, comparison, derivation, example transformation, or causal chain would be abstract in speech.
4. Keep tool choice automatic for simple definitions and transitions; prohibit decorative or duplicate tool calls.
5. Run orchestration and playback tests.

### Task 7: Full verification

**Files:**
- Modify: `docs/adr/0010-foundation-first-deep-interactive-teaching.md`

**Steps:**
1. Document the architectural decision and backward-compatibility policy.
2. Run focused Vitest suites for prompts, quality gates, quiz normalization, adaptive routing, orchestration, and UI.
3. Run DSL tests, TypeScript checking, and ESLint on changed files.
4. Inspect the teacher generation UI and one generated outline if the local authenticated environment permits it.
5. Review the final diff for unrelated changes and report any verification limitation.
