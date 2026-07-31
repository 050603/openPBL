# Student Companion Classroom Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI companion group the primary student interaction surface while preserving the existing task view and keeping both views on one shared runtime and data model.

**Architecture:** Keep `/student/classroom/[id]` as the single student classroom route. Extract the existing companion SSE/TTS/history/proactive behavior into one `CompanionRuntimeProvider` mounted once around the classroom content. Render the task view and classroom companion view together, switching visibility without unmounting either surface. Add explicit companion task, process-record, and confirmation records to `Course`, while continuing to use the existing course artifacts, submissions, uploads, reflections, and `CompanionThread` persistence.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, existing session reducer/server store, existing Director/SSE companion route, existing TTS settings and audio pipeline, Vitest + Testing Library.

---

## Current architecture and constraints

- `src/app/student/classroom/[id]/page.tsx` owns the classroom shell, heartbeat/presence, stage progress, projection state, and `StudentStageView`.
- `src/lib/session/store.tsx` provides optimistic session actions, server persistence through `/api/session/actions`, and 1.5 second polling refreshes.
- `src/lib/session/types.ts` already stores project artifacts, uploads, activity logs, AI supports, learning events, and persisted `CompanionThread` history.
- `src/components/views/student/companion-roundtable.tsx` currently couples the companion runtime and TTS queue to a fixed floating roundtable and is mounted independently by several stage views.
- `src/app/api/chat/companion/route.ts` already owns Director selection, sequential role responses, SSE, persistence, and proactive trigger handling. The new UI must call this route instead of creating another Agent backend.
- Current stage views contain the authoritative editors, upload flows, submissions, showcase, and reflection actions. They remain the task view and are not replaced by mock cards.

## Visual and interaction direction

The companion mode is a classroom, not an office or a generic chat panel: a soft daylight classroom table, six illustrated student teammates, colored desk cards for responsibilities, and a sideboard showing current evidence and decisions. Motion is sparse and semantic: a listening halo, a speaking pulse, a raised-hand cue for waiting confirmation, and a brief completed check. `prefers-reduced-motion` removes decorative motion without hiding state. Generated illustrations, if used, are project assets with no external third-party license dependency.

## Task 1: Add shared companion domain records

**Files:**

- Modify: `src/lib/session/types.ts`
- Modify: `src/lib/session/actions.ts`
- Modify: `src/lib/session/store.tsx`
- Test: `src/lib/session/companion-workspace.test.ts`

1. Add `CompanionTaskStatus`, `CompanionTask`, `CompanionConfirmation`, and `CompanionProcessRecord` types. Distinguish an immediate conversation from a multi-step task, a formal confirmation, a process record, and a saved artifact.
2. Add optional `companionTasks`, `companionConfirmations`, and `companionProcessRecords` arrays to `Course` and initialize them for new courses and `normalizeCourse`.
3. Add reducer actions and `SessionApi` methods to upsert tasks, upsert/resolve confirmations, and append process records. All mutation methods must use the existing optimistic commit path.
4. Write reducer tests covering status transitions, confirmation resolution, idempotent upsert, and newest-first process records.
5. Run `pnpm exec vitest run src/lib/session/companion-workspace.test.ts`.

## Task 2: Extract one companion runtime

**Files:**

- Create: `src/components/views/student/companion-runtime.tsx`
- Modify: `src/components/views/student/companion-roundtable.tsx`
- Modify: `src/app/api/chat/companion/route.ts`
- Test: `src/components/views/student/companion-runtime.test.tsx`

1. Move the tested TTS queue into the runtime module and re-export `useCompanionTTS` from the existing roundtable module so current tests and callers keep the same public import.
2. Implement `CompanionRuntimeProvider` and `useCompanionRuntime` with one AbortController, one TTS queue, one proactive listener set, one history loader, and one SSE reader per classroom page.
3. Expose messages, stream phase, current speaker, streaming text, selected companion, send/stop actions, history, TTS controls, and completed-round metadata to both surfaces.
4. Add a `preferredCompanionId` request field to the existing route so a student-directed request is honored without changing the backend orchestration model.
5. Preserve stage-opening, idle, artifact-follow-up, no-progress, teacher-directive, and persisted-thread behavior. Abort active work and stop audio only when the provider unmounts or the stage identity changes, never when the display mode changes.
6. Add tests proving one SSE request per send, one stop path, directed partner forwarding, and no duplicate runtime after a provider remains mounted through a mode change.
7. Run the focused runtime tests.

## Task 3: Mount the shared runtime and preserve both views

**Files:**

- Create: `src/components/views/student/classroom-experience.tsx`
- Modify: `src/app/student/classroom/[id]/page.tsx`
- Modify: `src/components/views/student/stage-dispatcher.tsx`
- Modify: stage view companion mounts under `src/components/views/student/`
- Test: `src/components/views/student/classroom-experience.test.tsx`

1. Mount `CompanionRuntimeProvider` once around the classroom content.
2. Add a local per-student view mode (`task` or `companion`) and persist only that UI preference in `sessionStorage`; never store mode in shared course state.
3. Keep the task and companion surfaces mounted and toggle `hidden`, `aria-hidden`, and interaction availability so unsaved editor state survives switching.
4. Convert `CompanionRoundtable` stage mounts into a provider-aware compatibility adapter that renders no second runtime when the shared provider exists.
5. Keep presence, projection, stage progress, and the existing task view behavior unchanged.
6. Test that both surfaces remain mounted, the mode switch is keyboard accessible, and switching modes does not create a second fetch/listener/audio runtime.

## Task 4: Build the classroom companion surface

**Files:**

- Create: `src/components/views/student/companion-classroom.tsx`
- Create: `src/components/views/student/companion-classroom.css` or scoped additions to `src/app/globals.css`
- Create or add: `public/companions/classroom/` project-owned illustration assets
- Test: `src/components/views/student/companion-classroom.test.tsx`

1. Build a responsive classroom layout with a phase header, stage objective, progress marker, companion seating/work areas, task board, recent artifacts, process log, and confirmation queue.
2. Give each available companion a visually distinct classroom seat and responsibility label. Derive status from actual runtime state, task state, and persisted history; never claim a task was executed merely because a card is visible.
3. Add whole-group and directed-partner scopes, a single composer, stop generation, voice toggle, history, and unread/active cues.
4. Add stage-specific quick tasks for proposal, make, showcase, and reflection. Starting a quick task creates a real `CompanionTask`, sends a preferred-partner request through the shared runtime, and records its result/process entry.
5. Add an AI draft suggestion card that creates a pending `CompanionConfirmation`. Only the student confirmation may adopt the draft into a formal submission.
6. Implement empty, loading, streaming, waiting-for-student, waiting-for-confirmation, failed, and reduced-motion states.
7. Test rendering/status mapping, directed partner selection, quick-task persistence, confirmation gating, and responsive DOM structure.

## Task 5: Add confirmation gates to formal student actions

**Files:**

- Create: `src/components/student/student-action-confirmation.tsx`
- Modify: `src/components/views/student/workspace.tsx`
- Modify: `src/components/views/student/proposal-review.tsx`
- Modify: `src/components/views/student/showcase.tsx`
- Modify: `src/components/views/student/reflection.tsx`
- Add focused tests beside the modified views where behavior changes.

1. Add one accessible confirmation dialog pattern for save, overwrite, upload, submit, mark-complete, and adopt-draft actions.
2. Route the main task-view document save/submit/upload, proposal save, showcase upload, and reflection save through the dialog. Keep drafting/editing local until the student confirms.
3. When the action is AI-suggested, create/update a persisted pending confirmation and resolve it only after the formal action succeeds.
4. Show saving, saved, failed, and retryable feedback through the existing session save status/toast conventions.
5. Run the affected unit and component tests.

## Task 6: Visual refinement and verification

**Files:**

- Modify: `src/app/globals.css`
- Modify: classroom companion components/assets as needed
- Add/update: tests and plan notes

1. Add the classroom illustration treatment, state animation tokens, focus states, reduced-motion rules, and narrow-screen reflow without introducing a heavyweight dependency.
2. Inspect the running classroom at desktop and narrow widths. Verify no horizontal scrolling, no duplicate SSE/TTS/listeners, and no loss of editor state on mode switch.
3. Run `pnpm test`.
4. Run `pnpm lint`.
5. Run `pnpm exec tsc --noEmit`.
6. Run `pnpm build`.
7. Record any remaining limitations and evidence in the final report.

## Main risks and mitigations

- Runtime duplication: provider-aware adapter plus one provider mounted above both views; tests spy on fetch and event listeners.
- Polling overwriting optimistic task/confirmation records: use the existing serialized commit path and reducer upserts.
- Stage changes while streaming: abort only on stage identity change and keep mode switching outside the provider identity.
- AI overclaiming task execution: statuses are advanced only by observed SSE/task callbacks; formal records require student confirmation.
- Visual assets becoming a licensing or maintenance burden: prefer project-owned generated illustrations or CSS, keep status meaning in accessible text, and never make animation required.

## Iteration 3 visual refinement (2026-07-16)

- Keep the classroom as the primary visual layer while changing the stage's visual anchor by phase: `问题墙` for launch, `知识桌` for AI learning, `方案桌` for proposal, `制作桌` for making, `展示台` for showcase, and `复盘角` for reflection.
- Derive the stage title, focus card, scene notes, lighting treatment, and actor seating count from the existing stage policy and runtime availability. Do not invent completed work or show a partner who is not available in the current stage.
- Separate `preparing` from `speaking`: preparation may animate the figure and halo, but only an observed `agent_start` renders the voice waveform and speaking mouth animation.
- Adapt the seating composition for two-, three-, five-, and six-partner stages, with a mobile two-column arrangement and a centered final partner when five are present.

## Iteration 4 visual refinement (2026-07-16)

- Evaluated CC0 modular character references and the MIT Rive React runtime. The production choice remains project-owned SVG characters because the classroom needs consistent role-specific props, expressions, and animation states; no third-party character file was added without a matching license and visual system.
- Added a stage theme token per PBL phase, a brief stage-change entrance for the objective card and scene accent, a warm classroom light/dust atmosphere layer, and desk-like grounding surfaces beneath each companion.
- Added selected-companion focus treatment: the selected partner receives visual focus while the other seats become quieter, and the existing popover/composer direction remains the interaction path.
- Rechecked desktop and 390px layouts after the visual pass: the classroom remains the dominant surface, the scene accent stays desktop-only on narrow screens, and the rail/composer remain reachable without horizontal overflow.
