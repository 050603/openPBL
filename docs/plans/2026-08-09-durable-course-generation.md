# Durable course generation

## Outcome

Course generation is represented by one durable PostgreSQL job per course. A
teacher may leave the page while a server worker continues generation, and a
later visit reconnects to the same job instead of creating duplicate content.

## Decisions

- Use PostgreSQL as the source of truth. Redis in this deployment is explicitly
  ephemeral, so it cannot own recovery state.
- Run the worker from the long-lived Next.js server instrumentation process.
  Job claiming is conditional in the database, allowing blue/green instances
  to coexist without both running the same queued job.
- Default the capability off in development and on in production with a
  database. `COURSE_GENERATION_BACKGROUND_ENABLED` remains an explicit override.
- Keep the existing SSE flow as the workstation fallback.
- Estimate an initial duration from page count (14 pages is approximately ten
  minutes), then replace it with observed completed-page throughput.

## Failure and recovery

- One unique job row per course makes enqueue idempotent.
- A graceful shutdown aborts the active generation and returns the job to the
  queue. A stale running job is also requeued on server startup.
- Failed jobs retain their error and may be reset by the next explicit retry.
- The generated classroom is linked to the course before the job is marked
  complete, so completed-job navigation always has a valid destination.

## Deployment requirement

Production must apply the Prisma migration before starting the application.
The production Compose configuration enables the background worker. Local
`next dev` leaves it disabled unless explicitly opted in.
