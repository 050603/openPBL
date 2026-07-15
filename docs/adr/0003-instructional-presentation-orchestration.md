# ADR-0003: Coordinate PPT and whiteboard by instructional intent

## Status

Accepted

## Context

AI-generated teaching slides have been optimized for keywords and short bullets. This often produces directory-style pages and pushes essential examples or evidence into narration, even when students must see exact content, differences, symbols, or relationships to understand the lesson. The playback runtime already supports whiteboard actions, but the pre-generated slide-action prompt exposes only spotlight, laser, video, and discussion, so procedural explanations cannot reliably use the board.

The solution must generalize across disciplines. Rules tied to isolated examples, subject names, or trigger keywords would be brittle and would not capture the underlying teaching need.

## Decision

1. Use one shared instructional-presentation policy in both slide-content and slide-action generation.
2. Assign stable structure, summaries, conclusions, representative cases, and exact visual evidence to PPT.
3. Assign processes that must unfold over time—comparison and annotation, decomposition, derivation, calculation, proof, transformation, structure, flow, and causality—to the whiteboard when listening alone is insufficient.
4. Expose the existing whiteboard action contract to pre-generated slide actions, including paced draw-and-explain sequences and returning to PPT.
5. Add deterministic lifecycle normalization: implicitly open before drawing, keep narration on the active board, close before slide-surface actions, and close an open board at the end of the page.
6. Keep the decision semantic and model-driven. Do not add per-subject trigger lists or fixed NLP/mathematics rules.

## Consequences

### Positive

- Slides retain the evidence students need instead of becoming title lists.
- Procedural explanations can be visually staged in sync with narration.
- The same policy applies to language, mathematics, science, technology, humanities, and other subjects.
- Playback cannot leave the whiteboard covering a later PPT action because of a missing close action.

### Negative

- Whiteboard-capable action prompts are longer and may produce more actions on genuinely procedural pages.
- Semantic decisions still depend on model judgment; prompt contract tests protect the policy, while output quality should continue to be evaluated with representative generated courses.

### Neutral

- No new rendering technology or action type is introduced; the change activates capabilities already present in the DSL and playback engine.

## Alternatives Considered

- Add rules for punctuation examples, equations, or named subjects: rejected because examples are evidence of a general teaching need, not durable classification rules.
- Put all explanatory content on PPT: rejected because dynamic reasoning becomes cluttered and loses instructional pacing.
- Put all examples on the whiteboard: rejected because stable evidence and conclusions should remain available for scanning and review.
- Change prompts only: rejected because malformed action order could still leave the board unopened or covering subsequent slide actions.
