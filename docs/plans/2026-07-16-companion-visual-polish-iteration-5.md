# Companion Classroom Visual Polish Iteration 5 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the classroom feel like a living PBL team workspace by improving character entrance, low-frequency role actions, and the physical integration of stage props.

**Architecture:** Keep `CompanionRuntimeProvider` and the existing semantic state mapping unchanged. Extend the presentation layer in `companion-classroom-workspace.tsx` with deterministic CSS/SVG motion and stage-aware decoration; no new agent backend, asset dependency, or persistent data field is required.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, inline SVG, CSS keyframes, Motion, Vitest.

---

### Task 1: Audit and define the living-classroom motion contract

- Verify the current `idle`, `preparing`, `speaking`, `waiting`, and `completed` states remain the only semantic inputs to the visual layer.
- Keep action labels tied to the six role activities and avoid implying an unobserved task completion.
- Add only presentation metadata (`data-activity`, stage theme variables, deterministic delay) to the DOM.

### Task 2: Implement staggered character entrance and autonomous role motion

- Add a low-frequency entrance sequence for portrait, nameplate, and activity chip.
- Refine reading, ideation, questioning, planning, reviewing, and noting loops so the prop and hands move together.
- Preserve `prefers-reduced-motion` and keyboard focus behavior.

### Task 3: Integrate stage props into the classroom environment

- Add a physical base/shadow treatment to the stage accent so it reads as a classroom object rather than a floating icon.
- Keep all six PBL stage variants, with stage accent positioning and color inherited from the stage token.
- Avoid placing the scene object over the brief card, side rail, or composer at desktop and narrow breakpoints.

### Task 4: Verify the visual and runtime contract

- Inspect the running page at 1280px and 390px.
- Verify the stage remains the dominant surface, no horizontal overflow exists, and the console has no application errors.
- Run targeted Vitest, TypeScript, targeted ESLint, and production build.

