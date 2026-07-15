# ADR-0004: Gate learning alerts by active scope and content evidence

## Status

Accepted

## Context

Teacher-facing learning alerts were derived from fixed thresholds over all events for a scene. A completed or departed scene could remain eligible for dwell and idle warnings, normal revisits were treated as repeated-playback risk too early, and a small number of students could become a class-wide issue through an absolute-count shortcut. Signals also carried scene IDs but not the activity or knowledge-point context teachers need for intervention.

## Decision

1. Temporal alerts are eligible only while the corresponding scene is actively open. Scene completion and scene leave close the observation scope and clear derived temporal warnings.
2. Dwell time is evaluated for the current visit rather than accumulated across historical visits.
3. The maximum tolerated duration is the larger of the designed activity budget and measured TTS plus planned student activity, followed by an explicit allowance for reading, translation, pausing, thinking, and comprehension.
4. Repeated-playback and conversation-no-progress thresholds require three replays and four no-progress rounds respectively; idle requires five minutes on a visible, actively open page.
5. Common issues require the same normalized issue at the same scene/activity/knowledge-point location for at least 30% of the class and at least two students. Individual evidence remains individual below that threshold.
6. Learning events, signals, and common issues carry a structured content reference so teacher views can show the stage, PPT/page, activity, knowledge point, affected students, and reason.
7. Rule-based stage alerts run only in their owning active stage. Not using the optional AI companion is not itself treated as a risk.

## Consequences

- Normal completion, navigation, background tabs, and optional non-use of AI no longer create persistent teacher alarms.
- Actual generated audio duration participates when browser metadata is available; the generated timing plan remains the fallback.
- Teachers can distinguish a single-student bottleneck from a class-wide issue and act on the exact content involved.
- Alerting is intentionally more conservative, favoring trustworthy evidence over early but noisy notifications.
