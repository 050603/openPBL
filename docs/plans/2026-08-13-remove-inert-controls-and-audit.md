# Remove Inert Controls And Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove misleading controls from the six-stage architecture editor and establish a repeatable audit for UI actions that have no observable product effect.

**Architecture:** The editor will derive its presentation from the canonical six-stage routing contract instead of exposing fields that downstream generation overwrites. A shared normalization helper will sanitize legacy `resourceTypes` before both UI rendering and prompt serialization, while a small component makes the capability boundary explicit and testable.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Testing Library.

---

## Design decision

Three approaches were considered:

1. Hide only `worksheet`, `rubric`, and `project-brief`. This is too narrow because ordinary-stage media toggles and the `openMaicUse` selector are also overwritten downstream.
2. Make the UI capability-aware and sanitize legacy data at the generation boundary. This is the selected approach because it removes false affordances without expanding the artifact-generation system.
3. Implement real worksheet, rubric, and project-brief artifact pipelines. This would require new generation, storage, preview, download, and classroom-consumption contracts and is outside this cleanup.

## Audit standard

A control is considered real only when all applicable checks pass:

- It has an event or navigation target.
- The action produces a visible state change, persisted mutation, navigation, download, API call, or classroom effect.
- Any saved field has a downstream reader that changes behavior.
- A generation/download/publish label resolves to a real generated, downloadable, or published artifact.
- A control intentionally used only as a primitive trigger is excluded from findings.
- Unused components and disabled future controls are recorded as dead code, not reported as live fake functionality.

### Task 1: Add canonical module-resource normalization

**Files:**

- Modify: `src/lib/pbl-outline-normalization.ts`
- Test: `src/lib/pbl-outline-normalization.test.ts`

**Step 1: Write the failing tests**

- Verify ordinary stages always normalize to `ppt` and `script`.
- Verify the AI-learning stage keeps only `ppt`, `interactive-demo`, and `code-interactive`.
- Verify an empty or legacy-only AI selection falls back to `ppt`.

**Step 2: Run the focused test**

Run: `pnpm vitest run src/lib/pbl-outline-normalization.test.ts`

Expected: FAIL because the shared normalizer does not exist.

**Step 3: Implement the minimal helper**

Export a typed helper and use it in both source normalization and stage merging.

**Step 4: Re-run the focused test**

Expected: PASS.

### Task 2: Sanitize legacy values before generation

**Files:**

- Modify: `src/lib/openmaic/pbl/course-request.ts`
- Test: `src/lib/openmaic/pbl/course-request.test.ts`

**Step 1: Write the failing test**

Build a course requirement containing legacy resource values and assert that the serialized confirmed teaching outline contains only canonical values.

**Step 2: Run the focused test**

Run: `pnpm vitest run src/lib/openmaic/pbl/course-request.test.ts`

Expected: FAIL because raw `teachingOutline` is currently serialized.

**Step 3: Serialize a sanitized outline**

Map teaching modules through the canonical helper before `JSON.stringify`.

**Step 4: Re-run the focused test**

Expected: PASS.

### Task 3: Replace false resource and routing controls

**Files:**

- Create: `src/components/teacher/teaching-module-resources.tsx`
- Create: `src/components/teacher/teaching-module-resources.test.tsx`
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`

**Step 1: Write component tests**

- Ordinary module: no interactive resource buttons; show fixed teacher deliverables.
- AI-learning module: exactly three real resource buttons.
- Deprecated labels never render.
- Clicking a real option emits only canonical values.

**Step 2: Run the component test**

Run: `pnpm vitest run src/components/teacher/teaching-module-resources.test.tsx`

Expected: FAIL because the component does not exist.

**Step 3: Implement the component and integrate it**

Replace the routing `<select>` with a read-only route badge. Replace the seven-option resource fieldset with the capability-aware component.

**Step 4: Re-run the component test**

Expected: PASS.

### Task 4: Remove remaining confirmed live fake affordances

**Files:**

- Modify: `src/components/classroom-ux.tsx`

**Step 1: Replace help-icon buttons that only expose a native title**

Render them as non-button help indicators so they no longer promise a click action.

**Step 2: Run lint on touched files**

Run: `pnpm eslint src/components/classroom-ux.tsx src/components/teacher/teaching-module-resources.tsx src/app/teacher/prepare/[id]/verify/page.tsx`

Expected: PASS.

### Task 5: Document and verify the system-wide audit

**Files:**

- Create: `docs/audits/2026-08-13-fake-feature-audit/README.md`
- Create: `docs/audits/2026-08-13-fake-feature-audit/01-teacher-dashboard.png`
- Create: `docs/audits/2026-08-13-fake-feature-audit/02-stage-resources-before.png`
- Create: `docs/audits/2026-08-13-fake-feature-audit/03-stage-resources-after.png`

**Step 1: Record static results**

Document scanned scope, high-confidence findings, excluded false positives, and reachable-but-not-exposed incomplete editor code.

**Step 2: Run regression checks**

Run focused Vitest tests, touched-file ESLint, and `pnpm typecheck`.

Expected: all focused tests and type checking pass, or unrelated pre-existing failures are clearly separated.

**Step 3: Capture the corrected UI**

Reload the local app, return to Stage Architecture, and capture the same viewport showing the corrected controls.

