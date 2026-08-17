# ADR 0011: Managed recovery for quick course generation

## Status

Accepted — 2026-08-12

## Context

Quick generation is presented as a managed Agent workflow: the teacher should
be able to leave it unattended while generation, review and correction happen
inside the system. Previously, an exhausted stage-level review loop stored any
error as `failed`. This exposed internal quality-gate diagnostics to the teacher
and returned the UI to the initial form even when the problem was a correctable
model-output issue.

One such diagnostic was also incorrect: the lesson quality gate required
student AI-learning pages to cover knowledge-point lists attached to project
activities such as `proposal` and `make`.

## Decision

- Knowledge-teaching coverage is evaluated only against activity-catalog
  entries whose `stageKey` is `ai-learning`. Teacher and project activities may
  reference knowledge points for application, but do not require duplicate
  student teaching pages under those parent activities.
- Stage-local Agent review remains the first repair layer.
- When a known structured-output or quality-gate failure still escapes that
  layer, the durable job records the diagnostic as private Agent feedback,
  retains completed checkpoints and automatically schedules another bounded
  managed run.
- Recovery uses the existing database job row and conditional `queued` claim,
  so local in-process execution and the production background worker cannot
  execute the same retry twice.
- Network, authentication, quota, database and unknown infrastructure failures
  are terminal. Their internal diagnostics are logged server-side; the UI only
  receives a safe system-level explanation.

## Consequences

### Positive

- Teachers no longer need to interpret or manually fix model quality-gate
  diagnostics.
- Completed design stages survive managed correction.
- The progress canvas remains visible while the Agent repairs the course.

### Negative

- A badly behaving model can consume up to two additional managed runs after
  the four local stage-review rounds.
- Error classification must remain conservative so infrastructure outages do
  not create retry loops.

## Alternatives considered

- **Fail immediately after stage review:** rejected because it violates the
  unattended quick-generation contract.
- **Retry every error indefinitely:** rejected because provider and database
  failures require operator or user action and could create unbounded cost.
- **Silently weaken all quality gates:** rejected because course quality would
  become unpredictable; only the incorrectly scoped activity-coverage rule was
  corrected.
