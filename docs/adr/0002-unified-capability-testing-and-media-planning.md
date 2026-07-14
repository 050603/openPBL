# ADR-0002: Unify capability testing, TTS calibration, and classroom media planning

## Status

Accepted

## Context

The settings page currently sends image, video, search, ASR, and PDF providers to the LLM model-verification endpoint. Provider-specific credentials can therefore be valid while the test still fails under an unrelated protocol. TTS test audio is generated but not played, and speed calibration is a separate single-sample value that replaces prior measurements. Classroom generation reuses teacher-confirmed outlines, so the capability flags never reach the outline prompt that normally creates `mediaGenerations`; the background media worker then has no requests to execute.

## Decision

1. Add one server capability-test route that dispatches by provider section and reuses the same provider adapters, credential resolution rules, model IDs, base URLs, and authentication paths as production generation.
2. Make a TTS test generate and autoplay a fixed normal-speed sample, measure decoded audio duration, and persist a configuration-bound calibration keyed by provider, model, voice, language, and speed.
3. Aggregate repeated calibration samples on the server using total speech units and total measured duration. The shared aggregate is the course-planning profile; UI changes to any key dimension naturally select an uncalibrated fingerprint and prompt a retest.
4. When confirmed scene outlines are supplied, run a bounded media-planning LLM pass if image or video generation is enabled. It may add media requests only where the visual or motion materially improves learning; it cannot change scene identity, order, knowledge references, duration, or PBL routing.
5. Keep classroom content available when an optional asset fails. Retry transient asset failures, persist per-asset success/failure status, and let classroom clients poll the saved snapshot for completed media and failure notices.
6. Web search remains optional and degradable, but its returned source context is injected into confirmed-outline scene generation rather than being discarded.

## Consequences

### Positive

- Tests exercise the actual capability instead of an LLM-compatible endpoint.
- TTS planning uses stable shared averages without changing playback speed to fill time.
- Teacher capability selections affect confirmed-outline generation without rebuilding the course structure.
- Optional media failures are visible and do not discard usable classroom content.

### Negative

- Image/video capability tests can consume a small amount of provider quota when their adapter requires a real task.
- Media planning adds one bounded LLM call when optional visual capabilities are enabled.
- File-backed aggregate updates are process-safe but still assume the current single shared configuration store.

### Neutral

- The server provider configuration remains the source of truth for credentials and provider priority.
- Images, videos, and TTS continue to run after the classroom body is available.

## Alternatives Considered

- Keep one generic LLM test: rejected because modality protocols and authentication differ.
- Add media to every slide when enabled: rejected because capability permission is not a pedagogical requirement.
- Store only each user's latest TTS sample: rejected because it is unstable and cannot provide the requested shared model average.
