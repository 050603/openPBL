# ADR 0010: Foundation-first deep-interactive teaching

## Status

Accepted — 2026-08-11

## Context

Generated lessons repeatedly alternated a short slide, an interaction, and a
quiz. A deterministic checkpoint repair policy amplified the problem by adding
a quiz after every knowledge block. Students spent too much time being tested
before receiving a complete explanation, and the optional interaction flag let
different generation paths produce inconsistent lesson structures.

## Decision

- Deep interaction is the only generation contract; there is no teacher-facing
  or API-level interaction mode switch.
- Student teaching follows foundation explanation, concrete example and visible
  reasoning, then ungraded interactive practice and feedback.
- The main lesson has exactly one graded terminal mastery assessment. A
  deterministic normalizer merges accidental block quizzes and places this
  assessment after every student teaching page.
- Questions carry knowledge-point IDs. Adaptive enrichment uses those scores
  only after the terminal assessment and only when time remains.
- Enrichment is prepared and reviewed during lesson preparation, is ungraded,
  and never triggers another assessment.
- Whiteboard tools remain native teacher tools. Prompts require meaningful
  whiteboard construction for worked reasoning, representation changes and
  misconception comparison when the slide does not already show that evidence.

## Consequences

Older persisted interaction flags are ignored and no longer copied into new
course data. The vocational Task Engine flag remains because it selects a
different generation architecture, not an interaction intensity. A terminal
assessment may aggregate knowledge points across AI-learning parent activities;
ordinary teaching pages remain restricted to their parent activity catalog.
