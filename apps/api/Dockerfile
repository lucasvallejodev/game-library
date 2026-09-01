# syntax=docker/dockerfile:1

# =============================================================================
# Game Library API — production image.
#
# Built from the repository root so the pnpm workspace is visible:
#   docker build -f apps/api/Dockerfile .
# =============================================================================

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# ── Dependencies ─────────────────────────────────────────────────────────────
# Manifests only, so this layer is cached until a dependency actually changes.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── Build ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter @game-library/api build
# Production dependencies only — no TypeScript, no test runner.
RUN pnpm deploy --filter @game-library/api --prod --legacy /prod

# Prune frontend and build tooling that pnpm drags in as *optional peers*.
# better-auth declares next, react, react-dom and drizzle-kit as optional
# peers; because apps/web provides them, pnpm resolves them into the API's tree
# too — roughly 350MB of framework this bundle never imports. Neither
# `--prod`, `injectWorkspacePackages` nor `resolvePeersFromWorkspaceRoot`
# excludes them, so they are removed explicitly.
#
# This is safe precisely because it is verifiable: if any of it were actually
# needed, the container fails its /health/ready check on startup.
RUN cd /prod/node_modules/.pnpm 2>/dev/null && rm -rf       next@* '@next+'*       react@* react-dom@*       drizzle-kit@*       esbuild@* '@esbuild+'*       '@rolldown+'* lightningcss*       typescript@* vitest@*     || true

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Never root. node:alpine ships an unprivileged `node` user already.
COPY --from=build --chown=node:node /prod/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
# The SQL the migrate command applies. Kept as files rather than inlined so the
# migration chain stays reviewable in the image.
COPY --from=build --chown=node:node /repo/packages/db/migrations ./migrations

ENV MIGRATIONS_DIR=/app/migrations
ENV API_HOST=0.0.0.0
ENV API_PORT=4000
EXPOSE 4000

USER node

# Compose overrides this for the one-shot migrate service.
CMD ["node", "dist/index.js"]
