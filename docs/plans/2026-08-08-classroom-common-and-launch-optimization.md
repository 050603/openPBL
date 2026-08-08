# Classroom Common and Launch Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify the shared classroom chrome, make teacher resources collapsible and usable, fix anchored menus and notification read state, and clarify the project-launch experience for teachers and students.

**Architecture:** Keep the existing client-side classroom and session architecture. Improve shared UI components in place, reuse the authenticated upload API for teacher course resources, and persist uploaded resource metadata through the existing course update flow so students can open it immediately.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Vitest, Testing Library.

---

### Task 1: Compact shared teacher classroom chrome

**Files:**
- Modify: `src/components/classroom-ux.tsx`
- Modify: `src/app/teacher/teach/[id]/classroom/page.tsx`
- Test: `src/app/teacher/teach/[id]/classroom/page.test.tsx`

1. Remove the prominent evidence and AI-support row from the stage banner.
2. Convert the banner to a compact stage summary with only actionable class metrics.
3. Keep the six-stage navigation as the primary progress control and preserve the existing non-overlapping right sidebar behavior.
4. Run the teacher classroom test.

### Task 2: Anchor header popovers and mark notifications read

**Files:**
- Modify: `src/components/dashboard-shell.tsx`
- Test: `src/components/dashboard-shell.test.tsx`

1. Render each menu next to its own trigger instead of at a fixed top-right position.
2. Mark the current notification batch read when the notification menu opens.
3. Verify course, notification, and profile menus align with their triggers and the unread badge disappears.

### Task 3: Make teacher stage resources collapsible

**Files:**
- Modify: `src/components/openmaic-bridge/teacher-stage-resources.tsx`
- Test: `src/components/openmaic-bridge/teacher-stage-resources.test.tsx`

1. Add an accessible expand/collapse control to the resource header.
2. Remove generated-purpose and duplicate stage-description microcopy from the script panel.
3. Let the script panel use the available player height without leaving a large unused lower area.
4. Preserve projection and dynamic scaffold behavior.

### Task 4: Enable teacher resource upload in project launch

**Files:**
- Modify: `src/components/views/teacher/project-launch.tsx`
- Test: `src/components/views/teacher/project-launch.test.tsx`

1. Add a real file picker using the existing `/api/uploads` endpoint.
2. Send the course ID and save the returned file as a course resource through `updateCourse`.
3. Display uploaded resources with open links and clear pending/error/success states.
4. Verify a successful upload updates course resources.

### Task 5: Simplify the student project-launch page

**Files:**
- Modify: `src/components/views/student/project-launch.tsx`
- Test: add focused assertions in a component test if practical.

1. Remove the redundant task-book subtitle and automatic-status hint.
2. Replace the dense timeline with a clear, compact six-stage learning path.
3. Lead with the concrete work students need to complete in this stage: understand the problem, review resources, and choose a direction.
4. Remove promotional AI language while preserving functional status and actions.

### Task 6: Verify

1. Run focused Vitest suites for changed components.
2. Run TypeScript type checking for the application.
3. Review the final diff to ensure unrelated worktree changes are untouched.
