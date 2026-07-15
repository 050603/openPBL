# Teaching Quality Boundaries Design

## Problem

Course facts currently reach OpenMAIC mostly as prose. Grade, prior knowledge, learner needs, confirmed knowledge points, and learning objectives are not a shared contract, so outline, slide, interaction, narration, and quiz prompts can drift independently. Quiz generation also trusts model JSON as `QuizQuestion[]` even though the runtime supports only single choice, multiple choice, and short answer.

## Chosen approach

Introduce one structured `TeachingConstraints` object derived from explicit teacher input plus conservative grade-based defaults. The object defines learner foundation, cognitive level, terminology policy, familiar contexts, scaffolding, assessment progression, and the confirmed knowledge boundary. Serialize the same object into every planning/content/action prompt.

Keep the runtime quiz union stable. Enrich assessment forms through supported semantic formats:

- `single`: ordinary single choice, true/false, scenario choice;
- `multiple`: evidence selection and classification;
- `short_answer`: fill-in, concise explanation, and scenario task.

Ordering, drag matching, and line matching remain unsupported until dedicated components exist. Prompt planning must not request them. If a provider nevertheless returns one, a deterministic normalizer converts it to a supported short-answer task with a rubric instead of rendering malformed structured data as text.

## Quality gates

1. Pre-generation: infer or normalize learner profile and knowledge boundary.
2. Outline generation: require explicit progression, prerequisite explanation, and supported quiz formats.
3. Page generation: inject the same constraints into slide, widget, quiz, and narration prompts.
4. Quiz normalization: validate type, options, answer keys, analysis, points, and rubric; repair aliases and downgrade unsupported structures.
5. Course audit: check knowledge references, page progression, quiz schema, and explanation completeness; report deterministic corrections before persistence.

This avoids a second full-course LLM review call, preserving generation speed and API cost while making structural guarantees deterministic.
