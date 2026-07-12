# PBL Runtime Bugfixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair the new classroom runtime so image generation, interactive scene generation, teacher-resource routing, ordinary activity resources, and companion dialogue playback all follow the PBL contract.

**Architecture:** Trace each reported symptom from the browser call through its API route and persistence/renderer boundary. Keep authentication strict while fixing request context, make resource type and audience explicit metadata, and use one serialized companion queue for both visual bubbles and TTS playback.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, OpenMAIC scene generation, browser SpeechSynthesis/server TTS.

---

### Task 1: Repair image generation authorization and automatic course generation

**Files:**
- Inspect/modify: `src/components/visuals.tsx`
- Inspect/modify: `src/app/api/openmaic/generate/image/route.ts`
- Inspect/modify: `src/lib/openmaic/media/*` and model/provider resolution used by the image route
- Test: route/helper tests near the image-generation API, plus a component or orchestration test for automatic generation

**Steps:**

1. Trace the request headers/body from `ProjectCoverImage`/course generation to the image route and identify why a valid local course request is rejected with 401.
2. Write a regression test proving the route accepts the supported authenticated/local request and still rejects an actually missing/invalid credential.
3. Implement the narrow authorization/request-context fix; do not make the route public or expose provider keys.
4. Move course-cover/image generation into the course-generation success path so the cover is requested automatically and duplicate requests are idempotent.
5. Run the focused image tests and verify a successful response path returns 200-shaped data.

### Task 2: Preserve and enforce designed interactive resource types

**Files:**
- Inspect/modify: `src/lib/openmaic/generation/outline-generator.ts`
- Inspect/modify: `src/lib/openmaic/generation/scene-generator.ts`
- Inspect/modify: `src/app/api/openmaic/generate/scene-content/route.ts`
- Inspect/modify: `src/lib/openmaic/prompts/templates/pbl-course/*`
- Test: outline/scene generation tests under `src/lib/openmaic/generation/`

**Steps:**

1. Add a failing regression test for an AI-learning outline with `interactive` type plus `widgetType/widgetOutline`, asserting the effective outline and generated content remain interactive.
2. Trace any fallback or prompt branch that turns interactive outlines into slides, including task-engine/non-task-engine sanitization.
3. Make the PBL template and scene route honor the explicit `resourceType`/widget metadata; only fall back when the required interactive configuration is genuinely absent.
4. Add a result-level assertion so an interactive outline cannot silently persist as a slide scene.
5. Run focused generation tests and the TypeScript check.

### Task 3: Hide every teacher-only resource from the student AI classroom

**Files:**
- Inspect/modify: `src/lib/openmaic-bridge/scene-classifier.ts`
- Inspect/modify: `src/lib/openmaic-bridge/post-generation-split.ts`
- Inspect/modify: `src/app/student/classroom/[id]/page.tsx` and the student scene loader/player
- Inspect/modify: `src/lib/openmaic/server/classroom-generation.ts`
- Test: `src/lib/openmaic-bridge/scene-classifier.test.ts` and split/loader regression tests

**Steps:**

1. Add a failing test containing teacher scenes for launch, proposal, make, showcase, and reflection; assert none are returned in the student scene set.
2. Make explicit `audience: "teacher"` authoritative at every read/split boundary, not only for launch-title keywords.
3. Ensure persisted student classrooms are rebuilt from student scenes only and never render the teacher classroom as a fallback.
4. Verify student-facing loaders filter by audience/stage metadata and teacher-only resources remain available only to teacher views.
5. Run the classifier, split, and student-loader tests.

### Task 4: Generate and parse teacher resources for ordinary classroom activities

**Files:**
- Inspect/modify: `src/lib/llm/prompts.ts`
- Inspect/modify: `src/lib/openmaic/pbl/course-request.ts`
- Inspect/modify: `src/lib/openmaic/prompts/templates/pbl-course/user.md`
- Inspect/modify: `src/lib/openmaic-bridge/scene-classifier.ts`
- Inspect/modify: `src/components/openmaic-bridge/teacher-stage-resources.tsx`
- Test: prompt/template and teacher-resource parsing tests

**Steps:**

1. Add a failing prompt test for a `teachingOutline` ordinary activity with `openMaicUse: "none"` that still requires a teacher-facing facilitation resource when the activity has a teacher role/script/resource type.
2. Encode this rule in the structured PBL request/template rather than reintroducing page-level manual rules.
3. Mark generated ordinary-activity resources with explicit stage, audience, generation purpose, and script/scaffold metadata.
4. Parse them into teacher resources and expose them in the per-stage teacher resource player.
5. Verify launch, ordinary activities, and later facilitation stages all produce independently addressable teacher resources.

### Task 5: Fix companion auto-opening, visual queueing, and TTS synchronization

**Files:**
- Inspect/modify: `src/components/views/student/companion-roundtable.tsx`
- Inspect/modify: companion event/orchestrator code under `src/lib/companion/`
- Inspect/modify: `src/app/api/chat/companion/route.ts` only if the stream contract needs queue metadata
- Test: `src/lib/ai-companions.test.ts`, companion orchestrator tests, and a new roundtable queue test

**Steps:**

1. Add failing tests for stage-entry auto-opening, serialized speaker bubbles, and the invariant that a bubble remains visible until its TTS item finishes or fails.
2. Separate the active speaker queue from the currently rendered bubble; enqueue the full response before starting visual/TTS playback.
3. Make the next speaker start only after the previous speaker’s visual display and TTS completion callback settle.
4. Trigger the stage-opening companion message when the student enters a new enabled stage, with duplicate-stage guards.
5. Run focused companion tests and a browser-level smoke check if the local app can be started.

### Task 6: Full verification

**Commands:**
- `pnpm exec tsc --noEmit`
- `pnpm vitest run <focused tests>`
- `pnpm test`
- `pnpm exec eslint <changed files>`
- `pnpm build`

Record unrelated pre-existing full-repository lint errors separately; do not weaken authentication or hide them by disabling lint rules globally.
