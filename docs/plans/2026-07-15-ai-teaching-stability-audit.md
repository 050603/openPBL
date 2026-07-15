# AI Teaching Stability Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the actual openPBL AI-teaching generation and playback path against partial generation, false progress, stale requests, excessive polling, and invalid progress payloads.

**Architecture:** Preserve the current generator, split classrooms, Stage renderer, and PlaybackEngine. Add strict contracts at boundaries: generation must remain one-outline-to-one-scene, playback completion must come from an exhausted engine snapshot, resource requests are abortable, and progress is normalized against the persisted classroom on the server.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zustand, Vitest, filesystem classroom snapshots, SSE.

---

### Task 1: Playback-derived student progress

**Files:**
- Modify: `src/components/openmaic-bridge/student-stage-host.tsx`
- Modify: `src/components/openmaic-bridge/student-stage-host.test.tsx`
- Create: `src/lib/openmaic/playback/scene-completion.ts`
- Create: `src/lib/openmaic/playback/scene-completion.test.ts`

**Steps:** Write failing tests for initial idle, exhausted actions, empty-scene synthetic dwell, manual navigation, and final-scene completion; implement the pure completion predicate; wire `Stage.onPlaybackStateChange`; remove “enter equals complete”; run tests.

### Task 2: Abortable classroom loads and bounded media polling

**Files:**
- Modify: `src/components/openmaic-bridge/openmaic-resource-player.tsx`
- Create: `src/components/openmaic-bridge/resource-player-policy.ts`
- Create: `src/components/openmaic-bridge/resource-player-policy.test.ts`
- Modify: `src/components/openmaic-bridge/student-stage-host.tsx`

**Steps:** Test that only running assets poll; add AbortController ownership to both loaders; ignore abort errors; stop polling immediately after terminal status; run tests.

### Task 3: Strict scene-generation completeness

**Files:**
- Modify: `src/lib/openmaic/server/classroom-generation.ts`
- Create: `src/lib/openmaic/generation/generation-completeness.ts`
- Create: `src/lib/openmaic/generation/generation-completeness.test.ts`

**Steps:** Test missing drafts and failed scene creation; implement descriptive completeness assertion; fail before persistence when any confirmed outline is missing; retain best-effort media behavior; run tests.

### Task 4: Server-normalized progress

**Files:**
- Modify: `src/app/api/openmaic/progress/route.ts`
- Create: `src/lib/openmaic/progress/normalize-progress.ts`
- Create: `src/lib/openmaic/progress/normalize-progress.test.ts`

**Steps:** Test duplicate/unknown ids, invalid indices, classroom mismatch, unknown students, and monotonic merge; normalize against persisted classroom; reject cross-classroom writes; run tests.

### Task 5: Error fidelity and full verification

**Files:**
- Modify: `src/app/teacher/prepare/[id]/generate/page.tsx`
- Verify: all files in the actual-path design document.

**Steps:** Prefer detailed SSE generation errors; run targeted tests; run `pnpm test`; run targeted ESLint and `pnpm tsc --noEmit`; run `pnpm build`; perform local UI smoke checks; review unreachable legacy candidates without deleting uncertain shared code.
