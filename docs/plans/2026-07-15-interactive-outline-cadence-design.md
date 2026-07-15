# Interactive course-outline cadence design

## Problem

The preparation page uses the streaming outline endpoint. The UI switch was not included in its request, and the streaming endpoint did not pass `interactiveMode` into the structured PBL prompt. The conditional interactive block was therefore removed before the model saw it. Final classroom generation then correctly preserved the teacher-confirmed outline, which also prevented that later stage from repairing the missing interactions.

The existing interactive policy also favored replacing suitable slides with widgets. The intended teaching rhythm is different: retain explanation slides, then add a related interaction that applies or checks the preceding knowledge.

## Decision

1. Use a shared prompt-plan resolver in streaming and batch outline generation so prompt selection and the conditional `interactiveMode` variable cannot diverge.
2. Send the current switch value from the preparation page with every outline-generation request.
3. In interactive mode, require a student AI-learning cadence of one or two related explanation slides followed by one interaction. A quiz is assessment and cannot satisfy the interaction requirement.
4. Apply a deterministic post-generation cadence policy before the outline is shown for confirmation. Preserve model-generated interactions; when a block is missing one, derive an interaction from the preceding knowledge block.
5. Split the last explanation detail's existing duration budget with the derived interaction so the confirmed parent-module duration remains unchanged.
6. Keep default mode unchanged. Keep teacher-facing phases unchanged. Once a teacher confirms the outline, final classroom generation continues to preserve those resource types exactly.

## Alternatives

- Prompt-only enforcement was rejected because the current failure demonstrated that conditionals and model compliance can both fail silently.
- Converting most slides into widgets was rejected because it removes necessary explanation instead of creating an explanation-practice rhythm.
- Adding interactions only during final classroom generation was rejected because teachers would not see or confirm the real course structure in the outline page.
