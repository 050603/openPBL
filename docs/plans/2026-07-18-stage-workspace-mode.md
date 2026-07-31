# Stage Workspace Mode Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add teacher-controlled per-stage student workspace modes with live enforcement and shared learning data across mode switches.

**Architecture:** Persist one normalized workspace policy per course stage and resolve the visible student surface from that policy plus an optional stage-scoped student preference. Reuse the existing course session store and polling channel so classroom changes propagate without a second data store.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript, Vitest, Testing Library, Tailwind CSS.

---

### Task 1: Define and test stage workspace policies

**Files:**
- Create: `src/lib/classroom/stage-workspace-policy.ts`
- Create: `src/lib/classroom/stage-workspace-policy.test.ts`
- Modify: `src/lib/session/types.ts`

1. Write tests for defaults, normalization, forced access, and student-choice resolution.
2. Run the policy test and confirm it fails before implementation.
3. Add serializable policy types and pure resolver helpers.
4. Run the policy test and confirm it passes.

### Task 2: Enforce policies without unmounting student data surfaces

**Files:**
- Modify: `src/components/views/student/workspace-mode.ts`
- Modify: `src/components/views/student/workspace-mode.test.tsx`
- Modify: `src/app/student/classroom/[id]/page.tsx`
- Modify: `src/app/student/classroom/[id]/page.test.tsx`

1. Add stage-scoped preference tests and forced-mode page tests.
2. Update the preference hook to accept a stage and default mode.
3. Resolve effective mode from the course policy while keeping both surfaces mounted.
4. Hide switching actions whenever the teacher forces one mode.
5. Run the focused student tests.

### Task 3: Add reusable teacher configuration UI

**Files:**
- Create: `src/components/views/teacher/stage-workspace-policy-panel.tsx`
- Create: `src/components/views/teacher/stage-workspace-policy-panel.test.tsx`
- Modify: `src/app/teacher/teach/[id]/classroom/page.tsx`

1. Test three access choices and conditional default-mode controls.
2. Implement compact current-stage and six-stage variants.
3. Put current-stage control at the top of the live right panel and persist via `updateCourse`.
4. Run the component test.

### Task 4: Add pre-class configuration entry points

**Files:**
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`
- Modify: `src/app/teacher/prepare/[id]/preview/page.tsx`

1. Place the six-stage editor on the course-outline preparation step.
2. Place the same editor before the publish checklist on preview.
3. Persist every change through the existing course update action.
4. Verify focused tests, TypeScript, and lint for changed files.
