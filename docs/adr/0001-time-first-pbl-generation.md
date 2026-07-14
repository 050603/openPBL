# ADR-0001: Make confirmed timing the prerequisite for PBL generation

## Status

Accepted

## Context

The teacher workflow currently asks the LLM to generate complete first-level course modules and then calculates a timing recommendation from those modules. Confirmation immediately derives a display timeline from the same data. This makes timing an output rather than an input. The first-level normalizer also retains extra activities after the six canonical stages, allowing duplicate AI-learning or practice stages to appear after reflection.

The required workflow is knowledge graph → suggested six-stage timing → teacher confirmation → PBL mainline and module generation → detailed lesson outline. The final teacher allocation must constrain every downstream duration and structure.

## Decision

Use a strict two-state generation contract:

1. `suggested`: create only a canonical six-stage timing skeleton from course duration, grade, difficulty, and knowledge-graph complexity. Do not call the module-generation LLM and do not create a project mainline.
2. `confirmed`: send the confirmed timing plan, knowledge graph, and a deterministic six-stage timeline to the LLM. Normalize the response to exactly one module per canonical stage, overlay the confirmed IDs and durations, validate order/completeness/uniqueness, and only then persist the project mainline and generated modules.

All downstream outline and classroom generation requires both a valid confirmed timing plan and a valid project mainline. No fallback may silently synthesize a missing mainline during save or serialization.

## Consequences

### Positive

- Teacher changes directly constrain module content and downstream page/activity budgets.
- Reflection is always the final top-level stage.
- Multiple knowledge points are merged inside the single AI-learning module instead of creating duplicate stages.
- Invalid model output is corrected deterministically and checked before persistence.

### Negative

- Confirming timing now performs an LLM request and can fail independently.
- Regenerating the timing proposal invalidates the existing mainline and detailed outline by design.

### Neutral

- The project mainline remains a deterministic timing spine; the LLM supplies pedagogical module content within that spine.

## Alternatives Considered

- Keep generating modules first and merely improve sorting: rejected because timing would remain post-hoc.
- Let the LLM generate arbitrary repeated top-level stages: rejected because top-level PBL progression is a platform invariant; variation belongs in second-level resources.
- Preserve duplicate stages for older drafts: rejected because the product is still in development and the requested upgrade does not require legacy-shape compatibility.
