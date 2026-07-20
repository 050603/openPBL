# syntax=docker/dockerfile:1.7
# OpenPBL production image — multi-stage build.
#
# Stages:
#   1. deps    — install node_modules (incl. workspace packages + prisma client)
#   2. builder — run `next build` to produce `.next/standalone`
#   3. runner  — minimal runtime image, non-root, with healthcheck
#
# The runner image is self-contained: it can be promoted across environments
# without rebuilding, with runtime config supplied via env vars / env_file.

# ============================================================================
# Stage 1: deps
# ============================================================================
FROM node:22-alpine AS deps

# libc6-compat: required by some native modules on alpine.
# python3 / make / g++: build tools for `sharp` (and any other native addon
# that does not ship a prebuilt binary for linuxmusl-x64).
RUN apk add --no-cache libc6-compat python3 make g++

# Enable pnpm via corepack (Node 22 ships corepack).
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy only the manifests needed for `pnpm install --frozen-lockfile` so the
# layer is cached across source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/

# `postinstall` builds the workspace packages (mathml2omml, pptxgenjs,
# @openmaic/*) and runs `prisma generate`. The latter requires the schema, so
# copy the prisma directory too. `scripts/sync-maic-importer.mjs` is invoked
# by postinstall and must also be present.
COPY prisma ./prisma
COPY scripts/sync-maic-importer.mjs ./scripts/sync-maic-importer.mjs

# Install with the frozen lockfile. `--ignore-scripts` is NOT used because
# postinstall builds the workspace packages the app imports at runtime.
RUN pnpm install --frozen-lockfile

# ============================================================================
# Stage 2: builder
# ============================================================================
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .

# Build the Next.js app. `next build` produces `.next/standalone` because
# `output: 'standalone'` is set in next.config.ts.
RUN pnpm build

# ============================================================================
# Stage 3: runner
# ============================================================================
FROM node:22-alpine AS runner

LABEL org.opencontainers.image.title="openpbl-app" \
      org.opencontainers.image.description="OpenPBL — Project-Based Learning classroom platform" \
      org.opencontainers.image.source="https://github.com/openpbl/openpbl" \
      org.opencontainers.image.version="0.1.0"

# Runtime dependencies:
#   - libvips: required by `sharp` for image optimization at runtime.
#   - wget: used by the HEALTHCHECK directive.
#   - tini: tiny init that reaps zombies and forwards signals (Next.js server
#     is a single process so this is mostly defensive; STOPSIGNAL below still
#     works without tini).
RUN apk add --no-cache libvips wget tini

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Create a non-root user/group (uid/gid 1001) for the server process.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Copy the standalone server output (includes a minimal node_modules tree).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Standalone does NOT copy `public` or `.next/static` automatically; both are
# required for the app to serve static assets correctly.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma migrations directory — `prisma migrate deploy` reads these at startup
# (or via `pnpm db:migrate:prod`). The Prisma client itself is already in the
# standalone node_modules tree, but migrations are not traced.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Reference env file (non-secret). Operators copy this to `.env` and fill in
# real values; the app does NOT read .env.example at runtime.
COPY --chown=nextjs:nodejs .env.example ./.env.example

# Persistent upload directory — mount a volume here in docker-compose so
# uploaded files survive container restarts.
RUN mkdir -p .openpbl-data/uploads && chown -R nextjs:nodejs .openpbl-data

# Graceful shutdown: SIGTERM triggers the instrumentation.ts handler which
# drains in-flight requests, closes the WebSocket server, disconnects Prisma,
# then exits 0 within the budget defined in lib/runtime/lifecycle.ts.
STOPSIGNAL SIGTERM

EXPOSE 3000

# Liveness probe: hit the lightweight `/api/health/live` endpoint. The
# `start-period` gives the app 30s to boot before probes can fail the
# container; `retries: 3` with 5s timeout tolerates transient blips.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health/live || exit 1

USER nextjs

# tini as PID 1 so signals are forwarded correctly to the Node process.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
