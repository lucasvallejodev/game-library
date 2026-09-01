# syntax=docker/dockerfile:1

# =============================================================================
# Game Library web — production image.
#
# Built from the repository root:
#   docker build -f apps/web/Dockerfile .
# =============================================================================

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/web apps/web
COPY packages packages

# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so
# they must be present here rather than at run time. Nothing secret may be
# passed this way — see docs/security.md §4.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @game-library/web build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# `output: 'standalone'` traces exactly the files the server needs, so no
# node_modules install happens here at all.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
# standalone deliberately omits these two; they are normally served by a CDN,
# and must be copied in when the Node server serves them itself.
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public

ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000

USER node

# standalone emits its own minimal server; `next start` is not used.
CMD ["node", "apps/web/server.js"]
