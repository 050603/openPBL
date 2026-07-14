# Teaching Quality Boundaries Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every generated classroom page respect learner readiness and confirmed knowledge boundaries, while guaranteeing that every generated quiz is renderable and gradable by the current runtime.

**Architecture:** Derive a shared teaching-constraints contract from course facts and teacher-provided learner context, pass it through every OpenMAIC generation stage, normalize quiz output against an explicit capability matrix, and run deterministic post-generation quality checks. Unsupported assessment structures are repaired or downgraded to a supported interactive form.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, OpenMAIC prompt templates, Vitest.

---

### Task 1: Learner profile and teaching constraints

**Files:**
- Create: `src/lib/openmaic/pedagogy/teaching-constraints.ts`
- Modify: `src/lib/session/types.ts`
- Test: `src/lib/openmaic/pedagogy/teaching-constraints.test.ts`

**Steps:**
1. Test conservative grade-band inference and explicit teacher overrides.
2. Define learner-profile and teaching-constraints contracts.
3. Build a stable prompt formatter containing terminology, example, depth, scaffolding, and knowledge-boundary rules.
4. Verify inferred high-school constraints do not assume unexplained specialist concepts.

### Task 2: Course input and request propagation

**Files:**
- Modify: `src/app/teacher/prepare/new/page.tsx`
- Modify: `src/lib/openmaic/pbl/course-request.ts`
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`
- Modify: `src/app/teacher/prepare/[id]/generate/page.tsx`
- Modify: `src/app/api/openmaic/generate/route.ts`
- Modify: `src/lib/openmaic/server/classroom-generation.ts`
- Modify: `src/lib/openmaic/types/generation.ts`

**Steps:**
1. Add optional teacher fields for prior knowledge, learning needs, and familiar contexts.
2. Persist them on the course.
3. Derive constraints using the confirmed knowledge graph and objectives.
4. Send the structured constraints through outline preview and final generation routes.

### Task 3: Prompt integration

**Files:**
- Modify: `src/lib/openmaic/generation/outline-generator.ts`
- Modify: `src/lib/openmaic/generation/scene-generator.ts`
- Modify: `src/lib/openmaic/generation/pipeline-types.ts`
- Modify: `src/lib/openmaic/pbl/course-template.ts`
- Modify: relevant prompt templates under `src/lib/openmaic/prompts/templates/`

**Steps:**
1. Inject the authoritative constraint block into outline planning.
2. Inject it into slide, interactive, quiz, and action generation.
3. Require prerequisite-first terminology and page-to-page cognitive progression.
4. Restrict examples and depth to confirmed objectives and knowledge points.

### Task 4: Quiz capability matrix and normalization

**Files:**
- Create: `src/lib/openmaic/quiz/quality.ts`
- Modify: `packages/@openmaic/dsl/src/stage.ts`
- Modify: `src/lib/openmaic/types/generation.ts`
- Modify: `src/lib/openmaic/generation/scene-generator.ts`
- Modify: `src/lib/openmaic/prompts/templates/quiz-content/system.md`
- Modify: `src/lib/openmaic/prompts/templates/quiz-content/user.md`
- Test: `src/lib/openmaic/quiz/quality.test.ts`

**Steps:**
1. Test aliases, malformed choice questions, unsupported matching/ordering, missing analysis, and missing rubric.
2. Add semantic question format metadata without expanding the runtime type union.
3. Normalize every provider response before it enters scene storage.
4. Permit only formats backed by rendering and grading.

### Task 5: Quiz rendering and grading semantics

**Files:**
- Modify: `src/components/openmaic/scene-renderers/quiz-view.tsx`
- Modify: `src/components/openmaic/edit/surfaces/quiz/QuestionCard.tsx`
- Modify: quiz locale resources if needed.

**Steps:**
1. Display true/false, fill-in, and scenario-task labels accurately.
2. Reuse proven choice/text components for their supported response structures.
3. Preserve submission, scoring, explanations, retry, and playback-completion behavior.

### Task 6: Course quality audit

**Files:**
- Create: `src/lib/openmaic/generation/course-quality.ts`
- Modify: `src/lib/openmaic/server/classroom-generation.ts`
- Test: `src/lib/openmaic/generation/course-quality.test.ts`

**Steps:**
1. Validate knowledge IDs, quiz structure, analysis/rubric completeness, and progression metadata.
2. Apply safe deterministic corrections and log remaining warnings.
3. Run the audit before ordered scene assembly/persistence.

### Task 7: Verification

1. Run focused pedagogy, quiz, and quality-audit tests.
2. Run TypeScript and targeted ESLint.
3. Run the complete Vitest suite.
4. Run the Next.js production build.
