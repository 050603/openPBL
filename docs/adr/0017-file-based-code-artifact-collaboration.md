# ADR 0017: File-based code artifact collaboration with an isolated runner

- Status: Accepted for the experiment
- Date: 2026-08-27

## Context

The AI collaboration experiment currently treats a rich-text document as the
student-owned project artifact. The experiment also needs a code artifact that
initially supports Python and C, preserves student authority, and can use the
server's compute without executing untrusted student code in the web process.

The two candidate interaction models were a normal project/file editor and a
Jupyter-style notebook. The runtime candidates included browser-only WebAssembly,
direct host execution, and a separately sandboxed server runner.

## Decision

1. Use a file-based project workspace as the shared Python/C experience.
   Jupyter notebooks remain a possible later artifact type for data-analysis
   projects, not the common code substrate.
2. Use Monaco Editor as the editing shell. Keep its assets same-origin and load
   its Chinese messages before editor initialization.
3. Store code artifacts as versioned structured data containing language,
   active file, and files. Python and C drafts remain independent when the
   student switches artifact type.
4. Execute code on server compute only through an internal runner service. The
   Next.js application must never spawn Python, GCC, or student executables
   directly.
5. Use a runner adapter so execution infrastructure can change without changing
   the artifact UI or evidence model. The current single-host experiment uses a
   loopback-only runner process backed by Bubblewrap and native Python/GCC. A
   multi-node deployment should move the same adapter to self-hosted Piston,
   Judge0, or a dedicated execution service.
6. Keep the run control disabled until the runner enforces all of the following:
   per-run isolation, an unprivileged identity, no outbound network by default,
   a read-only base filesystem, an ephemeral writable workspace, CPU/wall-time/
   memory/PID/output/file limits, cancellation, cleanup, rate limiting, and an
   internal-only authenticated API.

## AI collaboration contract

- AI context includes the project requirements, file tree, active file,
  selection, deterministic diagnostics, recent run output, and recent accepted
  changes. It does not receive unrelated or unlimited chat history.
- Local collaboration is anchored to exact file and line ranges through Monaco
  decorations and gutter comments. Read/unread and stale-anchor states mirror
  the document-comment model.
- Deterministic tools run before the model: Python syntax checks and linting;
  GCC warnings for C; project tests where present. AI explains and prioritizes
  these signals instead of inventing compiler findings.
- AI edits are returned as a structured patch. Monaco's diff editor previews
  file- or hunk-level changes; the student accepts, rejects, or requests a
  revision before any source file is changed. Accepted changes retain before/
  after evidence and remain undoable.
- AI may explain errors, point out risks, suggest tests, improve non-core
  structure, or complete explicitly delegated peripheral work. It may not
  choose or implement the project's core algorithm, make the central design
  decision, claim successful execution without runner evidence, or submit the
  final artifact.

## Runtime selection

For the current fast-production experiment, the project-owned runner binds only
to loopback, authenticates every request, and launches each job through
Bubblewrap with separate user/PID/network/IPC/UTS namespaces, a read-only system
tree, an ephemeral workspace, and CPU/address-space/process/file/output/wall-time
limits. Python and GCC are never spawned by the Next.js process. This keeps the
test environment small while preserving a real isolation boundary.

For a normal multi-tenant deployment, prefer self-hosted Piston behind the same
runner adapter. It is MIT-licensed and already implements Linux namespace/cgroup
resource isolation and execution limits. Do not use its public API as a
production dependency. The application must fail closed when the runner is not
configured; it must never fall back to direct host execution.

Judge0 remains the scale-up alternative when queueing, multi-file packaging,
webhooks, or broader language coverage outweigh its heavier deployment and
GPLv3 licensing considerations. For a stronger multi-tenant boundary, place the
runner on a dedicated execution node and evaluate gVisor or microVM isolation.

## Consequences

- Python and C share one coherent learning and collaboration model.
- Notebook-specific features do not complicate the first experiment.
- Server compute and native compilers remain available without turning the app
  server into a remote shell.
- The experiment now exposes real Python/C execution, line-anchored AI findings,
  selection-based collaboration through Monaco's native context menu, and
  Monaco's native red/green diff review. Every AI change remains unapplied until
  the student accepts it, and an accepted change is undoable.

## Upstream projects

- Monaco Editor: <https://github.com/microsoft/monaco-editor>
- Piston: <https://github.com/engineer-man/piston>
- Judge0: <https://github.com/judge0/judge0>
- NsJail: <https://github.com/google/nsjail>
- gVisor: <https://gvisor.dev/docs/>
- JupyterLite kernels: <https://jupyterlite.readthedocs.io/en/stable/howto/configure/kernels.html>
