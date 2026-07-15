# Authoritative Course Basis Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make teacher-confirmed course basics and hour-scaled student boundaries authoritative for every AI suggestion and downstream course-generation stage.

**Architecture:** Build one deterministic course generation profile from title, subject, grade band, hours, objectives, description, learner profile, and PBL configuration. Serialize that profile into both the legacy `/api/llm` prompts and OpenMAIC teaching constraints so knowledge graphs, modules, outlines, evaluation, and final classroom scenes share the same learner and scope boundary. Use hour bands to calculate a recommended knowledge-point range and explicit depth/assessment rules instead of fixed content counts.

**Tech Stack:** TypeScript, Next.js 16 App Router, React, Vitest, existing OpenMAIC teaching constraints and LLM prompt builders.

---

### Task 1: Course scope contract

**Files:**
- Modify: `src/lib/openmaic/pedagogy/teaching-constraints.ts`
- Modify: `src/lib/openmaic/pedagogy/teaching-constraints.test.ts`

1. Add tests for one-hour, medium, and five-hour scope bands.
2. Add total minutes, recommended knowledge-point range, and authoritative scope rule to the teaching constraint contract.
3. Verify explicit teacher learner knowledge continues to override inferred defaults.

### Task 2: Shared teacher generation input

**Files:**
- Create: `src/lib/teacher/course-generation-input.ts`
- Create: `src/lib/teacher/course-generation-input.test.ts`
- Modify: `src/lib/llm/types.ts`
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`

1. Extend the LLM input contract with learning objectives and learner profile.
2. Build that input from the saved course in one shared helper.
3. Replace duplicated preparation-page request objects so neither generation path can omit confirmed basics.

### Task 3: Grade- and hour-aware field suggestions

**Files:**
- Modify: `src/lib/teaching-ai/client-api.ts`
- Modify: `src/lib/teaching-ai/support-engine.ts`
- Modify: `src/lib/teaching-ai/support-engine.test.ts`
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`

1. Send the current objective and learner-profile draft with each targeted suggestion request.
2. Inject the inferred grade band, explicit learner foundation, learning needs, familiar contexts, and hour capacity into every targeted prompt.
3. Add prompt-capture tests proving the model sees these constraints.

### Task 4: Authoritative downstream prompts

**Files:**
- Modify: `src/lib/llm/prompts.ts`
- Modify: `src/lib/llm/client.test.ts`
- Modify: `src/lib/openmaic/pbl/course-request.ts`
- Modify: `src/lib/openmaic/pbl/course-request.test.ts`

1. Add a shared formatted course-basis block to knowledge graph, module, outline, evaluation, PBL outline, and full-course prompts.
2. Replace fixed knowledge-point counts with the hour-scaled range.
3. State that objectives and learner boundaries are authoritative and content outside them may not become hidden prerequisites or assessment targets.
4. Ensure final OpenMAIC requirements receive hours and the same scope contract.

### Task 5: Verification

1. Run focused prompt, support-engine, course-request, and teaching-constraint tests.
2. Run TypeScript and ESLint checks.
3. Inspect generated prompt text for one-hour and five-hour AI-literacy examples.
