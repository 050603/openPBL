# Pixel Companion Scene Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the floating chat window with a lightweight pixel-art roundtable whose agent replies appear as speech bubbles inside the classroom UI.

**Architecture:** Keep the existing director, SSE, TTS, and persistence flow. Replace only the student presentation layer with a persistent scene, inline composer, anchored agent bubbles, and an optional compact history drawer. Vendor only six character sprite sheets plus the table and chair sprites.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS sprite animation, Vitest.

---

### Task 1: Curate assets

- Copy six `char_*.png` sprite sheets, one coffee table, and three chair directions into `public/companions/pixel-agents/`.
- Add upstream MIT license and attribution.
- Verify the copied payload stays below 50KB.

### Task 2: Build the embedded scene

- Replace generated CSS people with sprite-sheet characters.
- Render a layered pixel table scene with chairs, shadows, name plates, and speaking states.
- Keep the scene persistent without blocking classroom controls.

### Task 3: Replace chat-window interaction

- Open only an inline input composer from “发起讨论”.
- Anchor assistant messages to their speaking character as short bubbles.
- Keep conversation history behind a secondary button.
- Preserve streaming, director selection, TTS, stopping, and evidence recording.

### Task 4: Verify

- Run focused ESLint and TypeScript checks.
- Run the full test suite and production build.
- Confirm vendored asset count and total byte size.
