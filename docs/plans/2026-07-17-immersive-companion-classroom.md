# Immersive Companion Classroom Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Turn companion mode into a near-fullscreen collaborative classroom in which the visual team is primary, while every AI contribution remains subordinate to student decisions, editing, review, and submission.

**Architecture:** Add an immersive presentation mode to the existing student shell instead of introducing a second route or runtime. Keep `CompanionRuntimeProvider` as the single source of conversation, SSE, TTS, history, and task state. Recompose the studio UI as a full-viewport scene with floating controls and an overlay drawer, and expose live speech through the existing Pixi workstation feedback layer.

**Tech Stack:** Next.js 16 App Router, React 19 client components, PixiJS 8, TypeScript, component-scoped CSS, Vitest.

---

## Product principles and acceptance criteria

1. **Real group collaboration:** the scene and animated members occupy the visual center; discussion, agent selection, task assignment, progress, archives, and project tools feel like actions inside one shared classroom.
2. **Student ownership:** an agent may explain, compare, organize, critique, propose a scaffold, or produce a reviewable draft. It may not make the final decision, invent student evidence, mark core learning work complete, or submit on the student's behalf.
3. **Calm immersion:** permanent chrome is limited to a compact stage indicator, a settings entry, and the message composer. Project overview, TTS, history, task mode, and other controls live in an on-demand drawer or modal.
4. **Visible participation:** while an agent speaks, its scene bubble is visible without first selecting the character and updates with streaming text.
5. **Honest task state:** a directed agent result becomes “waiting for student” rather than implying that the learning task is complete.
6. **Continuity:** traditional task mode, teacher projection, proactive intervention, SSE, TTS, history, and the shared runtime continue to work.

## Task 1: Add an immersive shell mode

**Files:**
- Modify: `src/components/dashboard-shell.tsx`
- Modify: `src/app/student/classroom/[id]/page.tsx`
- Test: `src/components/views/student/student-surface-cleanup.test.tsx`

**Steps:**
1. Add a failing render assertion that companion mode uses an immersive shell while task mode retains the normal shell.
2. Add an `immersive` presentation prop to `DashboardShell`; hide permanent header chrome and remove max-width, padding, and top offset only when active.
3. Compute immersive mode from the current student workspace state without changing projection behavior.
4. Run the focused student surface test.

## Task 2: Recompose the studio into a full-viewport scene

**Files:**
- Modify: `src/components/views/student/companion-studio-workspace.tsx`
- Modify: `src/components/views/student/companion-studio-workspace.css`

**Steps:**
1. Remove the full-width “AI 伴学现场” HUD and card-like outer border, radius, and shadow.
2. Replace it with a compact top-left stage/progress indicator and a top-right settings button.
3. Make the right rail an overlay drawer that is closed by default on every viewport.
4. Open the drawer from settings, team overview, scene agent selection, and unread activity entry points.
5. Keep the composer centered and visually subordinate, with enough width for communication and task assignment.
6. Add focus-visible states, Escape close behavior, reduced-motion behavior, and responsive drawer sizing.

## Task 3: Make live agent speech visible in the scene

**Files:**
- Modify: `src/pixi/workstation.ts`
- Test: `src/components/views/student/companion-roundtable-tts.test.tsx`

**Steps:**
1. Add a failing unit-level assertion for speaking feedback visibility where practical; otherwise verify through the existing state adapter test and visual QA.
2. Show the workstation feedback bubble whenever the partner state is `speaking`, independent of selection.
3. Keep selected-agent details available while preventing idle agents from covering the scene with old messages.
4. Stream the current response through the existing `setAgentMessage` adapter and hide the automatic bubble after speaking ends.

## Task 4: Encode student responsibility in task state and prompts

**Files:**
- Modify: `src/lib/ai-companions.ts`
- Modify: `src/components/views/student/companion-studio-workspace.tsx`
- Test: `src/lib/ai-companions.test.ts`
- Test: `src/lib/session/companion-workspace.test.ts`

**Steps:**
1. Add failing prompt tests for permitted assistance and prohibited substitution.
2. Add a shared responsibility contract to every companion system prompt: agents can contribute analysis, organization, critique, source leads, scaffolds, and reviewable drafts; they cannot decide, fabricate, complete core evidence, or submit.
3. Require agents to label what the student must decide, verify, edit, or do next when handling a directed task.
4. Change directed task completion from `result` to `waiting-student` and present the result as a contribution awaiting student review.
5. Add a clear “student responsibility” note and a route back to the task editor from the agent drawer.

## Task 5: Verify the experience

**Files:**
- Modify tests only if regressions expose missing contracts.

**Steps:**
1. Run targeted Vitest suites for companion prompts, task state, student surface, confirmations, and TTS.
2. Run `pnpm exec tsc --noEmit` and targeted ESLint.
3. Run `pnpm build`.
4. Visually inspect desktop and 390px layouts: scene dominance, closed/open drawer, live speech bubble, composer, settings, agent task assignment, and task-mode return.
5. Confirm no new browser console errors and that reduced-motion and keyboard focus remain usable.

