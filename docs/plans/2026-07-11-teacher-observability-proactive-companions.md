# Teacher Observability and Proactive Companions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build evidence-based teacher monitoring, read-only real-time presentation, persistent proactive companion conversations, and a 40/60 AI-teacher scoring workflow while simplifying both teacher and student classroom surfaces.

**Architecture:** Extend the existing course aggregate with typed learning events, conversation threads, intervention signals, teacher directives, projection snapshots, and evaluation records. Keep writes behind Next.js Route Handlers and the existing serialized file store; client components report idempotent events and render server-owned state. Pure analyzers derive individual and class-wide signals, while LLM calls only choose or phrase interventions and never invent evidence.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Tailwind CSS, Zustand-backed OpenMAIC stage state, Vitest/Testing Library, existing file-backed session store and LLM client.

---

## Task 1: Add domain types, defaults, and backward-compatible migration

**Files:**
- Modify: `src/lib/session/types.ts:256`
- Modify: `src/lib/session/actions.ts:650`
- Modify: `src/lib/session/actions.test.ts`
- Modify: `src/lib/session/store.tsx:80`

**Step 1: Write failing migration and scoring-flow tests**

Add tests proving that legacy peer/self scoring flows migrate to two scored flows and one non-scored reflection flow, projection defaults are present, and new arrays default to empty without dropping existing course data.

```ts
expect(course.content.evaluationPlan.flows).toEqual([
  expect.objectContaining({ sourceRole: "ai", weight: 40, scored: true }),
  expect.objectContaining({ sourceRole: "teacher", weight: 60, scored: true }),
  expect.objectContaining({ sourceRole: "self", weight: 0, scored: false }),
]);
expect(course.content.evaluationPlan.flows?.some((flow) => flow.sourceRole === "peer")).toBe(false);
expect(course.learningEvents).toEqual([]);
expect(course.companionThreads).toEqual([]);
```

**Step 2: Run the focused test and verify failure**

Run: `pnpm vitest run src/lib/session/actions.test.ts`

Expected: FAIL because the new fields and migration rules do not exist.

**Step 3: Add the domain contracts**

Define these core shapes with literal unions rather than untyped payloads:

```ts
type LearningEventType =
  | "scene-enter" | "scene-leave" | "heartbeat" | "scene-replay"
  | "interaction-result" | "artifact-change" | "stage-enter" | "stage-goal-complete";

type CompanionMessageVisibility = "student-and-teacher" | "teacher-only";
type InterventionStatus = "open" | "handled" | "resolved" | "dismissed";
type TeacherDirectiveStatus = "active" | "goal-completed" | "revoked";
type ProjectionMode = "forced" | "optional";
```

Add `LearningEvent`, `CompanionThread`, `CompanionMessage`, `LearningSignal`, `ClassCommonIssue`, `TeacherAgentDirective`, `OfflineInterventionRecord`, `DynamicFacilitationScaffold`, and a versioned `TeacherResourceProjection.playback` snapshot. Add optional arrays to `Course` and normalize them during hydration.

Add `scored?: boolean` to `EvaluationFlow`, remove `peer` from newly created flows, and keep `self` only as a non-scored reflection source. Preserve legacy record readability.

**Step 4: Run tests and type-check the domain layer**

Run: `pnpm vitest run src/lib/session/actions.test.ts`

Expected: PASS.

Run: `pnpm exec tsc --noEmit`

Expected: no new domain errors.

## Task 2: Build idempotent telemetry persistence and pure learning analytics

**Files:**
- Create: `src/lib/learning-analytics/analyzer.ts`
- Create: `src/lib/learning-analytics/analyzer.test.ts`
- Create: `src/lib/learning-analytics/telemetry.ts`
- Create: `src/app/api/learning-events/route.ts`
- Modify: `src/lib/session/server-store.ts`

**Step 1: Write failing analyzer tests**

Cover foreground-only dwell calculation, duplicate event removal, two replays, three minutes inactivity, three non-progress dialogue rounds, escalation after two AI attempts, and class aggregation at either 30% or five students.

```ts
expect(analyzeStudentLearning({ events, expectedDurationSec: 120 }).signals)
  .toContainEqual(expect.objectContaining({ kind: "dwell-overrun" }));
expect(aggregateCommonIssues(signals, 20)[0].studentIds).toHaveLength(6);
```

**Step 2: Verify tests fail**

Run: `pnpm vitest run src/lib/learning-analytics/analyzer.test.ts`

Expected: FAIL with missing module/exports.

**Step 3: Implement pure analyzers**

Use constants for confirmed defaults: `DWELL_RATIO=1.5`, `REPLAY_COUNT=2`, `IDLE_MS=180000`, `NO_PROGRESS_ROUNDS=3`, `AI_ATTEMPTS_BEFORE_ESCALATION=2`, `COMMON_RATIO=0.3`, `COMMON_MIN_STUDENTS=5`. Return evidence IDs and never infer a signal from an LLM error.

**Step 4: Implement the Route Handler**

Validate the request body, reject cross-course student IDs, deduplicate by `event.idempotencyKey`, append events through `updateCourse`, run the analyzer, and atomically update derived signals. Return accepted IDs and current derived summary.

**Step 5: Verify**

Run: `pnpm vitest run src/lib/learning-analytics/analyzer.test.ts src/lib/session/actions.test.ts`

Expected: PASS.

## Task 3: Instrument the student AI course and add isolated teacher preview

**Files:**
- Modify: `src/components/openmaic-bridge/student-stage-host.tsx`
- Modify: `src/components/views/student/ai-learning.tsx`
- Create: `src/components/views/teacher/ai-learning-preview.tsx`
- Modify: `src/components/views/teacher/ai-learning.tsx`
- Create: `src/components/openmaic-bridge/student-stage-host.test.tsx`

**Step 1: Add failing tests**

Test that student mode emits scene-enter, visibility-aware heartbeat, scene-leave and replay events; preview mode emits none and does not POST progress.

**Step 2: Add an explicit host mode**

```ts
type StudentStageHostMode = "student" | "teacher-preview";
```

In student mode, batch telemetry with idempotency keys and flush on scene change, visibility change, page hide, and a short interval. Derive expected scene duration from scene metadata. In preview mode, allow navigation/interactions but disable both telemetry and `/api/openmaic/progress` writes.

**Step 3: Add the teacher preview surface**

Place a clear “预览学生 AI 课程” action on the teacher AI-learning page. Open a full-height dialog/drawer containing `StudentStageHost mode="teacher-preview"` and a persistent preview badge.

**Step 4: Verify**

Run: `pnpm vitest run src/components/openmaic-bridge/student-stage-host.test.tsx`

Expected: PASS.

## Task 4: Replace duplicate AI-learning cards with evidence-based teacher monitoring

**Files:**
- Rewrite: `src/components/views/teacher/ai-learning.tsx`
- Create: `src/components/views/teacher/student-learning-detail.tsx`
- Create: `src/components/views/teacher/ai-learning.test.tsx`
- Modify: `src/lib/session/store.tsx`

**Step 1: Write failing UI tests**

Assert removal of “AI 课堂状态/参与学生/有学习记录的学生”, presence of effective-time variance, repeat learners, stalled students, unresolved risks, common issues, red alert icon, and detail tabs.

**Step 2: Build the three-level layout**

Render real metrics only. Use “暂无足够证据” when events are absent. Show common issues above the student list and compact student rows/cards sorted by severity then inactivity.

**Step 3: Build student detail and offline intervention actions**

Tabs: 风险信号, AI 对话, 学习轨迹, 阶段产物, 教师指导. In AI-learning, expose only `已巡视`, `已个别辅导`, and `已进行全班讲解`; save actor, target, note, and timestamp.

**Step 4: Verify**

Run: `pnpm vitest run src/components/views/teacher/ai-learning.test.tsx`

Expected: PASS.

## Task 5: Add dedicated OpenMAIC teacher-resource and projection experiences

**Files:**
- Modify: `src/components/openmaic/stage.tsx`
- Modify: `src/components/openmaic/edit/PlaybackChromeRoot.tsx`
- Modify: `src/components/openmaic/canvas/canvas-area.tsx`
- Modify: `src/components/openmaic/stage/scene-sidebar.tsx`
- Modify: `src/components/openmaic-bridge/openmaic-resource-player.tsx`
- Modify: `src/components/openmaic-bridge/teacher-stage-resources.tsx`
- Modify: `src/lib/session/types.ts`
- Create: `src/components/openmaic-bridge/openmaic-resource-player.test.tsx`

**Step 1: Write failing experience tests**

Assert that teacher-resource mode does not render chat, agent roundtable, agent toggle, or course-complete UI; projection mode has no interactive controls and ignores pointer/keyboard navigation.

**Step 2: Thread an explicit experience prop**

```ts
type StageExperience = "student-course" | "teacher-resource" | "projected-readonly";
```

Do not use CSS-only hiding. Conditionally omit `ChatArea`, `Roundtable`, course-complete sidebar entry, and irrelevant chrome so hidden controls cannot remain keyboard-accessible.

**Step 3: Expose and restore playback snapshots**

Use `PlaybackEngine.onProgress`, `onModeChange`, and `getSnapshot()` to emit a throttled serializable state. For projected-readonly, restore the authoritative snapshot and mirror play/pause changes without exposing controls.

**Step 4: Add forced/optional projection settings**

Extend projection state with `mode`, `version`, `updatedAt`, `engineMode`, and `snapshot`. Teacher chooses forced or optional before projecting. Student projection accepts only increasing versions.

**Step 5: Verify**

Run: `pnpm vitest run src/components/openmaic-bridge/openmaic-resource-player.test.tsx`

Expected: PASS.

## Task 6: Implement forced and optional student projection behavior

**Files:**
- Modify: `src/app/student/classroom/[id]/page.tsx`
- Modify: `src/components/openmaic-bridge/teacher-stage-resources.tsx`
- Create: `src/components/openmaic-bridge/student-projection.test.tsx`

**Step 1: Write failing tests**

Cover forced replacement and restoration, optional banner/entry, no student controls, stale-version rejection, and reconnect recovery.

**Step 2: Implement forced mode**

Save only local pre-projection UI location, replace the stage content with the read-only player, and restore the unchanged student state after the server projection becomes null.

**Step 3: Implement optional mode**

Show a prominent live projection panel/entry without replacing the student's stage. The projected player remains read-only.

**Step 4: Verify**

Run: `pnpm vitest run src/components/openmaic-bridge/student-projection.test.tsx`

Expected: PASS.

## Task 7: Persist companion conversations and add proactive Director triggers

**Files:**
- Modify: `src/app/api/chat/companion/route.ts`
- Modify: `src/lib/ai-companions.ts`
- Modify: `src/components/views/student/companion-roundtable.tsx`
- Create: `src/app/api/companion/threads/route.ts`
- Create: `src/lib/companion/orchestrator.ts`
- Create: `src/lib/companion/orchestrator.test.ts`

**Step 1: Write failing orchestration tests**

Cover one opening per student/stage, proactive trigger routing, active teacher directives, recorder teacher-only summary, recorder student-visible summary only on milestone/loss-of-focus, and reviewer activation on artifact submission/change.

**Step 2: Persist messages before and after SSE generation**

Create/load one thread per course/student/stage. Store student, agent, teacher-guidance, and system-trigger messages with timestamps, companion identity, visibility, trigger and status. Do not trust client-supplied history as the source of truth.

**Step 3: Add proactive requests**

Allow `trigger.kind` values `stage-opening`, `idle`, `no-progress`, `artifact-stalled`, `teacher-goal`, and `milestone`. The Director chooses speakers and the route streams through the existing SSE event format.

**Step 4: Implement recorder and reviewer policies**

After each meaningful round, write a structured teacher-only recorder summary. Emit a student-visible recorder message only for stage transition, loss of focus, or next-step clarification. Reviewer feedback must cite current artifact evidence.

**Step 5: Verify**

Run: `pnpm vitest run src/lib/companion/orchestrator.test.ts src/lib/ai-companions.test.ts`

Expected: PASS.

## Task 8: Add teacher conversation review, grouped signals, and goal directives

**Files:**
- Create: `src/components/views/teacher/companion-monitor.tsx`
- Create: `src/components/views/teacher/teacher-directive-form.tsx`
- Modify: `src/components/views/teacher/proposal-review.tsx`
- Modify: `src/components/views/teacher/project-making.tsx`
- Modify: `src/components/views/teacher/showcase.tsx`
- Modify: `src/components/views/teacher/reflection.tsx`
- Modify: `src/components/views/teacher/workspace.tsx`
- Create: `src/app/api/teacher-directives/route.ts`
- Create: `src/components/views/teacher/companion-monitor.test.tsx`

**Step 1: Write failing grouping and directive tests**

Assert one compact card per student, red exclamation for unresolved signals, a separate common-issue section, read-only chronological transcript, single/multi/all target selection, active-until-goal-complete semantics, and manual revoke.

**Step 2: Replace vertical signal buttons**

Normalize existing stage-specific signal displays into the shared monitor. Sort students by highest unresolved severity. Open the same student detail model used by AI-learning, but enable teacher Agent directives only where the roundtable is enabled.

**Step 3: Implement directive lifecycle**

Persist target IDs, stage, goal, instruction, success criteria, creator and status. Include active directives in the companion system prompt. Mark `goal-completed` only from observable goal evidence; otherwise leave active until teacher revoke.

**Step 4: Verify**

Run: `pnpm vitest run src/components/views/teacher/companion-monitor.test.tsx`

Expected: PASS.

## Task 9: Remove duplicate student scaffolds and visible process logs

**Files:**
- Modify: `src/components/views/student/workspace.tsx`
- Modify: `src/components/views/student/proposal-review.tsx`
- Modify: `src/components/views/student/project-making.tsx`
- Modify: `src/components/views/student/showcase.tsx`
- Modify: `src/components/views/student/reflection.tsx`
- Modify: `src/components/classroom-ux.tsx`
- Create: `src/components/views/student/student-surface-cleanup.test.tsx`

**Step 1: Write failing removal tests**

Assert no “AI 任务支架” diagnostic card/buttons and no student-visible “过程记录” activity-log card, while artifact editing, submission and the companion roundtable remain usable.

**Step 2: Remove the visual components and duplicate actions**

Delete only student-facing UI and obsolete handlers. Keep server telemetry, recorder summaries and teacher evidence intact.

**Step 3: Verify**

Run: `pnpm vitest run src/components/views/student/student-surface-cleanup.test.tsx`

Expected: PASS.

## Task 10: Implement confirmed 40/60 scoring and AI collaboration health

**Files:**
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`
- Modify: `src/components/views/teacher/showcase.tsx`
- Modify: `src/components/views/student/reflection.tsx`
- Modify: `src/lib/session/store.tsx`
- Create: `src/lib/evaluation/scoring.ts`
- Create: `src/lib/evaluation/scoring.test.ts`
- Create: `src/lib/evaluation/ai-process-evaluator.ts`
- Create: `src/lib/evaluation/ai-process-evaluator.test.ts`

**Step 1: Write failing scoring tests**

Cover editable weights summing to 100, no peer flow, self reflection excluded, missing-side pending state, and weighted synthesis only when both scores exist.

```ts
expect(computeFinalScore({ aiScore: 82, aiWeight: 40, teacherScore: 90, teacherWeight: 60 }))
  .toBe(87.2);
expect(computeFinalScore({ aiScore: undefined, aiWeight: 40, teacherScore: 90, teacherWeight: 60 }))
  .toBeNull();
```

**Step 2: Implement AI health evidence rules**

Score rubric evidence across question specificity/context, independent continuation, verification/modification, observable artifact progress, comparison/corroboration, and repeated answer-seeking/delegation. Frequency alone must never add or subtract points. Return `insufficient-evidence` instead of a score when minimum evidence is absent.

**Step 3: Update course-creation confirmation UI**

Present separate AI and teacher dimension editors, enforce total 100, remove peer scoring UI, and label self reflection as non-scored.

**Step 4: Update showcase scoring UI**

Show AI subtotal, teacher subtotal, weights and final score. Do not show AI suggestions beside teacher dimension inputs. Display “待 AI 过程评价” or “待教师评分” as appropriate.

**Step 5: Verify**

Run: `pnpm vitest run src/lib/evaluation/scoring.test.ts src/lib/evaluation/ai-process-evaluator.test.ts`

Expected: PASS.

## Task 11: Split predictable teacher resources from dynamic facilitation scaffolds

**Files:**
- Modify: `src/app/teacher/prepare/[id]/generate/page.tsx`
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`
- Modify: `src/lib/openmaic-bridge/post-generation-split.ts`
- Modify: `src/lib/openmaic-bridge/scene-classifier.ts`
- Modify: `src/lib/openmaic-bridge/teacher-resources.ts`
- Modify: `src/components/openmaic-bridge/teacher-stage-resources.tsx`
- Create: `src/lib/teacher-resources/facilitation-scaffolds.ts`
- Create: `src/lib/teacher-resources/facilitation-scaffolds.test.ts`
- Create: `src/app/api/teaching-ai/facilitation-scaffold/route.ts`

**Step 1: Write failing classification tests**

Prove that predictable content generates normal PPT/demo/script resources, while proposal critique, artifact critique, common-issue response and presentation summary generate conclusion-free scaffold templates.

**Step 2: Update generation prompts and schema**

Add an explicit `generationMode: "predictable" | "dynamic-scaffold"`. Dynamic scaffolds contain sections, prompts, evidence slots and completion rules, but no invented student outcomes or class conclusions.

**Step 3: Add classroom-time filling**

Generate a filled draft only after real submissions, transcripts or class signals exist. Show cited evidence and require teacher confirmation before presentation.

**Step 4: Add publish validation**

Block publish when selected predictable PPT/demo/script resources are missing. Identify the exact stage and resource type. Do not replace missing generated output with local placeholders.

**Step 5: Verify**

Run: `pnpm vitest run src/lib/teacher-resources/facilitation-scaffolds.test.ts src/lib/openmaic-bridge/teacher-resources.test.ts`

Expected: PASS.

## Task 12: Full regression, browser QA, and delivery

**Files:**
- Modify only files required by failures found during verification.

**Step 1: Run focused and full tests**

Run: `pnpm test`

Expected: all tests pass.

**Step 2: Run static verification**

Run: `pnpm exec tsc --noEmit`

Expected: no errors.

Run: `pnpm lint`

Expected: no errors in changed files.

**Step 3: Run the production build**

Run: `pnpm build`

Expected: Next.js 16.2 production build succeeds.

**Step 4: Perform two-browser visual QA**

Start: `pnpm dev:next`

Verify teacher and student sessions side-by-side for teacher preview isolation, both projection modes, read-only synchronization, telemetry-derived monitoring, conversation persistence, proactive opening/triggering, grouped intervention details, directive completion/revoke, score pending/final states, and resource/scaffold generation. Capture screenshots at desktop and narrow viewport widths.

**Step 5: Review the dirty worktree before handoff**

Run: `git status --short` and `git diff --check`.

Expected: no whitespace errors; pre-existing user changes remain intact and are not reset, staged, or committed without explicit authorization.
