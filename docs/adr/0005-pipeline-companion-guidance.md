# ADR-0005: Use evidence-gated companion turns and ordered TTS prefetch

## Status

Accepted

## Context

The companion roundtable can proactively react to stage entry, inactivity, saved work, uploads, directives, and no-progress conditions. Treating every save as a reason to speak increases cognitive load. Multi-agent turns can repeat advice or create several simultaneous tasks. The existing audio queue prevents overlap, but server TTS for a later role starts only after the earlier role finishes playback, creating avoidable gaps.

## Decision

1. Route all proactive behavior through a shared priority and cooldown gate. Routine saves remain silent; milestones and explicit help remain eligible.
2. Default to one speaker. Proactive turns always use one speaker; two speakers are allowed only when the student explicitly requests multiple perspectives.
3. Constrain every turn to one core problem and one student action. A second role may only add non-redundant support for that same problem.
4. Buffer later-role text on the server, compare it with earlier responses, and suppress substantially repeated output before it reaches the student.
5. Keep automatic recorder summaries teacher-only.
6. Preserve sequential text generation for cross-role context, but remove per-role persistence from the critical path.
7. Start TTS synthesis as soon as each role manuscript completes. Prefetch later audio while earlier audio plays, then display and play prepared items in strict director order.

## Consequences

### Positive

- Students receive fewer unsolicited messages and only one actionable task at a time.
- Normal saving does not interrupt project work.
- Multi-role turns remain coherent and substantially repeated responses are removed.
- Later-role audio is usually ready when the preceding role finishes.

### Negative

- Most turns use one role, so visible role variety is lower.
- Similarity suppression is deterministic and conservative; semantically redundant text with very different wording may still pass.
- Prefetched audio may finish even if the student stops the round, although stale audio is never played.

## Alternatives Considered

- Generate all role texts concurrently: rejected because later roles would lose prior-role context and repeat more often.
- Generate all TTS only after all text completes: rejected because it delays the first audible response.
- Stream sentence-sized TTS chunks: deferred because prosody and sentence-boundary instability would add complexity and can produce fragmented speech.
- Keep every recorder summary student-visible: rejected because it duplicates content the student has just heard.

