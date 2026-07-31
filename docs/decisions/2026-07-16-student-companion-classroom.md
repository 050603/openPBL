# ADR: Shared companion runtime with classroom presentation mode

## Status

Accepted

## Context

The student classroom currently mounts a floating companion roundtable inside individual stage views. This couples the Director/SSE/TTS/proactive behavior to a presentation component, makes a second full companion workspace difficult to add, and risks duplicate requests or audio when the student changes presentation mode. The product needs both the existing task surface and a classroom-style companion surface, backed by the same artifacts and runtime.

## Decision

Mount one `CompanionRuntimeProvider` at the classroom route boundary. The provider owns the active SSE request, abort controller, TTS queue, persisted thread loading, proactive event listeners, selected partner, and stream state. The task view and companion classroom consume this state through a context. The two views remain mounted and only their visibility changes, so local editor state and the runtime survive a mode switch.

Add explicit course records for companion tasks, process records, and student confirmations. Existing course artifacts remain authoritative for formal project data; companion records describe coordination and suggestions. Any operation that mutates an artifact must pass through a student confirmation before calling the existing session action.

## Alternatives considered

1. Keep one floating roundtable per stage and enlarge it: rejected because it leaves runtime ownership coupled to a visual component and makes mode switching prone to duplication.
2. Create a second companion backend for the classroom: rejected because it would split history, Director behavior, TTS, proactive triggers, and source-of-truth status.
3. Use only local UI state for tasks: rejected because task/process/confirmation state must be visible in both modes and survive polling/page refreshes.

## Consequences

- The classroom page becomes the single lifecycle boundary for companion behavior.
- Existing stage task views remain usable and can be tested independently.
- New task/confirmation records add modeling work, but make truthful status display and future task execution extensible.
- The classroom visual layer can evolve without changing Agent orchestration.

