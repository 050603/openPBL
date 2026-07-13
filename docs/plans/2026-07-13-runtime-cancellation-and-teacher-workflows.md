# Runtime Cancellation and Teacher Workflow Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop request-scoped AI/classroom work after a client disconnects, eliminate companion timer/request leaks, allow stage-level time reallocation, and make teacher rubric drafts update and persist reliably.

**Architecture:** Treat `Request.signal` as the cancellation contract for foreground generation. Pass it into every cancellable LLM call, check it at each expensive phase and before every persistence boundary, and keep detached streaming work abort-aware. Keep background classroom jobs signal-free so they continue independently. Use pure timing helpers for total-preserving stage reallocation, and a controlled local rubric draft for teacher scoring.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, AI SDK 6, Web Streams, Vitest.

---

## Task 1: Propagate disconnect cancellation through classroom generation

**Files:** `src/app/api/openmaic/generate/route.ts`, `src/lib/openmaic/server/classroom-generation.ts`, `src/lib/openmaic/server/server-classroom-split.ts`, `src/lib/openmaic/server/classroom-link.ts`, `src/lib/openmaic/ai/llm.ts`, `src/lib/openmaic/generation/generation-retry.ts`, `src/lib/llm/client.ts`, plus focused route/generation tests.

1. Add abort-aware guards before and after generation phases, splitting, linking, progress writes, and persistence.
2. Pass `request.signal` into raw LLM fetches and AI SDK calls; do not retry or fall back after an abort.
3. Stop heartbeats and close the SSE stream without enqueueing after cancellation.
4. Preserve the existing background job runner behavior by leaving it without a request signal.

## Task 2: Clean up companion timers, TTS, and event-triggered work

**Files:** `src/components/views/student/companion-roundtable.tsx`, plus focused component/orchestration tests.

1. Track delayed queue transitions and phase/artifact timers in refs and clear them on stop/unmount.
2. Abort in-flight server TTS requests and ignore completion callbacks from stopped playback.
3. Abort thread loading when the component unmounts and prevent zero-delay artifact events from starting a stopped round.

## Task 3: Reallocate course time from stage-level controls

**Files:** `src/lib/pbl-time-model.ts`, `src/lib/pbl-time-model.test.ts`, `src/app/teacher/prepare/[id]/verify/page.tsx`.

1. Add a pure helper that honors a requested canonical stage total, redistributes the remaining fixed course minutes across other stages, and distributes each stage total across its activities.
2. Wire stage-total numeric controls into the existing recomputation path so child lesson/module durations, mainline, and persisted outline stay synchronized.
3. Clamp invalid values and preserve the six-module minimums where possible.

## Task 4: Make teacher scoring drafts editable and saveable

**Files:** `src/components/views/teacher/showcase.tsx`, focused scoring tests if needed.

1. Keep draft scores stable across store re-renders and group changes, with every slider and numeric input writing to the same state.
2. Compute teacher and hybrid totals from the draft at render/save time, and submit the complete dimension map in one upsert.
3. Clean up transient feedback timers while touching the component.

## Task 5: Verify

Run focused Vitest suites, `pnpm exec tsc --noEmit`, targeted ESLint on changed files, and `pnpm build`; inspect the final diff for preservation of unrelated worktree changes.
