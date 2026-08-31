# AGENTS.md

Operating guide for AI agents and new contributors working on **Game Library**.
Read this first, then the doc your task touches.

## What this project is

A self-hosted web app for tracking games owned across multiple platforms and storage locations
(GOG, Steam, external drives), plus a wishlist. **The wishlist's purpose is preventing duplicate
purchases** — before buying, the app tells you whether you already own the title somewhere.

Two facts shape everything:

1. A game can be in **several locations at once** → games ↔ locations is many-to-many.
2. Identity across library and wishlist is the **IGDB id** → that is what makes duplicate
   detection reliable rather than fuzzy title matching.

**Status:** roadmap increments 1–2 complete (workspace skeleton + tooling; Docker Compose infrastructure). Increment 3 (Drizzle schema + first migration) is next.

## Documentation map

| Read this                                                  | When you are…                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [docs/architecture.md](docs/architecture.md)               | Orienting; changing structure, topology, or the storage/IGDB design                  |
| [docs/adr.md](docs/adr.md)                                 | **Tempted to change a library or pattern.** Every decision + why + what was rejected |
| [docs/database.md](docs/database.md)                       | Touching the schema, queries, indexes, or migrations                                 |
| [docs/api-endpoints.md](docs/api-endpoints.md)             | Adding or changing an endpoint                                                       |
| [docs/security.md](docs/security.md)                       | Touching auth, tenancy, Twitch tokens, uploads, or user input                        |
| [docs/frontend-guidelines.md](docs/frontend-guidelines.md) | Writing any component or stylesheet                                                  |
| [docs/roadmap.md](docs/roadmap.md)                         | Deciding what to build next                                                          |
| `docs/img/game_library_reference.webp`                     | Building UI — **styling reference only** (see rule 13)                               |

## Stack (settled — see ADRs before proposing changes)

TypeScript · Next.js App Router + RSC · TanStack Query · **SCSS Modules + BEM** · Radix UI
(behavior only) · Fastify · PostgreSQL 16 · **Drizzle ORM** · Better Auth · Redis 7 ·
MinIO/S3 with local-disk fallback · IGDB via Twitch OAuth2 · Zod · Vitest + Testcontainers +
Playwright · Docker Compose · pnpm workspaces.

## Non-negotiable rules

These encode decisions that are expensive to reverse. Violating one is a bug even if the code
works.

1. **`userId` is the first parameter of every repository function.** No repository method may be
   capable of an unscoped read. Cross-tenant access returns `404`, never `403`.
   → [security.md](security.md) §3
2. **`TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` exist only in the API environment.** Never
   `NEXT_PUBLIC_*`, never in `apps/web`, never in a response body. All IGDB traffic goes through
   the authenticated `/api/igdb/*` proxy. → [security.md](security.md) §4
3. **Layering is strict.** Routes never import repositories. Services never import
   `FastifyRequest`. Repositories contain no HTTP awareness.
   → [architecture.md](architecture.md) §5
4. **Never use Tailwind, a utility-class framework, or a pre-styled component library.** SCSS
   Modules with BEM, on the shared token layer. This was an explicit owner override.
   → [ADR-005](docs/adr.md)
5. **Raw color values appear only in `_tokens.scss`.** Everywhere else uses tokens.
6. **Migrations are committed SQL and immutable once merged.** Fix forward with a new migration.
   Hand-appending SQL that drizzle-kit cannot express (extensions, partial indexes, CHECKs) is
   expected. → [database.md](database.md) §6
7. **Every request body, query, and param is Zod-validated at the route boundary.** Shared
   schemas live in `packages/shared` and are used by both API and web.
8. **Object keys are server-generated.** A client-supplied filename never enters a storage path.
9. **`storage_driver` is recorded per asset.** The S3→local fallback depends on it; do not infer
   the driver from current config at read time. → [architecture.md](architecture.md) §7
10. **`notes` is untrusted markdown.** Sanitize at render (`rehype-sanitize`), never at storage.
11. **Every resource module ships a cross-tenant isolation test.** User B must get `404` on all
    of user A's resources. This test is never skipped.
12. **Never run `git commit`, `git push`, or `git tag`.** At the end of each roadmap phase,
    **propose a commit message and stop.** The owner decides whether and when to commit. Staging
    is also the owner's call — do not `git add` on their behalf. → see _Committing_ below
13. **The reference image is a styling reference only** — colors, typography, and part of the
    layout and look-and-feel. **Never infer features, entities, or data model from it.** It shows
    Store, Community, Friends, Downloads, and an install action; none are requirements. On
    _behavior_, the written requirements win; on _appearance_, the reference wins.
    → [ADR-013](docs/adr.md)

## Conventions

**Naming** — DB: `snake_case` tables/columns, plural tables. TS: `camelCase` values,
`PascalCase` types/components. Files: `kebab-case` dirs, `PascalCase.tsx` components,
`resource.layer.ts` for API modules (`games.service.ts`). CSS: BEM in kebab-case.

**Imports** — `@/` path aliases within an app; workspace packages by name
(`@game-library/shared`). SCSS partials via `@use`, never `@import`.

**Commits** — Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

**Errors** — throw typed domain errors (`NotFoundError`, `ConflictError`,
`ExternalServiceError`); the central error plugin maps them to HTTP.

## Commands

```bash
cp .env.example .env          # first run only — then fill in the blanks
pnpm install
docker compose up -d --wait   # postgres, redis, minio (+ one-shot bucket init)
pnpm db:generate              # schema change → SQL migration (review the output!)
pnpm db:migrate               # apply
pnpm db:seed                  # dev dataset
pnpm dev                      # api :4000 + web :3000
pnpm test                     # unit
pnpm test:integration         # Testcontainers — needs Docker
pnpm test:e2e                 # Playwright
pnpm lint && pnpm typecheck
```

Infrastructure endpoints once `docker compose up -d` is healthy:

| Service       | Address          | Notes                                      |
| ------------- | ---------------- | ------------------------------------------ |
| Postgres      | `localhost:5432` | `DATABASE_URL` in `.env`                   |
| Redis         | `localhost:6379` | password-protected; rejects unauthed pings |
| MinIO S3 API  | `localhost:9000` | bucket `game-library-media`, **private**   |
| MinIO console | `localhost:9001` | sign in with `MINIO_ROOT_USER/PASSWORD`    |

All four bind to `127.0.0.1` only. `docker compose down` keeps your data;
`docker compose down -v` destroys it.

API docs at `http://localhost:4000/api/docs` (generated from the Zod schemas).

## Working with the owner

- **Present options, don't decide alone.** For any consequential choice — a library, a data-model
  shape, a convention — lay out 2–4 concrete options with honest tradeoffs, mark a
  recommendation, and ask. Batch related questions into one round.
- **Check [docs/adr.md](docs/adr.md) first.** If the decision is already recorded, follow it
  rather than re-asking or quietly diverging.
- Record new decisions as a new ADR in the same format.

### Committing — always the owner's decision

**Do not commit. Ever.** No `git commit`, `git push`, `git tag`, and no `git add`.

At the end of each roadmap phase, finish the work, then hand over:

1. A short summary of what changed and what now works.
2. **A proposed commit message** in Conventional Commits format — subject line, plus a body if
   the change warrants one — in a code block, ready to copy.
3. Stop there.

The owner reviews and decides whether to commit, reword, split, or hold. A proposed message is a
suggestion, not a plan to then execute. If the owner explicitly asks for a commit, that
authorization covers **that commit only** — it does not carry forward to the next phase.

## Open questions

One item remains open, and it is deliberately deferred rather than pending:

- **Postgres RLS** — to be **evaluated during the hardening phase** (roadmap increment 13), not
  decided now. Repository-layer scoping (rule 1) plus the mandatory cross-tenant tests (rule 11)
  are the primary enforcement regardless of the outcome.

Resolved 2026-08-31: `games.status` **dropped** ([ADR-013](docs/adr.md)); default seed lists
**confirmed** ([ADR-014](docs/adr.md)).
