# OpenMAIC P0 Upstream Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sync the three approved P0 areas from OpenMAIC without replacing OpenPBL's teaching domain, persistence model, or in-progress product changes.

**Architecture:** Keep the vendored workspace packages and synchronize them against immutable upstream release tags. Preserve OpenPBL-specific teaching contracts in the application extension layer, and protect persisted classrooms with migration, validation, and playback fixtures. Security changes are ported as focused patches so OpenPBL retains its stronger DNS-pinned SSRF dispatcher.

**Tech Stack:** TypeScript, Next.js 16 App Router, Vitest, pnpm workspace packages, `@openmaic/dsl`, `@openmaic/importer`.

---

### Task 1: Record immutable upstream baselines

**Files:**
- Create: `docs/openmaic-upstream.md`

**Steps:**
1. Record the `@openmaic/dsl@0.9.0` and `@openmaic/importer@0.1.2` tag commits.
2. Document that OpenPBL extensions must remain outside synchronized package code where the upstream generics allow it.
3. Verify both commits exist in the upstream clone.

### Task 2: Port the SSRF hardening delta test-first

**Files:**
- Create: `src/lib/openmaic/server/ssrf-guard.test.ts`
- Modify: `src/lib/openmaic/server/ssrf-guard.ts`
- Modify: affected files under `src/lib/openmaic/media/adapters/`
- Create or modify: focused adapter tests under `src/lib/openmaic/media/adapters/`

**Steps:**
1. Add failing tests for private IPv4 embedded in ISATAP IPv6 addresses.
2. Run the focused SSRF tests and confirm failure.
3. Add the minimal ISATAP classification while retaining OpenPBL's wider reserved-range blocks and DNS-pinned dispatcher.
4. Add failing tests asserting provider connectivity probes use `redirect: 'manual'`.
5. Apply `redirect: 'manual'` only to probe/test requests and make the tests pass.
6. Run all SSRF, provider, proxy-media, and media-adapter tests.

### Task 3: Synchronize `@openmaic/dsl` 0.9.0

**Files:**
- Modify: `packages/@openmaic/dsl/**`
- Modify: OpenPBL extension types and consumers under `src/lib/openmaic/types/` as required
- Test: `packages/@openmaic/dsl/test/**`
- Test: existing stage/action/storage/playback tests

**Steps:**
1. Export the immutable upstream tag and compare it with the current workspace package.
2. Preserve the current OpenPBL working-tree intent before the mechanical sync.
3. Synchronize package source, tests, schema generation, metadata, and build configuration.
4. Re-express OpenPBL-only fields through intersections/generic scene content where possible.
5. Add compatibility tests for unstamped legacy documents, current documents, runtime sessions, interactive/PBL content, and persisted OpenPBL quiz metadata.
6. Build and test the DSL package.
7. Typecheck affected OpenPBL consumers and fix only migration-related incompatibilities.

### Task 4: Synchronize `@openmaic/importer` 0.1.2

**Files:**
- Modify: `packages/@openmaic/importer/**`
- Test: `packages/@openmaic/importer/test/**`

**Steps:**
1. Export the immutable importer tag and compare it with the workspace package.
2. Synchronize source, tests, metadata, and build configuration without touching unrelated packages.
3. Retain OpenPBL's maintained `omml2mathml` dependency and browser artifact workflow.
4. Build and test the importer.
5. Run PPTX import fixtures covering custom shapes, math, slide normalization, and browser bundle generation.

### Task 5: Integration verification

**Files:**
- Modify only incompatibilities directly caused by Tasks 2-4.

**Steps:**
1. Run focused Vitest suites after each package.
2. Run `pnpm typecheck`.
3. Run `pnpm lint:ci`.
4. Run the complete Vitest suite with bounded workers.
5. Run the production build if the preceding gates pass.
6. Review `git diff` to confirm no unrelated user changes were overwritten and report any remaining risks.

