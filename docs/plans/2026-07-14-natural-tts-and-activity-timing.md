# Natural TTS and activity-aware course timing

## Decision

Course duration is a generation constraint, not a playback-speed target. Generated and browser-native speech always play at the configured natural rate. The only runtime speed change is the explicit playback-speed control chosen by the user.

Before content generation, each student-facing scene receives a timing plan with:

- total activity time;
- narration time and its model/voice-specific text budget;
- student operation or thinking time;
- teacher/AI feedback time;
- transition time.

Lecture pages primarily spend their budget on narration. Interactive, code, and quiz pages reserve substantial silent activity time and use speech only for concise guidance and feedback. Page splitting remains semantic and knowledge-bound: the model chooses page boundaries from concepts, examples, explanations, and activities instead of a fixed seconds-per-page rule.

## Voice calibration

The teacher settings page can run a fixed calibration passage at speed `1` using the selected provider, model, and voice. The browser measures the returned audio duration. The server stores the resulting effective CJK characters/minute and Latin words/minute profile under that exact provider/model/voice tuple.

Calibration data is explicit and replaceable. It is not continuously learned from classroom playback, so a bad runtime measurement cannot silently corrupt future courses. Seed profiles remain the fallback for uncalibrated combinations.

## Runtime behavior

Playback never derives a rate from scene or action target duration. Pre-generated audio uses the normal audio rate; browser speech uses the configured normal TTS rate. A missing audio file uses a natural text-duration estimate rather than waiting for the planned scene duration.

Post-generation validation compares estimated narration plus reserved activity time with the target and may request one content correction. It may add or remove relevant explanation, examples, pages, or activities, but it must never compensate by changing speech speed or introducing knowledge outside the confirmed graph.

## Consequences

- Existing `targetDurationSec` fields remain planning and diagnostics metadata only.
- Provider metadata now includes the selected voice and timing calibrations, without exposing credentials.
- Changing provider/model/voice automatically selects that tuple's calibration or falls back to a seed profile.
- Teacher-only facilitation resources remain concise and are not expanded to fill student activity time.
