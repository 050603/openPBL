# AI Direct Collaborative Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a desktop-first proposal and make workspace where AI teammates can directly edit approved draft fields, every edit is traceable and undoable, and resources and process history live in the same workbench.

**Architecture:** Keep learning evidence as the source of truth for student drafts. AI responses emit a validated field-level workspace patch; the client applies it to the matching draft evidence and stores the reversible operation in the existing companion confirmation aggregate as an applied operation journal. Student submission remains a separate explicit action. The workbench becomes a three-column desktop shell with local editor/resource/archive views.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Vitest, existing session store and learning-evidence domain, existing web-search route, Lucide icons, CSS.

---

### Task 1: Define the reversible workspace patch contract

**Files:**
- Modify: `src/lib/companion/workspace-operation.ts`
- Modify: `src/lib/companion/workspace-operation.test.ts`
- Modify: `src/lib/companion/stage-policy.ts`

1. Write failing tests for proposal/make target validation, append/replace operations, sanitization, and conflict metadata.
2. Run `pnpm vitest run src/lib/companion/workspace-operation.test.ts` and confirm failure.
3. Add stage-specific target maps and update the machine-readable prompt contract.
4. Add pure helpers that apply a patch to a learning-evidence payload and return before/after values.
5. Run the focused test and confirm it passes.

### Task 2: Apply AI edits immediately and record undo data

**Files:**
- Modify: `src/components/views/student/companion-runtime.tsx`
- Modify: `src/components/views/student/companion-studio-workspace.tsx`
- Modify: `src/components/views/student/companion-studio-workspace-task-sync.test.tsx`
- Modify: `src/lib/session/types.ts`

1. Write a failing task-sync test expecting a workspace patch to update draft evidence immediately.
2. Confirm the previous waiting-confirmation behavior fails the new expectation.
3. Apply valid patches in task completion, store an applied operation journal entry, and add an attributed process record.
4. Keep high-impact non-edit suggestions in the AI decision inbox but mark successful workspace edits as already handled.
5. Add field-level undo with a current-value check; record successful reversions in the process history.
6. Run the task-sync and runtime tests.

### Task 3: Complete the proposal and make shared editors

**Files:**
- Modify: `src/components/views/student/evidence-task/proposal-task.tsx`
- Modify: `src/components/views/student/evidence-task/make-task.tsx`
- Modify: `src/components/views/student/evidence-task/use-evidence-draft.ts`
- Modify: `src/lib/learning-evidence/missions.ts`
- Modify: `src/lib/learning-evidence/readiness.ts`
- Modify: `src/lib/learning-evidence/readiness.test.ts`

1. Add proposal fields for risks and AI responsibility boundary.
2. Add make-stage test-result and revision-decision draft cards alongside version upload.
3. Make external AI changes refresh a clean draft without overwriting unsaved local input.
4. Derive make readiness from an artifact plus the configured number of complete test–interpret–revision cycles.
5. Update mission labels and focused tests.

### Task 4: Consolidate workbench navigation, resources, and archive

**Files:**
- Modify: `src/components/views/student/studio-project-workbench.tsx`
- Create: `src/components/views/student/studio-resource-library.tsx`
- Create: `src/components/views/student/studio-process-archive.tsx`
- Modify: `src/components/views/student/companion-studio-workspace.tsx`
- Modify: `src/components/views/student/companion-studio-workspace.css`

1. Add left navigation for shared editing, resources, and process archive.
2. Keep the AI teammate panel visible by default on desktop and add an explicit “edit this field” task hint.
3. Connect resource search to `/api/openmaic/web-search`, render source title/domain/snippet, and send selected evidence back to the Knowledge teammate for synthesis.
4. Build a unified archive timeline for AI edits, reversions, tasks, student saves, evidence, and conversations.
5. Add undo controls only for operations whose target field still equals the recorded after value.
6. Update component tests for navigation and operation history.

### Task 5: Desktop visual and motion quality

**Files:**
- Modify: `src/components/views/student/companion-studio-workspace.css`
- Modify: `src/pixi/person.ts`
- Modify: `src/pixi/person.test.ts`

1. Implement the desktop three-column grid and stable canvas scrolling.
2. Ensure panels use existing project color, spacing, radius, and typography tokens.
3. Preserve the current character action until the next animation is ready, cross-fade transitions, and avoid restarting identical states.
4. Respect reduced-motion settings for panel and character transitions.
5. Run motion unit tests and inspect the accessible desktop state.

### Task 6: Verify the complete path

1. Run focused Vitest suites for workspace operations, task sync, evidence workflow, readiness, and character motion.
2. Run ESLint on modified files.
3. Run `pnpm typecheck`; report any pre-existing unrelated failures separately.
4. Run the production build.
5. Open the desktop student route with an authorized fixture if available; otherwise document the authentication blocker and do not alter a live classroom to manufacture screenshots.

