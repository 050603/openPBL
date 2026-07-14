# Classroom Generation Throughput Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce teacher-side classroom generation wait time without changing generated classroom content quality by bounding scene and TTS concurrency, and by persisting the classroom body before media assets finish.

**Architecture:** Keep each scene's content generation followed by its action generation in one sequential worker. Run those workers through the existing bounded-concurrency utility and assemble their results in outline order. Persist the body immediately after scene generation and let a post-response asset task generate images, video, and TTS, atomically updating the persisted student/teacher classroom files as each phase completes. Use provider-aware TTS concurrency metadata with environment overrides and conservative limits.

**Tech Stack:** TypeScript, Next.js Route Handlers, Node.js filesystem storage, existing OpenMAIC generation/media providers, Vitest.

---

## Implementation Tasks

1. Add server classroom-scene concurrency configuration and refactor the scene loop into bounded workers while preserving content → actions ordering and final scene order.
2. Add atomic persisted-classroom scene updates and expose split scene arrays so background media work can update the correct student and teacher files.
3. Split the classroom generation pipeline at the body persistence boundary and schedule image/video/TTS generation with `after()` after the SSE done payload is ready.
4. Add provider-aware TTS concurrency configuration and process speech segments through a bounded worker pool while retaining provider fallback order.
5. Add focused regression tests for configuration, ordering, background persistence, and TTS concurrency; run typecheck, tests, lint, build, and diff checks.

