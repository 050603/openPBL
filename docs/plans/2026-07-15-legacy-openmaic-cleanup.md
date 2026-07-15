# Legacy OpenMAIC Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove OpenMAIC generation and classroom entry paths that are outside openPBL's active AI-teaching pipeline, without retaining compatibility for old courses or URLs.

**Architecture:** Treat the active openPBL pipeline as a whitelist: teacher preparation calls `/api/openmaic/generate`, the server persists split classrooms, and student/teacher hosts read them through `/api/openmaic/classroom`. Delete legacy browser-side generation, direct OpenMAIC classroom playback, and unused filesystem job orchestration. Replace remaining compatibility API paths used by active components with canonical `/api/openmaic/*` paths before removing rewrites.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, Zustand, filesystem classroom storage.

---

### Task 1: Prove the active and legacy dependency boundaries

**Files:**
- Inspect: `src/app/teacher/prepare/[id]/generate/page.tsx`
- Inspect: `src/app/api/openmaic/generate/route.ts`
- Inspect: `src/components/openmaic-bridge/student-stage-host.tsx`
- Inspect: `src/components/openmaic-bridge/openmaic-resource-player.tsx`

**Step 1:** Search all imports, route strings, and dynamic imports for the deletion candidates.

**Step 2:** Record a candidate only when all inbound references originate inside the same legacy closure.

### Task 2: Canonicalize active API and media paths

**Files:**
- Modify active TTS, voice, image, video, and scene-generation clients under `src/components/openmaic` and `src/lib/openmaic`
- Modify: `src/lib/openmaic/server/classroom-media-generation.ts`
- Modify: `next.config.ts`

**Step 1:** Replace active `/api/generate/*` calls with `/api/openmaic/generate/*`.

**Step 2:** Replace generated `/api/classroom-media/*` URLs with `/api/openmaic/classroom-media/*`.

**Step 3:** Remove the corresponding compatibility rewrites and prove no old path remains.

### Task 3: Delete the disconnected legacy closure

**Files:**
- Delete: `src/app/openmaic/generation-preview/**`
- Delete: `src/app/openmaic/classroom/[id]/page.tsx`
- Delete: `src/lib/openmaic/server/classroom-job-runner.ts`
- Delete: `src/lib/openmaic/server/classroom-job-store.ts`
- Modify: `src/lib/openmaic/server/classroom-storage.ts`
- Modify: `src/app/api/openmaic/classroom/route.ts`

**Step 1:** Delete the legacy client-side generator and direct classroom page.

**Step 2:** Delete unused job orchestration and its storage directory helpers.

**Step 3:** Remove the unused classroom POST compatibility contract and obsolete generated URL field.

### Task 4: Verify deletion and current flow

**Files:**
- Test: existing Vitest suite
- Verify: all application routes through `next build`

**Step 1:** Run reference searches and require zero legacy route/job references.

**Step 2:** Run `pnpm test` and `pnpm tsc --noEmit`.

**Step 3:** Run targeted ESLint and `pnpm build`.

**Step 4:** Run `git diff --check` and inspect the final deletion list.
